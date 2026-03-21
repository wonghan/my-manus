import express, { type Request, type Response } from "express";
import { readAgentEnvironment } from "./config";
import { getClarificationRequest, researchPrompt } from "./research";

const env = readAgentEnvironment();
const app = express();

app.use(express.json());

app.get("/health", (_request: Request, response: Response) => {
  response.json({
    ok: true,
    mode: env.mode
  });
});

app.post("/research", async (request: Request, response: Response) => {
  const prompt = String(request.body?.prompt ?? "");
  const clarification = getClarificationRequest(prompt);

  if (clarification) {
    response.json({
      ok: true,
      clarification
    });
    return;
  }

  const result = await researchPrompt(prompt, {
    mode: env.mode,
    model: env.model,
    openaiApiBase: env.openaiApiBase
  });

  response.json({
    ok: true,
    result
  });
});

app.listen(env.port, () => {
  console.log(`[agent] listening on http://localhost:${env.port}`);
});
