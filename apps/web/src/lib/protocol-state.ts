import {
  agUiEventSchema,
  a2uiMessageSchema,
  deepMerge,
  type A2UiComponentNode,
  type A2UiMessage,
  type AgUiEvent,
  type ConversationMessage,
  type RunRecord,
  type RunStatus,
  type SessionDetail,
  type SessionSummary
} from "@my-manus/shared";

export interface SurfaceState {
  surfaceId: string;
  title?: string;
  catalogId?: string;
  rootComponentId?: string;
  components: Record<string, A2UiComponentNode>;
  dataModel: Record<string, unknown>;
}

export interface ProtocolState {
  sessions: SessionSummary[];
  sessionDetails: Record<string, SessionDetail>;
  activeSessionId?: string;
  activeRunId?: string;
  // surfaces 只保存 Agent-owned UI；应用外壳本身不走 A2UI。
  surfaces: Record<string, SurfaceState>;
  runStatus: Record<string, RunStatus>;
  errorMessage?: string;
}

export const initialProtocolState: ProtocolState = {
  sessions: [],
  sessionDetails: {},
  surfaces: {},
  runStatus: {}
};

export type ProtocolAction =
  | {
      type: "sessions/loaded";
      sessions: SessionSummary[];
    }
  | {
      type: "session/selected";
      sessionId?: string;
      activeRunId?: string;
    }
  | {
      type: "session/detailLoaded";
      detail: SessionDetail;
    }
  | {
      type: "run/created";
      session: SessionSummary;
      run: RunRecord;
      messages: ConversationMessage[];
    }
  | {
      type: "event/received";
      event: AgUiEvent;
    }
  | {
      type: "error";
      message: string;
    };

export function protocolReducer(
  state: ProtocolState,
  action: ProtocolAction
): ProtocolState {
  switch (action.type) {
    case "sessions/loaded":
      return {
        ...state,
        sessions: action.sessions
      };
    case "session/selected":
      return {
        ...state,
        activeSessionId: action.sessionId,
        activeRunId: action.activeRunId
      };
    case "session/detailLoaded":
      return {
        ...state,
        sessionDetails: {
          ...state.sessionDetails,
          [action.detail.session.id]: action.detail
        },
        runStatus: {
          ...state.runStatus,
          ...Object.fromEntries(
            action.detail.runs.map((run) => [run.id, run.status])
          )
        }
      };
    case "run/created": {
      const existing = state.sessionDetails[action.session.id];
      const detail: SessionDetail = existing
        ? {
            ...existing,
            session: action.session,
            messages: [...existing.messages, ...action.messages],
            runs: [...existing.runs, action.run]
          }
        : {
            session: action.session,
            messages: action.messages,
            runs: [action.run]
          };

      const nextSessions = mergeSessionSummary(state.sessions, action.session);

      return {
        ...state,
        sessions: nextSessions,
        sessionDetails: {
          ...state.sessionDetails,
          [action.session.id]: detail
        },
        activeSessionId: action.session.id,
        activeRunId: action.run.id,
        runStatus: {
          ...state.runStatus,
          [action.run.id]: action.run.status
        }
      };
    }
    case "event/received":
      return reduceAgUiEvent(state, action.event);
    case "error":
      return {
        ...state,
        errorMessage: action.message
      };
    default:
      return state;
  }
}

function reduceAgUiEvent(state: ProtocolState, event: AgUiEvent): ProtocolState {
  const parsed = agUiEventSchema.parse(event);

  let nextState = state;

  switch (parsed.type) {
    case "RUN_STARTED":
      nextState = {
        ...nextState,
        runStatus: {
          ...nextState.runStatus,
          [parsed.run_id]: "running"
        }
      };
      break;
    case "RUN_FINISHED":
      nextState = {
        ...nextState,
        runStatus: {
          ...nextState.runStatus,
          [parsed.run_id]: "completed"
        }
      };
      break;
    case "RUN_ERROR":
      nextState = {
        ...nextState,
        runStatus: {
          ...nextState.runStatus,
          [parsed.run_id]: "failed"
        },
        errorMessage: parsed.message
      };
      break;
    case "TEXT_MESSAGE_CONTENT":
      nextState = appendAssistantDelta(nextState, parsed.message_id, parsed.delta);
      break;
    case "STATE_DELTA": {
      const status = parsed.delta.status;
      if (typeof status === "string") {
        nextState = {
          ...nextState,
          runStatus: {
            ...nextState.runStatus,
            [parsed.run_id]: status as RunStatus
          }
        };
      }
      break;
    }
    case "CUSTOM":
      // A2UI 不单独开 SSE 通道，而是挂在 AG-UI CUSTOM 事件里做协议桥接。
      if (parsed.name === "a2ui.message") {
        const message = a2uiMessageSchema.parse(parsed.value);
        nextState = applyA2UiMessage(nextState, message);
      }
      break;
    default:
      break;
  }

  return nextState;
}

function appendAssistantDelta(
  state: ProtocolState,
  messageId: string,
  delta: string
) {
  const sessionEntries = Object.entries(state.sessionDetails);
  const updates = Object.fromEntries(
    sessionEntries.map(([sessionId, detail]) => {
      const messages = detail.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: message.content + delta
            }
          : message
      );

      return [
        sessionId,
        {
          ...detail,
          messages
        }
      ];
    })
  );

  return {
    ...state,
    sessionDetails: {
      ...state.sessionDetails,
      ...updates
    }
  };
}

function applyA2UiMessage(state: ProtocolState, message: A2UiMessage): ProtocolState {
  const parsed = a2uiMessageSchema.parse(message);
  const currentSurface = state.surfaces[parsed.surfaceId] ?? {
    surfaceId: parsed.surfaceId,
    components: {},
    dataModel: {}
  };

  switch (parsed.type) {
    case "beginRendering":
      return {
        ...state,
        surfaces: {
          ...state.surfaces,
          [parsed.surfaceId]: {
            ...currentSurface,
            title: parsed.title,
            catalogId: parsed.catalogId
          }
        }
      };
    case "surfaceUpdate":
      return {
        ...state,
        surfaces: {
          ...state.surfaces,
          [parsed.surfaceId]: {
            ...currentSurface,
            rootComponentId: parsed.rootComponentId,
            components: {
              ...currentSurface.components,
              ...Object.fromEntries(
                parsed.components.map((component) => [component.id, component])
              )
            }
          }
        }
      };
    case "dataModelUpdate":
      return {
        ...state,
        surfaces: {
          ...state.surfaces,
          [parsed.surfaceId]: {
            ...currentSurface,
            dataModel: deepMerge(currentSurface.dataModel, parsed.data)
          }
        }
      };
    case "deleteSurface": {
      const remaining = { ...state.surfaces };
      delete remaining[parsed.surfaceId];
      return {
        ...state,
        surfaces: remaining
      };
    }
    default:
      return state;
  }
}

function mergeSessionSummary(
  sessions: SessionSummary[],
  session: SessionSummary | SessionDetail["session"]
) {
  const summary: SessionSummary = {
    ...session,
    lastPreview:
      "lastPreview" in session ? session.lastPreview : "Latest run updated"
  };

  const withoutCurrent = sessions.filter((item) => item.id !== session.id);
  return [summary, ...withoutCurrent];
}
