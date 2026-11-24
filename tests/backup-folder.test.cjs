const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
test("folder backups preserve versions and restore the latest or a selected account snapshot",async()=>{
  const files=new Map(),handles=new Map(),messages=[];
  const dir={name:"Designer-invoice",requestPermission:async()=>"granted",
    async getFileHandle(name,{create}={}){
      if(!create&&!files.has(name))throw Error("missing");
      return {kind:"file",getFile:async()=>new Blob([files.get(name)]),
        createWritable:async()=>({write:async text=>files.set(name,text),close:async()=>{}})};
    },
    async *entries(){for(const name of files.keys())yield [name,await this.getFileHandle(name)];}
  };
  const indexedDB={open(){const req={result:{close(){},transaction(){const tx={objectStore(){return {
    put(value,key){handles.set(key,value);return {};},get(key){return {result:handles.get(key)};}
  };}};queueMicrotask(()=>tx.oncomplete());return tx;}}};queueMicrotask(()=>req.onsuccess());return req;}};
  const ctx=vm.createContext({indexedDB,window:{showDirectoryPicker:async()=>dir},Blob,crypto,
    currentUser:{uid:"test-user"},DB:{clients:[],invoices:[],settings:{}},CLOUD_KEYS:["clients","invoices","settings"],
    ST:{},cloudReady:true,saveDB(){},render(){},validateImportedDB:data=>data,todayStr:()=>"2026-11-25",
    alert:m=>messages.push(m),confirm:()=>true});
  const api=vm.runInContext(fs.readFileSync(path.join(root,"assets/backup-folder.js"),"utf8")+";BackupFolder",ctx);
  await api.run("save");
  await new Promise(resolve=>setTimeout(resolve,5));
  ctx.DB.invoices.push({id:"INV-0004"});await api.run("save");
  assert.equal(files.size,2);
  ctx.DB.invoices=[];await api.run("latest");
  assert.equal(ctx.DB.invoices.length,1);
  await api.run("list");await api.run("selected",1);
  assert.equal(ctx.DB.invoices.length,0);
  ctx.currentUser={uid:"different-user"};await api.run("latest");
  assert.match(messages.at(-1),/لا توجد نسخ/);
});
test("Arabic invoice headings override global character spacing for PNG rendering",()=>{
  const css=fs.readFileSync(path.join(root,"assets/invoice.css"),"utf8");
  assert.match(css,/\.bill table th\{letter-spacing:0;direction:rtl;/);
});
