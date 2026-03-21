import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";
import { tool } from "langchain";
import { z } from "zod";
import type { ResearchResult } from "@my-manus/shared";
import { createMockResearchResult } from "./mock";

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

export interface ClarificationRequest {
  question: string;
  placeholder: string;
}

export function getClarificationRequest(prompt: string): ClarificationRequest | null {
  const normalized = prompt.trim();
  if (normalized.length >= 18) {
    return null;
  }

  return {
    question:
      "Could you narrow the task a little? A short domain, audience, or desired output format will make the research much better.",
    placeholder: "Example: Compare AI coding agents for small startup teams and end with a deployment recommendation."
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
  const tools = hasWebSearch
    ? [
        tool(
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
                searchReturnedUrl = true;
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
        )
      ]
    : [];

  const model = new ChatOpenAI({
    model: options.model,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: options.openaiApiBase
      ? {
          baseURL: options.openaiApiBase
        }
      : undefined
  });

  const agent = createDeepAgent({
    model,
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
