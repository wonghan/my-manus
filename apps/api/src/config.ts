export interface ApiEnvironment {
  port: number;
  agentMode: "mock" | "live";
  agentBaseUrl: string;
  useRemoteAgent: boolean;
}

export function readApiEnvironment(): ApiEnvironment {
  return {
    port: Number(process.env.API_PORT ?? 4300),
    agentMode: process.env.AGENT_EXECUTION_MODE === "live" ? "live" : "mock",
    agentBaseUrl: process.env.AGENT_BASE_URL ?? "http://localhost:4301",
    useRemoteAgent: process.env.AGENT_EXECUTION_TRANSPORT === "remote"
  };
}
