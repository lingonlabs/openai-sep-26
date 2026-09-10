import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { createApp } from "./app.js";
const root = fileURLToPath(new URL("../../../", import.meta.url));
config({ path: resolve(root, ".env"), quiet: true });
const port = Number(process.env.APP_PORT || 4318);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid APP_PORT");
const local = resolve(root, ".local");
mkdirSync(local, { recursive: true, mode: 0o700 });
const tokenPath = resolve(local, "relay-token");
if (!existsSync(tokenPath))
  writeFileSync(tokenPath, randomBytes(32).toString("hex"), { mode: 0o600 });
chmodSync(tokenPath, 0o600);
const token = readFileSync(tokenPath, "utf8").trim();
const mode = process.env.AGENT_MODE || "live";
if (mode !== "live" && mode !== "demo")
  throw new Error("AGENT_MODE must be live or demo");
const { app } = await createApp({
  port,
  token,
  mode,
  model: process.env.ASTRA_MODEL || "gpt-6-astra",
  apiKey: process.env.OPENAI_API_KEY,
  dbPath: process.env.APP_DB_PATH || resolve(local, "close-copilot.sqlite"),
  sandboxOrigin:
    process.env.NETSUITE_SANDBOX_ORIGIN ||
    "https://11816061-sb1.app.netsuite.com",
  staticPath: resolve(root, "apps/workbench/dist"),
});
await app.listen({ port, host: "127.0.0.1" });
console.log(
  `Close Copilot: http://127.0.0.1:${port} · ${mode === "live" ? "Live Astra" : "Deterministic test mode"} · Local SQLite history`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
