import Fastify from "fastify";
import websocket from "@fastify/websocket";
import staticPlugin from "@fastify/static";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { ClientMessageSchema, type ServerMessage } from "@close/shared";
import type { WebSocket } from "ws";
import { Store } from "./store.js";
import { BrowserBroker } from "./broker.js";
import { CloseAgents, type AgentOptions } from "./agents.js";
import { Manager } from "./manager.js";
import { demoPage } from "./demo-pages.js";
export interface AppOptions extends AgentOptions {
  port: number;
  token: string;
  dbPath: string | null;
  sandboxOrigin: string;
  staticPath: string;
}
export async function createApp(options: AppOptions) {
  const origin = `http://127.0.0.1:${options.port}`;
  const store = await Store.open(options.dbPath),
    broker = new BrowserBroker(store, options.sandboxOrigin, origin),
    agents = new CloseAgents(store, broker, options);
  const manager = new Manager(
    store,
    broker,
    agents,
    options.sandboxOrigin,
    origin,
  );
  const app = Fastify({ logger: false, bodyLimit: 65536 });
  const clients = new Map<WebSocket, { id: string; role: "browser" | "ui" }>();
  app.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host;
    if (
      host !== `127.0.0.1:${options.port}` &&
      host !== `localhost:${options.port}`
    )
      return reply.code(403).send({ error: "Localhost host required" });
    const from = request.headers.origin;
    if (
      from &&
      from !== origin &&
      from !== `http://localhost:${options.port}` &&
      !/^chrome-extension:\/\/[a-p]{32}$/.test(from)
    )
      return reply.code(403).send({ error: "Origin not allowed" });
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer");
  });
  await app.register(websocket, { options: { maxPayload: 2_500_000 } });
  const send = (socket: WebSocket, value: unknown) => {
    if (socket.readyState === 1) socket.send(JSON.stringify(value));
  };
  let broadcastTimer: ReturnType<typeof setTimeout> | undefined;
  manager.onChange = () => {
    if (broadcastTimer) return;
    broadcastTimer = setTimeout(() => {
      broadcastTimer = undefined;
      const message = { type: "state", state: manager.state() };
      for (const socket of clients.keys()) send(socket, message);
    }, 80);
  };
  app.get("/bridge", { websocket: true }, (socket) => {
    let identity: { id: string; role: "browser" | "ui" } | null = null;
    const authTimer = setTimeout(
      () => socket.close(1008, "Pairing required"),
      5000,
    );
    socket.on("message", async (bytes) => {
      try {
        const parsed = ClientMessageSchema.safeParse(
          JSON.parse(bytes.toString()),
        );
        if (!parsed.success) {
          socket.close(1008, "Invalid protocol message");
          return;
        }
        const message = parsed.data;
        if (!identity) {
          if (
            message.type !== "hello" ||
            !equal(message.token, options.token)
          ) {
            socket.close(1008, "Pairing rejected");
            return;
          }
          clearTimeout(authTimer);
          identity = { id: message.clientId, role: message.role };
          if ([...clients.values()].some((c) => c.id === message.clientId)) {
            socket.close(1008, "Client ID already connected");
            return;
          }
          clients.set(socket, identity);
          if (identity.role === "browser")
            manager.connected({
              id: identity.id,
              name: message.name,
              synthetic: message.synthetic,
              tabs: [],
              activeWorkspaceId: null,
              send: (value) => send(socket, value),
            });
          send(socket, {
            type: "welcome",
            clientId: identity.id,
            state: manager.state(),
          } satisfies ServerMessage);
          return;
        }
        if (message.type === "ui.request") {
          try {
            const data = await manager.request(message.action, message.payload);
            send(socket, {
              type: "ui.response",
              requestId: message.requestId,
              ok: true,
              data,
            });
          } catch (e) {
            send(socket, {
              type: "ui.response",
              requestId: message.requestId,
              ok: false,
              error: e instanceof Error ? e.message : "Request failed",
            });
          }
          return;
        }
        if (message.type === "heartbeat") return;
        if (identity.role !== "browser") {
          socket.close(1008, "Browser role required");
          return;
        }
        if (message.type === "browser.inventory")
          manager.inventory(identity.id, message.tabs);
        else if (message.type === "browser.context")
          manager.context(identity.id, message.workspaceId, message.context);
        else if (message.type === "browser.result")
          broker.receive(identity.id, message);
        else socket.close(1008, "Unexpected message");
      } catch {
        socket.close(1008, "Invalid message");
      }
    });
    socket.on("close", () => {
      clearTimeout(authTimer);
      const client = clients.get(socket);
      clients.delete(socket);
      if (client?.role === "browser") manager.disconnected(client.id);
    });
  });
  app.get("/health", async () => ({
    ok: true,
    app: "close-copilot",
    protocol: 1,
    mode: options.mode,
    model: options.model,
    apiConfigured: !!options.apiKey,
  }));
  app.get("/demo/:app", async (request, reply) => {
    const name = (request.params as { app: string }).app;
    if (!["netsuite", "gmail", "vendors"].includes(name))
      return reply.code(404).send();
    return reply.type("text/html").send(demoPage(name));
  });
  if (existsSync(options.staticPath))
    await app.register(staticPlugin, { root: options.staticPath, prefix: "/" });
  else
    app.get("/", async (_req, reply) =>
      reply
        .type("text/plain")
        .send("Run pnpm build before opening the workbench."),
    );
  const heartbeat = setInterval(() => {
    for (const socket of clients.keys()) send(socket, { type: "heartbeat" });
  }, 20000);
  heartbeat.unref();
  app.addHook("onClose", async () => {
    clearInterval(heartbeat);
    clearTimeout(broadcastTimer);
    manager.close();
    const sockets = [...clients.keys()];
    clients.clear();
    for (const socket of sockets) socket.close(1001, "App shutting down");
    store.close();
  });
  return { app, manager, broker, store };
}
function equal(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
