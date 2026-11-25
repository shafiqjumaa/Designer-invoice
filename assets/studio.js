const Studio = (() => {
  function folderSetup(){
    const id=new URLSearchParams(location.hash.slice(1)).get("deliveryFolder");
    if(!id || !/^[a-zA-Z0-9_-]{10,120}$/.test(id))return "";
    return `<div class="card"><button class="btn btn-primary" data-folder="${esc(id)}" onclick="Studio.saveFolder(this.dataset.folder)">حفظ مجلد التصاميم المرفق في حسابي</button></div>`;
  }
  function saveFolder(id){
    DB.settings.deliveryFolder="https://drive.google.com/drive/folders/"+id;
    saveDB();history.replaceState(null,"",location.pathname+location.search);render();
  }
  const stages = ["قيد التنفيذ", "بانتظار تدقيقي", "جاهز للتسليم", "تم التسليم"];
  const toolPlans = () => DB.expenses.filter(e => e.category === "اشتراكات" && ["monthly","yearly"].includes(e.cycle) && e.nextDue);
  const assignments = () => DB.batches.flatMap(batch => (batch.items || []).filter(item => item.designer).map(item => ({batch,item})));
  const money = n => '<bdi>$' + fmt(n) + '</bdi>';
  const choice = (v,label,current) => `<option value="${esc(v)}" ${v===current?"selected":""}>${esc(label)}</option>`;
  function field(label,key,value,type="text",extra=""){
    return `<label class="field"><span class="lbl">${label}</span><input type="${type}" value="${esc(value ?? "")}" ${extra} oninput="App.modalUpdateSilent('${key}',this.value)"></label>`;
  }
  function teamFields(it){
    return `<fieldset class="card"><legend>توزيع العمل</legend>
      ${field("المصمّم المنفّذ (اتركه فارغًا إذا العمل إلك)","designer",it.designer,"text",'list="studio-designers"')}
      <datalist id="studio-designers">${[...new Set(assignments().map(x=>x.item.designer))].map(n=>choice(n,n,"")).join("")}</datalist>
      <div class="grid g2">${field("نسبتك من سعر العميل %","commission",it.commission,"number",'min="0" max="100" step="0.1"')}
      ${field("موعد تسليم العمل","taskDue",it.taskDue,"date")}</div>
      <label class="field"><span class="lbl">مرحلة العمل</span><select onchange="App.modalUpdateSilent('stage',this.value)">${stages.map(s=>choice(s,s,it.stage||stages[0])).join("")}</select></label></fieldset>`;
  }
  function designerShare(item,base){return item.designer ? base*(100-Number(item.commission||0))/100 : 0;}
  function team(){
    const rows=assignments().sort((a,b)=>(a.item.taskDue||"9999").localeCompare(b.item.taskDue||"9999"));
    return `<div class="page-header"><h1 class="page-title">توزيع شغل الفريق</h1><button class="btn btn-primary" onclick="App.setAdminPage('work')">اختيار مشروع لتوزيع عمل</button></div>
      <label class="field"><span class="lbl">إسناد عمل جديد ضمن مشروع</span><select onchange="if(this.value)App.openItemModal(this.value);this.selectedIndex=0"><option value="">اختر المشروع</option>${DB.batches.filter(b=>b.status==="مفتوح").map(b=>choice(b.id,b.title,"")).join("")}</select></label>
      ${rows.length?`<div class="card" style="overflow:auto"><table style="width:100%;text-align:start;white-space:nowrap"><thead><tr>${["العمل / المشروع","المصمّم","التسليم","الحالة","حصّتك المتفق عليها","حصة المصمّم",""].map(t=>`<th style="text-align:start;padding:8px">${t}</th>`).join("")}</tr></thead><tbody>${rows.map(({item,batch})=>{
        const price=itemTotal(item),share=designerShare(item,price);
        return `<tr>${[esc(item.title||item.type)+" / "+esc(batch.title),esc(item.designer),esc(item.taskDue||"—"),esc(item.stage||stages[0]),money(price-share)+" · "+esc(item.commission)+"%",money(share),taskButton("item",batch.id,item.id,"تعديل")].map(c=>`<td style="padding:8px">${c}</td>`).join("")}</tr>`;
      }).join("")}</tbody></table></div>`:emptyState("users","افتح أحد أعمال المشروع وحدّد المصمّم ونسبتك ليظهر هنا.")}`;
  }
  function expenseFields(e){
    const projects=DB.batches.map(b=>choice(b.id,b.title,e.projectId)).join("");
    return `<label class="field"><span class="lbl">تحميل المصروف على مشروع</span><select onchange="App.modalUpdateSilent('projectId',this.value)">${choice("","مصروف عام",e.projectId||"")}${projects}</select></label>
    ${e.category==="اشتراكات"&&!e.renewalOf?`<div class="grid g2">${field("اسم الخطة","planName",e.planName)}
      <label class="field"><span class="lbl">دورة الدفع</span><select onchange="App.modalUpdate('cycle',this.value)">${[["","دفعة واحدة"],["monthly","شهري"],["yearly","سنوي"]].map(([v,l])=>choice(v,l,e.cycle||"")).join("")}</select></label></div>
      ${e.cycle?field("موعد التجديد القادم","nextDue",e.nextDue,"date"):""}`:""}`;
  }
  function advance(date,cycle,anchor){
    const [y,m,d]=date.split("-").map(Number);
    const target=new Date(Date.UTC(y,m-1+(cycle==="yearly"?12:1),1));
    const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
    target.setUTCDate(Math.min(anchor||d,last));
    return target.toISOString().slice(0,10);
  }
  function renew(id,due){
    const e=toolPlans().find(x=>x.id===id && x.nextDue===due);
    if(!e || !confirm("تسجيل دفعة "+e.name+" بقيمة $"+fmt(e.amount)+" وتحديث موعد التجديد؟"))return;
    const paymentId=e.id+"-renew-"+due;
    if(!DB.expenses.some(x=>x.id===paymentId)){
      DB.expenses.push({id:paymentId,renewalOf:id,name:e.name,serviceName:e.serviceName??e.name,category:e.category,projectId:e.projectId||"",amount:Number(e.amount),date:todayStr(),notes:"تجديد "+due,planName:e.planName||""});
    }
    e.anchorDay=e.anchorDay||Number(due.slice(-2));
    e.nextDue=advance(due,e.cycle,e.anchorDay);
    saveDB();render();
  }
  function renewals(){
    const plans=toolPlans().sort((a,b)=>a.nextDue.localeCompare(b.nextDue));
    const month=todayStr().slice(0,7);
    return `<section class="card" style="margin-bottom:18px"><h2>تجديدات أدواتي</h2>
      <p class="muted small">الدفعات المجدولة لهذا الشهر: ${money(plans.filter(e=>e.nextDue.startsWith(month)).reduce((n,e)=>n+Number(e.amount),0))}</p>
      ${plans.map(e=>`<div class="page-header"><div>${expenseServiceIcon(expenseService(e.serviceName??e.name))} <b>${esc(e.name)}</b> ${esc(e.planName||"")} · ${e.cycle==="yearly"?"سنوي":"شهري"} · ${money(e.amount)} · <bdi>${esc(e.nextDue)}</bdi></div>
      <button class="btn btn-soft small" data-id="${esc(e.id)}" data-due="${esc(e.nextDue)}" onclick="Studio.renew(this.dataset.id,this.dataset.due)">تأكيد الدفع</button></div>`).join("")||'<p class="small">حدّد دورة الدفع وموعد التجديد عند إضافة مصروف اشتراك.</p>'}</section>`;
  }
  function earnings(batch){
    const items=batch.items||[];
    const receipts=new Map();
    for(const inv of DB.invoices){
      if(inv.status!=="مدفوعة")continue;
      for(const line of inv.items||[]){
        if(line.sourceBatch!==batch.id)continue;
        receipts.set(line.sourcePart,(receipts.get(line.sourcePart)||0)+Number(line.qty)*Number(line.price));
      }
    }
    let received=0,shares=0;
    for(const it of items){
      const parts=it.pricingMode==="detailed"?(it.components||[]):[it];
      for(const part of parts){
        const marked=part.paid ? (part===it?itemTotal(it):Number(part.qty)*Number(part.price)) : 0;
        const cash=Math.max(marked,receipts.get(part.id)||0);
        receipts.delete(part.id);
        received+=cash;shares+=designerShare(it,cash);
      }
    }
    for(const cash of receipts.values())received+=cash;
    const costs=DB.expenses.filter(e=>e.projectId===batch.id).reduce((n,e)=>n+Number(e.amount||0),0);
    const net=received-shares-costs, hours=projectMinutes(batch)/60;
    return `<section class="card" style="margin-bottom:18px"><h2>ربح المشروع بالساعة</h2>
      <p>المقبوض من بنود العمل والفواتير المرتبطة ${money(received)} − حصة المصمّمين من المقبوض ${money(shares)} − المصاريف المرتبطة ${money(costs)}</p>
      <b>الصافي ${money(net)}</b> · ${hours?`ساعاتي المسجّلة ${fmt(hours)} · <b>${money(net/hours)} / ساعة</b>`:"سجّل وقتك بالمؤقّت لحساب الربح بالساعة."}</section>`;
  }
  function taskButton(kind,id,sub,label){
    return `<button class="btn btn-soft small" data-kind="${kind}" data-id="${esc(id)}" data-sub="${esc(sub||"")}" onclick="Studio.openTask(this.dataset)">${esc(label)}</button>`;
  }
  function openTask({kind,id,sub}){
    if(kind==="item")App.openItemModal(id,sub);
    if(kind==="batch")App.jumpSearchResult("batch",id);
    if(kind==="invoice")App.viewInvoice(id);
    if(kind==="expense"){App.setAdminPage("expenses");App.openExpenseModal(id);}
  }
  function today(){
    const now=todayStr(),soon=new Date(now+"T12:00:00Z");soon.setUTCDate(soon.getUTCDate()+3);
    const rows=[];
    for(const batch of DB.batches.filter(b=>b.status!=="منتهي"))for(const item of batch.items||[]){
      if(item.stage!=="تم التسليم"&&(item.stage==="بانتظار تدقيقي"||item.stage==="جاهز للتسليم"||item.taskDue&&item.taskDue<=now))
        rows.push([item.taskDue,item.stage||stages[0],(item.designer||batch.title)+" · "+(item.title||item.type),"item",batch.id,item.id]);
    }
    for(const b of DB.batches)if(b.status==="مفتوح"&&b.endDate&&b.endDate<=now)rows.push([b.endDate,"تسليم مشروع",b.title,"batch",b.id]);
    for(const i of DB.invoices)if(i.status==="مرسلة"&&i.dueDate&&i.dueDate<=now)rows.push([i.dueDate,"متابعة فاتورة",i.number,"invoice",i.id]);
    for(const e of toolPlans())if(e.nextDue<=soon.toISOString().slice(0,10))rows.push([e.nextDue,"تجديد أداة",e.name,"expense",e.id]);
    rows.sort((a,b)=>(a[0]||now).localeCompare(b[0]||now));
    return `<section class="card" style="margin-bottom:18px"><h2>شو عليّ اليوم؟</h2>${rows.map(([date,type,title,kind,id,sub])=>`<div class="page-header"><div><b>${esc(type)}</b> · ${esc(title)} <small class="muted">${esc(date||"")} ${date&&date<now?"· متأخر":""}</small></div>${taskButton(kind,id,sub,"فتح")}</div>`).join("")||'<p class="muted">ما عندك متابعة مستحقة اليوم.</p>'}</section>`;
  }
  function delivery(batch){
    const link=safeExternalUrl(batch.driveLink),folder=safeExternalUrl(DB.settings.deliveryFolder);
    return `<div class="actions">${folder?`<a class="btn btn-soft small" href="${esc(folder)}" target="_blank" rel="noopener noreferrer">مجلد التصاميم الرئيسي</a>`:""}
    ${link?`<button class="btn btn-soft small" data-url="${esc(link)}" onclick="App.copyText(this.dataset.url,'تم نسخ رابط تسليم العميل')">نسخ رابط تسليم العميل</button>`:""}</div>`;
  }
  return {folderSetup,saveFolder,teamFields,team,expenseFields,advance,renew,renewals,earnings,today,openTask,delivery};
})();
