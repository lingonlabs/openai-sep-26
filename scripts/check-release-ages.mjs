import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
const lock = parse(readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8'));
const groups = new Map();
for (const key of Object.keys(lock.packages ?? {})) {
  const at = key.lastIndexOf('@');
  const name = key.slice(0, at), version = key.slice(at + 1);
  if (at <= 0 || !/^\d+\.\d+\.\d+/.test(version)) throw new Error(`Non-registry dependency: ${key}`);
  groups.set(name, [...(groups.get(name) ?? []), version]);
}
const queue = [...groups]; const problems = []; let checked = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const [name, versions] = queue.shift();
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${name}: registry returned ${response.status}`);
    const metadata = await response.json();
    for (const version of versions) {
      const published = Date.parse(metadata.time?.[version]);
      if (!Number.isFinite(published) || Date.now() - published < 14 * 86400000) problems.push(`${name}@${version}: ${metadata.time?.[version] ?? 'missing publication time'}`);
      checked++;
    }
  }
}));
if (problems.length) throw new Error(`Release-age policy failed:\n${problems.join('\n')}`);
console.log(`Verified ${checked} locked package versions: every publication is at least 14 days old. No exclusions.`);
