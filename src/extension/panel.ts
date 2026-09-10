import { renderPanel } from '../browser/panel.js';
import type { State } from '../browser/controller.js';
let tabId:number|undefined;
const $=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!;
function render(state:State){renderPanel($('#review'),state,{check:()=>void act('check'),fix:()=>void act('fix'),proceed:()=>void act('proceed'),cancel:()=>void act('cancel')});}
async function act(action:string){if(tabId)await chrome.tabs.sendMessage(tabId,{type:'controller:action',action}).catch(()=>{$('#site-status').textContent='The form disconnected. Reload and reconnect.';});}
async function sync(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id;
  if(!tabId)return;
  try{const reply=await chrome.tabs.sendMessage(tabId,{type:'state:get'});if(reply.ok){render(reply.data);$('#site-status').textContent='Watching the synthetic journal fixture. NetSuite adapter pending verification.';}}
  catch{$('#review').replaceChildren();$('#site-status').textContent='Not watching this site. Open /fixture?extension=1 on the local relay. NetSuite is not connected yet.';}
}
$('#pair').addEventListener('submit',async event=>{
  event.preventDefault();$('#pair-error').textContent='';
  const response=await chrome.runtime.sendMessage({type:'relay:configure',token:$<HTMLInputElement>('#token').value.trim()});
  if(!response.ok){$('#pair-error').textContent=response.error;return;}
  $<HTMLInputElement>('#token').value='';$('#pair').hidden=true;
  if(tabId)await chrome.tabs.sendMessage(tabId,{type:'controller:connect',pack:response.data}).catch(()=>{});
  await sync();
});
chrome.runtime.onMessage.addListener((message,sender)=>{if(message?.type==='state:changed'&&sender.tab?.id===tabId)render(message.state);});
chrome.tabs.onActivated.addListener(()=>void sync());
chrome.tabs.onUpdated.addListener((id,change)=>{if(id===tabId&&change.status==='complete')void sync();});
void chrome.runtime.sendMessage({type:'relay:health'}).then(response=>{if(response.ok)$('#mode').textContent=response.data.mode==='demo'?'RULES DEMO · No AI calls':'LIVE REVIEW · '+response.data.model;}).catch(()=>{$('#mode').textContent='Relay unavailable';});
void chrome.runtime.sendMessage({type:'relay:pack'}).then(response=>{if(response.ok)$('#pair').hidden=true;}).catch(()=>{});
void sync();
