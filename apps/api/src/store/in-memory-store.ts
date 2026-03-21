import { EventEmitter } from "node:events";
import {
  type AgUiEvent,
  type ApprovalRequest,
  type ArtifactRecord,
  type ConversationMessage,
  type RunRecord,
  type RunStatus,
  type RunStep,
  type SessionDetail,
  type SessionRecord,
  type SessionSummary
} from "@my-manus/shared";

interface PendingClarificationState {
  prompt: string;
  question: string;
  placeholder: string;
}

export class InMemoryAppStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly messages = new Map<string, ConversationMessage>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly runSteps = new Map<string, RunStep[]>();
  // artifact 数据会先落在内存里，未来切到 Postgres 时可以直接复用这层接口。
  private readonly artifacts = new Map<string, ArtifactRecord[]>();
  private readonly approvals = new Map<string, ApprovalRequest>();
  // run_events 是当前版本唯一的“可重放历史”，刷新页面时依赖它恢复 A2UI surface。
  private readonly runEvents = new Map<string, AgUiEvent[]>();
  private readonly sessionMessageOrder = new Map<string, string[]>();
  private readonly sessionRunOrder = new Map<string, string[]>();
  private readonly runEmitter = new EventEmitter();
  private readonly pendingClarifications = new Map<string, PendingClarificationState>();

  createSession(title: string): SessionRecord {
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

  listSessions(): SessionSummary[] {
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

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  getSessionDetail(sessionId: string): SessionDetail | undefined {
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

  createRun(sessionId: string, prompt: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session ${sessionId}`);
    }

    const now = new Date().toISOString();
    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      sessionId,
      role: "user",
      content: prompt,
      createdAt: now
    };

    const assistantMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      sessionId,
      role: "assistant",
      content: "",
      createdAt: now
    };

    const run: RunRecord = {
      id: crypto.randomUUID(),
      sessionId,
      status: "queued",
      prompt,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      createdAt: now,
      updatedAt: now
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

  getRun(runId: string) {
    return this.runs.get(runId);
  }

  updateRunStatus(runId: string, status: RunStatus) {
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }

    run.status = status;
    run.updatedAt = new Date().toISOString();
    this.touchSession(run.sessionId);
  }

  setRunPrompt(runId: string, prompt: string) {
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }

    run.prompt = prompt;
    run.updatedAt = new Date().toISOString();
  }

  appendAssistantContent(messageId: string, delta: string) {
    const message = this.messages.get(messageId);
    if (!message) {
      return;
    }

    message.content += delta;
  }

  setRunSteps(runId: string, steps: RunStep[]) {
    this.runSteps.set(runId, steps);
  }

  getRunSteps(runId: string) {
    return this.runSteps.get(runId) ?? [];
  }

  addArtifact(artifact: ArtifactRecord) {
    const current = this.artifacts.get(artifact.runId) ?? [];
    current.push(artifact);
    this.artifacts.set(artifact.runId, current);
  }

  listArtifacts(runId: string) {
    return this.artifacts.get(runId) ?? [];
  }

  setArtifacts(runId: string, artifacts: ArtifactRecord[]) {
    this.artifacts.set(runId, artifacts);
  }

  createApproval(approval: ApprovalRequest) {
    this.approvals.set(approval.id, approval);
  }

  getApproval(approvalId: string) {
    return this.approvals.get(approvalId);
  }

  updateApprovalStatus(approvalId: string, status: ApprovalRequest["status"]) {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      return;
    }

    approval.status = status;
  }

  setPendingClarification(runId: string, state: PendingClarificationState) {
    this.pendingClarifications.set(runId, state);
  }

  getPendingClarification(runId: string) {
    return this.pendingClarifications.get(runId);
  }

  clearPendingClarification(runId: string) {
    this.pendingClarifications.delete(runId);
  }

  pushRunEvent(runId: string, event: AgUiEvent) {
    const events = this.runEvents.get(runId) ?? [];
    events.push(event);
    this.runEvents.set(runId, events);
    this.runEmitter.emit(runId, event);
  }

  getRunEvents(runId: string) {
    return this.runEvents.get(runId) ?? [];
  }

  subscribeToRun(runId: string, listener: (event: AgUiEvent) => void) {
    this.runEmitter.on(runId, listener);

    return () => {
      this.runEmitter.off(runId, listener);
    };
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
