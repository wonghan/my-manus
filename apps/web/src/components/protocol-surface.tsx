"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Code2,
  Database,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  MousePointer2,
  RefreshCw,
  Search,
  ShieldAlert,
  Terminal
} from "lucide-react";
import {
  getValueAtPath,
  type A2UiBinding,
  type A2UiUserAction
} from "@my-manus/shared";
import type { SurfaceState } from "../lib/protocol-state";

interface SurfaceHostProps {
  surface?: SurfaceState;
  sessionId?: string;
  runId?: string;
  onAction: (payload: A2UiUserAction) => Promise<void>;
}

interface TimelineRecord {
  id?: string;
  title?: string;
  status?: string;
  logs?: string[];
  details?: string;
  subSteps?: TimelineRecord[];
}

export function ProtocolSurface({
  surface,
  sessionId,
  runId,
  onAction
}: SurfaceHostProps) {
  const [fields, setFields] = useState<Record<string, string>>({});

  const rootComponent = useMemo(() => {
    if (!surface?.rootComponentId) {
      return undefined;
    }

    return surface.components[surface.rootComponentId];
  }, [surface]);

  if (!surface || !rootComponent || !sessionId) {
    return null;
  }

  const currentSurface = surface;
  const currentSessionId = sessionId;

  return <div className="w-full">{renderNode(rootComponent.id)}</div>;

  function renderNode(componentId: string): React.ReactNode {
    const component = currentSurface.components[componentId];
    if (!component) {
      return null;
    }

    const childNodes = component.children?.map((childId) => renderNode(childId));
    const props = resolveProps(component.props);

    switch (component.type) {
      case "Column":
        return (
          <div className={clsx("flex flex-col", gapClass(props.gap))} key={component.id}>
            {childNodes}
          </div>
        );
      case "Row":
        return (
          <div className={clsx("flex items-center", gapClass(props.gap))} key={component.id}>
            {childNodes}
          </div>
        );
      case "Card":
        return (
          <section
            className="my-4 w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            key={component.id}
          >
            {childNodes}
          </section>
        );
      case "Text":
        return (
          <p className={textToneClass(String(props.tone ?? "body"))} key={component.id}>
            {String(props.text ?? "")}
          </p>
        );
      case "Markdown":
        return (
          <div className="agent-prose mb-3 text-[15px] leading-relaxed" key={component.id}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {String(props.markdown ?? "")}
            </ReactMarkdown>
          </div>
        );
      case "Badge":
        return (
          <span
            className={clsx(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
              badgeToneClass(String(props.tone ?? "info"))
            )}
            key={component.id}
          >
            {String(props.label ?? "")}
          </span>
        );
      case "Button":
        return (
          <button
            className={buttonClass(String(props.variant ?? "primary"))}
            key={component.id}
            onClick={() => {
              const action = props.action as
                | {
                    name: string;
                    payload?: Record<string, unknown>;
                  }
                | undefined;

              if (!action) {
                return;
              }

              void onAction({
                version: "v0.8",
                type: "userAction",
                sessionId: currentSessionId,
                runId,
                surfaceId: currentSurface.surfaceId,
                action,
                a2uiClientDataModel: {
                  ...currentSurface.dataModel,
                  ...fields
                }
              });
            }}
          >
            {String(props.label ?? "Action")}
          </button>
        );
      case "ButtonGroup":
        return (
          <div className="flex flex-wrap items-center gap-2" key={component.id}>
            {childNodes}
          </div>
        );
      case "Divider":
        return <hr className="my-3 border-gray-200" key={component.id} />;
      case "Input":
        return (
          <label className="flex w-full flex-col gap-2 text-sm text-gray-700" key={component.id}>
            <span>{String(props.label ?? "")}</span>
            <input
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              placeholder={String(props.placeholder ?? "")}
              value={fields[String(props.field ?? component.id)] ?? ""}
              onChange={(event) =>
                setFields((current) => ({
                  ...current,
                  [String(props.field ?? component.id)]: event.target.value
                }))
              }
            />
          </label>
        );
      case "Textarea":
        return (
          <label className="flex w-full flex-col gap-2 text-sm text-gray-700" key={component.id}>
            <span>{String(props.label ?? "")}</span>
            <textarea
              className="min-h-28 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              placeholder={String(props.placeholder ?? "")}
              value={fields[String(props.field ?? component.id)] ?? ""}
              onChange={(event) =>
                setFields((current) => ({
                  ...current,
                  [String(props.field ?? component.id)]: event.target.value
                }))
              }
            />
          </label>
        );
      case "Select":
        return (
          <label className="flex w-full flex-col gap-2 text-sm text-gray-700" key={component.id}>
            <span>{String(props.label ?? "")}</span>
            <select
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              value={fields[String(props.field ?? component.id)] ?? ""}
              onChange={(event) =>
                setFields((current) => ({
                  ...current,
                  [String(props.field ?? component.id)]: event.target.value
                }))
              }
            >
              <option value="">Choose…</option>
              {Array.isArray(props.options)
                ? props.options.map((option) => (
                    <option
                      key={String((option as { value: string }).value)}
                      value={String((option as { value: string }).value)}
                    >
                      {String((option as { label: string }).label)}
                    </option>
                  ))
                : null}
            </select>
          </label>
        );
      case "List":
        return (
          <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2" key={component.id}>
            {(Array.isArray(props.items) ? props.items : []).map((item, index) => {
              const record = item as Record<string, unknown>;
              return (
                <button
                  className="group rounded-xl border border-gray-200 bg-white p-4 text-left text-sm text-gray-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:shadow"
                  key={String(record.id ?? index)}
                  onClick={() =>
                    void onAction({
                      version: "v0.8",
                      type: "userAction",
                      sessionId: currentSessionId,
                      runId,
                      surfaceId: currentSurface.surfaceId,
                      action: {
                        name: String(props.actionName ?? "list-action"),
                        payload:
                          (record.actionPayload as Record<string, unknown>) ?? {}
                      },
                      a2uiClientDataModel: currentSurface.dataModel
                    })
                  }
                >
                  <div className="font-medium transition-colors group-hover:text-blue-700">
                    {String(record.title ?? "")}
                  </div>
                  <div className="mt-1 text-xs text-gray-400 transition-colors group-hover:text-blue-500/70">
                    {String(record.description ?? "")}
                  </div>
                </button>
              );
            })}
          </div>
        );
      case "Table": {
        const table = props.table as
          | { headers?: string[]; rows?: string[][] }
          | undefined;
        return (
          <div
            className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
            key={component.id}
          >
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold tracking-wide text-gray-700">
                <Database size={16} className="text-blue-500" />
                {String(props.title ?? "Data Output")}
              </div>
              <div className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-400 shadow-inner">
                {String(props.rowCount ?? table?.rows?.length ?? 0)} rows
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-white p-1">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
                  <tr>
                    {(table?.headers ?? []).map((header) => (
                      <th
                        key={header}
                        className="whitespace-nowrap border-b border-gray-200 px-6 py-4 font-semibold tracking-wider"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(table?.rows ?? []).map((row, rowIndex) => (
                    <tr
                      key={`${component.id}-${rowIndex}`}
                      className="group border-b border-gray-100 bg-white transition-colors hover:bg-blue-50/50"
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${component.id}-${rowIndex}-${cellIndex}`}
                          className="border-r border-gray-50 px-6 py-4 text-gray-700 transition-colors last:border-r-0 group-hover:text-gray-900"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }
      case "CodeBlock":
        return (
          <div
            className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-800 bg-[#1E1E1E] text-gray-300 shadow-xl"
            key={component.id}
          >
            <div className="flex items-center justify-between border-b border-[#404040] bg-[#2D2D2D] px-4 py-2">
              <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                <Code2 size={14} className="text-blue-400" />
                {String(props.filename ?? props.language ?? "script.ts")}
              </div>
              <button className="rounded bg-[#3D3D3D] px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-[#4D4D4D]">
                Copy
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed">
              <pre>
                <code className="text-[#D4D4D4]">{String(props.code ?? "")}</code>
              </pre>
            </div>
          </div>
        );
      case "StepTimeline":
        return (
          <div
            className="my-4 w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            key={component.id}
          >
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <Terminal size={14} />
              Agent Reasoning
            </div>
            <div className="ml-1 flex flex-col">
              {(Array.isArray(props.steps) ? props.steps : []).map((step, index, array) => (
                <TimelineItem
                  key={String((step as TimelineRecord).id ?? index)}
                  step={step as TimelineRecord}
                  isLast={index === array.length - 1}
                />
              ))}
            </div>
          </div>
        );
      case "ArtifactHeader":
        return (
          <div className="flex items-center justify-between gap-4" key={component.id}>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                {String(props.title ?? "")}
              </h3>
              <p className="text-xs text-gray-500">{String(props.meta ?? "")}</p>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
              {String(props.status ?? "")}
            </span>
          </div>
        );
      case "ReferenceList": {
        const html = String(props.html ?? "");
        const loading = Boolean(props.loading);
        return (
          <div
            className="flex h-full flex-col overflow-hidden rounded-t-lg border border-gray-200 bg-white shadow-sm"
            key={component.id}
          >
            <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-100/90 px-4 py-2.5 backdrop-blur-md">
              <div className="flex shrink-0 gap-1.5">
                <div className="h-3 w-3 rounded-full border border-red-500/20 bg-red-400 shadow-sm" />
                <div className="h-3 w-3 rounded-full border border-amber-500/20 bg-amber-400 shadow-sm" />
                <div className="h-3 w-3 rounded-full border border-green-500/20 bg-green-400 shadow-sm" />
              </div>
              <div className="ml-2 flex shrink-0 gap-1">
                <button className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-200">
                  <ChevronLeft size={16} />
                </button>
                <button className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-200">
                  <ChevronRight size={16} />
                </button>
                <button className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-200">
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="group flex flex-1 items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 shadow-inner">
                <ShieldAlert
                  size={12}
                  className="mr-2 text-gray-400 transition-colors group-hover:text-green-500"
                />
                <span className="max-w-[300px] truncate font-medium tracking-wide">
                  {String(props.url ?? "https://google.com")}
                </span>
              </div>
              <button className="shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-200">
                <ExternalLink size={14} />
              </button>
            </div>
            <div className="relative flex-1 overflow-auto bg-gray-50 p-6">
              {loading ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-gray-100 bg-white shadow-lg">
                    <RefreshCw size={24} className="animate-spin text-blue-500" />
                  </div>
                  <div className="text-sm font-medium text-gray-600">
                    Loading page content...
                  </div>
                </div>
              ) : null}
              <div
                className="workspace-browser-content"
                dangerouslySetInnerHTML={{
                  __html: html || "<h1>Welcome</h1><p>No content loaded.</p>"
                }}
              />
            </div>
          </div>
        );
      }
      case "Notice":
        return (
          <div
            className={clsx(
              "my-3 rounded-xl border px-4 py-3 shadow-sm",
              noticeToneClass(String(props.tone ?? "info"))
            )}
            key={component.id}
          >
            <strong className="block text-sm font-semibold">
              {String(props.title ?? "")}
            </strong>
            <p className="mt-1 text-sm leading-relaxed">
              {String(props.message ?? "")}
            </p>
          </div>
        );
      default:
        return null;
    }
  }

  function resolveProps(
    props: Record<string, unknown> | undefined
  ): Record<string, unknown> {
    if (!props) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(props).map(([key, value]) => [key, resolveValue(value)])
    );
  }

  function resolveValue(value: unknown): unknown {
    if (
      typeof value === "object" &&
      value !== null &&
      "mode" in value &&
      ((value as A2UiBinding).mode === "literal" ||
        (value as A2UiBinding).mode === "path")
    ) {
      const binding = value as A2UiBinding;
      // 所有组件先做 binding 解析，这样 React 渲染层保持很薄，只负责“展示协议结果”。
      return binding.mode === "literal"
        ? binding.value
        : getValueAtPath(currentSurface.dataModel, binding.path);
    }

    return value;
  }
}

function TimelineItem({
  step,
  isLast
}: {
  step: TimelineRecord;
  isLast: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(
    step.status === "running" || step.status === "error"
  );

  useEffect(() => {
    if (step.status === "running") {
      setIsExpanded(true);
    }
  }, [step.status]);

  const hasDetails =
    Boolean(step.details) ||
    Boolean(step.logs?.length) ||
    Boolean(step.subSteps?.length);

  return (
    <div className="group relative flex flex-col">
      {!isLast ? (
        <div className="absolute bottom-[-8px] left-[7.5px] top-6 w-px bg-gray-200 transition-colors group-hover:bg-gray-300" />
      ) : null}

      <div
        className="z-10 -ml-2 flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50/50"
        onClick={() => {
          if (hasDetails) {
            setIsExpanded((current) => !current);
          }
        }}
      >
        <div className="mt-0.5 shrink-0 bg-white shadow-[0_0_0_4px_white]">
          {getTimelineIcon(step)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                "text-sm font-medium",
                step.status === "pending"
                  ? "text-gray-400"
                  : step.status === "error"
                    ? "text-red-600"
                    : "text-gray-800"
              )}
            >
              {step.title}
            </span>
            {hasDetails ? (
              <span className="text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            ) : null}
          </div>

          {isExpanded && hasDetails ? (
            <div className="overflow-hidden">
              {step.details ? (
                <div className="mt-1 border-l-2 border-gray-100 py-1 pl-1 text-xs text-gray-500">
                  {step.details}
                </div>
              ) : null}
              {step.logs && step.logs.length > 0 ? (
                <div className="mt-2 overflow-x-auto rounded-md border border-gray-800 bg-gray-900 p-2 font-mono text-[10px] text-gray-300 shadow-inner">
                  {step.logs.map((log, index) => (
                    <div
                      key={`${step.id ?? "step"}-${index}`}
                      className="whitespace-pre-wrap font-mono leading-tight"
                    >
                      {log}
                    </div>
                  ))}
                  {step.status === "running" ? (
                    <div className="mt-1 h-3 w-2 animate-pulse bg-gray-500" />
                  ) : null}
                </div>
              ) : null}
              {step.subSteps && step.subSteps.length > 0 ? (
                <div className="mt-2 pl-4">
                  {step.subSteps.map((subStep, index) => (
                    <TimelineItem
                      key={subStep.id ?? index}
                      step={subStep}
                      isLast={index === step.subSteps!.length - 1}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getTimelineIcon(step: TimelineRecord) {
  if (step.status === "completed") {
    return <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />;
  }

  if (step.status === "running") {
    return <Loader2 size={16} className="shrink-0 animate-spin text-blue-500" />;
  }

  const title = (step.title ?? "").toLowerCase();
  const iconClass = "shrink-0 text-gray-400";

  if (title.includes("search")) {
    return <Search size={16} className={iconClass} />;
  }

  if (title.includes("browse") || title.includes("read")) {
    return <Globe size={16} className={iconClass} />;
  }

  if (title.includes("code")) {
    return <Code2 size={16} className={iconClass} />;
  }

  if (title.includes("extract") || title.includes("table") || title.includes("artifact")) {
    return <Database size={16} className={iconClass} />;
  }

  if (title.includes("terminal")) {
    return <Terminal size={16} className={iconClass} />;
  }

  if (title.includes("write")) {
    return <FileText size={16} className={iconClass} />;
  }

  if (title.includes("click")) {
    return <MousePointer2 size={16} className={iconClass} />;
  }

  return <Circle size={16} className={iconClass} />;
}

function gapClass(value: unknown) {
  switch (value) {
    case "sm":
      return "gap-2";
    case "md":
      return "gap-4";
    case "lg":
      return "gap-6";
    default:
      return "gap-3";
  }
}

function textToneClass(tone: string) {
  switch (tone) {
    case "hero":
      return "mb-2 text-2xl font-bold tracking-tight text-gray-900";
    case "muted":
      return "mb-8 max-w-md text-base text-gray-500";
    case "sectionTitle":
      return "text-sm font-semibold text-gray-800";
    case "body":
    default:
      return "text-sm leading-relaxed text-gray-700";
  }
}

function badgeToneClass(tone: string) {
  switch (tone) {
    case "warning":
      return "bg-amber-50 text-amber-700";
    case "error":
      return "bg-red-50 text-red-700";
    default:
      return "bg-blue-50 text-blue-600";
  }
}

function noticeToneClass(tone: string) {
  switch (tone) {
    case "error":
      return "border-red-200 bg-red-50 text-red-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-blue-200 bg-blue-50 text-blue-700";
  }
}

function buttonClass(variant: string) {
  if (variant === "secondary") {
    return "inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50";
  }

  if (variant === "ghost") {
    return "inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-800";
  }

  return "inline-flex items-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md";
}
