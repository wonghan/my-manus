import type { AppStore, RunEventBus, RunJobData } from "@my-manus/shared";
import { RunCoordinator } from "@my-manus/agent";
import {
  createDbClient,
  createRunQueue,
  PostgresAppStore,
  RedisRunEventBus
} from "@my-manus/db";
import {
  assertPersistentApiEnvironment,
  readApiEnvironment,
  type ApiEnvironment
} from "./config";
import { InMemoryRunEventBus } from "./services/in-memory-run-event-bus";
import { InMemoryAppStore } from "./store/in-memory-store";

export interface ApiRuntime {
  env: ApiEnvironment;
  store: AppStore;
  eventBus: RunEventBus;
  coordinator: RunCoordinator;
  runQueue?: {
    add(name: RunJobData["type"], data: RunJobData): Promise<unknown>;
  };
}

export function createApiRuntime(): ApiRuntime {
  const env = readApiEnvironment();

  if (env.storageMode === "memory") {
    const store = new InMemoryAppStore();
    const eventBus = new InMemoryRunEventBus();
    return {
      env,
      store,
      eventBus,
      coordinator: new RunCoordinator(store, eventBus)
    };
  }

  assertPersistentApiEnvironment(env);
  const databaseUrl = env.databaseUrl!;
  const redisUrl = env.redisUrl!;

  const db = createDbClient(databaseUrl);
  const store = new PostgresAppStore(db);
  const eventBus = new RedisRunEventBus(redisUrl);
  const runQueue = createRunQueue(redisUrl);

  return {
    env,
    store,
    eventBus,
    runQueue,
    coordinator: new RunCoordinator(store, eventBus)
  };
}
