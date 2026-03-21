import {
  getClarificationRequest,
  researchPrompt,
  readAgentEnvironment
} from "@my-manus/agent";
import {
  buildApprovalSurface,
  buildArtifactActionsSurface,
  buildArtifactMainSurface,
  buildAssistantMessageSurface,
  buildClarificationSurface,
  buildEmptyStateSurface,
  buildErrorSurface,
  buildStepsSurface,
  createA2UiCustomEvent,
  createBaseEvent,
  createResearchArtifactData,
  type AgUiEvent,
  type ApprovalRequest,
  type ArtifactRecord,
  type ResearchResult,
  type RunRecord,
  type RunStep
} from "@my-manus/shared";
import { InMemoryAppStore } from "../store/in-memory-store";

const wait = (duration: number) =>
  new Promise((resolve) => setTimeout(resolve, duration));

export class RunCoordinator {
  private readonly agentEnv = readAgentEnvironment();

  constructor(private readonly store: InMemoryAppStore) {}

  getBootstrapMessages() {
    return buildEmptyStateSurface();
  }

  async startRun(run: RunRecord) {
    try {
      this.store.updateRunStatus(run.id, "running");
      await this.emit(run.id, {
        ...createBaseEvent("RUN_STARTED", run.sessionId, run.id),
        input: {
          prompt: run.prompt,
          message_id: run.userMessageId
        }
      });

      // 先把基础 surface 打开，后续所有动态 UI 都通过 AG-UI CUSTOM + A2UI 更新。
      await this.emitSurface(
        run,
        buildAssistantMessageSurface(`message:${run.assistantMessageId}`)
      );
      await this.emitSurface(run, buildStepsSurface(`steps:${run.id}`));
      await this.emitSurface(
        run,
        buildArtifactActionsSurface(`artifact:${run.id}:actions`)
      );

      await this.emit(run.id, {
        ...createBaseEvent("TEXT_MESSAGE_START", run.sessionId, run.id),
        message_id: run.assistantMessageId,
        role: "assistant"
      });

      await this.pushAssistantDelta(
        run,
        "I’m mapping the request into a research plan and preparing the artifact workspace.\n\n"
      );

      const clarification = getClarificationRequest(run.prompt);
      if (clarification) {
        this.store.updateRunStatus(run.id, "waiting_clarification");
        this.store.setPendingClarification(run.id, {
          prompt: run.prompt,
          question: clarification.question,
          placeholder: clarification.placeholder
        });

        await this.pushAssistantDelta(
          run,
          "Before I continue, I need one more detail so the result is focused and useful."
        );
        await this.emitSurface(
          run,
          buildClarificationSurface(
            `clarification:${run.id}`,
            clarification.question,
            clarification.placeholder
          )
        );
        await this.emitState(run, {
          status: "waiting_clarification"
        });
        return;
      }

      await this.performResearch(run, run.prompt);
    } catch (error) {
      await this.failRun(run, error);
    }
  }

  async continueRunAfterClarification(runId: string, clarification: string) {
    const run = this.store.getRun(runId);
    const pending = this.store.getPendingClarification(runId);

    if (!run || !pending) {
      throw new Error("No pending clarification found for this run.");
    }

    try {
      this.store.clearPendingClarification(runId);
      this.store.setRunPrompt(
        runId,
        `${pending.prompt}\n\nAdditional context: ${clarification}`
      );
      this.store.updateRunStatus(runId, "running");

      await this.emitSurface(run, [
        {
          version: "v0.8",
          type: "deleteSurface",
          surfaceId: `clarification:${run.id}`
        }
      ]);

      await this.pushAssistantDelta(
        run,
        `\n\nThanks, that helps. I’ll continue with this added context: ${clarification}\n\n`
      );
      await this.emitState(run, {
        status: "running"
      });
      await this.performResearch(
        run,
        `${pending.prompt}\n\nAdditional context: ${clarification}`
      );
    } catch (error) {
      await this.failRun(run, error);
    }
  }

