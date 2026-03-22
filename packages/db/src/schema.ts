import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp
} from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  runId: text("run_id"),
  role: text("role").notNull(),
  content: text("content").notNull(),
  surfaceId: text("surface_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => ({
  sessionCreatedIdx: index("messages_session_created_idx").on(
    table.sessionId,
    table.createdAt
  )
}));

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  status: text("status").notNull(),
  prompt: text("prompt").notNull(),
  userMessageId: text("user_message_id").notNull(),
  assistantMessageId: text("assistant_message_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
}, (table) => ({
  sessionCreatedIdx: index("runs_session_created_idx").on(
    table.sessionId,
    table.createdAt
  )
}));

export const runSteps = pgTable("run_steps", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  parentStepId: text("parent_step_id"),
  sequence: integer("sequence").notNull(),
  artifactId: text("artifact_id"),
  artifactKind: text("artifact_kind"),
  detail: text("detail"),
  logs: jsonb("logs").notNull()
}, (table) => ({
  runSequenceIdx: index("run_steps_run_sequence_idx").on(
    table.runId,
    table.sequence
  )
}));

export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  stepId: text("step_id").notNull(),
  sequence: integer("sequence").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => ({
  runSequenceIdx: index("artifacts_run_sequence_idx").on(
    table.runId,
    table.sequence
  )
}));

export const approvalRequests = pgTable("approval_requests", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  runId: text("run_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const runEvents = pgTable("run_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  sessionId: text("session_id").notNull(),
  sequence: integer("sequence").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => ({
  runSequenceIdx: index("run_events_run_sequence_idx").on(
    table.runId,
    table.sequence
  )
}));

export const pendingClarifications = pgTable("pending_clarifications", {
  runId: text("run_id").primaryKey(),
  prompt: text("prompt").notNull(),
  question: text("question").notNull(),
  placeholder: text("placeholder").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});
