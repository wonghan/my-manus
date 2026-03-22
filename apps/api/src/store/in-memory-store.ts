import type {
  AgUiEvent,
  AppStore,
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
} from "@my-manus/shared";

export class InMemoryAppStore implements AppStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly messages = new Map<string, ConversationMessage>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly runSteps = new Map<string, RunStep[]>();
  // artifact 数据会先落在内存里，切到 Postgres 时会复用同一套 store 接口。
  private readonly artifacts = new Map<string, ArtifactRecord[]>();
  private readonly approvals = new Map<string, ApprovalRequest>();
  // run_events 是当前版本唯一的“可重放历史”，刷新页面时依赖它恢复 A2UI surface。
  private readonly runEvents = new Map<string, AgUiEvent[]>();
  private readonly sessionMessageOrder = new Map<string, string[]>();
  private readonly sessionRunOrder = new Map<string, string[]>();
  private readonly pendingClarifications = new Map<
    string,
    PendingClarificationState
  >();

  async createSession(title: string): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.sessions.set(session.id, session);
    this.sessionMessageOrder.set(session.id, []);
    this.sessionRunOrder.set(session.id, []);
    return session;
  }

  async listSessions(): Promise<SessionSummary[]> {
    return [...this.sessions.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((session) => {
        const messageIds = this.sessionMessageOrder.get(session.id) ?? [];
        const latestMessageId = [...messageIds].reverse().find((id) => {
          const message = this.messages.get(id);
          return message?.role === "user";
        });
        const preview = latestMessageId
          ? this.messages.get(latestMessageId)?.content ?? "Untitled session"
          : "New session";

        return {
          ...session,
          lastPreview: preview
        };
      });
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    return this.sessions.get(sessionId);
  }

  async getSessionDetail(
    sessionId: string
  ): Promise<SessionDetail | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const messages = (this.sessionMessageOrder.get(sessionId) ?? [])
      .map((messageId) => this.messages.get(messageId))
      .filter((message): message is ConversationMessage => Boolean(message));

    const runs = (this.sessionRunOrder.get(sessionId) ?? [])
      .map((runId) => this.runs.get(runId))
      .filter((run): run is RunRecord => Boolean(run));

    return {
      session,
      messages,
      runs
    };
  }

  async createRun(sessionId: string, prompt: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    const userMessageAt = new Date();
    const assistantMessageAt = new Date(userMessageAt.getTime() + 1);
    const runAt = new Date();
    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      sessionId,
      role: "user",
      content: prompt,
      createdAt: userMessageAt.toISOString()
    };

    const assistantMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      sessionId,
      role: "assistant",
      content: "",
      createdAt: assistantMessageAt.toISOString()
    };

    const run: RunRecord = {
      id: crypto.randomUUID(),
      sessionId,
      status: "queued",
      prompt,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      createdAt: runAt.toISOString(),
      updatedAt: runAt.toISOString()
    };

    assistantMessage.runId = run.id;
    assistantMessage.surfaceId = `message:${assistantMessage.id}`;

    this.messages.set(userMessage.id, userMessage);
    this.messages.set(assistantMessage.id, assistantMessage);
    this.runs.set(run.id, run);
    this.runSteps.set(run.id, []);
    this.artifacts.set(run.id, []);
    this.runEvents.set(run.id, []);

    const sessionMessages = this.sessionMessageOrder.get(sessionId) ?? [];
    sessionMessages.push(userMessage.id, assistantMessage.id);
    this.sessionMessageOrder.set(sessionId, sessionMessages);

    const sessionRuns = this.sessionRunOrder.get(sessionId) ?? [];
    sessionRuns.push(run.id);
    this.sessionRunOrder.set(sessionId, sessionRuns);

    this.touchSession(sessionId, prompt);

    return {
      run,
      userMessage,
      assistantMessage
    };
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    return this.runs.get(runId);
  }

  async updateRunStatus(runId: string, status: RunStatus): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }

    run.status = status;
    run.updatedAt = new Date().toISOString();
    this.touchSession(run.sessionId);
  }

  async setRunPrompt(runId: string, prompt: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }

    run.prompt = prompt;
    run.updatedAt = new Date().toISOString();
  }

  async appendAssistantContent(messageId: string, delta: string): Promise<void> {
    const message = this.messages.get(messageId);
    if (!message) {
      return;
    }

    message.content += delta;
  }

  async setRunSteps(runId: string, steps: RunStep[]): Promise<void> {
    this.runSteps.set(runId, steps);
  }

  async getRunSteps(runId: string): Promise<RunStep[]> {
    return this.runSteps.get(runId) ?? [];
  }

  async addArtifact(artifact: ArtifactRecord): Promise<void> {
    const current = this.artifacts.get(artifact.runId) ?? [];
    current.push(artifact);
    this.artifacts.set(artifact.runId, current);
  }

  async listArtifacts(runId: string): Promise<ArtifactRecord[]> {
    return this.artifacts.get(runId) ?? [];
  }

  async createApproval(approval: ApprovalRequest): Promise<void> {
    this.approvals.set(approval.id, approval);
  }

  async getApproval(
    approvalId: string
  ): Promise<ApprovalRequest | undefined> {
    return this.approvals.get(approvalId);
  }

  async updateApprovalStatus(
    approvalId: string,
    status: ApprovalRequest["status"]
  ): Promise<void> {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      return;
    }

    approval.status = status;
  }

  async setPendingClarification(
    runId: string,
    state: PendingClarificationState
  ): Promise<void> {
    this.pendingClarifications.set(runId, state);
  }

  async getPendingClarification(
    runId: string
  ): Promise<PendingClarificationState | undefined> {
    return this.pendingClarifications.get(runId);
  }

  async clearPendingClarification(runId: string): Promise<void> {
    this.pendingClarifications.delete(runId);
  }

  async pushRunEvent(runId: string, event: AgUiEvent): Promise<void> {
    const events = this.runEvents.get(runId) ?? [];
    events.push(event);
    this.runEvents.set(runId, events);
  }

  async getRunEvents(runId: string): Promise<AgUiEvent[]> {
    return this.runEvents.get(runId) ?? [];
  }

  private touchSession(sessionId: string, titleHint?: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.title === "New session" && titleHint) {
      session.title = titleHint.slice(0, 48);
    }

    session.updatedAt = new Date().toISOString();
  }
}
