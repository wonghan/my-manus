import { describe, expect, it } from "vitest";
import {
  a2uiUserActionSchema,
  buildAssistantMessageSurface,
  createA2UiCustomEvent,
  createBaseEvent,
  type AgUiEvent
} from "../packages/shared/src/index";
import {
  initialProtocolState,
  protocolReducer
} from "../apps/web/src/lib/protocol-state";

describe("protocol bridge", () => {
  it("hydrates an A2UI surface from AG-UI custom events", () => {
    let state = initialProtocolState;

    for (const message of buildAssistantMessageSurface("message:test")) {
      state = protocolReducer(state, {
        type: "event/received",
        event: createA2UiCustomEvent("session-1", "run-1", message)
      });
    }

    state = protocolReducer(state, {
      type: "event/received",
      event: createA2UiCustomEvent("session-1", "run-1", {
        version: "v0.8",
        type: "dataModelUpdate",
        surfaceId: "message:test",
        data: {
          content: "hello from A2UI"
        }
      })
    });

    expect(state.surfaces["message:test"]).toMatchObject({
      surfaceId: "message:test",
      rootComponentId: "message-root",
      dataModel: {
        content: "hello from A2UI"
      }
    });
  });

  it("tracks run status from AG-UI runtime events", () => {
    const runId = "run-2";
    const sessionId = "session-2";

    const events: AgUiEvent[] = [
      {
        ...createBaseEvent("RUN_STARTED", sessionId, runId),
        input: {
          prompt: "Research deployment options",
          message_id: "user-1"
        }
      },
      {
        ...createBaseEvent("STATE_DELTA", sessionId, runId),
        delta: {
          status: "waiting_approval"
        }
      },
      createBaseEvent("RUN_FINISHED", sessionId, runId)
    ];

    const state = events.reduce(
      (current, event) =>
        protocolReducer(current, {
          type: "event/received",
          event
        }),
      initialProtocolState
    );

    expect(state.runStatus[runId]).toBe("completed");
  });

  it("parses A2UI user actions with client data", () => {
    const action = a2uiUserActionSchema.parse({
      version: "v0.8",
      type: "userAction",
      sessionId: "session-3",
      runId: "run-3",
      surfaceId: "clarification:run-3",
      action: {
        name: "submit-clarification"
      },
      a2uiClientDataModel: {
        clarification: "Keep it private and simple."
      }
    });

    expect(action.a2uiClientDataModel?.clarification).toBe(
      "Keep it private and simple."
    );
  });
});
