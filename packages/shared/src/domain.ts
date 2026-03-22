export type MessageRole = "user" | "assistant";

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "waiting_clarification"
  | "completed"
  | "failed"
  | "cancelled";

export type StepStatus = "pending" | "running" | "completed" | "error";

export type ArtifactKind =
  | "browser"
  | "table"
  | "code"
  | "markdown"
  | "terminal";

export interface PlannedStep {
  id: string;
  title: string;
  description?: string;
  artifactKind?: ArtifactKind;
  children?: PlannedStep[];
}

export interface AgentPlan {
  steps: PlannedStep[];
}

export type ApprovalType =
  | "open_external_link"
  | "export_file"
  | "run_code"
  | "write_file";

export interface ConversationMessage {
  id: string;
  sessionId: string;
  runId?: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  surfaceId?: string;
}

export interface RunStep {
  id: string;
  runId: string;
  title: string;
  status: StepStatus;
  parentStepId?: string;
  sequence: number;
  artifactId?: string;
  artifactKind?: ArtifactKind;
  detail?: string;
  logs: string[];
}

export interface ArtifactRecord {
  id: string;
  runId: string;
  stepId: string;
  sequence: number;
  kind: ArtifactKind;
  title: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  runId: string;
  type: ApprovalType;
  title: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface RunRecord {
  id: string;
  sessionId: string;
  status: RunStatus;
  prompt: string;
  userMessageId: string;
  assistantMessageId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionSummary extends SessionRecord {
  lastPreview: string;
}

export interface SessionDetail {
  session: SessionRecord;
  messages: ConversationMessage[];
  runs: RunRecord[];
}

export interface ResearchReference {
  id: string;
  title: string;
  url: string;
  summary: string;
}

export interface ResearchResult {
  headline: string;
  summary: string;
  browser: {
    title: string;
    url: string;
    excerpt: string;
    keyFindings: string[];
  };
  table: {
    headers: string[];
    rows: string[][];
  };
  markdown: string;
  code: {
    language: string;
    filename: string;
    content: string;
  };
  references: ResearchReference[];
}

export interface PendingClarification {
  runId: string;
  question: string;
  placeholder: string;
}

export interface PendingClarificationState extends PendingClarification {
  prompt: string;
}

export interface UserPromptInput {
  sessionId: string;
  prompt: string;
}
