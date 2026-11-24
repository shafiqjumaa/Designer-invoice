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
test("Drive API uploads to the designated folder and restores both versions",async()=>{
  const folder="1CUhkjuhx-dfB72d9r3LlQfqEOUkUIbj8",files=[],messages=[];
  const google={accounts:{oauth2:{initTokenClient(options){return {requestAccessToken(){options.callback({access_token:"test",expires_in:3600});}};}}}};
  const ctx=vm.createContext({google,window:{google},currentUser:{uid:"test"},cloudReady:true,ST:{},DB:{settings:{},invoices:[]},
    CLOUD_KEYS:["settings","invoices"],crypto,URLSearchParams,Blob,localStorage:{getItem:()=>"test"},alert:m=>messages.push(m),
    confirm:()=>true,todayStr:()=>"2026-11-25",render(){},saveDB(){},validateImportedDB:d=>d,
    async fetch(url,options){
      assert.equal(options.headers.Authorization,"Bearer test");
      let result;
      if(url.includes("/upload/")){
        const parts=options.body.split("\r\n");
        const meta=JSON.parse(parts[3]);assert.deepEqual(meta.parents,[folder]);
        files.push({name:meta.name,data:JSON.parse(parts[7])});result={id:String(files.length)};
      }else if(url.includes("alt=media"))result=files[Number(url.split("/").pop().split("?")[0])-1].data;
      else if(url.includes("/"+folder+"?"))result={mimeType:"application/vnd.google-apps.folder",capabilities:{canAddChildren:true}};
      else result={files:files.map((f,i)=>({name:f.name,id:String(i+1)}))};
      return {ok:true,json:async()=>result};
    }});
  vm.runInContext(fs.readFileSync(path.join(root,"assets/backup-folder.js"),"utf8"),ctx);
  const api=vm.runInContext(fs.readFileSync(path.join(root,"assets/google-drive.js"),"utf8")+";DriveBackup",ctx);
  await api.run("save");await new Promise(resolve=>setTimeout(resolve,4));
  ctx.DB.invoices.push({id:"invoice"});await api.run("save");
  ctx.DB.invoices=[];await api.run("latest");assert.equal(ctx.DB.invoices.length,1,messages.join("\n"));
  await api.run("list");await api.run("selected",1);assert.equal(ctx.DB.invoices.length,0);
});
