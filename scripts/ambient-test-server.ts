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
const { app, manager, broker } = await createApp({
  port: 4318,
  token: "test-pairing-token-".repeat(4),
  mode: "demo",
  model: "gpt-6-astra",
  dbPath: null,
  sandboxOrigin: "https://11816061-sb1.app.netsuite.com",
  staticPath: resolve("apps/workbench/dist"),
});
// Deterministic browser driver used only by the isolated extension regression.
// It travels through the real broker/extension; no production test endpoint.
const originalChat = manager.agents.chat.bind(manager.agents);
const originalAmbient = manager.agents.ambient.bind(manager.agents);
manager.agents.ambient = async (request) => {
  if (
    !request.preferences.instructions.some(
      (i) =>
        i.enabled &&
        i.text === "Offer test choices for this synthetic workspace",
    )
  )
    return originalAmbient(request);
  const event = request.events[0];
  if (!event?.url.startsWith("http://127.0.0.1:4318/demo/"))
    throw new Error("Synthetic observations only");
  return {
    decision: "offer",
    instructionId: request.preferences.instructions.find((i) => i.enabled)!.id,
    tabId: event.tabId,
    entityKey: "synthetic-review",
    summary: "Remembered the synthetic workspace.",
    reason: "Your saved instruction asks for a synthetic review.",
    title: "Choose a synthetic review",
    detail: "Choose what help you would like.",
    options: [
      {
        kind: "task",
        label: "Review the workspace",
        prompt: "Summarize the selected synthetic workspace.",
      },
      { kind: "dismiss", label: "No help needed", prompt: "No help needed." },
    ],
  };
};
manager.agents.chat = async (task, workspace, message, signal) => {
  if (message !== "[Native browser regression]")
    return originalChat(task, workspace, message, signal);
  const tabs = broker.tabs(workspace);
  if (tabs.some((t) => !t.url.startsWith("http://127.0.0.1:4318/demo/")))
    throw new Error("Native regression requires synthetic fixture URLs");
  const tab = tabs.find((t) => t.app === "gmail")!;
  const act = async (action: import("@close/shared").BrowserAction) => {
    const result = await broker.command(task, tab.id, action, signal);
    if (result.status !== "ok") throw new Error(result.message);
    broker.record(task, result);
    return result;
  };
  const first = await act({ kind: "inspect" });
  const field = first.observation.elements.find((e) => e.role === "searchbox")!;
  await act({ kind: "fill", elementId: field.id, value: "invoice" });
  await act({ kind: "key", elementId: field.id, key: "Enter" });
  const result = await act({ kind: "screenshot" });
  if (!result.screenshot?.startsWith("data:image/png;base64,"))
    throw new Error("No captured image");
  return "### Native browser checks\n\n| Check | Result |\n| --- | --- |\n| Search key | Complete |\n| Source screenshot | Captured |\n\n- Only the selected tab was used.\n- Bills remain unsaved.";
};
await app.listen({ port: 4318, host: "127.0.0.1" });
for (const s of ["SIGINT", "SIGTERM"] as const)
  process.once(s, () => void app.close().then(() => process.exit(0)));
