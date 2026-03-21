import { createApp } from "./app";
import { readApiEnvironment } from "./config";

const env = readApiEnvironment();
const app = createApp();

app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
});
