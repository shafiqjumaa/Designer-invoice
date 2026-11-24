// OAuth access tokens live only in memory and are bound to the active app session.
const DriveBackup = (() => {
  const folder="1CUhkjuhx-dfB72d9r3LlQfqEOUkUIbj8";
  const scope="https://www.googleapis.com/auth/drive.file";
  let auth, choices, busy=false;
  function reset(){auth=null;choices=null;}
  function check(owner){
    if(!owner || currentUser?.uid!==owner || !cloudReady || ST.cloudError)throw Error("تحقق من تسجيل الدخول ومزامنة حسابك أولاً.");
  }
  function clientId(){return localStorage.getItem("designerflow-drive-client-id")||"";}
  function configure(){
    const value=prompt("معرّف Web client من مشروع Google Cloud الخاص بالموقع",clientId());
    if(value===null)return;
    if(!/^701976583448-[\w-]+\.apps\.googleusercontent\.com$/.test(value.trim()))return alert("أدخل معرّف عميل الويب من مشروع الموقع designer-invoice-68d2d.");
    localStorage.setItem("designerflow-drive-client-id",value.trim());reset();render();
  }
  function panel(){
    const files=choices?.owner===currentUser?.uid?choices?.files:null;
    return `<p>Google Drive · <a target="_blank" rel="noopener" href="https://drive.google.com/drive/folders/${folder}">Designer-invoice</a></p>
    ${clientId()?"":'<p class="small muted">يتطلب الربط إعداد معرّف Google للموقع مرة على هذا المتصفح.</p>'}
    <div class="flex gap wrap"><button class="btn btn-primary" onclick="DriveBackup.run('save')">حفظ مباشرةً على Drive</button>
    <button class="btn btn-soft" onclick="DriveBackup.run('latest')">استعادة أحدث نسخة من Drive</button>
    <button class="btn btn-soft" onclick="DriveBackup.run('list')">اختيار نسخة من Drive</button>
    <button class="btn btn-soft" onclick="DriveBackup.configure()">إعداد الربط</button></div>
    ${files?.length?`<select id="driveCloudVersion" aria-label="اختر نسخة">${files.map((f,i)=>`<option value="${i}">${esc(f.label)}</option>`).join("")}</select>
    <button class="btn btn-soft" onclick="DriveBackup.run('selected',Number(document.getElementById('driveCloudVersion').value))">استعادة النسخة المحددة</button>`:""}`;
  }
  async function authorize(owner){
    if(auth?.owner===owner && auth.until>Date.now())return auth.token;
    if(!window.google?.accounts?.oauth2)throw Error("انتظر تحميل تسجيل الدخول من Google وأعد المحاولة.");
    const result=await new Promise((resolve,reject)=>{
      google.accounts.oauth2.initTokenClient({client_id:clientId(),scope,include_granted_scopes:false,
        callback:r=>r.error?reject(Error("لم يمنح Google صلاحية Drive.")):resolve(r),
        error_callback:()=>reject(Error("تعذّر فتح نافذة Google أو أُغلقت."))}).requestAccessToken();
    });
    check(owner);
    auth={owner,token:result.access_token,until:Date.now()+(Number(result.expires_in)-60)*1000};
    return auth.token;
  }
  async function request(token,url,options={}){
    const response=await fetch(url,{...options,headers:{...options.headers,Authorization:"Bearer "+token}});
    if(!response.ok){
      if(response.status===401)reset();
      const e=Error("تعذّر الاتصال بـ Google Drive ("+response.status+"). تحقق من إعداد الربط والصلاحيات.");
      e.status=response.status;throw e;
    }
    return response.json();
  }
  const api="https://www.googleapis.com/drive/v3/files";
  async function ensureFolder(owner,token){
    const url=api+"/"+folder+"?fields=id,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true";
    let info;
    try{info=await request(token,url);}catch(e){
      if(e.status!==404)throw e;
      if(!window.gapi)throw Error("تعذّر تحميل أداة اختيار مجلد Google.");
      await new Promise((ok,fail)=>gapi.load("picker",{callback:ok,onerror:()=>fail(Error("تعذّر تحميل Google Picker.")),timeout:15000,ontimeout:()=>fail(Error("انتهت مهلة Google Picker."))}));
      check(owner);
      await new Promise((resolve,reject)=>{
        const view=new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true);
        new google.picker.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(firebaseConfig.apiKey)
          .setAppId(firebaseConfig.messagingSenderId).setOrigin(location.origin).setTitle("اختر مجلد Designer-invoice")
          .setCallback(data=>{
            if(data.action==="cancel")reject(new DOMException("إلغاء","AbortError"));
            if(data.action==="picked")data.docs?.[0]?.id===folder?resolve():reject(Error("اختر مجلد Designer-invoice المحدد للموقع."));
          }).build().setVisible(true);
      });
      info=await request(token,url);
    }
    if(info.trashed||info.mimeType!=="application/vnd.google-apps.folder")throw Error("مجلد النسخ غير متاح.");
    return info;
  }
  async function run(action,index){
    if(busy)return;
    const owner=currentUser?.uid;
    try{
      check(owner);if(!clientId()){configure();return;}
      busy=true;
      const token=await authorize(owner);
      const info=await ensureFolder(owner,token);
      check(owner);
      if(action==="save"){
        if(!info.capabilities?.canAddChildren)throw Error("يلزم حساب Google يملك صلاحية إضافة ملفات للمجلد.");
        const createdAt=new Date().toISOString(), name="designerflow-"+owner+"-"+createdAt.replace(/:/g,"-")+"_"+crypto.randomUUID()+".json";
        const data=JSON.stringify({format:"designerflow-backup-v1",owner,createdAt,data:DB});
        const boundary="df_"+crypto.randomUUID();
        const metadata=JSON.stringify({name,parents:[folder],mimeType:"application/json"});
        const body=["--"+boundary,"Content-Type: application/json; charset=UTF-8","",metadata,"--"+boundary,"Content-Type: application/json; charset=UTF-8","",data,"--"+boundary+"--",""].join("\r\n");
        await request(token,"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",{method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body});
        check(owner);choices=null;DB.settings.lastBackupDate=todayStr();
        (DB.settings.backupHistory||=[]).unshift({date:todayStr(),sizeKB:Math.ceil(new Blob([data]).size/1024)});
        saveDB();render();alert("تم حفظ النسخة في مجلد Designer-invoice على Google Drive.");return;
      }
      let selected;
      if(action==="selected")selected=choices?.owner===owner?choices.files[index]:null;
      else{
        const files=[];let pageToken="";
        do{
          const params=new URLSearchParams({q:"'"+folder+"' in parents and trashed = false and mimeType = 'application/json'",fields:"nextPageToken,files(id,name)",pageSize:"1000",supportsAllDrives:"true",includeItemsFromAllDrives:"true"});
          if(pageToken)params.set("pageToken",pageToken);
          const page=await request(token,api+"?"+params);
          for(const f of page.files){const date=BackupFolder.parseName(f.name,owner);if(date)files.push({...date,id:f.id});}
          pageToken=page.nextPageToken;
        }while(pageToken);
        check(owner);files.sort((a,b)=>b.stamp.localeCompare(a.stamp));choices={owner,files};render();
        if(!files.length){alert("لم يعثر الموقع على نسخ مباشرة لهذا الحساب في المجلد.");return;}
        if(action==="list")return;
        selected=files[0];
      }
      if(!selected)throw Error("أعد اختيار النسخة.");
      const backup=await request(token,api+"/"+encodeURIComponent(selected.id)+"?alt=media&supportsAllDrives=true");
      check(owner);
      if(backup.format!=="designerflow-backup-v1"||backup.owner!==owner||!CLOUD_KEYS.every(k=>Object.hasOwn(backup.data||{},k)))throw Error("النسخة غير مكتملة أو تخص حساباً آخر.");
      const data=validateImportedDB(backup.data);
      if(confirm("استعادة نسخة "+selected.label+" واستبدال البيانات الحالية؟ عدد الفواتير "+data.invoices.length+".")){DB=data;saveDB();render();}
    }catch(e){if(e.name!=="AbortError")alert(e.message);}finally{busy=false;}
  }
  return {panel,configure,run,reset};
})();
