import { RelayClient } from '../browser/transport.js';
import { GateRequestSchema } from '../shared/schema.js';
declare const __RELAY_ORIGIN__:string;
declare const __NETSUITE_ORIGIN__:string;
function allowedTab(url?:string) {if(!url)return false;const u=new URL(url);return u.origin===__RELAY_ORIGIN__&&['/fixture','/fixture/'].includes(u.pathname)||!!__NETSUITE_ORIGIN__&&u.origin===__NETSUITE_ORIGIN__;}
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(!message||!['relay:configure','relay:pack','relay:gate','relay:health'].includes(message.type))return false;
  void (async()=>{
    if(sender.id!==chrome.runtime.id || sender.tab&&!allowedTab(sender.tab.url))throw new Error('This tab is not supported');
    if(message.type==='relay:configure') {
      if(sender.tab)throw new Error('Configure the connection in the extension panel');
      if(typeof message.token!=='string'||message.token.length<32)throw new Error('Paste the local relay token');
      const client=new RelayClient(__RELAY_ORIGIN__,message.token);const pack=await client.pack();
      await chrome.storage.local.set({relayToken:message.token});return pack;
    }
    if(message.type==='relay:health'){const response=await fetch(__RELAY_ORIGIN__+'/api/health',{signal:AbortSignal.timeout(4000)});return response.json();}
    const {relayToken}=await chrome.storage.local.get('relayToken');if(typeof relayToken!=='string')throw new Error('Connect the extension to the local relay first');
    const client=new RelayClient(__RELAY_ORIGIN__,relayToken);
    if(message.type==='relay:pack')return client.pack();
    return client.gate(GateRequestSchema.parse(message.request),AbortSignal.timeout(8500));
  })().then(data=>respond({ok:true,data})).catch(error=>respond({ok:false,error:error instanceof Error?error.message:'Relay unavailable'}));
  return true;
});
