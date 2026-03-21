export interface AgentEnvironment {
  port: number;
  mode: "mock" | "live";
  model: string;
  openaiApiBase?: string;
}

export function readAgentEnvironment(): AgentEnvironment {
  return {
    port: Number(process.env.AGENT_PORT ?? 4301),
    mode: process.env.AGENT_EXECUTION_MODE === "live" ? "live" : "mock",
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
    openaiApiBase: process.env.OPENAI_API_BASE?.trim() || undefined
  };
}
