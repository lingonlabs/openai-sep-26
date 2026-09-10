import entries from '../../data/demo-entries.json';
import pack from '../../data/close-pack.json';
import { EntrySchema, money, totals } from '../shared/schema.js';
import { FixtureAdapter } from '../browser/fixture-adapter.js';
import { GateController } from '../browser/controller.js';
import { RelayClient } from '../browser/transport.js';
import { renderPanel } from '../browser/panel.js';
const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const form=$<HTMLFormElement>('#journal'), adapter=new FixtureAdapter(form);
const review=$('#review');let client:RelayClient|null=null;let saves=0;
const extensionMode=new URLSearchParams(location.search).get('extension')==='1';
const controller=new GateController(adapter,{gate:(request,signal)=>{
  if(!client)throw new Error('Connect to the local relay first.');return client.gate(request,signal);
}},state=>renderPanel(review,state,{check:()=>void controller.check(),fix:()=>void controller.applyFix(),proceed:()=>void controller.continueOnce(),cancel:()=>controller.cancel()}));
function updateTotals(){
  try{const t=totals(adapter.read());$('#debit-total').textContent=money(t.debit);$('#credit-total').textContent=money(t.credit);
    $('#balance-status').textContent=t.debit===t.credit?'✓ Balanced':`Difference: ${money(t.debit-t.credit)}`;
    $('#balance-status').className=t.debit===t.credit?'balanced':'unbalanced';
  }catch{$('#balance-status').textContent='Check the amount format';}
}
function load(id:string){
  if(!extensionMode)controller.cancel();
  const item=entries.find(e=>e.id===id)!;const entry=EntrySchema.parse(item.entry);form.dataset.entry=JSON.stringify(entry);
  for(const key of ['postingDate','postingPeriod','vendorId','invoiceId','memo'] as const)$<HTMLInputElement>(`[data-field="${key}"]`).value=entry[key]??'';
  const tbody=$('#lines');tbody.replaceChildren();
  for(const line of entry.lines){const row=document.createElement('tr');row.dataset.lineId=line.id;
    const idCell=document.createElement('td');idCell.textContent=line.id;row.append(idCell);
    const cell=document.createElement('td');const select=document.createElement('select');select.dataset.field='account';select.setAttribute('aria-label',`${line.id} account`);
    for(const account of pack.accounts){const option=document.createElement('option');option.value=account.id;option.textContent=`${account.id} · ${account.name}`;select.append(option);}
    if(!pack.accounts.some(a=>a.id===line.account)){const option=document.createElement('option');option.value=line.account;option.textContent=`${line.account} · Unknown account`;select.append(option);}
    select.value=line.account;cell.append(select);row.append(cell);
    for(const field of ['debit','credit'] as const){const td=document.createElement('td');const input=document.createElement('input');input.inputMode='decimal';input.dataset.field=field;input.value=line[field];input.setAttribute('aria-label',`${line.id} ${field}`);td.className='number';td.append(input);row.append(td);}tbody.append(row);
  }
  $('#entry-id').textContent=`JE / ${entry.id}`;$('#save-status').textContent='This lab simulates a journal form. It does not post to NetSuite.';
  updateTotals();form.dispatchEvent(new Event('input',{bubbles:true}));
}
const scenario=$<HTMLSelectElement>('#scenario');
for(const item of entries){const option=document.createElement('option');option.value=item.id;option.textContent=`${item.id} — ${item.title}`;scenario.append(option);}
scenario.onchange=()=>load(scenario.value);
form.addEventListener('input',()=>{updateTotals();if(!extensionMode)controller.invalidate();});
form.addEventListener('change',()=>{updateTotals();if(!extensionMode)controller.invalidate();});
document.addEventListener('submit',event=>{
  if(event.target!==form)return;
  if(extensionMode){
    // A missing extension must not make this lab look like an integrated success.
    if(!form.dataset.extensionConnected){event.preventDefault();$('#save-status').textContent='Load the extension and connect its side panel first.';}
  }else if(!controller.isResumingSave){event.preventDefault();void controller.check();}
},true);
form.addEventListener('submit',event=>{
  if(event.defaultPrevented)return;event.preventDefault();saves++;form.dataset.saveCount=String(saves);
  $('#save-status').textContent=`Simulated save complete · ${adapter.read().id} · ${saves} save${saves===1?'':'s'} this session. No ERP data was changed.`;
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!extensionMode)controller.cancel();});
$<HTMLFormElement>('#pair').onsubmit=async event=>{
  event.preventDefault();$('#pair-error').textContent='';
  try{client=new RelayClient(location.origin,$<HTMLInputElement>('#token').value.trim());const loaded=await client.pack();controller.connect(loaded);
    $('#pair').hidden=true;$('#pack-info').hidden=false;$('#pack-info').textContent=`${loaded.evidence.length} evidence records · August 2026 · ${loaded.version}`;
    $<HTMLInputElement>('#token').value='';
  }catch(error){$('#pair-error').textContent=error instanceof Error?error.message:'Could not connect';}
};
void fetch('/api/health').then(r=>r.json()).then(health=>{$('#mode').textContent=health.mode==='demo'?'RULES DEMO · No AI calls':'LIVE REVIEW · '+health.model;}).catch(()=>{$('#mode').textContent='Relay unavailable';});
if(extensionMode){$('.copilot-panel').hidden=true;document.body.classList.add('extension-lab');$('.subtitle').textContent='Extension test mode. Open the Close Copilot side panel to connect.';}
load('D1');
