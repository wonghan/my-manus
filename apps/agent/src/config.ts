export interface AgentEnvironment {
  port: number;
  mode: "mock" | "live";
  storageMode: "memory" | "postgres";
  model: string;
  databaseUrl?: string;
  redisUrl?: string;
  openaiApiBase?: string;
}

export function readAgentEnvironment(): AgentEnvironment {
  return {
    port: Number(process.env.AGENT_PORT ?? 4301),
    mode: process.env.AGENT_EXECUTION_MODE === "live" ? "live" : "mock",
    storageMode:
      process.env.APP_STORAGE_MODE === "postgres" ? "postgres" : "memory",
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
    redisUrl: process.env.REDIS_URL?.trim() || undefined,
    openaiApiBase: process.env.OPENAI_API_BASE?.trim() || undefined
  };
}

export function assertPersistentAgentEnvironment(env: AgentEnvironment) {
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
