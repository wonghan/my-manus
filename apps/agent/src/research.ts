import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";
import { tool } from "langchain";
import { z } from "zod";
import {
  createResearchArtifactData,
  type AgentPlan,
  type ArtifactKind,
  type PlannedStep,
  type ResearchResult
} from "@my-manus/shared";
import {
  createMockResearchPlan,
  createMockResearchResult
} from "./mock";

const artifactKinds = [
  "browser",
  "table",
  "code",
  "markdown",
  "terminal"
] as const;

const artifactKindSchema = z.enum(artifactKinds);

const referenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  summary: z.string()
});

const researchResultSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  browser: z.object({
    title: z.string(),
    url: z.string(),
    excerpt: z.string(),
    keyFindings: z.array(z.string())
  }),
  table: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string()))
  }),
  markdown: z.string(),
  code: z.object({
    language: z.string(),
    filename: z.string(),
    content: z.string()
  }),
  references: z.array(referenceSchema)
});

const plannedStepSchema: z.ZodType<PlannedStep> = z.lazy(() =>
  z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    artifactKind: artifactKindSchema.optional(),
    children: z.array(plannedStepSchema).optional()
  })
);

const agentPlanSchema = z.object({
  steps: z.array(plannedStepSchema).min(1).max(4)
});

type ResearchArtifactData = ReturnType<typeof createResearchArtifactData>;

export interface ClarificationRequest {
  question: string;
  placeholder: string;
}

export interface ResearchExecutionContext {
  prompt: string;
  result?: ResearchResult;
  artifactData?: ResearchArtifactData;
}

export interface StepExecutionResult {
  context: ResearchExecutionContext;
  artifact?:
    | {
        kind: ArtifactKind;
        title: string;
        payload: Record<string, unknown>;
      }
    | undefined;
  summary?: string;
}

export function getClarificationRequest(prompt: string): ClarificationRequest | null {
  const normalized = prompt.trim();
  if (normalized.length >= 18) {
    return null;
  }

  return {
    question:
      "Could you narrow the task a little? A short domain, audience, or desired output format will make the research much better.",
    placeholder:
      "Example: Compare AI coding agents for small startup teams and end with a deployment recommendation."
  };
}

export async function planResearchRun(
  prompt: string,
  options: {
    mode: "mock" | "live";
    model: string;
    openaiApiBase?: string;
  }
): Promise<AgentPlan> {
  if (options.mode !== "live" || !process.env.OPENAI_API_KEY) {
    return createMockResearchPlan(prompt);
  }

  try {
    const agent = createDeepAgent({
      model: createModel(options),
      responseFormat: agentPlanSchema,
      systemPrompt:
        "You are planning a research workflow for an artifact workspace. Return exactly a two-level step tree. Top-level steps are parent groups. Only leaf child steps may declare artifactKind. Each leaf must produce at most one artifact. Prefer browser first, then only the additional artifacts truly needed. Valid artifact kinds are browser, table, markdown, code, terminal."
    } as never);

    const response = await (agent as never as {
      invoke: (input: unknown) => Promise<unknown>;
    }).invoke({
      messages: [
        {
          role: "user",
          content: `${prompt}\n\nPlan a concise two-level research workflow for this task.`
        }
      ]
    });

    const structured =
      (response as { structuredResponse?: unknown }).structuredResponse ??
      (response as { output?: unknown }).output ??
      response;
    if (!structured) {
      return createMockResearchPlan(prompt);
    }

    const parsed = agentPlanSchema.parse(structured);
    return normalizePlan(parsed);
  } catch {
    return createMockResearchPlan(prompt);
  }
}

export async function executePlannedStep(
  step: Pick<PlannedStep, "artifactKind" | "title">,
  context: ResearchExecutionContext,
  options: {
    mode: "mock" | "live";
    model: string;
    openaiApiBase?: string;
  }
): Promise<StepExecutionResult> {
  if (!step.artifactKind) {
    return {
      context
    };
  }

  if (step.artifactKind === "terminal") {
    return {
      context,
      artifact: {
        kind: "terminal",
        title: "Terminal notes",
        payload: {
          title: "Terminal notes",
          status: "ready",
          meta: "Execution log",
          code: [
            "$ research-run",
            "Planning complete.",
            "No shell execution was required for this workflow."
          ].join("\n"),
          language: "bash",
          filename: "terminal.log"
        }
      }
    };
  }

  const preparedContext = await ensureResearchContext(context, options);
  const artifact = artifactFromKind(
    step.artifactKind,
    preparedContext.artifactData
  );

  return {
    context: preparedContext,
    artifact,
    summary: preparedContext.result?.summary
  };
}

