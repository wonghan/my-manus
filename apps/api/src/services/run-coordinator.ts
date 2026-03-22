import {
  executePlannedStep,
  getClarificationRequest,
  planResearchRun,
  readAgentEnvironment,
  type ResearchExecutionContext
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
  type AgUiEvent,
  type AgentPlan,
  type ApprovalRequest,
  type ArtifactKind,
  type ArtifactRecord,
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

      // 所有 Agent-owned UI 都先声明 surface，后续再通过增量 dataModelUpdate 驱动。
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
    const planningToolId = `${run.id}:planning`;
    await this.emitToolStart(
      run,
      planningToolId,
      "plan_research_workflow",
      "Planning the research workflow"
    );
    await wait(180);
    await this.emitToolArgs(
      run,
      planningToolId,
      JSON.stringify({ prompt: effectivePrompt })
    );

    const plan = await planResearchRun(effectivePrompt, {
      mode: this.agentEnv.mode,
      model: this.agentEnv.model,
      openaiApiBase: this.agentEnv.openaiApiBase
    });
    const steps = this.materializePlan(run.id, plan);

    await this.emitToolEnd(run, planningToolId);
    await this.emitToolResult(run, planningToolId, {
      parentSteps: plan.steps.length,
      leafSteps: steps.filter((step) => step.parentStepId).length
    });
    await this.syncSteps(run, steps);

    await this.pushAssistantDelta(
      run,
      "The plan is ready. I’ll execute each step and keep every artifact available so you can revisit it from the timeline.\n\n"
    );

    const leafSteps = steps.filter((step) => Boolean(step.parentStepId));
    let latestArtifactId: string | undefined;
    let artifactSequence = 1;
    let assistantSummary: string | undefined;
    let executionContext: ResearchExecutionContext = {
      prompt: effectivePrompt
    };

    for (const step of leafSteps) {
      await this.updateStep(
        run,
        steps,
        step.id,
        "running",
        [
          step.detail ?? "Preparing step execution.",
          `Target artifact: ${step.artifactKind ?? "none"}`
        ],
        latestArtifactId
      );

      const toolCallId = `${run.id}:${step.id}:tool`;
      await this.emitToolStart(
        run,
        toolCallId,
        this.toolNameForStep(step.artifactKind),
        step.title
      );
      await wait(140);
      await this.emitToolArgs(
        run,
        toolCallId,
        JSON.stringify({
          stepId: step.id,
          artifactKind: step.artifactKind,
          title: step.title
        })
      );

      const execution = await executePlannedStep(
        {
          title: step.title,
          artifactKind: step.artifactKind
        },
        executionContext,
        {
          mode: this.agentEnv.mode,
          model: this.agentEnv.model,
          openaiApiBase: this.agentEnv.openaiApiBase
        }
      );

      executionContext = execution.context;
      assistantSummary = execution.summary ?? assistantSummary;

      await this.emitToolEnd(run, toolCallId);

      if (execution.artifact) {
        const artifact = this.createArtifactRecord(
          run.id,
          step.id,
          artifactSequence,
          execution.artifact.kind,
          execution.artifact.title,
          execution.artifact.payload
        );

        artifactSequence += 1;
        latestArtifactId = artifact.id;
        this.store.addArtifact(artifact);

        await this.emitArtifactSurface(run, artifact);
        await this.emitToolResult(run, toolCallId, {
          artifactId: artifact.id,
          kind: artifact.kind,
          title: artifact.title
        });
        await this.updateStep(
          run,
          steps,
          step.id,
          "completed",
          [
            `Artifact ready: ${artifact.title}`,
            `Workspace kind: ${artifact.kind}`
          ],
          latestArtifactId,
          {
            artifactId: artifact.id,
            artifactKind: artifact.kind
          }
        );
      } else {
        await this.emitToolResult(run, toolCallId, {
          status: "skipped",
          reason: "This step produced no artifact."
        });
        await this.updateStep(
          run,
          steps,
          step.id,
          "completed",
          ["Step completed without a visible artifact."],
          latestArtifactId
        );
      }
    }

    if (assistantSummary) {
      await this.pushAssistantDelta(run, assistantSummary);
    }

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

  private materializePlan(runId: string, plan: AgentPlan): RunStep[] {
    const steps: RunStep[] = [];
    let sequence = 1;

    for (const parent of plan.steps) {
      const parentId = `${runId}:${parent.id}`;
      steps.push({
        id: parentId,
        runId,
        title: parent.title,
        status: "pending",
        sequence,
        detail: parent.description,
        logs: []
      });
      sequence += 1;

      for (const child of parent.children ?? []) {
        steps.push({
          id: `${runId}:${child.id}`,
          runId,
          parentStepId: parentId,
          title: child.title,
          status: "pending",
          sequence,
          detail: child.description,
          artifactKind: child.artifactKind,
          logs: []
        });
        sequence += 1;
      }
    }

    return steps;
  }

  private async emitArtifactSurface(run: RunRecord, artifact: ArtifactRecord) {
    const surfaceId = `artifact:${artifact.id}`;
    await this.emitSurface(run, buildArtifactMainSurface(surfaceId, artifact.kind));
    await this.emitSurface(run, [
      {
        version: "v0.8",
        type: "dataModelUpdate",
        surfaceId,
        data: artifact.payload
      }
    ]);
  }

  private createArtifactRecord(
    runId: string,
    stepId: string,
    sequence: number,
    kind: ArtifactKind,
    title: string,
    payload: Record<string, unknown>
  ): ArtifactRecord {
    return {
      id: crypto.randomUUID(),
      runId,
      stepId,
      sequence,
      kind,
      title,
      payload,
      createdAt: new Date().toISOString()
    };
  }

  private async updateStep(
    run: RunRecord,
    steps: RunStep[],
    stepId: string,
    status: RunStep["status"],
    logs: string[],
    latestArtifactId?: string,
    extras?: {
      artifactId?: string;
      artifactKind?: ArtifactKind;
    }
  ) {
    const step = steps.find((item) => item.id === stepId);
    if (!step) {
      return;
    }

    step.status = status;
    step.logs = logs;
    if (extras?.artifactId) {
      step.artifactId = extras.artifactId;
    }
    if (extras?.artifactKind) {
      step.artifactKind = extras.artifactKind;
    }

    this.refreshParentStepStatuses(steps);
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
      logs,
      artifactId: step.artifactId,
      artifactKind: step.artifactKind,
      latestArtifactId
    });
    await this.emitStepsSurface(run, steps, latestArtifactId);
  }

  private async syncSteps(
    run: RunRecord,
    steps: RunStep[],
    latestArtifactId?: string
  ) {
    this.refreshParentStepStatuses(steps);
    this.store.setRunSteps(run.id, steps);
    await this.emit(run.id, {
      ...createBaseEvent("ACTIVITY_SNAPSHOT", run.sessionId, run.id),
      activities: steps.map((step) => ({
        id: step.id,
        title: step.title,
        status: step.status,
        logs: step.logs,
        detail: step.detail,
        parentStepId: step.parentStepId,
        artifactId: step.artifactId,
        artifactKind: step.artifactKind,
        sequence: step.sequence
      }))
    });
    await this.emitStepsSurface(run, steps, latestArtifactId);
  }

  private refreshParentStepStatuses(steps: RunStep[]) {
    const parentSteps = steps.filter((step) => !step.parentStepId);

    for (const parent of parentSteps) {
      const children = steps
        .filter((step) => step.parentStepId === parent.id)
        .sort((left, right) => left.sequence - right.sequence);

      if (children.length === 0) {
        continue;
      }

      const completedCount = children.filter(
        (child) => child.status === "completed"
      ).length;

      if (children.some((child) => child.status === "error")) {
        parent.status = "error";
        parent.logs = [`${parent.title} hit an error in one of its child steps.`];
        continue;
      }

      if (children.some((child) => child.status === "running")) {
        parent.status = "running";
        parent.logs = [`${completedCount} of ${children.length} child steps completed.`];
        continue;
      }

      if (children.every((child) => child.status === "completed")) {
        parent.status = "completed";
        parent.logs = [`${children.length} of ${children.length} child steps completed.`];
        continue;
      }

      if (completedCount > 0) {
        parent.status = "running";
        parent.logs = [`${completedCount} of ${children.length} child steps completed.`];
        continue;
      }

      parent.status = "pending";
      parent.logs = [];
    }
  }

  private async emitStepsSurface(
    run: RunRecord,
    steps: RunStep[],
    latestArtifactId?: string
  ) {
    await this.emitSurface(run, [
      {
        version: "v0.8",
        type: "dataModelUpdate",
        surfaceId: `steps:${run.id}`,
        data: {
          steps,
          latestArtifactId
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

  private toolNameForStep(artifactKind?: ArtifactKind) {
    switch (artifactKind) {
      case "browser":
        return "read_url";
      case "table":
        return "build_table_artifact";
      case "code":
        return "build_code_artifact";
      case "terminal":
        return "capture_terminal_artifact";
      case "markdown":
      default:
        return "build_markdown_artifact";
    }
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
