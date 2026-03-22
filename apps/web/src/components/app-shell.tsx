"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import clsx from "clsx";
import {
  Bot,
  Clock,
  Maximize2,
  Menu,
  Minimize2,
  Paperclip,
  Plus,
  Send,
  Settings,
  Sparkles,
  Zap
} from "lucide-react";
import { motion } from "motion/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { A2UiUserAction, AgUiEvent, ConversationMessage } from "@my-manus/shared";
import { apiClient } from "../lib/api";
import {
  initialProtocolState,
  protocolReducer,
  type SurfaceState
} from "../lib/protocol-state";
import { ProtocolSurface } from "./protocol-surface";

const UI_STATE_STORAGE_KEY = "my-manus.ui-state.v1";

interface PersistedUiState {
  activeSessionId?: string;
  activeRunIdBySession: Record<string, string>;
  selectedArtifactIdByRun: Record<string, string>;
  isArtifactPinnedByRun: Record<string, boolean>;
}

function readPersistedUiState(): PersistedUiState {
  if (typeof window === "undefined") {
    return {
      activeRunIdBySession: {},
      selectedArtifactIdByRun: {},
      isArtifactPinnedByRun: {}
    };
  }

  try {
    const raw = window.localStorage.getItem(UI_STATE_STORAGE_KEY);

    if (!raw) {
      return {
        activeRunIdBySession: {},
        selectedArtifactIdByRun: {},
        isArtifactPinnedByRun: {}
      };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedUiState>;

    return {
      activeSessionId:
        typeof parsed.activeSessionId === "string"
          ? parsed.activeSessionId
          : undefined,
      activeRunIdBySession:
        parsed.activeRunIdBySession &&
        typeof parsed.activeRunIdBySession === "object"
          ? parsed.activeRunIdBySession
          : {},
      selectedArtifactIdByRun:
        parsed.selectedArtifactIdByRun &&
        typeof parsed.selectedArtifactIdByRun === "object"
          ? parsed.selectedArtifactIdByRun
          : {},
      isArtifactPinnedByRun:
        parsed.isArtifactPinnedByRun &&
        typeof parsed.isArtifactPinnedByRun === "object"
          ? parsed.isArtifactPinnedByRun
          : {}
    };
  } catch {
    return {
      activeRunIdBySession: {},
      selectedArtifactIdByRun: {},
      isArtifactPinnedByRun: {}
    };
  }
}

export function AppShell() {
  const initialUiStateRef = useRef<PersistedUiState>(readPersistedUiState());
  const [state, dispatch] = useReducer(protocolReducer, initialProtocolState);
  const [prompt, setPrompt] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [activeRunIdBySession, setActiveRunIdBySession] = useState<
    Record<string, string>
  >(() => initialUiStateRef.current.activeRunIdBySession);
  const [selectedArtifactIdByRun, setSelectedArtifactIdByRun] = useState<
    Record<string, string>
  >(() => initialUiStateRef.current.selectedArtifactIdByRun);
  const [isArtifactPinnedByRun, setIsArtifactPinnedByRun] = useState<
    Record<string, boolean>
  >(() => initialUiStateRef.current.isArtifactPinnedByRun);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadSession = useCallback(async (sessionId: string, preferredRunId?: string) => {
    const detailResponse = await apiClient.getSessionDetail(sessionId);
    dispatch({
      type: "session/detailLoaded",
      detail: detailResponse.detail
    });

    for (const run of detailResponse.detail.runs) {
      const eventsResponse = await apiClient.getRunEvents(run.id);
      for (const event of eventsResponse.events) {
        dispatch({
          type: "event/received",
          event
        });
      }
    }

    const preferredRun = preferredRunId
      ? detailResponse.detail.runs.find((run) => run.id === preferredRunId)
      : undefined;
    const latestRun = preferredRun ?? detailResponse.detail.runs.at(-1);

    if (latestRun) {
      setActiveRunIdBySession((current) => ({
        ...current,
        [sessionId]: latestRun.id
      }));
    }

    dispatch({
      type: "session/selected",
      sessionId,
      activeRunId: latestRun?.id
    });

    if (latestRun) {
      openRunStream(latestRun.id, false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [bootstrap, sessions] = await Promise.all([
          apiClient.getBootstrap(),
          apiClient.listSessions()
        ]);

        for (const message of bootstrap.messages) {
          dispatch({
            type: "event/received",
            event: {
              type: "CUSTOM",
              thread_id: "bootstrap",
              run_id: "bootstrap",
              timestamp: new Date().toISOString(),
              name: "a2ui.message",
              value: message
            } satisfies AgUiEvent
          });
        }

        dispatch({
          type: "sessions/loaded",
          sessions: sessions.sessions
        });

        const preferredSessionId =
          initialUiStateRef.current.activeSessionId &&
          sessions.sessions.some(
            (session) => session.id === initialUiStateRef.current.activeSessionId
          )
            ? initialUiStateRef.current.activeSessionId
            : sessions.sessions[0]?.id;

        if (preferredSessionId) {
          await loadSession(
            preferredSessionId,
            initialUiStateRef.current.activeRunIdBySession[preferredSessionId]
          );
        }
      } catch (error) {
        dispatch({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to bootstrap the app."
        });
      } finally {
        setIsBootstrapping(false);
      }
    })();

    return () => {
      eventSourceRef.current?.close();
    };
  }, [loadSession]);

  useEffect(() => {
    if (!state.activeSessionId || !state.activeRunId) {
      return;
    }

    const sessionId = state.activeSessionId;
    const runId = state.activeRunId;

    setActiveRunIdBySession((current) => {
      if (current[sessionId] === runId) {
        return current;
      }

      return {
        ...current,
        [sessionId]: runId
      };
    });
  }, [state.activeRunId, state.activeSessionId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (isBootstrapping) {
      return;
    }

    const snapshot: PersistedUiState = {
      activeSessionId: state.activeSessionId,
      activeRunIdBySession,
      selectedArtifactIdByRun,
      isArtifactPinnedByRun
    };

    window.localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(snapshot));
  }, [
    activeRunIdBySession,
    isBootstrapping,
    isArtifactPinnedByRun,
    selectedArtifactIdByRun,
    state.activeSessionId
  ]);

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    const response = await apiClient.createRun({
      sessionId: state.activeSessionId,
      prompt: trimmed
    });

    dispatch({
      type: "run/created",
      session: {
        ...response.session,
        lastPreview: trimmed
      },
      run: response.run,
      messages: response.messages
    });

    setPrompt("");
    setIsFullscreen(false);
    setIsArtifactPinnedByRun((current) => ({
      ...current,
      [response.run.id]: false
    }));
    openRunStream(response.run.id, true);

    const sessions = await apiClient.listSessions();
    dispatch({
      type: "sessions/loaded",
      sessions: sessions.sessions
    });
  }, [prompt, state.activeSessionId]);

  async function handleSurfaceAction(payload: A2UiUserAction) {
    const response = await apiClient.postUserAction(payload);
    if (response.session && response.run && response.messages) {
      const run = response.run;

      dispatch({
        type: "run/created",
        session: {
          ...response.session,
          lastPreview: response.messages[0]?.content ?? "New run"
        },
        run,
        messages: response.messages
      });

      setIsFullscreen(false);
      setIsArtifactPinnedByRun((current) => ({
        ...current,
        [run.id]: false
      }));
      openRunStream(run.id, true);
      const sessions = await apiClient.listSessions();
      dispatch({
        type: "sessions/loaded",
        sessions: sessions.sessions
      });
    }
  }

  function openRunStream(runId: string, replay: boolean) {
    eventSourceRef.current?.close();
    const source = new EventSource(
      `${apiClient.baseUrl}/runs/${runId}/stream?replay=${replay ? "1" : "0"}`
    );

    source.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as AgUiEvent;
      dispatch({
        type: "event/received",
        event: parsed
      });
    };

    source.onerror = () => {
      source.close();
    };

    eventSourceRef.current = source;
  }

  const activeDetail = state.activeSessionId
    ? state.sessionDetails[state.activeSessionId]
    : undefined;
  const activeRunId = state.activeRunId;
  const activeRunStatus = activeRunId ? state.runStatus[activeRunId] : undefined;
  const activeStepsSurface = activeRunId
    ? state.surfaces[`steps:${activeRunId}`]
    : undefined;
  const latestArtifactId =
    activeStepsSurface &&
    typeof activeStepsSurface.dataModel.latestArtifactId === "string"
      ? String(activeStepsSurface.dataModel.latestArtifactId)
      : undefined;
  const pinnedArtifactId = activeRunId
    ? selectedArtifactIdByRun[activeRunId]
    : undefined;
  const visibleArtifactId =
    activeRunId && isArtifactPinnedByRun[activeRunId]
      ? pinnedArtifactId
      : latestArtifactId ?? pinnedArtifactId;
  const workspaceSurface = visibleArtifactId
    ? state.surfaces[`artifact:${visibleArtifactId}`]
    : undefined;
  const workspaceActionsSurface = activeRunId
    ? state.surfaces[`artifact:${activeRunId}:actions`]
    : undefined;
  const hasWorkspace = Boolean(workspaceSurface);
  const isThinking = activeRunStatus === "running";

  const handleSelectArtifact = useCallback(
    (runId: string, artifactId: string) => {
      dispatch({
        type: "session/selected",
        sessionId: state.activeSessionId,
        activeRunId: runId
      });
      setSelectedArtifactIdByRun((current) => ({
        ...current,
        [runId]: artifactId
      }));
      setIsArtifactPinnedByRun((current) => ({
        ...current,
        [runId]: true
      }));
    },
    [state.activeSessionId]
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white font-sans text-gray-900 selection:bg-blue-200 selection:text-blue-900">
      <SidebarView
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        sessions={state.sessions}
        activeSessionId={state.activeSessionId}
        onSelectSession={(sessionId) =>
          void loadSession(sessionId, activeRunIdBySession[sessionId])
        }
        onNewSession={() => {
          eventSourceRef.current?.close();
          setIsFullscreen(false);
          dispatch({
            type: "session/selected",
            sessionId: undefined,
            activeRunId: undefined
          });
        }}
      />

      <div
        className={clsx(
          "relative flex h-full flex-1 flex-col overflow-hidden",
          hasWorkspace ? "bg-gray-50/50" : "bg-white"
        )}
      >
        {!hasWorkspace ? (
          <div className="h-full w-full max-w-4xl flex-1 self-center shadow-2xl shadow-gray-200/20">
              <ChatPanel
                detail={activeDetail}
                isThinking={isThinking}
                isBootstrapping={isBootstrapping}
                prompt={prompt}
                setPrompt={setPrompt}
                errorMessage={state.errorMessage}
                onSubmit={handleSubmit}
                onSurfaceAction={handleSurfaceAction}
                surfaces={state.surfaces}
                selectedArtifactIdByRun={selectedArtifactIdByRun}
                onSelectArtifact={handleSelectArtifact}
              />
          </div>
        ) : (
          <PanelGroup direction="horizontal" className="h-full w-full">
            {!isFullscreen ? (
              <>
                <Panel
                  defaultSize={45}
                  minSize={30}
                  className="h-full border-r border-gray-200/80 bg-white shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]"
                >
                  <ChatPanel
                    detail={activeDetail}
                    isThinking={isThinking}
                    isBootstrapping={isBootstrapping}
                    prompt={prompt}
                    setPrompt={setPrompt}
                    errorMessage={state.errorMessage}
                    onSubmit={handleSubmit}
                    onSurfaceAction={handleSurfaceAction}
                    surfaces={state.surfaces}
                    selectedArtifactIdByRun={selectedArtifactIdByRun}
                    onSelectArtifact={handleSelectArtifact}
                  />
                </Panel>
                <PanelResizeHandle className="group z-20 flex w-1.5 cursor-col-resize items-center justify-center border-x border-gray-200/50 bg-gray-100/50 transition-colors hover:bg-blue-400 active:bg-blue-500">
                  <div className="h-8 w-1 rounded-full bg-gray-300 transition-colors group-hover:bg-white" />
                </PanelResizeHandle>
              </>
            ) : null}

            <Panel
              defaultSize={isFullscreen ? 100 : 55}
              minSize={20}
              className="h-full bg-gray-50/80"
            >
              <WorkspacePanel
                surface={workspaceSurface}
                actionsSurface={workspaceActionsSurface}
                sessionId={state.activeSessionId}
                runId={activeRunId}
                onSurfaceAction={handleSurfaceAction}
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => setIsFullscreen((current) => !current)}
              />
            </Panel>
          </PanelGroup>
        )}
      </div>
    </div>
  );
}