  async requestExportApproval(runId: string) {
    const run = this.store.getRun(runId);
    if (!run) {
      throw new Error("Run not found.");
    }

    const approval: ApprovalRequest = {
      id: crypto.randomUUID(),
      sessionId: run.sessionId,
      runId,
      type: "export_file",
      title: "Approve artifact export",
      description:
        "The agent is ready to export the current artifact bundle. Approve this action before the system prepares a downloadable payload.",
      status: "pending",
      createdAt: new Date().toISOString()
    };

    this.store.createApproval(approval);
    this.store.updateRunStatus(run.id, "waiting_approval");

    await this.emitSurface(
      run,
      buildApprovalSurface(`approval:${run.id}`, approval)
    );
    await this.emitState(run, {
      status: "waiting_approval"
    });

    return approval;
  }

  async resolveApproval(approvalId: string, decision: "approved" | "rejected") {
    const approval = this.store.getApproval(approvalId);
    if (!approval) {
      throw new Error("Approval request not found.");
    }

    const run = this.store.getRun(approval.runId);
    if (!run) {
      throw new Error("Related run not found.");
    }

    this.store.updateApprovalStatus(approvalId, decision);
    this.store.updateRunStatus(run.id, "completed");

    await this.emitSurface(run, [
      {
        version: "v0.8",
        type: "deleteSurface",
        surfaceId: `approval:${run.id}`
      }
    ]);

    await this.pushAssistantDelta(
      run,
      decision === "approved"
        ? "\n\nExport approved. In a production deployment, this is where the backend would create the final file package."
        : "\n\nExport request rejected. The research artifacts stay available in the workspace for inspection."
    );
    await this.emitState(run, {
      status: "completed"
    });
  }

  private async performResearch(run: RunRecord, effectivePrompt: string) {
    const steps: RunStep[] = [
      {
        id: `${run.id}:plan`,
        runId: run.id,
        title: "Shape the research plan",
        status: "pending",
        logs: []
      },
      {
        id: `${run.id}:search`,
        runId: run.id,
        title: "Search and review sources",
        status: "pending",
        logs: []
      },
      {
        id: `${run.id}:artifact`,
        runId: run.id,
        title: "Assemble artifact outputs",
        status: "pending",
        logs: []
      }
    ];

    await this.syncSteps(run, steps);
    await this.updateStep(run, steps, 0, "running", [
      "Interpret prompt intent",
      "Choose artifact layout"
    ]);
    await this.emitToolStart(run, "plan-tool", "plan_request", "Planning the workflow");
    await wait(320);
    await this.emitToolArgs(run, "plan-tool", JSON.stringify({ prompt: effectivePrompt }));
    await wait(220);
    await this.emitToolEnd(run, "plan-tool");
    await this.emitToolResult(run, "plan-tool", {
      status: "ok",
      summary: "Plan drafted"
    });
    await this.updateStep(run, steps, 0, "completed", [
      "Plan drafted",
      "Ready to search"
    ]);

    await this.updateStep(run, steps, 1, "running", [
      "Query search tool",
      "Collect candidate references"
    ]);
    await this.emitArtifactSurface(run, "browser", {
      title: "Loading browser workspace",
      status: "running",
      meta: "Searching the web",
      browserTitle: "Search results",
      browserUrl: `https://google.com/search?q=${encodeURIComponent(effectivePrompt)}`,
      browserExcerpt: "",
      browserFindings: [],
      html: "",
      loading: true,
      references: []
    });
    await this.emitToolStart(run, "search-tool", "search_web", "Searching the web");
    await wait(300);
    await this.emitToolArgs(run, "search-tool", JSON.stringify({ query: effectivePrompt }));
    await wait(240);

    const result = await researchPrompt(effectivePrompt, {
      mode: this.agentEnv.mode,
      model: this.agentEnv.model,
      openaiApiBase: this.agentEnv.openaiApiBase
    });
    const artifactData = createResearchArtifactData(result);

    await this.emitToolEnd(run, "search-tool");
    await this.emitToolResult(run, "search-tool", {
      references: result.references.length
    });
    await this.emitArtifactSurface(run, "browser", artifactData.browser);
    await wait(350);
    await this.updateStep(run, steps, 1, "completed", [
      `Collected ${result.references.length} references`
    ]);

    await this.updateStep(run, steps, 2, "running", [
      "Shape browser digest",
      "Build summary, table, and code sample"
    ]);
    await wait(200);
    await this.persistArtifacts(run, result);
    await this.emitArtifactSurface(run, "table", artifactData.table);
    await this.pushAssistantDelta(run, result.summary);
    await this.updateStep(run, steps, 2, "completed", [
      "Artifact surfaces updated",
      "Workspace ready"
    ]);

    await this.emit(run.id, {
      ...createBaseEvent("TEXT_MESSAGE_END", run.sessionId, run.id),
      message_id: run.assistantMessageId
    });
    this.store.updateRunStatus(run.id, "completed");
    await this.emitState(run, {
      status: "completed"
    });
    await this.emit(run.id, createBaseEvent("RUN_FINISHED", run.sessionId, run.id));
  }

