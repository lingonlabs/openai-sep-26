import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { GateRequestSchema, type ClosePack, type GateRequest, type GateResponse } from '../shared/schema.js';
import type { GateOptions } from '../gate/provider.js';

interface Options { root:string; token:string; port:number; pack:ClosePack; gateOptions:GateOptions;
  extensionOrigin?:string; gate:(request:GateRequest,signal?:AbortSignal)=>Promise<GateResponse>; logging?:boolean }
function json(res:ServerResponse,status:number,body:unknown) { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body)); }
function tokenMatches(value:unknown, expected:string) {
  if (typeof value!=='string') return false;
  const a=Buffer.from(value),b=Buffer.from(expected);return a.length===b.length && timingSafeEqual(a,b);
}
async function body(req:IncomingMessage) {
  let size=0;const chunks:Buffer[]=[];
  for await (const chunk of req) {size+=chunk.length;if(size>256_000) throw new Error('Request too large');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
export function makeServer(options:Options) {
  const {root,pack}=options;const inflight=new Set<string>();
  return createServer(async(req,res)=>{
    const localOrigins=[`http://127.0.0.1:${options.port}`,`http://localhost:${options.port}`];
    const origin=req.headers.origin;
    const validExtension=origin && /^chrome-extension:\/\/[a-p]{32}$/.test(origin) && (!options.extensionOrigin||origin===options.extensionOrigin);
    if (!localOrigins.some(o=>new URL(o).host===req.headers.host)) {json(res,403,{error:'Invalid host'});return;}
    if (origin && !localOrigins.includes(origin) && !validExtension) {json(res,403,{error:'Origin not allowed'});return;}
    if (origin) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
    if (req.method==='OPTIONS') {res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Close-Copilot-Token'});res.end();return;}
    const path=new URL(req.url??'/',localOrigins[0]).pathname;
    if(path==='/api/health'&&req.method==='GET') {json(res,200,{status:'ok',mode:options.gateOptions.mode,model:options.gateOptions.mode==='live'?options.gateOptions.model:null,
      apiConfigured:!!options.gateOptions.apiKey,packVersion:pack.version,company:pack.company});return;}
    if(path.startsWith('/api/')) {
      if(!tokenMatches(req.headers['x-close-copilot-token'],options.token)) {json(res,401,{error:'Pair with the local relay token first'});return;}
      if(path==='/api/pack'&&req.method==='GET') {json(res,200,pack);return;}
      if(path==='/api/gate'&&req.method==='POST') {
        let id:string|undefined;let registered=false;const started=performance.now();const abort=new AbortController();
        const timer=setTimeout(()=>abort.abort(),options.gateOptions.timeoutMs);
        res.on('close',()=>{if(!res.writableEnded)abort.abort();});
        try {
          const request=GateRequestSchema.parse(await body(req));id=request.requestId;
          if(inflight.has(id)){json(res,409,{error:'This request is already running'});return;}
          if(inflight.size>=2){json(res,429,{error:'Relay is busy. Try again shortly.'});return;}
          inflight.add(id);registered=true;
          const result=await options.gate(request,abort.signal);
          if(abort.signal.aborted) throw new Error('Review timed out');
          if(options.logging!==false) {
            await mkdir(resolve(root,'logs'),{recursive:true});
            await appendFile(resolve(root,'logs/run.jsonl'),JSON.stringify({ts:new Date().toISOString(),kind:'gate',requestId:id,
              fingerprint:request.fingerprint,packVersion:pack.version,decision:result.verdict.decision,evidence:result.verdict.evidenceIds,
              schemaOk:true,...result.meta})+'\n');
          }
          json(res,200,result);
        } catch(error) {
          const message=error instanceof Error?error.message:'Review failed';
          const invalid=error instanceof Error && error.name==='ZodError';
          const status=invalid?400:abort.signal.aborted?504:503;
          // Never echo provider bodies, credentials, or the submitted journal into errors.
          const safe=invalid?'Invalid journal entry':abort.signal.aborted?'Review timed out':
            message.includes('requires OPENAI_API_KEY')?'Live mode needs a local API key':
            message.includes('fingerprint')?'Entry fingerprint mismatch':message.includes('Close pack changed')?message:'Could not check this entry. Retry or continue without a check.';
          if(options.logging!==false) {await mkdir(resolve(root,'logs'),{recursive:true});await appendFile(resolve(root,'logs/run.jsonl'),JSON.stringify({ts:new Date().toISOString(),kind:'gate_error',requestId:id,status,ms:Math.round(performance.now()-started),schemaOk:false})+'\n');}
          if(!res.destroyed)json(res,status,{error:safe});
        } finally {clearTimeout(timer);if(id&&registered)inflight.delete(id);}
        return;
      }
      json(res,404,{error:'Unknown endpoint'});return;
    }
    const files:Record<string,string>={'/':'dist/fixture/index.html','/fixture':'dist/fixture/index.html','/fixture/':'dist/fixture/index.html',
      '/fixture/app.js':'dist/fixture/app.js','/fixture/styles.css':'dist/fixture/styles.css'};
    const file=files[path];
    if(req.method!=='GET'||!file){json(res,404,{error:'Not found'});return;}
    try {const bytes=await readFile(resolve(root,file));const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
      res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
    } catch {json(res,503,{error:'Run npm run build before opening the fixture'});}
  });
}