interface SidebarViewProps {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  sessions: {
    id: string;
    title: string;
    updatedAt: string;
    lastPreview: string;
  }[];
  activeSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
}

function SidebarView({
  isOpen,
  setIsOpen,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession
}: SidebarViewProps) {
  if (!isOpen) {
    return (
      <div className="hidden h-full w-14 shrink-0 flex-col items-center gap-4 border-r border-gray-200 bg-gray-50 py-4 md:flex">
        <button
          onClick={() => setIsOpen(true)}
          className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-200"
        >
          <Menu size={20} />
        </button>
        <button
          onClick={onNewSession}
          className="mt-2 rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-200"
          title="New Session"
        >
          <Plus size={20} />
        </button>
        <div className="mt-auto flex flex-col gap-4">
          <button className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-200">
            <Settings size={20} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute z-10 flex h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50 shadow-lg md:relative md:shadow-none">
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <div className="flex items-center gap-2 font-semibold text-gray-800">
          <Zap size={20} className="text-blue-500" />
          <span>Manus Clone</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-200"
        >
          <Menu size={18} />
        </button>
      </div>

      <div className="p-3">
        <button
          onClick={onNewSession}
          className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50"
        >
          <Plus size={16} />
          New Agent Session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Recent
        </div>
        <div className="flex flex-col gap-1">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={clsx(
                "group flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left transition-colors",
                activeSessionId === session.id
                  ? "bg-gray-200"
                  : "hover:bg-gray-200"
              )}
            >
              <span className="truncate text-sm text-gray-700 transition-colors group-hover:text-gray-900">
                {session.title}
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Clock size={10} />
                {formatRelativeTime(session.updatedAt)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex cursor-pointer items-center gap-3 border-t border-gray-200 p-4 transition-colors hover:bg-gray-100">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
          U
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="truncate text-sm font-medium text-gray-800">
            User Account
          </div>
          <div className="truncate text-xs text-gray-500">Pro Plan</div>
        </div>
        <Settings size={16} className="text-gray-400" />
      </div>
    </div>
  );
}

interface ChatPanelProps {
  detail?: {
    session: {
      id: string;
    };
    messages: ConversationMessage[];
  };
  isThinking: boolean;
  isBootstrapping: boolean;
  prompt: string;
  setPrompt: (value: string) => void;
  errorMessage?: string;
  onSubmit: () => Promise<void>;
  onSurfaceAction: (payload: A2UiUserAction) => Promise<void>;
  surfaces: Record<string, SurfaceState>;
  selectedArtifactIdByRun: Record<string, string>;
  onSelectArtifact: (runId: string, artifactId: string) => void;
}

function ChatPanel({
  detail,
  isThinking,
  isBootstrapping,
  prompt,
  setPrompt,
  errorMessage,
  onSubmit,
  onSurfaceAction,
  surfaces,
  selectedArtifactIdByRun,
  onSelectArtifact
}: ChatPanelProps) {
  const sessionId = detail?.session.id ?? "bootstrap";
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages, isThinking]);

  return (
    <div className="relative flex h-full flex-col bg-white">
      <div className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth">
        <div className="mx-auto max-w-3xl space-y-8">
          {isBootstrapping ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <Bot size={26} className="text-blue-500" />
              </motion.div>
              <div className="text-lg font-semibold text-gray-800">
                Restoring saved workspace...
              </div>
              <div className="mt-2 text-sm text-gray-500">
                Reloading sessions, runs, and artifact history from storage.
              </div>
            </div>
          ) : !detail || detail.messages.length === 0 ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 shadow-sm"
              >
                <Sparkles size={32} className="text-blue-500" />
              </motion.div>
              <ProtocolSurface
                surface={surfaces["session-empty-state"]}
                sessionId={sessionId}
                onAction={onSurfaceAction}
              />
            </div>
          ) : (
            detail.messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={clsx(
                  "flex gap-4",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gray-900 px-5 py-3 text-[15px] leading-relaxed text-white shadow-sm">
                    {message.content}
                  </div>
                ) : (
                  <div className="flex w-full max-w-[85%] gap-4">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-100 shadow-sm">
                      <Bot size={16} className="text-blue-600" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <ProtocolSurface
                        surface={
                          message.surfaceId
                            ? surfaces[message.surfaceId]
                            : undefined
                        }
                        sessionId={detail.session.id}
                        runId={message.runId}
                        onAction={onSurfaceAction}
                      />
                      <ProtocolSurface
                        surface={
                          message.runId
                            ? surfaces[`steps:${message.runId}`]
                            : undefined
                        }
                        sessionId={detail.session.id}
                        runId={message.runId}
                        selectedArtifactId={
                          message.runId
                            ? selectedArtifactIdByRun[message.runId]
                            : undefined
                        }
                        onSelectArtifact={(artifactId) => {
                          if (message.runId) {
                            onSelectArtifact(message.runId, artifactId);
                          }
                        }}
                        onAction={onSurfaceAction}
                      />
                      <ProtocolSurface
                        surface={
                          message.runId
                            ? surfaces[`clarification:${message.runId}`]
                            : undefined
                        }
                        sessionId={detail.session.id}
                        runId={message.runId}
                        onAction={onSurfaceAction}
                      />
                      <ProtocolSurface
                        surface={
                          message.runId
                            ? surfaces[`approval:${message.runId}`]
                            : undefined
                        }
                        sessionId={detail.session.id}
                        runId={message.runId}
                        onAction={onSurfaceAction}
                      />
                      <ProtocolSurface
                        surface={
                          message.runId ? surfaces[`error:${message.runId}`] : undefined
                        }
                        sessionId={detail.session.id}
                        runId={message.runId}
                        onAction={onSurfaceAction}
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            ))
          )}

          {isThinking ? (
            <div className="flex gap-4">
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-100 shadow-sm">
                <Bot size={16} className="text-blue-600" />
              </div>
              <div className="rounded-full border border-gray-100 bg-gray-50 px-4 py-2 text-sm font-medium tracking-wide text-gray-500">
                Agent is thinking...
              </div>
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="relative z-20 border-t border-gray-100 bg-white/80 p-4 backdrop-blur-md">
        <div className="mx-auto max-w-3xl">
          <div
            className={clsx(
              "relative flex items-end gap-2 rounded-2xl border border-gray-300 bg-gray-50 p-2 shadow-sm transition-all duration-200 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100",
              isThinking ? "opacity-70" : ""
            )}
          >
            <button
              type="button"
              className="mb-0.5 shrink-0 rounded-xl p-2.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
              disabled={isThinking}
            >
              <Paperclip size={20} />
            </button>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
              placeholder="Ask me to do anything..."
              disabled={isThinking}
              className="m-0 max-h-[120px] min-h-[48px] flex-1 resize-none bg-transparent px-1 py-3 text-[15px] leading-relaxed text-gray-800 outline-none placeholder:text-gray-400"
              rows={1}
            />
            <button
              onClick={() => void onSubmit()}
              disabled={!prompt.trim() || isThinking}
              className={clsx(
                "mb-0.5 shrink-0 rounded-xl p-2.5 shadow-sm transition-all",
                prompt.trim() && !isThinking
                  ? "bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700 hover:shadow-md"
                  : "cursor-not-allowed bg-gray-200 text-gray-400"
              )}
            >
              <Send
                size={18}
                className={
                  prompt.trim() && !isThinking
                    ? "translate-x-0.5 -translate-y-0.5"
                    : ""
                }
              />
            </button>
          </div>
          <div className="mt-2 text-center text-xs font-medium tracking-wide text-gray-400">
            {errorMessage ?? "Agent can make mistakes. Verify important information."}
          </div>
        </div>
      </div>
    </div>
  );
}

