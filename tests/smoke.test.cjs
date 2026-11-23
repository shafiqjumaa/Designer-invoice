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
