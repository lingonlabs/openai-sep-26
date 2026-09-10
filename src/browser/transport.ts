import { GateResponseSchema, type ClosePack, type GateRequest } from '../shared/schema.js';
export class RelayClient {
  constructor(readonly baseUrl:string,private token:string){}
  private async request(path:string,body?:unknown,signal?:AbortSignal) {
    const timeout=AbortSignal.timeout(9000);
    const response=await fetch(this.baseUrl+path,{method:body?'POST':'GET',headers:{'X-Close-Copilot-Token':this.token,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:signal?AbortSignal.any([signal,timeout]):timeout});
    const result=await response.json();if(!response.ok)throw new Error(result.error??'Local relay unavailable');return result;
  }
  async pack():Promise<ClosePack>{return this.request('/api/pack');}
  async gate(request:GateRequest,signal:AbortSignal){return GateResponseSchema.parse(await this.request('/api/gate',request,signal));}
}
