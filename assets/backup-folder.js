// A directory handle points to the folder selected in Drive for desktop.
// Persist the handle per DesignerFlow account. Browser permissions may expire.
const BackupFolder = (() => {
  const folderName = "Designer-invoice";
  const folderUrl = "https://drive.google.com/drive/folders/1CUhkjuhx-dfB72d9r3LlQfqEOUkUIbj8";
  let busy = false;
  let choices = null;
  function panel(){
    const uid = currentUser?.uid;
    const files = choices?.uid === uid ? choices.files : null;
    return `<p class="small muted">على الكمبيوتر، اختر مجلد <a href="${folderUrl}" target="_blank" rel="noopener">Designer-invoice</a> من Google Drive للكمبيوتر. يزامن Drive الملفات بعد حفظها.</p>
      <div class="flex gap wrap">
        <button class="btn btn-soft" onclick="BackupFolder.run('connect')">اختيار مجلد Drive</button>
        <button class="btn btn-primary" onclick="BackupFolder.run('save')">حفظ نسخة على Drive</button>
        <button class="btn btn-soft" onclick="BackupFolder.run('latest')">استعادة أحدث نسخة</button>
        <button class="btn btn-soft" onclick="BackupFolder.run('list')">اختيار نسخة سابقة</button>
      </div>${files?.length?`<div class="field"><label class="lbl" for="driveVersions">النسخ مرتّبة من الأحدث</label>
        <select id="driveVersions">${files.map((f,i)=>`<option value="${i}">${esc(f.label)}</option>`).join("")}</select>
        <button class="btn btn-soft" onclick="BackupFolder.run('selected',Number(document.getElementById('driveVersions').value))">استعادة النسخة المحددة</button></div>`:""}`;
  }
  async function storedHandle(uid, value){
    const db = await new Promise((resolve,reject)=>{
      const open=indexedDB.open("designerflow-backup-folders",1);
      open.onupgradeneeded=()=>open.result.createObjectStore("directories");
      open.onsuccess=()=>resolve(open.result);
      open.onerror=()=>reject(open.error);
    });
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction("directories",value?"readwrite":"readonly");
        const store=tx.objectStore("directories");
        const request=value?store.put(value,uid):store.get(uid);
        tx.oncomplete=()=>resolve(request.result);
        tx.onabort=()=>reject(tx.error);
      });
    }finally{db.close();}
  }
  function checkSession(uid){
    if(!uid || currentUser?.uid!==uid || !cloudReady || ST.cloudError)
      throw Error("سجّل الدخول وانتظر اكتمال تحميل بيانات حسابك.");
  }
  function parseName(name,uid){
    const prefix="designerflow-"+uid+"-";
    if(!name.startsWith(prefix))return null;
    const match=name.slice(prefix.length).match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)_[\w-]+\.json$/);
    if(!match)return null;
    const stamp=match[1].replace(/T(\d\d)-(\d\d)-(\d\d)/,"T$1:$2:$3");
    return {stamp,label:new Date(stamp).toLocaleString("ar-SY",{dateStyle:"medium",timeStyle:"medium"})};
  }
  async function run(action,index){
    if(busy)return;
    busy=true;
    try{
      const owner=currentUser?.uid;
      checkSession(owner);
      if(!window.showDirectoryPicker)throw Error("افتح الموقع في Chrome أو Edge على الكمبيوتر، وثبّت Google Drive للكمبيوتر أو استخدم تنزيل واستيراد ملف JSON.");
      let dir;
      if(action==="connect" || !(dir=await storedHandle(owner))){
        dir=await window.showDirectoryPicker({id:"designerflow-backup",mode:"readwrite"});
        if(dir.name!==folderName)throw Error("اختر المجلد Designer-invoice من داخل Google Drive للكمبيوتر.");
        checkSession(owner);
        await storedHandle(owner,dir);
        choices=null;
      }
      if(await dir.requestPermission({mode:action==="save"?"readwrite":"read"})!=="granted")
        throw Error("اسمح للموقع بالوصول إلى المجلد ثم أعد المحاولة.");
      checkSession(owner);
      if(action==="connect"){render();alert("تم اختيار المجلد "+dir.name);return;}
      if(action==="save"){
        const now=new Date().toISOString();
        const json=JSON.stringify({format:"designerflow-backup-v1",owner,createdAt:now,data:DB});
        const name="designerflow-"+owner+"-"+now.replace(/:/g,"-")+"_"+crypto.randomUUID()+".json";
        const file=await dir.getFileHandle(name,{create:true});
        const writer=await file.createWritable();
        try{checkSession(owner);await writer.write(json);await writer.close();}
        catch(error){await writer.abort().catch(()=>{});await dir.removeEntry(name).catch(()=>{});throw error;}
        checkSession(owner);
        DB.settings.lastBackupDate=todayStr();
        DB.settings.backupHistory=DB.settings.backupHistory||[];
        DB.settings.backupHistory.unshift({date:todayStr(),sizeKB:Math.ceil(new Blob([json]).size/1024)});
        choices=null;saveDB();render();alert("حُفظت النسخة في المجلد المحدد. تابع اكتمال المزامنة من Google Drive للكمبيوتر.");return;
      }
      let selected;
      if(action==="selected"){
        if(choices?.uid===owner)selected=choices.files[index];
      }else{
        const files=[];
        for await(const [name,handle] of dir.entries()){
          const date=parseName(name,owner);
          if(handle.kind==="file" && date && (await handle.getFile()).size)files.push({...date,name});
        }
        files.sort((a,b)=>b.stamp.localeCompare(a.stamp)||b.name.localeCompare(a.name));
        checkSession(owner);
        choices={uid:owner,files};
        if(!files.length){render();alert("لا توجد نسخ لهذا الحساب في المجلد المحدد.");return;}
        if(action==="list"){render();return;}
        selected=files[0];
      }
      if(!selected)throw Error("اختر نسخة من القائمة من جديد.");
      const handle=await dir.getFileHandle(selected.name);
      const backup=JSON.parse(await (await handle.getFile()).text());
      checkSession(owner);
      if(backup.format!=="designerflow-backup-v1" || backup.owner!==owner || !CLOUD_KEYS.every(k=>Object.hasOwn(backup.data||{},k)))
        throw Error("النسخة غير مكتملة أو تخص حساباً آخر.");
      const parsed=validateImportedDB(backup.data);
      if(!confirm("استعادة نسخة "+selected.label+"؟ ستستبدل بيانات حسابك الحالية، وتشمل النسخة "+parsed.invoices.length+" فاتورة و"+parsed.clients.length+" عميلاً."))return;
      DB=parsed;saveDB();render();alert("استُعيدت النسخة. انتظر اكتمال مزامنة الحساب قبل إغلاق الموقع.");
    }catch(error){
      if(error.name!=="AbortError")alert("تعذرت العملية. "+(error.name==="NotFoundError"?"تحقق من تشغيل Drive وأعد اختيار المجلد.":error.message));
    }finally{busy=false;}
  }
  return {panel,run,parseName,reset(){choices=null;}};
})();
