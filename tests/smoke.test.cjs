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
