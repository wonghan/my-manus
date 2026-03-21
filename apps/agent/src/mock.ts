import type { ResearchReference, ResearchResult } from "@my-manus/shared";

export function createMockResearchResult(prompt: string): ResearchResult {
  const topic = extractTopic(prompt);
  const references: ResearchReference[] = [
    {
      id: "ref-1",
      title: `${topic} market map`,
      url: "https://example.com/market-map",
      summary: `A broad overview that frames the current ${topic.toLowerCase()} landscape.`
    },
    {
      id: "ref-2",
      title: `${topic} product comparison`,
      url: "https://example.com/product-comparison",
      summary: `A side-by-side product comparison covering strengths, tradeoffs, and ideal use cases.`
    },
    {
      id: "ref-3",
      title: `${topic} deployment notes`,
      url: "https://example.com/deployment-notes",
      summary: `Operational guidance focused on launch readiness, cost, and reliability.`
    }
  ];

  return {
    headline: `${topic}: concise research brief`,
    summary: `I reviewed the current ${topic.toLowerCase()} landscape and organized the findings into an operator-friendly brief. The strongest pattern is that teams win by narrowing the first workflow, keeping approvals explicit, and exposing tangible artifacts instead of black-box reasoning.`,
    browser: {
      title: `${topic} browser digest`,
      url: "https://example.com/research-digest",
      excerpt:
        "The clearest opportunities appear where agents combine structured retrieval, visible progress, and lightweight human approval before risky actions.",
      keyFindings: [
        "Users trust the agent more when they can see the workbench evolve in real time.",
        "A single artifact workspace is easier to learn than many hidden tool outputs.",
        "Beginner-friendly systems do better when the deployment story stays boring and repeatable."
      ]
    },
    table: {
      headers: ["Angle", "Recommendation", "Why it matters"],
      rows: [
        [
          "Workflow scope",
          "Start with research and synthesis",
          "It keeps tool choices tight and makes outputs easy to inspect."
        ],
        [
          "Human approval",
          "Gate export and external actions",
          "This protects users without interrupting every low-risk step."
        ],
        [
          "Deployment",
          "Use one predictable platform first",
          "A simple deployment story is easier for a new team to operate."
        ]
      ]
    },
    markdown: [
      `# ${topic}`,
      "",
      "## What stands out",
      "",
      `- The first version should focus on a narrow and inspectable ${topic.toLowerCase()} workflow.`,
      "- Protocol-driven UI helps the product feel coherent because both progress and outputs arrive in the same language.",
      "- The strongest production improvement after v1 is usually approval, persistence, and deployment hardening rather than more tools.",
      "",
      "## Recommended next move",
      "",
      "Ship a version that streams progress, shows artifacts clearly, and keeps risky actions behind approval."
    ].join("\n"),
    code: {
      language: "ts",
      filename: "research-summary.ts",
      content: [
        "export const researchSummary = {",
        `  topic: ${JSON.stringify(topic)},`,
        "  priorities: [",
        '    "visible progress",',
        '    "artifact-first UI",',
        '    "simple deployment",',
        '    "explicit approvals"',
        "  ]",
        "};"
      ].join("\n")
    },
    references
  };
}

function extractTopic(prompt: string) {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.?!]+$/, "");

  if (!cleaned) {
    return "Research mission";
  }

  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}
