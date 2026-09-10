import 'dotenv/config';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { EntrySchema, fingerprint, GateResponseSchema } from '../src/shared/schema.js';
const base=`http://127.0.0.1:${process.env.PORT??4317}`;
const token=(await readFile('.local/relay-token','utf8')).trim();
const health=await fetch(base+'/api/health').then(r=>r.json());
if(health.mode==='live'&&!process.argv.includes('--live'))throw new Error('Live relay detected. Run npm run eval:gate -- --live to request paid model evaluations.');
const runs=3;const results=[];const latency:number[]=[];
console.log(health.mode==='demo'?'RULES DEMO evaluation — these results do not measure Astra accuracy.':'LIVE ASTRA evaluation — each request is counted, without hidden retries.');
for(const file of (await readdir('eval/cases')).filter(f=>f.endsWith('.json')).sort()){
  const c=JSON.parse(await readFile('eval/cases/'+file,'utf8'));const entry=EntrySchema.parse(c.entry);const observations=[];
  for(let n=0;n<runs;n++){
    const started=performance.now();
    try{
      const response=await fetch(base+'/api/gate',{method:'POST',headers:{'Content-Type':'application/json','X-Close-Copilot-Token':token},
        body:JSON.stringify({requestId:crypto.randomUUID(),fingerprint:await fingerprint(entry),packVersion:health.packVersion,entry}),signal:AbortSignal.timeout(10000)});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      const result=GateResponseSchema.parse(data);const refs=new Set([...result.verdict.evidenceIds,...result.verdict.issues.flatMap(i=>i.evidenceIds)]);
      const ms=Math.round(performance.now()-started);latency.push(ms);
      observations.push({decision:result.verdict.decision,evidenceOk:c.expected.evidenceIds.every((id:string)=>refs.has(id)),ms,meta:result.meta});
    }catch(error){observations.push({decision:'error',evidenceOk:false,ms:Math.round(performance.now()-started),error:error instanceof Error?error.message:'Failed'});}
    // User-configurable pacing for the account's actual TPM/RPM limits.
    const delay=Number(process.env.EVAL_DELAY_MS??0);if(delay>0)await new Promise(r=>setTimeout(r,delay));
  }
  const correct=observations.filter(o=>o.decision===c.expected.decision&&o.evidenceOk).length;
  results.push({case:c.id,expected:c.expected.decision,runs:observations,correct,majorityPass:correct>=2,flip:new Set(observations.map(o=>o.decision)).size>1});
}
console.table(results.map(r=>({case:r.case,expected:r.expected,run1:r.runs[0].decision,run2:r.runs[1].decision,run3:r.runs[2].decision,evidence:r.runs.every(o=>o.evidenceOk),pass:r.majorityPass})));
const p95=latency.sort((a,b)=>a-b)[Math.max(0,Math.ceil(latency.length*.95)-1)]??0;
const summary={mode:health.mode,cases:results.length,majorityPass:results.filter(r=>r.majorityPass).length,
  demoPerfect:results.filter(r=>r.case.startsWith('D')).every(r=>r.correct===3),
  falseBlocks:results.filter(r=>r.case.startsWith('C')).reduce((n,r)=>n+r.runs.filter(o=>o.decision==='block').length,0),
  flips:results.filter(r=>r.flip).length,errors:results.flatMap(r=>r.runs).filter(o=>o.decision==='error').length,p95Ms:p95};
await mkdir('logs',{recursive:true});await writeFile('logs/gate-eval.json',JSON.stringify({summary,results},null,2)+'\n');
console.log(summary);if(summary.majorityPass<12||!summary.demoPerfect||summary.falseBlocks||summary.flips>1||summary.errors||p95>=6000)process.exitCode=1;
