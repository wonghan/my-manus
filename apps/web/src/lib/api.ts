import type {
  A2UiMessage,
  A2UiUserAction,
  AgUiEvent,
  ConversationMessage,
  RunRecord,
  SessionDetail,
  SessionRecord,
  SessionSummary
} from "@my-manus/shared";

export interface BootstrapResponse {
  ok: true;
  messages: A2UiMessage[];
}

export interface SessionListResponse {
  ok: true;
  sessions: SessionSummary[];
}

export interface SessionDetailResponse {
  ok: true;
  detail: SessionDetail;
}

export interface RunEventsResponse {
  ok: true;
  events: AgUiEvent[];
}

export interface RunCreateResponse {
  ok: true;
  session: SessionRecord;
  run: RunRecord;
  messages: ConversationMessage[];
}

export interface UiActionResponse {
  ok: boolean;
  session?: SessionRecord | undefined;
  run?: RunRecord | undefined;
  messages?: ConversationMessage[] | undefined;
}

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4300";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  baseUrl: apiBaseUrl,
  getBootstrap() {
    return requestJson<BootstrapResponse>("/bootstrap");
  },
  listSessions() {
    return requestJson<SessionListResponse>("/sessions");
  },
  getSessionDetail(sessionId: string) {
    return requestJson<SessionDetailResponse>(`/sessions/${sessionId}`);
  },
  getRunEvents(runId: string) {
    return requestJson<RunEventsResponse>(`/runs/${runId}/events`);
  },
  createRun(payload: {
    sessionId?: string;
    prompt: string;
  }) {
    return requestJson<RunCreateResponse>("/runs", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  postUserAction(payload: A2UiUserAction) {
    return requestJson<UiActionResponse>("/ui/actions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
};
