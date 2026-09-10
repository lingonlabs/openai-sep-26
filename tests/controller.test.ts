import { test } from 'node:test';
import assert from 'node:assert/strict';
import packJson from '../data/close-pack.json';
import entries from '../data/demo-entries.json';
import { GateController } from '../src/browser/controller.js';
import { createGate } from '../src/gate/provider.js';
import { EntrySchema, applyChanges, type ClosePack, type GateRequest, type GateResponse } from '../src/shared/schema.js';
const pack=packJson as ClosePack;
function setup(id='D1',override?:(request:GateRequest)=>Promise<GateResponse>){
  let entry=EntrySchema.parse(entries.find(e=>e.id===id)!.entry);let saves=0;
  const gate=createGate(pack,{mode:'demo',model:'gpt-6-astra',timeoutMs:1000});
  const adapter={read:()=>structuredClone(entry),save:()=>{saves++;},apply:async(changes:Parameters<typeof applyChanges>[1])=>{entry=applyChanges(entry,changes);}};
  const controller=new GateController(adapter,{gate:override??gate},()=>{});controller.connect(pack);
  return {controller,get saves(){return saves;},get entry(){return entry;},set entry(value){entry=value;},gate};
}
test('clean Save is resumed once; a second continuation does nothing',async()=>{
  const x=setup();await x.controller.check();assert.equal(x.saves,1);await x.controller.continueOnce();assert.equal(x.saves,1);
});
test('duplicates cannot be continued through the warning path',async()=>{
  const x=setup('D2');await x.controller.check();assert.equal(x.controller.state.phase,'block');await x.controller.continueOnce();assert.equal(x.saves,0);
});
test('warning continuation is one-use even with concurrent clicks',async()=>{
  const x=setup('C4');await x.controller.check();assert.equal(x.saves,0);
  await Promise.all([x.controller.continueOnce(),x.controller.continueOnce()]);assert.equal(x.saves,1);
});
test('a stale approval cannot post edited values even without input events',async()=>{
  let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});let called!:()=>void;const entered=new Promise<void>(r=>{called=r;});
  const x=setup('D1',async request=>{called();await wait;return x.gate(request);});
  const checking=x.controller.check();await entered;x.entry={...x.entry,memo:'Changed while reviewing'};release();await checking;assert.equal(x.saves,0);
});
test('duplicate Save clicks share one pending check',async()=>{
  let calls=0;const x=setup('D1',async request=>{calls++;return x.gate(request);});
  await Promise.all([x.controller.check(),x.controller.check()]);assert.equal(calls,1);assert.equal(x.saves,1);
});
test('an unavailable check requires a deliberate continuation',async()=>{
  const x=setup('D1',async()=>{throw new Error('Relay unavailable');});await x.controller.check();
  assert.equal(x.controller.state.phase,'error');assert.equal(x.saves,0);await x.controller.continueOnce();assert.equal(x.saves,1);
});
test('changing a warned entry invalidates its continuation',async()=>{
  const x=setup('C4');await x.controller.check();x.entry={...x.entry,memo:'Edited'};await x.controller.continueOnce();assert.equal(x.saves,0);
});
test('a correction verifies the form and waits for another user Save',async()=>{
  const x=setup('D3');await x.controller.check();await x.controller.applyFix();
  assert.equal(x.controller.state.phase,'fixed');assert.equal(x.saves,0);assert.equal(x.entry.lines[0].debit,'452.00');
  await x.controller.check();assert.equal(x.saves,1);
});
test('cancelled review cannot publish or post a late response',async()=>{
  let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});let called!:()=>void;const entered=new Promise<void>(r=>{called=r;});
  const x=setup('D1',async request=>{called();await wait;return x.gate(request);});
  const checking=x.controller.check();await entered;x.controller.cancel();release();await checking;assert.equal(x.saves,0);assert.equal(x.controller.state.result,null);
});
test('mismatched response IDs cannot authorize Save',async()=>{
  const x=setup('D1',async request=>({...await x.gate(request),requestId:crypto.randomUUID()}));
  await x.controller.check();assert.equal(x.saves,0);assert.equal(x.controller.state.phase,'error');
});
