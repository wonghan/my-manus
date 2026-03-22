import type {
  ArtifactKind,
  ApprovalRequest,
  ResearchResult,
  RunStep
} from "../domain";
import {
  a2uiVersion,
  bind,
  literal,
  type A2UiComponentNode,
  type A2UiMessage
} from "../protocols/a2ui";

const catalogId = "my-manus://catalog/v1";

function begin(surfaceId: string, title?: string): A2UiMessage {
  return {
    version: a2uiVersion,
    type: "beginRendering",
    surfaceId,
    catalogId,
    title
  };
}

function update(
  surfaceId: string,
  rootComponentId: string,
  components: A2UiComponentNode[]
): A2UiMessage {
  return {
    version: a2uiVersion,
    type: "surfaceUpdate",
    surfaceId,
    rootComponentId,
    components
  };
}

function data(surfaceId: string, payload: Record<string, unknown>): A2UiMessage {
  return {
    version: a2uiVersion,
    type: "dataModelUpdate",
    surfaceId,
    data: payload
  };
}

export function buildEmptyStateSurface(surfaceId = "session-empty-state"): A2UiMessage[] {
  return [
    begin(surfaceId, "How can I help you today?"),
    update(surfaceId, "empty-root", [
      {
        id: "empty-root",
        type: "Column",
        props: { gap: "lg" },
        children: ["empty-title", "empty-copy", "empty-list"]
      },
      {
        id: "empty-title",
        type: "Text",
        props: {
          text: literal("How can I help you today?"),
          tone: "hero"
        }
      },
      {
        id: "empty-copy",
        type: "Text",
        props: {
          text: literal(
            "I am an autonomous agent capable of browsing the web, writing code, and executing complex tasks."
          ),
          tone: "muted"
        }
      },
      {
        id: "empty-list",
        type: "List",
        props: {
          items: bind("/suggestions"),
          actionName: "start-suggestion"
        }
      }
    ]),
    data(surfaceId, {
      suggestions: [
        {
          id: "suggestion-1",
          title: "Research top AI agents",
          description: "Click to start",
          actionPayload: {
            prompt: "Research top AI agents"
          }
        },
        {
          id: "suggestion-2",
          title: "Scrape data from a website",
          description: "Click to start",
          actionPayload: {
            prompt: "Scrape data from a website"
          }
        },
        {
          id: "suggestion-3",
          title: "Build a React component",
          description: "Click to start",
          actionPayload: {
            prompt: "Build a React component"
          }
        },
        {
          id: "suggestion-4",
          title: "Analyze my local CSV file",
          description: "Click to start",
          actionPayload: {
            prompt: "Analyze my local CSV file"
          }
        }
      ]
    })
  ];
}

export function buildAssistantMessageSurface(surfaceId: string): A2UiMessage[] {
  return [
    begin(surfaceId, "Assistant message"),
    update(surfaceId, "message-root", [
      {
        id: "message-root",
        type: "Column",
        props: { gap: "sm" },
        children: ["message-markdown"]
      },
      {
        id: "message-markdown",
        type: "Markdown",
        props: {
          markdown: bind("/content")
        }
      }
    ]),
    data(surfaceId, {
      content: ""
    })
  ];
}

export function buildStepsSurface(
  surfaceId: string,
  steps: RunStep[] = [],
  latestArtifactId?: string
): A2UiMessage[] {
  return [
    begin(surfaceId, "Agent steps"),
    update(surfaceId, "steps-root", [
      {
        id: "steps-root",
        type: "StepTimeline",
        props: {
          steps: bind("/steps"),
          latestArtifactId: bind("/latestArtifactId")
        }
      }
    ]),
    data(surfaceId, {
      steps,
      latestArtifactId
    })
  ];
}

export function buildArtifactMainSurface(
  surfaceId: string,
  kind: ArtifactKind
): A2UiMessage[] {
  const componentTypeByKind: Record<ArtifactKind, A2UiComponentNode["type"]> = {
    browser: "ReferenceList",
    table: "Table",
    code: "CodeBlock",
    markdown: "Markdown",
    terminal: "CodeBlock"
  };

  return [
    begin(surfaceId, "Artifact"),
    update(surfaceId, "artifact-root", [
      {
        id: "artifact-root",
        type: componentTypeByKind[kind],
        props: {
          items: bind("/references"),
          table: bind("/table"),
          code: bind("/code"),
          language: bind("/language"),
          filename: bind("/filename"),
          markdown: bind("/markdown"),
          title: bind("/title"),
          url: bind("/browserUrl"),
          excerpt: bind("/browserExcerpt"),
          findings: bind("/browserFindings"),
          html: bind("/html"),
          loading: bind("/loading"),
          rowCount: bind("/rowCount")
        }
      }
    ]),
    data(surfaceId, {
      title: "Preparing artifact",
      status: "running",
      meta: "",
      references: [],
      table: { headers: [], rows: [] },
      code: "",
      language: "md",
      filename: "artifact.txt",
      markdown: "",
      browserTitle: "",
      browserUrl: "",
      browserExcerpt: "",
      browserFindings: [],
      html: "",
      loading: false,
      rowCount: 0
    })
  ];
}