export async function researchPrompt(
  prompt: string,
  options: {
    mode: "mock" | "live";
    model: string;
    openaiApiBase?: string;
  }
): Promise<ResearchResult> {
  if (options.mode !== "live" || !process.env.OPENAI_API_KEY) {
    return createMockResearchResult(prompt);
  }

  let searchReturnedUrl = false;
  const hasWebSearch = Boolean(process.env.TAVILY_API_KEY);
  const tools = hasWebSearch ? [createInternetSearchTool(() => {
    searchReturnedUrl = true;
  })] : [];

  const agent = createDeepAgent({
    model: createModel(options),
    tools,
    responseFormat: researchResultSchema,
    systemPrompt:
      hasWebSearch
        ? "You are an expert product research agent. Research carefully, stay concise, and return structured results that are easy to render in an artifact workspace. Only include references that come directly from the internet_search tool. If the tool returns no URLs or returns an error, keep the references array empty and avoid inventing citations."
        : "You are an expert product research agent. Web search is unavailable in this run, so do not invent citations or URLs. If a claim is not directly supported, keep the wording cautious and return an empty references array."
  } as never);

  const response = await (agent as never as {
    invoke: (input: unknown) => Promise<unknown>;
  }).invoke({
    messages: [
      {
        role: "user",
        content:
          `${prompt}\n\nReturn a compact research brief with references, a comparison table, a markdown summary, and a short TypeScript object.`
      }
    ]
  });

  const structured =
    (response as { structuredResponse?: unknown }).structuredResponse ??
    (response as { output?: unknown }).output ??
    response;
  if (!structured) {
    return createMockResearchResult(prompt);
  }

  const parsed = researchResultSchema.parse(structured);
  if (!searchReturnedUrl) {
    return {
      ...parsed,
      references: []
    };
  }

  return parsed;
}

function createModel(options: {
  model: string;
  openaiApiBase?: string;
}) {
  return new ChatOpenAI({
    model: options.model,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: options.openaiApiBase
      ? {
          baseURL: options.openaiApiBase
        }
      : undefined
  });
}

function createInternetSearchTool(onSuccess: () => void) {
  return tool(
    async ({
      query,
      maxResults = 5
    }: {
      query: string;
      maxResults?: number;
    }) => {
      try {
        const search = new TavilySearch({
          tavilyApiKey: process.env.TAVILY_API_KEY,
          maxResults
        });

        const result = await search.invoke({
          query,
          maxResults
        } as never);

        if (JSON.stringify(result).includes("http")) {
          onSuccess();
        }

        return result;
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : "Search provider request failed."
        };
      }
    },
    {
      name: "internet_search",
      description: "Search the web for fresh factual context.",
      schema: z.object({
        query: z.string().describe("The research query"),
        maxResults: z.number().default(5)
      })
    }
  );
}

async function ensureResearchContext(
  context: ResearchExecutionContext,
  options: {
    mode: "mock" | "live";
    model: string;
    openaiApiBase?: string;
  }
) {
  if (context.result && context.artifactData) {
    return context;
  }

  const result = await researchPrompt(context.prompt, options);
  return {
    ...context,
    result,
    artifactData: createResearchArtifactData(result)
  };
}

function artifactFromKind(
  kind: Exclude<ArtifactKind, "terminal">,
  artifactData: ResearchArtifactData | undefined
) {
  if (!artifactData) {
    throw new Error("Artifact data is not ready.");
  }

  const record = artifactData[kind];
  return {
    kind,
    title: String(record.title ?? "Artifact"),
    payload: record
  };
}

function normalizePlan(plan: AgentPlan): AgentPlan {
  const steps = plan.steps.map((step, index) =>
    normalizeParentStep(step, `step-${index + 1}`)
  );

  return {
    steps
  };
}

function normalizeParentStep(step: PlannedStep, fallbackId: string): PlannedStep {
  const normalizedChildren =
    Array.isArray(step.children) && step.children.length > 0
      ? step.children.map((child, index) =>
          normalizeLeafStep(child, `${safeStepId(step.id || fallbackId)}-child-${index + 1}`)
        )
      : [
          normalizeLeafStep(
            {
              id: `${fallbackId}-output`,
              title: step.title,
              description: step.description,
              artifactKind: inferArtifactKind(step)
            },
            `${safeStepId(step.id || fallbackId)}-child-1`
          )
        ];

  return {
    id: safeStepId(step.id || fallbackId),
    title: step.title,
    description: step.description,
    children: normalizedChildren
  };
}

function normalizeLeafStep(step: PlannedStep, fallbackId: string): PlannedStep {
  return {
    id: safeStepId(step.id || fallbackId),
    title: step.title,
    description: step.description,
    artifactKind: step.artifactKind ?? inferArtifactKind(step)
  };
}

function inferArtifactKind(step: Pick<PlannedStep, "title" | "description" | "artifactKind">) {
  if (step.artifactKind) {
    return step.artifactKind;
  }

  const source = `${step.title} ${step.description ?? ""}`.toLowerCase();

  if (/browser|source|search|reference|browse/.test(source)) {
    return "browser";
  }

  if (/table|comparison|matrix/.test(source)) {
    return "table";
  }

  if (/code|component|snippet|typescript/.test(source)) {
    return "code";
  }

  if (/terminal|shell|cli/.test(source)) {
    return "terminal";
  }

  return "markdown";
}

function safeStepId(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "step";
}
