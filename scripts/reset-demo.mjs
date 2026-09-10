import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Explicit local reset; pairing/workspaces live outside this database.
if (!process.argv.includes('--confirm')) throw new Error('Stop the backend, then run node scripts/reset-demo.mjs --confirm.');
try {
  await fetch('http://127.0.0.1:4318/health', { signal: AbortSignal.timeout(2000) });
  throw new Error('Backend is still running. Stop it before resetting the demo.');
} catch (error) {
  if (error.cause?.code !== 'ECONNREFUSED') throw error;
}
const backups = new URL('../.local/backups/', import.meta.url);
mkdirSync(backups, { recursive: true, mode: 0o700 });
const backup = fileURLToPath(new URL(`before-demo-${Date.now()}.sqlite`, backups));
const db = new DatabaseSync(fileURLToPath(new URL('../.local/ambient.sqlite', import.meta.url)));
try {
  db.prepare('VACUUM INTO ?').run(backup);
  db.exec('DELETE FROM kv; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  console.log('Assistant history, findings, memories, baselines, and custom instructions cleared. Default help instructions load on reconnect.');
  console.log(`Local recovery backup: ${backup}`);
} finally { db.close(); }
