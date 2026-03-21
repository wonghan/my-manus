import { z } from "zod";

export const agUiEventTypeSchema = z.enum([
  "RUN_STARTED",
  "RUN_FINISHED",
  "RUN_ERROR",
  "STEP_STARTED",
  "STEP_FINISHED",
  "TEXT_MESSAGE_START",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_END",
  "TOOL_CALL_START",
  "TOOL_CALL_ARGS",
  "TOOL_CALL_END",
  "TOOL_CALL_RESULT",
  "STATE_SNAPSHOT",
  "STATE_DELTA",
  "MESSAGES_SNAPSHOT",
  "ACTIVITY_SNAPSHOT",
  "ACTIVITY_DELTA",
  "CUSTOM"
]);

const baseEventSchema = z.object({
  type: agUiEventTypeSchema,
  thread_id: z.string(),
  run_id: z.string(),
  timestamp: z.string()
});

export const runStartedEventSchema = baseEventSchema.extend({
  type: z.literal("RUN_STARTED"),
  input: z
    .object({
      prompt: z.string(),
      message_id: z.string()
    })
    .optional()
});

export const runFinishedEventSchema = baseEventSchema.extend({
  type: z.literal("RUN_FINISHED")
});

export const runErrorEventSchema = baseEventSchema.extend({
  type: z.literal("RUN_ERROR"),
  message: z.string()
});

export const stepStartedEventSchema = baseEventSchema.extend({
  type: z.literal("STEP_STARTED"),
  step_id: z.string(),
  title: z.string()
});

export const stepFinishedEventSchema = baseEventSchema.extend({
  type: z.literal("STEP_FINISHED"),
  step_id: z.string(),
  title: z.string(),
  status: z.enum(["completed", "error"])
});

export const textMessageStartEventSchema = baseEventSchema.extend({
  type: z.literal("TEXT_MESSAGE_START"),
  message_id: z.string(),
  role: z.enum(["user", "assistant"])
});

export const textMessageContentEventSchema = baseEventSchema.extend({
  type: z.literal("TEXT_MESSAGE_CONTENT"),
  message_id: z.string(),
  delta: z.string()
});

export const textMessageEndEventSchema = baseEventSchema.extend({
  type: z.literal("TEXT_MESSAGE_END"),
  message_id: z.string()
});

export const toolCallStartEventSchema = baseEventSchema.extend({
  type: z.literal("TOOL_CALL_START"),
  tool_call_id: z.string(),
  tool_name: z.string(),
  title: z.string()
});

export const toolCallArgsEventSchema = baseEventSchema.extend({
  type: z.literal("TOOL_CALL_ARGS"),
  tool_call_id: z.string(),
  delta: z.string()
});

export const toolCallEndEventSchema = baseEventSchema.extend({
  type: z.literal("TOOL_CALL_END"),
  tool_call_id: z.string()
});

export const toolCallResultEventSchema = baseEventSchema.extend({
  type: z.literal("TOOL_CALL_RESULT"),
  tool_call_id: z.string(),
  result: z.unknown()
});

export const stateSnapshotEventSchema = baseEventSchema.extend({
  type: z.literal("STATE_SNAPSHOT"),
  state: z.record(z.string(), z.unknown())
});

export const stateDeltaEventSchema = baseEventSchema.extend({
  type: z.literal("STATE_DELTA"),
  delta: z.record(z.string(), z.unknown())
});

export const activitySnapshotEventSchema = baseEventSchema.extend({
  type: z.literal("ACTIVITY_SNAPSHOT"),
  activities: z.array(z.record(z.string(), z.unknown()))
});

export const activityDeltaEventSchema = baseEventSchema.extend({
  type: z.literal("ACTIVITY_DELTA"),
  delta: z.record(z.string(), z.unknown())
});

export const customEventSchema = baseEventSchema.extend({
  type: z.literal("CUSTOM"),
  name: z.string(),
  value: z.unknown()
});

export const agUiEventSchema = z.union([
  runStartedEventSchema,
  runFinishedEventSchema,
  runErrorEventSchema,
  stepStartedEventSchema,
  stepFinishedEventSchema,
  textMessageStartEventSchema,
  textMessageContentEventSchema,
  textMessageEndEventSchema,
  toolCallStartEventSchema,
  toolCallArgsEventSchema,
  toolCallEndEventSchema,
  toolCallResultEventSchema,
  stateSnapshotEventSchema,
  stateDeltaEventSchema,
  activitySnapshotEventSchema,
  activityDeltaEventSchema,
  customEventSchema
]);

export type AgUiEvent = z.infer<typeof agUiEventSchema>;
export type AgUiEventType = z.infer<typeof agUiEventTypeSchema>;

export function createBaseEvent<T extends AgUiEventType>(
  type: T,
  threadId: string,
  runId: string
) {
  return {
    type,
    thread_id: threadId,
    run_id: runId,
    timestamp: new Date().toISOString()
  };
}

export function createA2UiCustomEvent(
  threadId: string,
  runId: string,
  value: unknown
): AgUiEvent {
  return {
    type: "CUSTOM",
    thread_id: threadId,
    run_id: runId,
    timestamp: new Date().toISOString(),
    name: "a2ui.message",
    value
  };
}
