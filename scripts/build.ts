import 'dotenv/config';
import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const port=Number(process.env.PORT??4317);const origin=`http://127.0.0.1:${port}`;
let sandbox=process.env.NETSUITE_ORIGIN?.trim()??'';
if(sandbox){const url=new URL(sandbox);if(url.protocol!=='https:'||url.origin!==sandbox||url.username||url.password)throw new Error('NETSUITE_ORIGIN must be an exact HTTPS origin');}
await mkdir('dist/extension',{recursive:true});await mkdir('dist/fixture',{recursive:true});
const define={__RELAY_ORIGIN__:JSON.stringify(origin),__NETSUITE_ORIGIN__:JSON.stringify(sandbox)};
await build({entryPoints:['src/fixture/app.ts'],outfile:'dist/fixture/app.js',bundle:true,format:'esm',platform:'browser',target:'chrome120'});
await build({entryPoints:['src/extension/background.ts','src/extension/panel.ts'],outdir:'dist/extension',bundle:true,format:'esm',platform:'browser',target:'chrome120',define});
await build({entryPoints:['src/extension/content.ts'],outfile:'dist/extension/content.js',bundle:true,format:'iife',platform:'browser',target:'chrome120',define});
await copyFile('src/fixture/index.html','dist/fixture/index.html');await copyFile('src/browser/styles.css','dist/fixture/styles.css');
await copyFile('src/extension/panel.html','dist/extension/panel.html');await copyFile('src/browser/styles.css','dist/extension/styles.css');
const matches=['http://127.0.0.1/*',...(sandbox?[sandbox+'/*']:[])];
await writeFile('dist/extension/manifest.json',JSON.stringify({manifest_version:3,name:'Close Copilot',version:'0.1.0',minimum_chrome_version:'120',
  description:'Evidence-based journal review. Synthetic fixture supported; NetSuite adapter pending.',
  permissions:['sidePanel','storage','activeTab'],host_permissions:matches,
  action:{default_title:'Open Close Copilot'},side_panel:{default_path:'panel.html'},background:{service_worker:'background.js',type:'module'},
  content_scripts:[{matches,js:['content.js'],run_at:'document_idle'}]},null,2)+'\n');
console.log('Built local journal fixture and unpacked extension in dist/.');
