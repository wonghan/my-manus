import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

function readDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(currentDir, "../../.env");

  if (!fs.existsSync(envPath)) {
    return "";
  }

  const envContents = fs.readFileSync(envPath, "utf8");

  for (const rawLine of envContents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "DATABASE_URL") {
      return value;
    }
  }

  return "";
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: readDatabaseUrl()
  }
});
