import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import packJson from '../data/close-pack.json';
import entries from '../data/demo-entries.json';
import { EntrySchema, fingerprint, type ClosePack } from '../src/shared/schema.js';
import { createGate } from '../src/gate/provider.js';
import { makeServer } from '../src/relay/server.js';
const pack=packJson as ClosePack;
test('HTTP bridge authenticates, validates origin, and returns an actual Gate review',async t=>{
  const token='test-only-local-pairing-token-'.repeat(2);const port=44317;
  const gateOptions={mode:'demo' as const,model:'gpt-6-astra',timeoutMs:1000};
  const server=makeServer({root:process.cwd(),token,port,pack,gateOptions,gate:createGate(pack,gateOptions),logging:false});
  server.listen(port,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${port}`;
  assert.equal((await fetch(base+'/api/pack')).status,401);
  const headers={'X-Close-Copilot-Token':token,'Content-Type':'application/json'};
  assert.equal((await fetch(base+'/api/pack',{headers:{...headers,Origin:'https://unrelated.example'}})).status,403);
  const entry=EntrySchema.parse(entries.find(e=>e.id==='D2')!.entry);
  const request={requestId:crypto.randomUUID(),packVersion:pack.version,fingerprint:await fingerprint(entry),entry};
  const response=await fetch(base+'/api/gate',{method:'POST',headers,body:JSON.stringify(request)});
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.verdict.decision,'block');assert.equal(result.meta.mode,'demo');
  assert.equal((await fetch(base+'/api/gate',{method:'POST',headers,body:JSON.stringify({...request,entry:{...entry,currency:'INVALID'}})})).status,400);
  assert.equal((await fetch(base+'/api/gate',{method:'POST',headers,body:JSON.stringify({...request,fingerprint:'0'.repeat(64)})})).status,503);
  assert.equal((await fetch(base+'/.env',{headers})).status,404);
  assert.equal((await fetch(base+'/.local/relay-token',{headers})).status,404);
});

test('duplicate command IDs stay reserved until the original request finishes',async t=>{
  const token='duplicate-request-test-token-'.repeat(2);const port=44318;
  const gateOptions={mode:'demo' as const,model:'gpt-6-astra',timeoutMs:2000};
  const realGate=createGate(pack,gateOptions);let calls=0;
  let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});
  let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});
  const server=makeServer({root:process.cwd(),token,port,pack,gateOptions,logging:false,gate:async request=>{
    calls++;entered();await wait;return realGate(request);
  }});
  server.listen(port,'127.0.0.1');await once(server,'listening');t.after(()=>{release();server.closeAllConnections();server.close();});
  const entry=EntrySchema.parse(entries[0].entry);
  const body=JSON.stringify({requestId:crypto.randomUUID(),packVersion:pack.version,fingerprint:await fingerprint(entry),entry});
  const send=()=>fetch(`http://127.0.0.1:${port}/api/gate`,{method:'POST',headers:{'X-Close-Copilot-Token':token,'Content-Type':'application/json'},body});
  const original=send();await started;
  assert.equal((await send()).status,409);
  assert.equal((await send()).status,409);
  assert.equal(calls,1);release();assert.equal((await original).status,200);
});
