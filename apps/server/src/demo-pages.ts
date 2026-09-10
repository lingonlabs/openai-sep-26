const shell = (
  title: string,
  app: string,
  body: string,
  script: string,
) => `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
*{box-sizing:border-box}body{margin:0;font:14px Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#253b45;background:#f5f7f8}header{background:#173a42;color:white;padding:18px 28px;display:flex;align-items:center;justify-content:space-between}header strong{font-size:20px;letter-spacing:-.5px}header span{font-size:11px;color:#b5d6d6;text-transform:uppercase;letter-spacing:1.5px}.demo{padding:8px 28px;background:#fff5da;color:#806129;font-size:11px}main{max-width:1060px;margin:30px auto;padding:0 28px}h1{font-size:25px;letter-spacing:-.7px}h2{font-size:18px}p{line-height:1.7}nav{display:flex;gap:18px;margin:20px 0}a{color:#167568;text-decoration:none;font-weight:550}a:hover{text-decoration:underline}button{font:inherit;cursor:pointer;background:#187a69;color:white;border:0;border-radius:6px;padding:10px 16px}button.secondary{background:white;border:1px solid #d4dfe0;color:#35545c}.card{background:white;border:1px solid #dce4e6;border-radius:10px;padding:24px;margin:18px 0;box-shadow:0 4px 16px #1e454605}.fields{display:grid;grid-template-columns:1fr 1fr;gap:20px 28px}label{display:flex;flex-direction:column;gap:8px;font-size:12px;font-weight:600;color:#60777c}input,select,textarea{width:100%;padding:11px;border:1px solid #cfdbde;border-radius:5px;font:14px inherit;color:#253b45;background:white}input:focus,select:focus,textarea:focus{outline:2px solid #86bcab}textarea{resize:vertical}.wide{grid-column:span 2}table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;padding:16px 12px;border-bottom:1px solid #e5ebec}th{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#819299}.pill{display:inline-block;background:#e4f3ec;color:#29765e;padding:5px 9px;border-radius:20px;font-size:11px}.pending{background:#fff0d6;color:#946815}.muted{color:#7b8e93;font-size:12px}.search{display:flex;gap:8px;margin:16px 0;max-width:550px}.email{display:block;color:#253b45;padding:20px 10px;border-bottom:1px solid #e3e8e9}.email small{display:block;color:#8c9a9e;margin-top:8px;font-weight:400}.invoice{white-space:pre-line;font:14px/2 ui-monospace,SFMono-Regular,monospace;background:#f8faf9;border-left:3px solid #2e8b70;padding:20px}.bottom{display:flex;gap:12px;align-items:center;margin-top:24px}.review{background:#eaf5ef;padding:12px 16px;color:#36735e;border-radius:6px;font-size:12px}@media(max-width:650px){.fields{grid-template-columns:1fr}.wide{grid-column:auto}main{padding:0 16px}table{font-size:11px}td,th{padding:12px 5px}}
</style></head><body><header><strong>${app}</strong><span>Close workspace</span></header><div class="demo">SYNTHETIC DEMO · These are test records, not connected account data.</div><main id="app">${body}</main><script>${script}</script></body></html>`;
const invoices = [
  {
    vendor: "Northstar Software",
    number: "INV-2026-0831",
    date: "2026-08-31",
    due: "2026-09-30",
    amount: "1,280.00",
    description: "Monthly software subscription — August 2026",
    email: "billing@northstar.example",
  },
  {
    vendor: "Marlow Design",
    number: "MD-2608",
    date: "2026-08-28",
    due: "2026-09-27",
    amount: "4,250.00",
    description: "Brand design services — August 2026",
    email: "accounts@marlow.example",
  },
  {
    vendor: "Beacon Office",
    number: "BO-8820",
    date: "2026-08-30",
    due: "2026-09-29",
    amount: "860.00",
    description: "Office supplies — August 2026",
    email: "invoices@beacon.example",
  },
];
export function demoPage(app: string) {
  if (app === "netsuite")
    return shell(
      "New Bill · Demo NetSuite",
      "NetSuite / Sandbox",
      "",
      `
let saved=false;const root=document.getElementById('app');
const vendorRecords=JSON.parse(sessionStorage.getItem('demo-vendor-records')||'null')||[{id:101,name:'Northstar Software',email:'billing@northstar.example'},{id:102,name:'Marlow Design',email:'accounts@marlow.example'}];
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderVendor(){
if(location.hash==='#vendors'){
 document.body.dataset.workflow='vendor_list';document.title='Vendors · Demo NetSuite';
 root.innerHTML='<h1>Vendors</h1><nav><a href="#new">Add New Bill</a><a href="#vendor-new">New Vendor</a></nav><div class="card"><p>All vendors · Total: '+vendorRecords.length+' · No pagination · Includes inactive vendors</p><table><thead><tr><th>Company Name</th><th>Email</th></tr></thead><tbody>'+vendorRecords.map(v=>'<tr><td><a href="#vendor-record-'+v.id+'">'+escapeHtml(v.name)+'</a></td><td>'+escapeHtml(v.email)+'</td></tr>').join('')+'</tbody></table></div>';return true;
}
if(location.hash==='#vendor-new'){
 document.body.dataset.workflow='vendor_form';document.title='New Vendor · Demo NetSuite';
 root.innerHTML='<h1>New Vendor</h1><nav><a href="#vendors">Vendors</a><a href="#new">Add New Bill</a></nav><form id="vendor-form" class="card"><div class="fields"><label>Company Name *<input aria-label="Company Name" required></label><label>Email<input aria-label="Email" type="email"></label><label>Subsidiary<input aria-label="Subsidiary" value="Demo LLC" readonly required></label><label>Currency<input aria-label="Currency" value="USD" readonly required></label></div><p id="vendor-error" role="alert"></p><div class="bottom"><button type="submit">Save</button><span>Creates a vendor record in this synthetic demo.</span></div></form>';
 document.getElementById('vendor-form').onsubmit=e=>{e.preventDefault();const name=root.querySelector('[aria-label="Company Name"]').value.trim(),email=root.querySelector('[aria-label="Email"]').value.trim();if(vendorRecords.some(v=>v.name.toLowerCase()===name.toLowerCase())){document.getElementById('vendor-error').textContent='Vendor already exists';return;}const vendor={id:103+vendorRecords.length,name,email};vendorRecords.push(vendor);sessionStorage.setItem('demo-vendor-records',JSON.stringify(vendorRecords));document.body.dataset.vendorSaveCount=String(Number(document.body.dataset.vendorSaveCount||0)+1);location.hash='#vendor-record-'+vendor.id;};return true;
}
if(location.hash.startsWith('#vendor-record-')){
 const vendor=vendorRecords.find(v=>String(v.id)===location.hash.replace('#vendor-record-',''));if(!vendor)return false;
 document.body.dataset.workflow='vendor_record';document.title=vendor.name+' · Vendor · Demo NetSuite';root.innerHTML='<h1>Vendor: '+escapeHtml(vendor.name)+'</h1><nav><a href="#vendors">Vendors</a><a href="#new">Add New Bill</a></nav><div class="card"><p>Vendor ID: '+vendor.id+'</p><p>Company Name: '+escapeHtml(vendor.name)+'</p><p>Email: '+escapeHtml(vendor.email)+'</p><p>Subsidiary: Demo LLC</p><p>Currency: USD</p><p>Saved vendor record</p></div>';return true;
}
return false;
}
function render(){if(renderVendor())return;const list=location.hash==='#bills';document.body.dataset.workflow=list?'bill_list':'bill_form';document.title=list?'Existing Bills · Demo NetSuite':'New Bill · Demo NetSuite';
root.innerHTML=list?'<p class="muted">TRANSACTIONS / ACCOUNTS PAYABLE</p><h1>Existing bills</h1><nav><a href="#new">Add New Bill</a><a href="#vendors">Vendors</a></nav><div class="card"><div class="search"><input aria-label="Search bills" placeholder="Search vendor or invoice"><button type="button" id="search">Search</button></div><p class="muted">All recorded demo bills · 1 record · No pagination</p><table><thead><tr><th>Record</th><th>Vendor</th><th>Invoice number</th><th>Currency</th><th>Amount</th><th>Date</th></tr></thead><tbody><tr id="bill"><td>BILL-1092</td><td>Northstar Software</td><td>INV-2026-0831</td><td>USD</td><td>1,280.00</td><td>2026-08-31</td></tr></tbody></table><p id="none" hidden>No matching bills in this search.</p></div>':
'<p class="muted">TRANSACTIONS / ACCOUNTS PAYABLE</p><h1>Add New Bill</h1><nav><a href="#bills">Existing bills</a><a href="#vendors">Vendors</a><span class="pill">Unsaved draft</span></nav><form id="bill-form"><section class="card"><h2>Primary information</h2><div class="fields"><label>Vendor<select aria-label="Vendor"><option value="">Choose vendor</option><option value="northstar">Northstar Software</option><option value="marlow">Marlow Design</option></select></label><label>Invoice number<input aria-label="Invoice number" autocomplete="off"></label><label>Invoice date<input aria-label="Invoice date" type="date" value="2026-09-10"></label><label>Due date<input aria-label="Due date" type="date"></label><label>Amount<input aria-label="Amount" inputmode="decimal" placeholder="0.00"></label><label>Currency<input aria-label="Currency" value="USD" readonly></label><label class="wide">Memo<textarea aria-label="Memo" rows="2"></textarea></label></div></section><section class="card"><h2>Accounting review</h2><div class="fields"><label>Expense account<select aria-label="Expense account"><option value="">Select after review</option><option>Professional services</option><option>Software expense</option></select></label><label>Posting period<select aria-label="Posting period"><option>August 2026</option><option>September 2026</option></select></label></div><p class="muted">Review account coding, tax, period and required fields before saving.</p></section><div class="bottom"><button type="submit" id="save">Save</button><span class="muted" id="save-status">The assistant stops before this step.</span></div></form>';
if(list){const input=root.querySelector('input');const search=()=>{const q=input.value.toLowerCase();const match=document.getElementById('bill').textContent.toLowerCase().includes(q);document.getElementById('bill').hidden=!match;document.getElementById('none').hidden=match;};input.oninput=search;document.getElementById('search').onclick=search;}
else document.getElementById('bill-form').onsubmit=e=>{e.preventDefault();saved=true;document.body.dataset.saved='true';document.getElementById('save-status').textContent='Demo save clicked by user.';};}
window.addEventListener('hashchange',render);render();`,
    );
  if (app === "gmail")
    return shell(
      "Invoice inbox · Demo Gmail",
      "Gmail / Finance",
      "",
      `
const invoices=${JSON.stringify(invoices)};const root=document.getElementById('app');let query='';
function render(){const n=Number(location.hash.replace('#invoice-',''));const inv=location.hash.startsWith('#invoice-')?invoices[n]:null;document.body.dataset.workflow=inv?'message':'inbox';document.title=inv?'Invoice '+inv.number+' · Demo Gmail':'Invoice inbox · Demo Gmail';
if(inv){root.innerHTML='<nav><a href="#inbox">Back to inbox</a></nav><h1>Invoice '+inv.number+'</h1><p class="muted">'+inv.vendor+' &lt;'+inv.email+'&gt; · '+inv.date+'</p><div class="card"><p>Hello finance team,</p><p>Please find the invoice details below. Thank you for your business.</p><div class="invoice">Vendor: '+inv.vendor+'\\nInvoice number: '+inv.number+'\\nInvoice date: '+inv.date+'\\nDue date: '+inv.due+'\\nAmount: USD '+inv.amount+'\\nDescription: '+inv.description+'</div><p class="muted">All invoice information is visible in this message. No attachment is required for this demo.</p></div>';return;}
root.innerHTML='<p class="muted">FINANCE@DEMO.EXAMPLE</p><h1>Invoice inbox</h1><div class="search"><input aria-label="Search mail" placeholder="Search mail" value=""><button type="button" id="search">Search mail</button></div><div class="card"><p class="muted" id="scope">3 invoice messages · August 2026 · No pagination</p><div id="messages"></div></div>';
const input=root.querySelector('input');input.value=query;const search=()=>{query=input.value;document.getElementById('messages').innerHTML=invoices.map((inv,i)=>'<a class="email" aria-label="Open invoice from '+inv.vendor+'" href="#invoice-'+i+'"><strong>'+inv.vendor+'</strong> · Invoice '+inv.number+'<small>'+inv.description+' · '+inv.date+'</small></a>').join('');document.getElementById('scope').textContent='3 invoice messages · August 2026 · No pagination'+(query?' · Search: '+query:'');};input.onkeydown=e=>{if(e.key==='Enter')search();};document.getElementById('search').onclick=search;search();}
window.addEventListener('hashchange',render);render();`,
    );
  return shell(
    "Vendor onboarding · Demo Sheet",
    "Sheets / Vendor operations",
    '<p class="muted">FINANCE OPERATIONS</p><h1>Vendor onboarding</h1><p class="muted">Updated September 10, 2026 · All 3 demo vendors shown</p><div class="card"><table><thead><tr><th>Vendor</th><th>Status</th><th>Owner</th><th>Notes</th></tr></thead><tbody><tr><td>Northstar Software</td><td>Approved</td><td>Finance</td><td>Active vendor record</td></tr><tr><td>Marlow Design</td><td>Approved</td><td>Finance</td><td>Active vendor record</td></tr><tr><td>Beacon Office</td><td>Pending</td><td>Operations</td><td>Tax form and payment details awaiting review</td></tr></tbody></table></div>',
    `document.body.dataset.workflow='vendors';`,
  );
}
