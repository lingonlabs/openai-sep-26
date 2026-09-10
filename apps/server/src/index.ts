import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WebSocket } from 'ws';
import { ClientMessageSchema } from '@ambient/shared';
import { Store } from './store.js';
import { Hub } from './hub.js';
import { driveAgent } from './agent.js';
import { fixtures } from './fixtures.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dataDir = resolve(root, '.local'); mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const tokenFile = resolve(dataDir, 'pairing-token');
if (!existsSync(tokenFile)) writeFileSync(tokenFile, randomBytes(32).toString('hex'), { mode: 0o600 });
const token = readFileSync(tokenFile, 'utf8').trim();
const store = new Store(resolve(dataDir, 'ambient.sqlite'));
const hub = new Hub(store, driveAgent, process.env.OPENAI_MODEL || 'gpt-6-astra', !!process.env.OPENAI_API_KEY);
const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
await app.register(websocket, { options: { maxPayload: 12 * 1024 * 1024 } });
let active: WebSocket | null = null;
const authorizedToken = (value: string) => { const given = Buffer.from(value), actual = Buffer.from(token); return given.length === actual.length && timingSafeEqual(given, actual); };
app.get('/health', async () => ({ ok: true, apiReady: hub.apiReady, model: hub.model, extensionConnected: hub.connected }));
// Local development control uses the same paired extension bridge and Hub as the
// side panel. It never operates Chrome directly or bypasses workspace membership.
app.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/control/')) return;
  const origin = request.headers.origin;
  if (origin && origin !== `http://127.0.0.1:${process.env.PORT ?? 4318}`) return reply.code(403).send({ error: 'Untrusted origin' });
  const bearer = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
  if (!authorizedToken(bearer)) return reply.code(401).send({ error: 'Pairing token required' });
});
app.get('/control/state', async () => ({ ...hub.state(), connected: hub.connected, workspaces: hub.workspaces, activeWorkspaceId: hub.activeId, tabs: hub.tabs }));
app.post('/control/start', async (request, reply) => {
  const parsed = ClientMessageSchema.safeParse({ ...(request.body as object), type: 'start' });
  if (!parsed.success || parsed.data.type !== 'start') return reply.code(400).send({ error: 'Invalid task request' });
  if (hub.running) return reply.code(409).send({ error: 'A browser task is already running' });
  if (!hub.connected) return reply.code(409).send({ error: 'The extension is not connected' });
  let immediateError: string | undefined;
  const run = hub.receive(parsed.data).catch(error => { immediateError = error instanceof Error ? error.message : 'Could not start task'; });
  await Promise.resolve();
  const taskId = hub.state().runningTaskId;
  if (!taskId) { await run; return reply.code(400).send({ error: immediateError ?? 'Task did not start' }); }
  return { taskId };
});
app.post('/control/stop', async () => { hub.stop('Stopped through local development control.'); return { ok: true }; });
app.get('/bridge', { websocket: true }, (socket, request) => {
  // Browser pages cannot impersonate an extension origin. Pairing is still required.
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(request.headers.origin ?? '')) { socket.close(1008, 'Extension origin required'); return; }
  let authenticated = false;
  const timer = setTimeout(() => socket.close(1008, 'Pairing timed out'), 5000);
  socket.on('message', bytes => {
    let parsed; try { parsed = ClientMessageSchema.safeParse(JSON.parse(bytes.toString())); } catch { socket.close(1008, 'Invalid message'); return; }
    if (!parsed.success) { socket.send(JSON.stringify({ type: 'error', message: 'Invalid bridge message.' })); return; }
    const message = parsed.data;
    if (!authenticated) {
      if (message.type !== 'hello' || !authorizedToken(message.token)) { socket.close(1008, 'Invalid pairing token'); return; }
      clearTimeout(timer);
      if (active && active !== socket) { socket.close(1008, 'Another extension is connected'); return; }
      authenticated = true; active = socket; hub.connected = true;
      hub.send = message => { if (socket.readyState === 1) socket.send(JSON.stringify(message)); };
      hub.publish(); return;
    }
    void hub.receive(message).catch(error => socket.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Request failed.' })));
  });
  socket.on('close', () => { clearTimeout(timer); if (active === socket) { hub.disconnect(); active = null; hub.send = () => {}; } });
  socket.on('error', () => {});
});
app.get('/fixtures/netsuite', async (_r, reply) => reply.type('text/html').send(fixtures.netsuite()));
app.get('/fixtures/gmail', async (r, reply) => reply.type('text/html').send(fixtures.gmail((r.query as { message?: string }).message)));
app.get('/fixtures/vendors', async (_r, reply) => reply.type('text/html').send(fixtures.vendors()));
const output = resolve(root, 'apps/extension/.output/chrome-mv3');
app.get('/preview', async (_r, reply) => {
  const file = resolve(output, 'sidepanel.html');
  if (!existsSync(file)) return reply.code(503).send('Build the extension first: pnpm build');
  return reply.type('text/html').send(readFileSync(file, 'utf8').replaceAll('src="/', 'src="/extension/').replaceAll('href="/', 'href="/extension/'));
});
app.get('/extension/*', async (r, reply) => {
  const path = resolve(output, (r.params as { '*': string })['*']);
  if (!path.startsWith(output + sep) || !existsSync(path)) return reply.code(404).send('Not found');
  const type: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' };
  return reply.type(type[extname(path)] || 'application/octet-stream').send(readFileSync(path));
});
app.get('/', async (_r, reply) => reply.type('text/html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ambient · Local setup</title><style>body{margin:0;background:#f4f3eb;color:#213e31;font:16px/1.7 system-ui}main{max-width:840px;margin:70px auto;padding:30px}h1{font-size:54px;letter-spacing:-2px;line-height:1.1}section{padding:24px;background:#fffdf7;border:1px solid #dadfd4;border-radius:15px;margin:20px 0}a{color:#246552}code{background:#edf0e7;padding:3px 6px;border-radius:4px}small{color:#657264}.pill{font-size:12px;letter-spacing:.1em;text-transform:uppercase}.links{display:flex;gap:20px;flex-wrap:wrap}</style></head><body><main><p class="pill">Ambient / local prototype</p><h1>A little more presence.<br>A lot less tab work.</h1><p>Your local server is ready. ${hub.apiReady ? 'The OpenAI API key is configured.' : 'Add OPENAI_API_KEY to .env and restart to enable Astra.'}</p><section><h2>Connect your demo profile</h2><ol><li>Run <code>pnpm build</code> if you have not built the extension.</li><li>In your dedicated Chrome profile, open <code>chrome://extensions</code>, enable Developer mode, and choose Load unpacked.</li><li>Select <code>apps/extension/.output/chrome-mv3</code> from this repository.</li><li>Click Ambient in the toolbar. Paste the local token from <code>.local/pairing-token</code> into the pairing screen.</li><li>Create a workspace and select the NetSuite sandbox and Gmail tabs. Allow access to the selected sites.</li></ol><small>The OpenAI key stays in .env on the server. The pairing token connects only this extension to localhost.</small></section><section><h2>Practice before using the real tabs</h2><p>These local fixtures contain synthetic invoices and exercise the same browser tools. Open them in your demo Chrome profile and select them in a workspace.</p><div class="links"><a href="/fixtures/netsuite">NetSuite practice</a><a href="/fixtures/gmail">Gmail practice</a><a href="/fixtures/vendors">Vendor register</a><a href="/preview">Preview the side panel</a></div></section></main></body></html>`));
const port = Number(process.env.PORT ?? 4318);
await app.listen({ host: '127.0.0.1', port });
console.log(`Ambient is running at http://127.0.0.1:${port}`);
console.log(`Pairing token file: ${tokenFile}`);
console.log(`Astra API: ${hub.apiReady ? 'key configured' : 'key missing'}. Tracing disabled. Local data: ${dataDir}`);
const shutdown = async () => { hub.stop('Server shutting down.'); active?.close(); await app.close(); store.close(); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