  private async emitArtifactSurface(
    run: RunRecord,
    kind: "browser" | "table" | "code" | "markdown" | "terminal",
    payload: Record<string, unknown>
  ) {
    const surfaceId = `artifact:${run.id}:main`;
    await this.emitSurface(run, buildArtifactMainSurface(surfaceId, kind));
    await this.emitSurface(run, [
      {
        version: "v0.8",
        type: "dataModelUpdate",
        surfaceId,
        data: payload
      }
    ]);
  }

  private async persistArtifacts(run: RunRecord, result: ResearchResult) {
    // 结果除了推给前端 surface，也会同步成 artifact 记录，方便以后接数据库。
    this.store.setArtifacts(run.id, this.createArtifactRecords(run.id, result));
  }

  private createArtifactRecords(runId: string, result: ResearchResult): ArtifactRecord[] {
    const now = new Date().toISOString();
    const artifactData = createResearchArtifactData(result);

    return [
      {
        id: crypto.randomUUID(),
        runId,
        kind: "browser",
        title: artifactData.browser.title,
        payload: artifactData.browser,
        createdAt: now
      },
      {
        id: crypto.randomUUID(),
        runId,
        kind: "table",
        title: artifactData.table.title,
        payload: artifactData.table,
        createdAt: now
      },
      {
        id: crypto.randomUUID(),
        runId,
        kind: "markdown",
        title: artifactData.markdown.title,
        payload: artifactData.markdown,
        createdAt: now
      },
      {
        id: crypto.randomUUID(),
        runId,
        kind: "code",
        title: artifactData.code.title,
        payload: artifactData.code,
        createdAt: now
      }
    ];
  }

  private async updateStep(
    run: RunRecord,
    steps: RunStep[],
    index: number,
    status: RunStep["status"],
    logs: string[]
  ) {
    const step = steps[index];
    if (!step) {
      return;
    }

    step.status = status;
    step.logs = logs;
    this.store.setRunSteps(run.id, steps);

    const event =
      status === "running"
        ? {
            ...createBaseEvent("STEP_STARTED", run.sessionId, run.id),
            step_id: step.id,
            title: step.title
          }
        : {
            ...createBaseEvent("STEP_FINISHED", run.sessionId, run.id),
            step_id: step.id,
            title: step.title,
            status:
              status === "completed"
                ? ("completed" as const)
                : ("error" as const)
          };

    await this.emit(run.id, event);
    await this.emitActivityDelta(run, {
      stepId: step.id,
      status,
      logs
    });
    await this.emitSurface(run, [
      {
        version: "v0.8",
        type: "dataModelUpdate",
        surfaceId: `steps:${run.id}`,
        data: {
          steps
        }
      }
    ]);
  }

