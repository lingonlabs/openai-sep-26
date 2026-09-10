import { applyChanges, canonicalEntry, fingerprint, GateResponseSchema, proposedChanges, type Change, type ClosePack,
  type Entry, type GateRequest, type GateResponse } from '../shared/schema.js';
export interface FormAdapter { read():Entry; save():void; apply(changes:Change[],signal:AbortSignal):Promise<void> }
export interface Transport { gate(request:GateRequest,signal:AbortSignal):Promise<GateResponse> }
export type Phase='disconnected'|'ready'|'checking'|'allow'|'warn'|'block'|'fixing'|'fixed'|'stale'|'error';
export interface State { phase:Phase; message:string; pack:ClosePack|null; result:GateResponse|null; canContinue:boolean }
export class GateController {
  state:State={phase:'disconnected',message:'Connect to the local relay to review entries.',pack:null,result:null,canContinue:false};
  private epoch=0; private abort:AbortController|null=null; private reviewedFingerprint:string|null=null;
  isResumingSave=false;
  constructor(private adapter:FormAdapter,private transport:Transport,private onState:(state:State)=>void){}
  private publish(patch:Partial<State>) {this.state={...this.state,...patch};this.onState(this.state);}
  connect(pack:ClosePack) {this.cancel();this.publish({pack,phase:'ready',message:'Ready to check this entry against the August close pack.',result:null,canContinue:false});}
  invalidate() {
    if(this.state.phase==='fixing')return;
    const wasChecking=this.state.phase==='checking';this.epoch++;this.abort?.abort();this.reviewedFingerprint=null;
    this.publish({phase:this.state.pack?(wasChecking?'stale':'ready'):'disconnected',result:null,canContinue:false,
      message:wasChecking?'The entry changed during review. Save again for a fresh check.':'Entry changed. A fresh check is required.'});
  }
  cancel() {this.epoch++;this.abort?.abort();this.abort=null;this.reviewedFingerprint=null;
    this.publish({phase:this.state.pack?'ready':'disconnected',result:null,canContinue:false,message:'Review stopped. Check again when ready.'});}
  async check() {
    if(this.state.phase==='checking'||this.state.phase==='fixing')return;
    const epoch=++this.epoch;const abort=new AbortController();this.abort=abort;this.reviewedFingerprint=null;
    this.publish({phase:'checking',message:'Checking accounts, period, and supporting evidence…',result:null,canContinue:false});
    try {
      const entry=this.adapter.read();const fp=await fingerprint(entry);
      if(epoch!==this.epoch)return;
      this.reviewedFingerprint=fp;
      if(!this.state.pack)throw new Error('Connect to the local relay before checking.');
      const request:GateRequest={requestId:crypto.randomUUID(),entry,fingerprint:fp,packVersion:this.state.pack.version};
      const response=GateResponseSchema.parse(await this.transport.gate(request,abort.signal));
      if(epoch!==this.epoch)return;
      if(response.requestId!==request.requestId||response.fingerprint!==fp||response.packVersion!==request.packVersion)throw new Error('Review does not match this entry. Please check again.');
      const current=await fingerprint(this.adapter.read());
      if(epoch!==this.epoch)return;
      if(current!==fp){this.invalidate();return;}
      this.publish({phase:response.verdict.decision,message:response.verdict.summary,result:response,canContinue:response.verdict.decision==='warn'});
      if(response.verdict.decision==='allow')this.saveOnce();
    } catch(error) {
      if(epoch!==this.epoch)return;
      this.publish({phase:'error',message:error instanceof Error?error.message:'Could not check this entry.',result:null,canContinue:!!this.reviewedFingerprint});
    }
  }
  private saveOnce() {
    this.reviewedFingerprint=null;this.publish({canContinue:false});
    this.isResumingSave=true;
    try{this.adapter.save();}finally{this.isResumingSave=false;}
  }
  async continueOnce() {
    if(!this.state.canContinue||!this.reviewedFingerprint||!['warn','error'].includes(this.state.phase))return;
    const epoch=this.epoch, expected=this.reviewedFingerprint;
    // Consume before awaiting so two clicks cannot both resume the save.
    this.publish({canContinue:false});
    try{
      const current=await fingerprint(this.adapter.read());
      if(epoch!==this.epoch)return;
      if(current!==expected){this.invalidate();return;}
      this.saveOnce();
    }catch{this.invalidate();}
  }
  async applyFix() {
    if(!this.state.result||!['block','warn'].includes(this.state.phase))return;
    const epoch=++this.epoch;const result=this.state.result;const abort=new AbortController();this.abort=abort;
    this.publish({phase:'fixing',message:'Applying the reviewed field changes. Posting is disabled during this step.',canContinue:false});
    const timer=setTimeout(()=>abort.abort(),90_000);
    try {
      const before=this.adapter.read();const fp=await fingerprint(before);
      if(epoch!==this.epoch)return;
      if(fp!==result.fingerprint)throw new Error('The entry changed. Run a fresh check before applying a fix.');
      const changes=proposedChanges(result.verdict);
      if(!changes.length)throw new Error('This issue needs manual review.');
      const expected=applyChanges(before,changes);
      await this.adapter.apply(changes,abort.signal);
      if(epoch!==this.epoch)return;
      if(abort.signal.aborted)throw new Error('Correction stopped. Review the current form before continuing.');
      const actual=this.adapter.read();
      if(canonicalEntry(actual)!==canonicalEntry(expected))throw new Error('The form differs from the approved correction. Review it manually.');
      this.reviewedFingerprint=null;
      this.publish({phase:'fixed',message:'Changes verified. Review the form, then click Save to run a new check.',result:null,canContinue:false});
    }catch(error){if(epoch===this.epoch){this.reviewedFingerprint=null;this.publish({phase:'error',message:error instanceof Error?error.message:'Could not apply the correction.',result:null,canContinue:false});}}
    finally{clearTimeout(timer);}
  }
}
