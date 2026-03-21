import cors from "cors";
import express from "express";
import { a2uiUserActionSchema } from "@my-manus/shared";
import { readApiEnvironment } from "./config";
import { RunCoordinator } from "./services/run-coordinator";
import { prepareSse, writeSseEvent } from "./services/sse";
import { InMemoryAppStore } from "./store/in-memory-store";

export function createApp() {
  const env = readApiEnvironment();
  const store = new InMemoryAppStore();
  const coordinator = new RunCoordinator(store);
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      agentMode: env.agentMode
    });
  });

  app.get("/bootstrap", (_request, response) => {
    response.json({
      ok: true,
      messages: coordinator.getBootstrapMessages()
    });
  });

  app.get("/sessions", (_request, response) => {
    response.json({
      ok: true,
      sessions: store.listSessions()
    });
  });

  app.post("/sessions", (request, response) => {
    const title = String(request.body?.title ?? "New session");
    const session = store.createSession(title);
    response.status(201).json({
      ok: true,
      session
    });
  });

  app.get("/sessions/:sessionId", (request, response) => {
    const detail = store.getSessionDetail(request.params.sessionId);
    if (!detail) {
      response.status(404).json({
        ok: false,
        message: "Session not found."
      });
      return;
    }

    response.json({
      ok: true,
      detail
    });
  });

  app.get("/runs/:runId/events", (request, response) => {
    response.json({
      ok: true,
      events: store.getRunEvents(request.params.runId)
    });
  });

  app.get("/runs/:runId/artifacts", (request, response) => {
    response.json({
      ok: true,
      artifacts: store.listArtifacts(request.params.runId)
    });
  });

  app.get("/runs/:runId/stream", (request, response) => {
    const run = store.getRun(request.params.runId);
    if (!run) {
      response.status(404).json({
        ok: false,
        message: "Run not found."
      });
      return;
    }

    prepareSse(response);

    if (request.query.replay !== "0") {
      for (const event of store.getRunEvents(run.id)) {
        writeSseEvent(response, event);
      }
    }

    const unsubscribe = store.subscribeToRun(run.id, (event) => {
      writeSseEvent(response, event);
    });

    request.on("close", () => {
      unsubscribe();
      response.end();
    });
  });

  app.post("/runs", async (request, response) => {
    const prompt = String(request.body?.prompt ?? "").trim();
    if (!prompt) {
      response.status(400).json({
        ok: false,
        message: "Prompt is required."
      });
      return;
    }

    const sessionId = String(request.body?.sessionId ?? "");
    const session =
      store.getSession(sessionId) ??
      store.createSession("New session");

    const created = store.createRun(session.id, prompt);
    void coordinator.startRun(created.run);

    response.status(201).json({
      ok: true,
      session,
      run: created.run,
      messages: [created.userMessage, created.assistantMessage]
    });
  });

  app.post("/ui/actions", async (request, response) => {
    const parsed = a2uiUserActionSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        message: "Invalid A2UI action payload.",
        issues: parsed.error.flatten()
      });
      return;
    }

    try {
      const action = parsed.data;

      // 所有需要回给 Agent 的交互都统一走 A2UI userAction，避免散落成很多私有接口。
      if (action.action.name === "start-suggestion") {
        const prompt = String(action.action.payload?.prompt ?? "").trim();
        if (!prompt) {
          response.status(400).json({
            ok: false,
            message: "Suggestion prompt is missing."
          });
          return;
        }

        const session =
          store.getSession(action.sessionId) ??
          store.createSession("New session");
        const created = store.createRun(session.id, prompt);
        void coordinator.startRun(created.run);

        response.status(201).json({
          ok: true,
          session,
          run: created.run,
          messages: [created.userMessage, created.assistantMessage]
        });
        return;
      }

      if (action.action.name === "request-export" && action.runId) {
        const approval = await coordinator.requestExportApproval(action.runId);
        response.json({
          ok: true,
          approval
        });
        return;
      }

      if (action.action.name === "approve-approval") {
        await coordinator.resolveApproval(
          String(action.action.payload?.approvalId),
          "approved"
        );
        response.json({ ok: true });
        return;
      }

      if (action.action.name === "reject-approval") {
        await coordinator.resolveApproval(
          String(action.action.payload?.approvalId),
          "rejected"
        );
        response.json({ ok: true });
        return;
      }

      if (action.action.name === "submit-clarification" && action.runId) {
        const clarification = String(
          action.a2uiClientDataModel?.clarification ?? ""
        ).trim();
        await coordinator.continueRunAfterClarification(
          action.runId,
          clarification
        );
        response.json({ ok: true });
        return;
      }

      if (action.action.name === "continue-research" && action.runId) {
        const parentRun = store.getRun(action.runId);
        if (!parentRun) {
          response.status(404).json({
            ok: false,
            message: "Parent run not found."
          });
          return;
        }

        const created = store.createRun(
          parentRun.sessionId,
          `${parentRun.prompt}\n\nContinue the research and add one more practical angle.`
        );
        void coordinator.startRun(created.run);
        response.status(201).json({
          ok: true,
          session: store.getSession(parentRun.sessionId),
          run: created.run,
          messages: [created.userMessage, created.assistantMessage]
        });
        return;
      }

      response.status(400).json({
        ok: false,
        message: `Unsupported action: ${action.action.name}`
      });
    } catch (error) {
      response.status(500).json({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unexpected UI action handling error."
      });
    }
  });

  return app;
}