  private async syncSteps(run: RunRecord, steps: RunStep[]) {
    this.store.setRunSteps(run.id, steps);
    await this.emit(run.id, {
      ...createBaseEvent("ACTIVITY_SNAPSHOT", run.sessionId, run.id),
      activities: steps.map((step) => ({
        id: step.id,
        title: step.title,
        status: step.status,
        logs: step.logs
      }))
    });
    await this.emitSurface(run, [
      {
        version: "v0.8",
        type: "dataModelUpdate",
        surfaceId: `steps:${run.id}`,
        data: {
          steps
        }
      }
    ]);
  }

  private async emitActivityDelta(run: RunRecord, delta: Record<string, unknown>) {
    await this.emit(run.id, {
      ...createBaseEvent("ACTIVITY_DELTA", run.sessionId, run.id),
      delta
    });
  }

  private async emitState(run: RunRecord, delta: Record<string, unknown>) {
    await this.emit(run.id, {
      ...createBaseEvent("STATE_DELTA", run.sessionId, run.id),
      delta
    });
  }

  private async emitToolStart(
    run: RunRecord,
    toolCallId: string,
    toolName: string,
    title: string
  ) {
    await this.emit(run.id, {
      ...createBaseEvent("TOOL_CALL_START", run.sessionId, run.id),
      tool_call_id: toolCallId,
      tool_name: toolName,
      title
    });
  }

  private async emitToolArgs(run: RunRecord, toolCallId: string, delta: string) {
    await this.emit(run.id, {
      ...createBaseEvent("TOOL_CALL_ARGS", run.sessionId, run.id),
      tool_call_id: toolCallId,
      delta
    });
  }

  private async emitToolEnd(run: RunRecord, toolCallId: string) {
    await this.emit(run.id, {
      ...createBaseEvent("TOOL_CALL_END", run.sessionId, run.id),
      tool_call_id: toolCallId
    });
  }

  private async emitToolResult(
    run: RunRecord,
    toolCallId: string,
    result: Record<string, unknown>
  ) {
    await this.emit(run.id, {
      ...createBaseEvent("TOOL_CALL_RESULT", run.sessionId, run.id),
      tool_call_id: toolCallId,
      result
    });
  }

  private async pushAssistantDelta(run: RunRecord, delta: string) {
    this.store.appendAssistantContent(run.assistantMessageId, delta);
    await this.emit(run.id, {
      ...createBaseEvent("TEXT_MESSAGE_CONTENT", run.sessionId, run.id),
      message_id: run.assistantMessageId,
      delta
    });
    await this.emitSurface(run, [
      {
        version: "v0.8",
        type: "dataModelUpdate",
        surfaceId: `message:${run.assistantMessageId}`,
        data: {
          content: this.store
            .getSessionDetail(run.sessionId)
            ?.messages.find((message) => message.id === run.assistantMessageId)
            ?.content
        }
      }
    ]);
  }

  private async emitSurface(run: RunRecord, messages: readonly unknown[]) {
    for (const message of messages) {
      await this.emit(
        run.id,
        createA2UiCustomEvent(run.sessionId, run.id, message)
      );
    }
  }

  private async emit(runId: string, event: AgUiEvent) {
    this.store.pushRunEvent(runId, event);
  }

  private async failRun(run: RunRecord, error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown run failure.";

    this.store.updateRunStatus(run.id, "failed");
    await this.emitSurface(run, buildErrorSurface(`error:${run.id}`, message));
    await this.emitState(run, {
      status: "failed"
    });
    await this.emit(run.id, {
      ...createBaseEvent("RUN_ERROR", run.sessionId, run.id),
      message
    });
  }
}
