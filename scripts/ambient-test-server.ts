import { resolve } from "node:path";
import { createApp } from "../apps/server/src/app.js";
import { build } from "esbuild";
await build({
  stdin: {
    contents:
      "import { PageRuntime } from './packages/browser/src/index.ts'; window.TestRuntime=PageRuntime;",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  outfile: "apps/workbench/dist/runtime-test.js",
});
const { app } = await createApp({
  port: 4318,
  token: "test-pairing-token-".repeat(4),
  mode: "demo",
  model: "gpt-6-astra",
  dbPath: null,
  sandboxOrigin: "https://11816061-sb1.app.netsuite.com",
  staticPath: resolve("apps/workbench/dist"),
});
await app.listen({ port: 4318, host: "127.0.0.1" });
for (const s of ["SIGINT", "SIGTERM"] as const)
  process.once(s, () => void app.close().then(() => process.exit(0)));