export function buildArtifactActionsSurface(
  surfaceId: string
): A2UiMessage[] {
  return [
    begin(surfaceId, "Artifact actions"),
    update(surfaceId, "artifact-actions-root", [
      {
        id: "artifact-actions-root",
        type: "ButtonGroup",
        children: ["artifact-action-export", "artifact-action-followup"]
      },
      {
        id: "artifact-action-export",
        type: "Button",
        props: {
          label: literal("Export artifact"),
          variant: "secondary",
          action: literal({
            name: "request-export"
          })
        }
      },
      {
        id: "artifact-action-followup",
        type: "Button",
        props: {
          label: literal("Continue this line of research"),
          variant: "primary",
          action: literal({
            name: "continue-research"
          })
        }
      }
    ])
  ];
}

export function buildApprovalSurface(
  surfaceId: string,
  approval: ApprovalRequest
): A2UiMessage[] {
  return [
    begin(surfaceId, "Approval required"),
    update(surfaceId, "approval-root", [
      {
        id: "approval-root",
        type: "Card",
        children: [
          "approval-badge",
          "approval-title",
          "approval-copy",
          "approval-actions"
        ]
      },
      {
        id: "approval-badge",
        type: "Badge",
        props: {
          label: literal("Human approval required"),
          tone: "warning"
        }
      },
      {
        id: "approval-title",
        type: "Text",
        props: {
          text: bind("/title"),
          tone: "sectionTitle"
        }
      },
      {
        id: "approval-copy",
        type: "Text",
        props: {
          text: bind("/description"),
          tone: "body"
        }
      },
      {
        id: "approval-actions",
        type: "ButtonGroup",
        children: ["approval-approve", "approval-reject"]
      },
      {
        id: "approval-approve",
        type: "Button",
        props: {
          label: literal("Approve"),
          variant: "primary",
          action: literal({
            name: "approve-approval",
            payload: {
              approvalId: approval.id
            }
          })
        }
      },
      {
        id: "approval-reject",
        type: "Button",
        props: {
          label: literal("Reject"),
          variant: "ghost",
          action: literal({
            name: "reject-approval",
            payload: {
              approvalId: approval.id
            }
          })
        }
      }
    ]),
    data(surfaceId, {
      title: approval.title,
      description: approval.description
    })
  ];
}

export function buildClarificationSurface(
  surfaceId: string,
  question: string,
  placeholder: string
): A2UiMessage[] {
  return [
    begin(surfaceId, "Clarification needed"),
    update(surfaceId, "clarification-root", [
      {
        id: "clarification-root",
        type: "Card",
        children: [
          "clarification-title",
          "clarification-copy",
          "clarification-input",
          "clarification-actions"
        ]
      },
      {
        id: "clarification-title",
        type: "Text",
        props: {
          text: literal("I need one more detail before researching."),
          tone: "sectionTitle"
        }
      },
      {
        id: "clarification-copy",
        type: "Text",
        props: {
          text: bind("/question"),
          tone: "body"
        }
      },
      {
        id: "clarification-input",
        type: "Textarea",
        props: {
          label: literal("Add context"),
          placeholder: bind("/placeholder"),
          field: "clarification"
        }
      },
      {
        id: "clarification-actions",
        type: "ButtonGroup",
        children: ["clarification-submit"]
      },
      {
        id: "clarification-submit",
        type: "Button",
        props: {
          label: literal("Continue run"),
          variant: "primary",
          action: literal({
            name: "submit-clarification"
          })
        }
      }
    ]),
    data(surfaceId, {
      question,
      placeholder
    })
  ];
}

export function buildErrorSurface(
  surfaceId: string,
  message: string
): A2UiMessage[] {
  return [
    begin(surfaceId, "Run error"),
    update(surfaceId, "error-root", [
      {
        id: "error-root",
        type: "Notice",
        props: {
          tone: "error",
          title: literal("The run stopped before completion."),
          message: literal(message)
        }
      }
    ])
  ];
}

export function createResearchArtifactData(result: ResearchResult) {
  return {
    browser: {
      title: result.browser.title,
      status: "ready",
      meta: result.browser.url,
      references: result.references,
      browserTitle: result.browser.title,
      browserUrl: result.browser.url,
      browserExcerpt: result.browser.excerpt,
      browserFindings: result.browser.keyFindings,
      html: [
        `<h1>${result.browser.title}</h1>`,
        `<p class="text-gray-600 mb-6 font-medium tracking-wide">${result.browser.excerpt}</p>`,
        '<div class="space-y-6">',
        ...result.references.map(
          (reference, index) =>
            `<div class="p-5 rounded-xl border shadow-sm transition-all hover:shadow-md ${
              index % 3 === 0
                ? "bg-blue-50/50 border-blue-100"
                : index % 3 === 1
                  ? "bg-purple-50/50 border-purple-100"
                  : "bg-emerald-50/50 border-emerald-100"
            }"><h2 class="mb-2 flex items-center gap-2"><div class="flex h-8 w-8 items-center justify-center rounded-lg ${
              index % 3 === 0
                ? "bg-blue-500"
                : index % 3 === 1
                  ? "bg-purple-500"
                  : "bg-emerald-500"
            } text-sm font-bold text-white">${index + 1}</div>${reference.title}</h2><p>${reference.summary}</p></div>`
        ),
        "</div>"
      ].join(""),
      loading: false
    },
    table: {
      title: "Comparison table",
      status: "ready",
      meta: `${result.table.rows.length} rows`,
      table: result.table,
      rowCount: result.table.rows.length
    },
    markdown: {
      title: result.headline,
      status: "ready",
      meta: "Markdown summary",
      markdown: result.markdown
    },
    code: {
      title: result.code.filename,
      status: "ready",
      meta: result.code.language,
      code: result.code.content,
      language: result.code.language,
      filename: result.code.filename
    }
  };
}
