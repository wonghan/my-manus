import { beforeEach, describe, expect, it } from "vitest";
import type { ApprovalRequest, ConversationMessage } from "../packages/shared/src/index";
import { RunCoordinator } from "../apps/api/src/services/run-coordinator";
import { InMemoryRunEventBus } from "../apps/api/src/services/in-memory-run-event-bus";
import { InMemoryAppStore } from "../apps/api/src/store/in-memory-store";

describe("run coordinator", () => {
  beforeEach(() => {
    process.env.AGENT_EXECUTION_MODE = "mock";
  });

  it("runs the clarification -> dynamic plan -> artifacts -> approval flow", async () => {
    const store = new InMemoryAppStore();
    const eventBus = new InMemoryRunEventBus();
    const coordinator = new RunCoordinator(store, eventBus);
    const session = await store.createSession("New session");
    const created = await store.createRun(session.id, "AI plan");

    await coordinator.startRun(created.run);

    expect((await store.getRun(created.run.id))?.status).toBe("waiting_clarification");
    expect(await store.getPendingClarification(created.run.id)).toBeTruthy();
    expect(
      (await store.getRunEvents(created.run.id)).some(
        (event) =>
          event.type === "CUSTOM" &&
          event.name === "a2ui.message" &&
          typeof event.value === "object" &&
          event.value !== null &&
          "surfaceId" in event.value &&
          event.value.surfaceId === `clarification:${created.run.id}`
      )
    ).toBe(true);

    await coordinator.continueRunAfterClarification(
      created.run.id,
      "Focus on a private deployment for a small product team."
    );

    expect((await store.getRun(created.run.id))?.status).toBe("completed");
    expect(
      (await store.getRunEvents(created.run.id)).some(
        (event) => event.type === "RUN_FINISHED"
      )
    ).toBe(true);
    const artifacts = await store.listArtifacts(created.run.id);
    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((artifact) => artifact.kind)).toEqual([
      "browser",
      "markdown"
    ]);
    expect(artifacts[0]?.stepId).toContain("research-phase-browser");
    expect(artifacts[1]?.stepId).toContain("delivery-phase-markdown");

    const runSteps = await store.getRunSteps(created.run.id);
    const parentSteps = runSteps.filter((step) => !step.parentStepId);
    const leafSteps = runSteps.filter((step) => Boolean(step.parentStepId));

    expect(parentSteps).toHaveLength(2);
    expect(leafSteps).toHaveLength(2);
    expect(leafSteps.every((step) => step.artifactId)).toBe(true);
    expect(parentSteps.every((step) => step.status === "completed")).toBe(true);

    const approval = (await coordinator.requestExportApproval(
      created.run.id
    )) as ApprovalRequest;
    expect((await store.getRun(created.run.id))?.status).toBe("waiting_approval");

    await coordinator.resolveApproval(approval.id, "approved");

    expect((await store.getRun(created.run.id))?.status).toBe("completed");

    const detail = await store.getSessionDetail(session.id);
    const assistantMessage = detail?.messages.find(
      (message): message is ConversationMessage => message.role === "assistant"
    );

    expect(assistantMessage?.content).toContain("Export approved");
  });
});
