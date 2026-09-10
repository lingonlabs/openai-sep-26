import { EntrySchema, applyChanges, type Change, type Entry } from '../shared/schema.js';
import type { FormAdapter } from './controller.js';
function amount(value:string) {const v=value.trim();if(!v)return '0.00';if(!/^\d+(\.\d{0,2})?$/.test(v))throw new Error('Amounts must be nonnegative with at most two decimal places.');
  const [integer,fraction='']=v.split('.');return `${BigInt(integer)}.${fraction.padEnd(2,'0')}`;}
export class FixtureAdapter implements FormAdapter {
  constructor(readonly form:HTMLFormElement){}
  private input(field:string,lineId:string|null=null):HTMLInputElement|HTMLSelectElement {
    const scope=lineId?this.form.querySelector(`[data-line-id="${CSS.escape(lineId)}"]`):this.form;
    const element=scope?.querySelector<HTMLInputElement|HTMLSelectElement>(`[data-field="${field}"]`);
    if(!element)throw new Error(`Missing form field ${field}`);return element;
  }
  read():Entry {
    const original=JSON.parse(this.form.dataset.entry??'null') as Entry;
    if(!original)throw new Error('No entry loaded');
    const value=(field:string)=>this.input(field).value;
    return EntrySchema.parse({...original,postingDate:value('postingDate'),postingPeriod:value('postingPeriod'),memo:value('memo'),
      vendorId:value('vendorId')||null,invoiceId:value('invoiceId')||null,
      lines:original.lines.map(l=>({...l,account:this.input('account',l.id).value,
        debit:amount(this.input('debit',l.id).value),credit:amount(this.input('credit',l.id).value)}))});
  }
  save(){this.form.requestSubmit();}
  async apply(changes:Change[],signal:AbortSignal) {
    const before=this.read();applyChanges(before,changes);
    for(const change of changes){
      signal.throwIfAborted();const input=this.input(change.field,change.lineId);
      if(input.value!==change.from && (!['debit','credit'].includes(change.field)||amount(input.value)!==change.from))throw new Error('Target value changed before editing');
      input.value=change.to;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
      // Yield between edits so cancellation and DOM side effects can be observed.
      await new Promise<void>(resolve=>setTimeout(resolve,40));
    }
  }
}
