import {validateReport,reportEndpoint,sendReport,reportText} from './report-model.mjs';
const DRAFT_KEY='poltava-report-draft';
export function mountReport(){
  const $=s=>document.querySelector(s),dialog=$('#reportDialog'),form=$('#reportForm'),status=$('#reportStatus');
  let busy=false;
  const fields=()=>Object.fromEntries(new FormData(form));
  function store(){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(fields()))}catch{}}
  try{const draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(draft)for(const key of ['type','title','object','description'])if(typeof draft[key]==='string')form.elements[key].value=draft[key]}catch{}
  $('#reportTrigger').addEventListener('click',()=>{dialog.showModal();form.elements.title.focus()});
  $('#reportCancel').addEventListener('click',()=>{store();dialog.close()});
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();else store()});
  form.addEventListener('input',()=>{store();status.textContent='';$('#reportExport').hidden=true});
  $('#reportExport').addEventListener('click',()=>{
    try{const blob=new Blob([reportText(fields(),document.documentElement.lang)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='poltava-report.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch{status.textContent='Заповніть назву й опис звернення, щоб зберегти його у файл.'}
  });
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    let data;try{data=validateReport(fields())}catch{status.textContent='Перевірте поля: назва — від 4 символів, опис — від 10 символів.';return}
    store();busy=true;$('#reportFields').disabled=true;$('#reportSend').disabled=true;$('#reportCancel').disabled=true;form.setAttribute('aria-busy','true');status.dataset.state='pending';status.textContent='Надсилаємо звернення…';
    try{
      if(navigator.onLine===false)throw new Error('offline');
      const response=await fetch('./report-config.json',{signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('notConfigured');
      const config=await response.json(),endpoint=reportEndpoint(config.endpoint,location.href);
      const id=await sendReport(endpoint,data,{signal:AbortSignal.timeout(18000)});
      status.dataset.state='success';status.textContent=`Звернення №${id} надіслано. Дякуємо за допомогу!`;form.reset();try{localStorage.removeItem(DRAFT_KEY)}catch{}$('#reportExport').hidden=true;
    }catch(error){
      status.dataset.state='error';status.textContent=({offline:'Немає інтернету. Чернетку збережено на цьому пристрої — надішліть її після підключення.',notConfigured:'Надсилання ще не підключене адміністратором. Чернетку збережено; її можна завантажити у файл.',network:'Не вдалося отримати підтвердження. Чернетку збережено. Якщо спробуєте ще раз, можливе повторне звернення.',rateLimit:'Забагато повідомлень за короткий час. Зачекайте хвилину й спробуйте ще раз.',invalid:'Перевірте заповнені поля та довжину опису.',server:'Сервіс тимчасово недоступний. Чернетку збережено — спробуйте пізніше.'})[error.message]||'Не вдалося надіслати звернення. Чернетку збережено.';$('#reportExport').hidden=false;
    }finally{busy=false;$('#reportFields').disabled=false;$('#reportSend').disabled=false;$('#reportCancel').disabled=false;form.removeAttribute('aria-busy')}
  });
  const objects=$('#objectsSection');try{const saved=localStorage.getItem('poltava-objects-open');if(saved!==null)objects.open=saved==='true'}catch{}
  objects.addEventListener('toggle',()=>{try{localStorage.setItem('poltava-objects-open',String(objects.open))}catch{}});
}
