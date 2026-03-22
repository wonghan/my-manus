export interface ApiEnvironment {
  port: number;
  agentMode: "mock" | "live";
  storageMode: "memory" | "postgres";
  agentBaseUrl: string;
  useRemoteAgent: boolean;
  databaseUrl?: string;
  redisUrl?: string;
}

export function readApiEnvironment(): ApiEnvironment {
  return {
    port: Number(process.env.API_PORT ?? 4300),
    agentMode: process.env.AGENT_EXECUTION_MODE === "live" ? "live" : "mock",
    storageMode:
      process.env.APP_STORAGE_MODE === "postgres" ? "postgres" : "memory",
    agentBaseUrl: process.env.AGENT_BASE_URL ?? "http://localhost:4301",
    useRemoteAgent: process.env.AGENT_EXECUTION_TRANSPORT === "remote",
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
    redisUrl: process.env.REDIS_URL?.trim() || undefined
  };
}

export function assertPersistentApiEnvironment(env: ApiEnvironment) {
  if (env.storageMode !== "postgres") {
    return;
  }

  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required when APP_STORAGE_MODE=postgres.");
  }

  if (!env.redisUrl) {
    throw new Error("REDIS_URL is required when APP_STORAGE_MODE=postgres.");
  }
}
