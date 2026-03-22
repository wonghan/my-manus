import { createDbClient, createRunWorker, PostgresAppStore, RedisRunEventBus } from "@my-manus/db";
import {
  assertPersistentAgentEnvironment,
  readAgentEnvironment
} from "./config";
import { RunCoordinator } from "./run-coordinator";

const env = readAgentEnvironment();

if (env.storageMode !== "postgres") {
  console.log("[agent] worker disabled because APP_STORAGE_MODE=memory");
  setInterval(() => undefined, 1 << 30);
} else {
  assertPersistentAgentEnvironment(env);
  const databaseUrl = env.databaseUrl!;
  const redisUrl = env.redisUrl!;

  const db = createDbClient(databaseUrl);
  const store = new PostgresAppStore(db);
  const eventBus = new RedisRunEventBus(redisUrl);
  const coordinator = new RunCoordinator(store, eventBus);
  const worker = createRunWorker(redisUrl, async (job) => {
    if (job.data.type === "start_run") {
      await coordinator.startRunById(job.data.runId);
      return;
    }

    if (job.data.type === "resume_run") {
      await coordinator.resumeRunById(job.data.runId);
    }
  });

  worker.on("ready", () => {
    console.log("[agent] worker listening for run jobs");
  });

  worker.on("completed", (job) => {
    console.log(`[agent] completed ${job.data.type} for run ${job.data.runId}`);
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[agent] failed ${job?.data.type ?? "unknown"} for run ${job?.data.runId ?? "unknown"}: ${error.message}`
    );
  });

  const shutdown = async () => {
    await worker.close();
    await eventBus.close?.();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}
