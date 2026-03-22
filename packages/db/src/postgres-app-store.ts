import {
  asc,
  desc,
  eq,
  sql,
  type InferSelectModel
} from "drizzle-orm";
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
import { createDbClient } from "./client";
import {
  approvalRequests,
  artifacts,
  messages,
  pendingClarifications,
  runEvents,
  runs,
  runSteps,
  sessions
} from "./schema";

type Database = ReturnType<typeof createDbClient>;
type SessionRow = InferSelectModel<typeof sessions>;
type MessageRow = InferSelectModel<typeof messages>;
type RunRow = InferSelectModel<typeof runs>;
type RunStepRow = InferSelectModel<typeof runSteps>;
type ArtifactRow = InferSelectModel<typeof artifacts>;
type ApprovalRow = InferSelectModel<typeof approvalRequests>;
type PendingClarificationRow = InferSelectModel<typeof pendingClarifications>;

export class PostgresAppStore implements AppStore {
  constructor(private readonly db: Database) {}

  async createSession(title: string): Promise<SessionRecord> {
    const now = new Date();
    const record: SessionRecord = {
      id: crypto.randomUUID(),
      title,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    await this.db.insert(sessions).values({
      id: record.id,
      title: record.title,
      createdAt: now,
      updatedAt: now
    });

    return record;
  }

  async listSessions(): Promise<SessionSummary[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .orderBy(desc(sessions.updatedAt));

    const summaries = await Promise.all(
      rows.map(async (row) => {
        const latestUserMessage = await this.db
          .select()
          .from(messages)
          .where(eq(messages.sessionId, row.id))
          .orderBy(desc(messages.createdAt))
          .limit(10);

        const preview =
          latestUserMessage.find((message) => message.role === "user")?.content ??
          "New session";

        return {
          ...mapSession(row),
          lastPreview: preview
        };
      })
    );

    return summaries;
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    const row = await this.db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId)
    });

    return row ? mapSession(row) : undefined;
  }

  async getSessionDetail(
    sessionId: string
  ): Promise<SessionDetail | undefined> {
    const sessionRow = await this.db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId)
    });

    if (!sessionRow) {
      return undefined;
    }

    const [messageRows, runRows] = await Promise.all([
      this.db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(asc(messages.createdAt)),
      this.db
        .select()
        .from(runs)
        .where(eq(runs.sessionId, sessionId))
        .orderBy(asc(runs.createdAt))
    ]);

    return {
      session: mapSession(sessionRow),
      messages: messageRows.map(mapMessage),
      runs: runRows.map(mapRun)
    };
  }

  async createRun(sessionId: string, prompt: string) {
    const session = await this.db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId)
    });
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
      runId: undefined,
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

    await this.db.transaction(async (tx) => {
      await tx.insert(messages).values({
        id: userMessage.id,
        sessionId,
        runId: null,
        role: userMessage.role,
        content: userMessage.content,
        surfaceId: null,
        createdAt: userMessageAt
      });
      await tx.insert(messages).values({
        id: assistantMessage.id,
        sessionId,
        runId: run.id,
        role: assistantMessage.role,
        content: assistantMessage.content,
        surfaceId: assistantMessage.surfaceId ?? null,
        createdAt: assistantMessageAt
      });
      await tx.insert(runs).values({
        id: run.id,
        sessionId,
        status: run.status,
        prompt: run.prompt,
        userMessageId: run.userMessageId,
        assistantMessageId: run.assistantMessageId,
        createdAt: runAt,
        updatedAt: runAt
      });
      await tx
        .update(sessions)
        .set({
          title: session.title === "New session" ? prompt.slice(0, 48) : session.title,
          updatedAt: runAt
        })
        .where(eq(sessions.id, sessionId));
    });

    return {
      run,
      userMessage,
      assistantMessage
    };
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    const row = await this.db.query.runs.findFirst({
      where: eq(runs.id, runId)
    });

    return row ? mapRun(row) : undefined;
  }

  async updateRunStatus(runId: string, status: RunStatus): Promise<void> {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const run = await tx.query.runs.findFirst({
        where: eq(runs.id, runId)
      });

      if (!run) {
        return;
      }

      await tx
        .update(runs)
        .set({
          status,
          updatedAt: now
        })
        .where(eq(runs.id, runId));
      await tx
        .update(sessions)
        .set({
          updatedAt: now
        })
        .where(eq(sessions.id, run.sessionId));
    });
  }

  async setRunPrompt(runId: string, prompt: string): Promise<void> {
    await this.db
      .update(runs)
      .set({
        prompt,
        updatedAt: new Date()
      })
      .where(eq(runs.id, runId));
  }

  async appendAssistantContent(messageId: string, delta: string): Promise<void> {
    await this.db
      .update(messages)
      .set({
        content: sql`${messages.content} || ${delta}`
      })
      .where(eq(messages.id, messageId));
  }

  async setRunSteps(runId: string, steps: RunStep[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(runSteps).where(eq(runSteps.runId, runId));

      if (steps.length === 0) {
        return;
      }

      await tx.insert(runSteps).values(
        steps.map((step) => ({
          id: step.id,
          runId: step.runId,
          title: step.title,
          status: step.status,
          parentStepId: step.parentStepId ?? null,
          sequence: step.sequence,
          artifactId: step.artifactId ?? null,
          artifactKind: step.artifactKind ?? null,
          detail: step.detail ?? null,
          logs: step.logs
        }))
      );
    });
  }

  async getRunSteps(runId: string): Promise<RunStep[]> {
    const rows = await this.db
      .select()
      .from(runSteps)
      .where(eq(runSteps.runId, runId))
      .orderBy(asc(runSteps.sequence));

    return rows.map(mapRunStep);
  }

  async addArtifact(artifact: ArtifactRecord): Promise<void> {
    await this.db.insert(artifacts).values({
      id: artifact.id,
      runId: artifact.runId,
      stepId: artifact.stepId,
      sequence: artifact.sequence,
      kind: artifact.kind,
      title: artifact.title,
      payload: artifact.payload,
      createdAt: new Date(artifact.createdAt)
    });
  }

  async listArtifacts(runId: string): Promise<ArtifactRecord[]> {
    const rows = await this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.runId, runId))
      .orderBy(asc(artifacts.sequence));

    return rows.map(mapArtifact);
  }

  async createApproval(approval: ApprovalRequest): Promise<void> {
    await this.db.insert(approvalRequests).values({
      id: approval.id,
      sessionId: approval.sessionId,
      runId: approval.runId,
      type: approval.type,
      title: approval.title,
      description: approval.description,
      status: approval.status,
      createdAt: new Date(approval.createdAt)
    });
  }

  async getApproval(
    approvalId: string
  ): Promise<ApprovalRequest | undefined> {
    const row = await this.db.query.approvalRequests.findFirst({
      where: eq(approvalRequests.id, approvalId)
    });

    return row ? mapApproval(row) : undefined;
  }

  async updateApprovalStatus(
    approvalId: string,
    status: ApprovalRequest["status"]
  ): Promise<void> {
    await this.db
      .update(approvalRequests)
      .set({
        status
      })
      .where(eq(approvalRequests.id, approvalId));
  }

  async setPendingClarification(
    runId: string,
    state: PendingClarificationState
  ): Promise<void> {
    const now = new Date();

    await this.db
      .insert(pendingClarifications)
      .values({
        runId,
        prompt: state.prompt,
        question: state.question,
        placeholder: state.placeholder,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: pendingClarifications.runId,
        set: {
          prompt: state.prompt,
          question: state.question,
          placeholder: state.placeholder,
          updatedAt: now
        }
      });
  }

  async getPendingClarification(
    runId: string
  ): Promise<PendingClarificationState | undefined> {
    const row = await this.db.query.pendingClarifications.findFirst({
      where: eq(pendingClarifications.runId, runId)
    });

    return row ? mapPendingClarification(row) : undefined;
  }

  async clearPendingClarification(runId: string): Promise<void> {
    await this.db
      .delete(pendingClarifications)
      .where(eq(pendingClarifications.runId, runId));
  }

  async pushRunEvent(runId: string, event: AgUiEvent): Promise<void> {
    const now = new Date();

    await this.db.transaction(async (tx) => {
      const current = await tx
        .select({
          value: sql<number>`coalesce(max(${runEvents.sequence}), 0)`
        })
        .from(runEvents)
        .where(eq(runEvents.runId, runId));
      const sequence = Number(current[0]?.value ?? 0) + 1;

      await tx.insert(runEvents).values({
        id: crypto.randomUUID(),
        runId,
        sessionId: event.thread_id,
        sequence,
        eventType: event.type,
        payload: event,
        createdAt: now
      });
    });
  }

  async getRunEvents(runId: string): Promise<AgUiEvent[]> {
    const rows = await this.db
      .select({
        payload: runEvents.payload
      })
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(asc(runEvents.sequence));

    return rows.map((row) => row.payload as AgUiEvent);
  }
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    title: row.title,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

function mapMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    runId: row.runId ?? undefined,
    role: row.role as ConversationMessage["role"],
    content: row.content,
    surfaceId: row.surfaceId ?? undefined,
    createdAt: toIso(row.createdAt)
  };
}

function mapRun(row: RunRow): RunRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    status: row.status as RunStatus,
    prompt: row.prompt,
    userMessageId: row.userMessageId,
    assistantMessageId: row.assistantMessageId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

function mapRunStep(row: RunStepRow): RunStep {
  return {
    id: row.id,
    runId: row.runId,
    title: row.title,
    status: row.status as RunStep["status"],
    parentStepId: row.parentStepId ?? undefined,
    sequence: row.sequence,
    artifactId: row.artifactId ?? undefined,
    artifactKind: (row.artifactKind ?? undefined) as RunStep["artifactKind"],
    detail: row.detail ?? undefined,
    logs: Array.isArray(row.logs) ? row.logs.map(String) : []
  };
}

function mapArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    id: row.id,
    runId: row.runId,
    stepId: row.stepId,
    sequence: row.sequence,
    kind: row.kind as ArtifactRecord["kind"],
    title: row.title,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: toIso(row.createdAt)
  };
}

function mapApproval(row: ApprovalRow): ApprovalRequest {
  return {
    id: row.id,
    sessionId: row.sessionId,
    runId: row.runId,
    type: row.type as ApprovalRequest["type"],
    title: row.title,
    description: row.description,
    status: row.status as ApprovalRequest["status"],
    createdAt: toIso(row.createdAt)
  };
}

function mapPendingClarification(
  row: PendingClarificationRow
): PendingClarificationState {
  return {
    runId: row.runId,
    prompt: row.prompt,
    question: row.question,
    placeholder: row.placeholder
  };
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