interface WorkspacePanelProps {
  surface?: SurfaceState;
  actionsSurface?: SurfaceState;
  sessionId?: string;
  runId?: string;
  onSurfaceAction: (payload: A2UiUserAction) => Promise<void>;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

function WorkspacePanel({
  surface,
  actionsSurface,
  sessionId,
  runId,
  onSurfaceAction,
  isFullscreen,
  onToggleFullscreen
}: WorkspacePanelProps) {
  return (
    <div className="relative h-full w-full bg-gray-100/50 p-4">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-60" />

      <div className="absolute right-6 top-6 z-20">
        <button
          onClick={onToggleFullscreen}
          className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-900 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          title={isFullscreen ? "Restore View" : "Maximize Workspace"}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      <div className="relative z-10 flex h-full flex-col gap-4">
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200/50 bg-white shadow-sm">
          {surface ? (
            <div className="h-full overflow-y-auto p-5">
              <ProtocolSurface
                surface={surface}
                sessionId={sessionId}
                runId={runId}
                onAction={onSurfaceAction}
              />
            </div>
          ) : null}
        </div>
        {actionsSurface ? (
          <div className="rounded-xl border border-gray-200/50 bg-white p-4 shadow-sm">
            <ProtocolSurface
              surface={actionsSurface}
              sessionId={sessionId}
              runId={runId}
              onAction={onSurfaceAction}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatRelativeTime(value: string) {
  const target = new Date(value).getTime();
  const diff = Date.now() - target;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < hour) {
    return `${Math.max(1, Math.round(diff / minute))} minutes ago`;
  }

  if (diff < day) {
    return `${Math.max(1, Math.round(diff / hour))} hours ago`;
  }

  return `${Math.max(1, Math.round(diff / day))} days ago`;
}
