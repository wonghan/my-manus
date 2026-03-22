import type {
  AgUiEvent
} from "./protocols/ag-ui";
import type {
  ApprovalRequest,
  ArtifactRecord,
  ConversationMessage,
  PendingClarificationState,
  RunRecord,
  RunStatus,
  RunStep,
  SessionDetail,
  SessionRecord,
  SessionSummary
} from "./domain";

export interface AppStore {
  createSession(title: string): Promise<SessionRecord>;
  listSessions(): Promise<SessionSummary[]>;
  getSession(sessionId: string): Promise<SessionRecord | undefined>;
  getSessionDetail(sessionId: string): Promise<SessionDetail | undefined>;
  createRun(
    sessionId: string,
    prompt: string
  ): Promise<{
    run: RunRecord;
    userMessage: ConversationMessage;
    assistantMessage: ConversationMessage;
  }>;
  getRun(runId: string): Promise<RunRecord | undefined>;
  updateRunStatus(runId: string, status: RunStatus): Promise<void>;
  setRunPrompt(runId: string, prompt: string): Promise<void>;
  appendAssistantContent(messageId: string, delta: string): Promise<void>;
  setRunSteps(runId: string, steps: RunStep[]): Promise<void>;
  getRunSteps(runId: string): Promise<RunStep[]>;
  addArtifact(artifact: ArtifactRecord): Promise<void>;
  listArtifacts(runId: string): Promise<ArtifactRecord[]>;
  createApproval(approval: ApprovalRequest): Promise<void>;
  getApproval(approvalId: string): Promise<ApprovalRequest | undefined>;
  updateApprovalStatus(
    approvalId: string,
    status: ApprovalRequest["status"]
  ): Promise<void>;
  setPendingClarification(
    runId: string,
    state: PendingClarificationState
  ): Promise<void>;
  getPendingClarification(
    runId: string
  ): Promise<PendingClarificationState | undefined>;
  clearPendingClarification(runId: string): Promise<void>;
  pushRunEvent(runId: string, event: AgUiEvent): Promise<void>;
  getRunEvents(runId: string): Promise<AgUiEvent[]>;
}

export interface RunEventBus {
  publish(runId: string, event: AgUiEvent): Promise<void>;
  subscribeToRun(
    runId: string,
    listener: (event: AgUiEvent) => void
  ): Promise<() => void> | (() => void);
  close?(): Promise<void>;
}

export type RunJobData =
  | {
      type: "start_run";
      runId: string;
    }
  | {
      type: "resume_run";
      runId: string;
    };
