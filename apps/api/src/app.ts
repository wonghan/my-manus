import cors from "cors";
import express from "express";
import { a2uiUserActionSchema } from "@my-manus/shared";
import { createApiRuntime } from "./runtime";
import { prepareSse, writeSseEvent } from "./services/sse";

export function createApp() {
  const { env, store, coordinator, eventBus, runQueue } = createApiRuntime();
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      agentMode: env.agentMode,
      storageMode: env.storageMode
    });
  });

  app.get("/bootstrap", (_request, response) => {
    response.json({
      ok: true,
      messages: coordinator.getBootstrapMessages()
    });
  });

  app.get("/sessions", async (_request, response) => {
    response.json({
      ok: true,
      sessions: await store.listSessions()
    });
  });

  app.post("/sessions", async (request, response) => {
    const title = String(request.body?.title ?? "New session");
    const session = await store.createSession(title);
    response.status(201).json({
      ok: true,
      session
    });
  });

  app.get("/sessions/:sessionId", async (request, response) => {
    const detail = await store.getSessionDetail(request.params.sessionId);
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

  app.get("/runs/:runId/events", async (request, response) => {
    response.json({
      ok: true,
      events: await store.getRunEvents(request.params.runId)
    });
  });

  app.get("/runs/:runId/artifacts", async (request, response) => {
    response.json({
      ok: true,
      artifacts: await store.listArtifacts(request.params.runId)
    });
  });

  app.get("/runs/:runId/stream", async (request, response) => {
    const run = await store.getRun(request.params.runId);
    if (!run) {
      response.status(404).json({
        ok: false,
        message: "Run not found."
      });
      return;
    }

    prepareSse(response);

    if (request.query.replay !== "0") {
      for (const event of await store.getRunEvents(run.id)) {
        writeSseEvent(response, event);
      }
    }

    const unsubscribe = await eventBus.subscribeToRun(run.id, (event) => {
      writeSseEvent(response, event);
    });

    request.on("close", () => {
      void unsubscribe();
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
      (await store.getSession(sessionId)) ??
      (await store.createSession("New session"));

    const created = await store.createRun(session.id, prompt);

    if (env.storageMode === "postgres") {
      await runQueue?.add("start_run", {
        type: "start_run",
        runId: created.run.id
      });
    } else {
      void coordinator.startRun(created.run);
    }

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
          (await store.getSession(action.sessionId)) ??
          (await store.createSession("New session"));
        const created = await store.createRun(session.id, prompt);

        if (env.storageMode === "postgres") {
          await runQueue?.add("start_run", {
            type: "start_run",
            runId: created.run.id
          });
        } else {
          void coordinator.startRun(created.run);
        }

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

        if (env.storageMode === "postgres") {
          await coordinator.prepareRunAfterClarification(
            action.runId,
            clarification
          );
          await runQueue?.add("resume_run", {
            type: "resume_run",
            runId: action.runId
          });
        } else {
          await coordinator.continueRunAfterClarification(
            action.runId,
            clarification
          );
        }
        response.json({ ok: true });
        return;
      }

      if (action.action.name === "continue-research" && action.runId) {
        const parentRun = await store.getRun(action.runId);
        if (!parentRun) {
          response.status(404).json({
            ok: false,
            message: "Parent run not found."
          });
          return;
        }

        const created = await store.createRun(
          parentRun.sessionId,
          `${parentRun.prompt}\n\nContinue the research and add one more practical angle.`
        );

        if (env.storageMode === "postgres") {
          await runQueue?.add("start_run", {
            type: "start_run",
            runId: created.run.id
          });
        } else {
          void coordinator.startRun(created.run);
        }
        response.status(201).json({
          ok: true,
          session: await store.getSession(parentRun.sessionId),
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
