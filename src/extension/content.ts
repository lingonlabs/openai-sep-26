import { GateController } from '../browser/controller.js';
import { FixtureAdapter } from '../browser/fixture-adapter.js';
declare const __RELAY_ORIGIN__:string;
// NetSuite intentionally has no guessed selectors. See docs/PHILIPP_HANDOFF.md.
const form=document.querySelector<HTMLFormElement>('form[data-close-copilot-fixture]');
if(location.origin===__RELAY_ORIGIN__&&new URLSearchParams(location.search).get('extension')==='1'&&form){
  const controller=new GateController(new FixtureAdapter(form),{gate:async(request,signal)=>{
    const response=await chrome.runtime.sendMessage({type:'relay:gate',request});signal.throwIfAborted();
    if(!response.ok)throw new Error(response.error);return response.data;
  }},state=>{void chrome.runtime.sendMessage({type:'state:changed',state}).catch(()=>{});});
  document.addEventListener('submit',event=>{if(event.target===form&&!controller.isResumingSave){event.preventDefault();void controller.check();}},true);
  for(const type of ['input','change'])form.addEventListener(type,()=>controller.invalidate());
  document.addEventListener('keydown',event=>{if(event.key==='Escape')controller.cancel();});
  chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
    if(message?.type==='state:get'){respond({ok:true,data:controller.state});return false;}
    if(message?.type==='controller:connect'){controller.connect(message.pack);form.dataset.extensionConnected='true';respond({ok:true});return false;}
    if(message?.type==='controller:action'){
      if(message.action==='check')void controller.check();if(message.action==='fix')void controller.applyFix();
      if(message.action==='proceed')void controller.continueOnce();if(message.action==='cancel')controller.cancel();
      respond({ok:true});return false;
    }
    return false;
  });
  void chrome.runtime.sendMessage({type:'relay:pack'}).then(response=>{if(response.ok){controller.connect(response.data);form.dataset.extensionConnected='true';}}).catch(()=>{});
}
