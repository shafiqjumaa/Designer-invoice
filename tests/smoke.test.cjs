const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

test('inline app script parses in modern JavaScript',()=>{
  assert.ok(script,'App inline script missing');
  assert.doesNotThrow(()=>new Function(script));
});
test('customer-local cache is isolated by Firebase UID',()=>{
  assert.match(script,/function userLocalKey\(uid\)/);
  assert.match(script,/USER_STORAGE_PREFIX\s*\+\s*uid/);
  assert.doesNotMatch(script,/localStorage\.setItem\(STORAGE_KEY/);
});
test('Firestore only writes changed data sections',()=>{
  assert.match(script,/pendingKeys\.add\(key\)/);
  assert.match(script,/const keys=Array\.from\(pendingKeys\)/);
  assert.match(script,/keys\.forEach\(key=>\{/);
});
test('old shared password no longer exists',()=>{
  assert.doesNotMatch(script,/const PASSWORD/);
  assert.match(script,/sendPasswordResetEmail/);
});
test('public form uses explicitly shared WhatsApp destination',()=>{
  assert.match(script,/params\.get\("wa"\)/);
  assert.match(script,/ST\.publicWhatsApp/);
  assert.match(script,/https:\/\/wa\.me\//);
  assert.match(script,/الطلب جاهز للإرسال/);
});
test('Arabic invoice link payload still round-trips',()=>{
  const block=script.slice(script.indexOf('function encodePublicPayload('),script.indexOf('/* ===================== CLIENT HELPERS'));
  const {encodePublicPayload,decodePublicPayload}=new Function(block+';return {encodePublicPayload,decodePublicPayload};')();
  const sample={number:'INV-27',clientName:'عميل تجريبي',amount:128.75};
  assert.deepEqual(decodePublicPayload(encodePublicPayload(sample)),sample);
});
test('Firestore rules disallow anonymous public writes',()=>{
  const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
  assert.match(rules,/request\.auth\s*!=\s*null/);
  assert.match(rules,/request\.auth\.uid\s*==\s*uid/);
  assert.doesNotMatch(rules,/allow\s+(read|write|create)\s*:\s*if\s*true/);
});

test('next invoice number skips legacy duplicated IDs and chooses maximum',()=>{
  const fragment=script.slice(script.indexOf('function invoiceTotal('),script.indexOf('function safeExternalUrl('));
  const DB={batches:[],invoices:[],subscriptions:[],expenses:[],responses:[]};
  const lib=new Function('DB','clientName',fragment+';return {invoiceTotal,nextDocumentNumber,calcStats};')(DB,()=> 'عميل');
  assert.equal(lib.nextDocumentNumber([{number:'INV-0004'},{number:'INV-0004'},{number:'INV-0006'}],'INV'),'INV-0007');
});
test('financial KPI counts paid invoices, not draft invoices or estimated client requests',()=>{
  const fragment=script.slice(script.indexOf('function invoiceTotal('),script.indexOf('function safeExternalUrl('));
  const DB={
    batches:[{status:'مفتوح',items:[{qty:5,price:20,paid:false}]}],
    invoices:[
      {number:'INV-0001',status:'مدفوعة',items:[{qty:2,price:50}]},
      {number:'INV-0002',status:'مسودة',items:[{qty:1,price:900}]},
      {number:'INV-0003',status:'مرسلة',items:[{qty:1,price:50}]}
    ],
    subscriptions:[],expenses:[{amount:20}],responses:[{estimatedValue:999,converted:false}]
  };
  const {calcStats}=new Function('DB','clientName',fragment+';return {calcStats};')(DB,()=> 'عميل');
  const stats=calcStats();
  assert.equal(stats.profit,100);
  assert.equal(stats.owed,50);
  assert.equal(stats.netProfit,80);
  assert.equal(stats.pendingResponses,1);
});
test('legacy backup imports require valid categories and preserve data, not overwrite unvalidated',()=>{
  const fragment=script.slice(script.indexOf('function validateImportedDB('),script.indexOf('document.getElementById("importFileInput")'));
  const defaults=()=>({clients:[],batches:[],responses:[],invoices:[],expenses:[],subscriptions:[],waitlist:[],contracts:[],goals:{},settings:{}});
  const validate=new Function('defaultDB',fragment+';return validateImportedDB;')(defaults);
  const data={clients:[{id:'client1'}],invoices:[{id:'inv1'}],goals:{},settings:{}};
  assert.deepEqual(validate(data).clients,data.clients);
  assert.deepEqual(validate(data).batches,[]);
  assert.throws(()=>validate({clients:{},settings:{}}));
});
test('public file URLs reject unsafe schemes and time totals remain predictable',()=>{
  const fragment=script.slice(script.indexOf('function safeExternalUrl('),script.indexOf('function clientStats('));
  const lib=new Function(fragment+';return {safeExternalUrl,projectMinutes};')();
  assert.equal(lib.safeExternalUrl('javascript:alert(1)'),'');
  assert.match(lib.safeExternalUrl('https://drive.google.com/file'),/^https:/);
  assert.equal(lib.projectMinutes({timeEntries:[{minutes:35},{minutes:25}]}),60);
});
test('cloud fetch requires server-confirmed data before initializing empty account',()=>{
  assert.match(script,/\.get\(\{source:"server"\}\)/);
  assert.match(script,/cloudReady=false; \/\/ No writes without a server-confirmed snapshot/);
});
test('mobile menu has an operable control and visual navigation labels',()=>{
  assert.match(html,/class="mobile-menu-btn"/);
  assert.match(html,/\.nav-open \.sidebar/);
  assert.match(script,/toggleMobileNav\(\)/);
});


test('auth and cloud requests have deadlines and visible loading UI',()=>{
  assert.match(script,/withDeadline\(fbAuth\.signInWithEmailAndPassword\(email,pass\),18000,"auth\/timeout"\)/);
  assert.match(script,/withDeadline\(loadCloudDBOnce\(uid\),15000,"cloud\/timeout"\)/);
  assert.match(script,/ST\.cloudLoading=true/);
  assert.match(script,/if\(ST\.cloudLoading\)return/);
  assert.match(script,/ST\.cloudLoading=false/);
  assert.match(script,/render\(\); \/\/ Avoid leaving the login button stuck/);
  assert.match(script,/ST\.pinShow=false/);
});
test('deadline rejects hung calls and resolves responsive calls',async()=>{
  const fragment=script.slice(script.indexOf('async function withDeadline('),script.indexOf('function userLocalKey('));
  const withDeadline=new Function(fragment+';return withDeadline;')();
  assert.equal(await withDeadline(Promise.resolve('ok'),20,'timeout'),'ok');
  await assert.rejects(withDeadline(new Promise(()=>{}),10,'auth/timeout'),e=>e.code==='auth/timeout');
});

test('neon design system is present and keeps reduced-motion accessibility',()=>{
  const css=fs.readFileSync(path.join(root,'assets/orizon-theme.css'),'utf8');
  assert.match(css, /\.df-ambient/);
  assert.match(css, /@keyframes df-glow-one/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /\.df-kpi/);
  assert.match(css, /\.df-topbar/);
  assert.match(css, /\.df-create-menu/);
  assert.match(css, /\.df-icon\.icon-fallback/);
});
test('solid rounded Flaticon CSS is optional with original SVG fallback',()=>{
  assert.match(html, /uicons-solid-rounded\/css\/uicons-solid-rounded\.css/);
  assert.match(html, /Uicons by <a href="https:\/\/www\.flaticon\.com\/uicons"/);
  assert.match(script, /const UI_SOLID_ROUNDED = Object\.freeze/);
  assert.match(script, /function verifyFlaticonIcons\(\)/);
  assert.match(script, /ICON_PATHS\[name\]\|\|ICON_PATHS\.document/);
});
test('existing business workflows are still reachable in the workspace',()=>{
  assert.match(script, /onclick="App\.openBatchMetaModal\(\)"/);
  assert.match(script, /onclick="App\.openClientModal\(\)"/);
  assert.match(script, /onclick="App\.openInvoiceModal\(\)"/);
  assert.match(script, /\$\{renderAdminPage\(stats\)\}/);
  assert.match(script, /function topbarSyncStatusHtml\(\)/);
});


test('mobile client survey preserves focus and typed text',()=>{
  const match=script.match(/\n  surveySet\(field,val\)\{([\s\S]*?)\n  \},\n  surveyToggleArr/);
  assert.ok(match,'Survey input controller not found');
  const ST={surveyDraft:{}};
  const document={activeElement:{tagName:'INPUT',isContentEditable:false}};
  let renders=0;
  const surveySet=new Function('ST','document','render',
    'return function(field,val){'+match[1]+'};')(ST,document,()=>renders++);
  surveySet('name','test user');
  surveySet('whatsapp','9639000000');
  assert.equal(ST.surveyDraft.name,'test user');
  assert.equal(ST.surveyDraft.whatsapp,'9639000000');
  assert.equal(renders,0,'Mobile input should not be replaced mid-typing');
  document.activeElement={tagName:'TEXTAREA',isContentEditable:false};
  surveySet('notes','notes');
  assert.equal(renders,0);
  document.activeElement={tagName:'BUTTON',isContentEditable:false};
  surveySet('budget','200');
  assert.equal(renders,1,'Selecting a chip should redraw the active selection');
  document.activeElement={tagName:'SELECT',isContentEditable:false};
  surveySet('serviceType','تصميم سوشيال ميديا');
  assert.equal(renders,2,'Service selection should redraw the questionnaire');
});
test('mobile layout handles small widths, keyboard and screen safe areas',()=>{
  const css=fs.readFileSync(path.join(root,'assets/orizon-theme.css'),'utf8');
  assert.match(css, /Mobile reliability and layout patch/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /font-size:16px!important/);
  assert.match(css, /max-height:calc\(100dvh/);
  assert.match(css, /\.df-kpi-grid/);
  assert.match(css, /\.modal-overlay/);
  assert.match(css, /\.invoice-paper/);
  assert.match(css, /\.theme-fab/);
  assert.match(css, /\.fab/);
});
test('solid rounded icons/fonts and PNG renderer are nonblocking',()=>{
  assert.match(html, /fonts\.googleapis\.com[^\n]*media="print" onload=/);
  assert.match(html, /uicons-solid-rounded\/css\/uicons-solid-rounded\.css"[\s\S]{0,70}media="print"/);
  assert.match(html, /<script defer src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas/);
});
test('mobile component fields have readable labels',()=>{
  assert.match(script, /df-component-field/);
  assert.match(script, /df-component-label/);
  assert.match(script, /df-comp-action-text/);
  assert.match(script, /df-comp-head/);
});
test('installed mobile app uses current CSS and supports landscape',()=>{
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  assert.match(sw, /designerflow-shell-v5/);
  assert.match(sw, /orizon-theme\.css\?v=20261123-mobile-v2/);
  assert.match(html, /orizon-theme\.css\?v=20261123-mobile-v2/);
  assert.equal(manifest.orientation,'any');
});
