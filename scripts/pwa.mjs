import {OFFLINE_BOUNDS,showOfflineBasemap} from './map-style.mjs';
import {offlineStatusView} from './offline-status.mjs';
export function initialOfflineMode(){let saved;try{saved=localStorage.getItem('poltava-basemap')}catch{}return !navigator.onLine||saved==='offline'}
export function mountPWA(map){
  const $=s=>document.querySelector(s),toggle=$('#offlineMap');
  let offline=initialOfflineMode(),registration=null,installPrompt=null,refreshRequested=false;
  let state={phase:'checking',ready:false},action=null,checkId=0;
  const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname),optIn=new URLSearchParams(location.search).get('pwa')==='1';
  function render(patch={}){
    state={...state,...patch};const view=offlineStatusView(state);action=view.action;
    $('#offlineIndicator').dataset.state=state.phase;$('#offlineIndicator').dataset.ready=String(state.ready);
    $('#offlineIndicatorToggle').setAttribute('aria-label',view.title);$('#offlineIndicatorToggle').title=view.title+' — '+view.detail;
    $('#offlineIconBadge').textContent=state.phase==='saving'?'↓':state.ready?'✓':['error','incomplete'].includes(state.phase)?'!':'?';
    $('#offlineBannerTitle').textContent=view.title;$('#offlineBannerDetail').textContent=view.detail;
    $('#offlineStatus').textContent=view.title+'. '+view.detail;$('#offlineStatus').dataset.ready=String(state.ready);
    $('#offlineProgress').hidden=!view.progress;$('#offlineProgress').value=view.percent;
    $('#offlineAction').hidden=!action;$('#offlineAction').textContent=view.label||'';
    $('#retryOffline').hidden=!['error','incomplete','local'].includes(state.phase);
    $('#retryOffline').textContent=state.phase==='local'?'Зберегти офлайн':'Спробувати ще раз';$('#updatePWA').hidden=state.phase!=='update';
  }
  function networkStatus(){const el=$('#networkStatus');el.textContent=!navigator.onLine?'Без інтернету':offline?'Офлайн-підкладка':'Онлайн';el.dataset.offline=String(offline||!navigator.onLine);toggle.checked=offline;$('#offlineExtent').hidden=!offline}
  function fitCentre(){map.fitBounds([[OFFLINE_BOUNDS[0],OFFLINE_BOUNDS[1]],[OFFLINE_BOUNDS[2],OFFLINE_BOUNDS[3]]],{padding:45,maxZoom:14,duration:600})}
  function showBase(value,focus=false){if(!value)map.getSource('online')?.setUrl('https://tiles.openfreemap.org/planet');offline=value;showOfflineBasemap(map,offline);networkStatus();if(focus&&map.loaded())fitCentre()}
  toggle.addEventListener('change',()=>{try{localStorage.setItem('poltava-basemap',toggle.checked?'offline':'online')}catch{}showBase(toggle.checked||!navigator.onLine,true)});
  $('#offlineCenter').addEventListener('click',()=>{toggle.checked=true;toggle.dispatchEvent(new Event('change'));fitCentre()});
  window.addEventListener('offline',()=>showBase(true,true));window.addEventListener('online',()=>showBase(initialOfflineMode()));
  map.on('load',()=>showBase(offline,offline));map.on('error',e=>{if(e.sourceId==='online'&&!offline)showBase(true,true)});
  document.querySelector('a[href="#dataSources"]')?.addEventListener('click',e=>{e.preventDefault();const details=$('#dataSources');details.open=true;details.scrollIntoView({block:'start'});details.querySelector('summary').focus()});
  document.addEventListener('click',e=>{if(!$('#offlineIndicator').contains(e.target))$('#offlineIndicator').open=false});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#offlineIndicator').open){$('#offlineIndicator').open=false;$('#offlineIndicatorToggle').focus()}});
  networkStatus();render();
  function waiting(){if(registration?.waiting)render({phase:'update'})}
  function check(){
    const worker=registration?.active||navigator.serviceWorker.controller;if(!worker)return;
    const id=++checkId,channel=new MessageChannel();
    const timer=setTimeout(()=>{channel.port1.close();if(id===checkId)render({phase:'error',message:'Не вдалося підтвердити збереження. Спробуйте ще раз.'})},5000);
    channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();if(id!==checkId)return;const receipt=e.data;
      if(receipt.ready)render({phase:'ready',ready:true,savedAt:receipt.saved_at});
      else render({phase:receipt.missing?'incomplete':'error',ready:false,message:receipt.missing?'':'Готової офлайн-копії на цьому пристрої немає.'});waiting();
    };
    worker.postMessage({type:'STATUS'},[channel.port2]);
  }
  function applyUpdate(){if(registration?.waiting){refreshRequested=true;registration.waiting.postMessage({type:'SKIP_WAITING'})}}
  function watch(worker){worker?.addEventListener('statechange',()=>{if(worker.state==='installed'){waiting();if(!registration.waiting)check()}if(worker.state==='redundant')render({phase:'error',message:'Не вдалося завершити збереження. Перевірте інтернет і вільне місце.'})})}
  async function register(){
    render({phase:'saving',done:0,total:0,message:''});
    try{registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});if(registration.active)check();waiting();watch(registration.installing);registration.addEventListener('updatefound',()=>watch(registration.installing));navigator.serviceWorker.ready.then(check)}
    catch{render({phase:'error',message:'Перевірте інтернет, вільне місце та HTTPS.'})}
  }
  async function retry(){
    if(!registration){await register();return}if(registration.waiting){applyUpdate();return}
    render({phase:'saving',done:0,total:0,message:''});
    if(registration.active)registration.active.postMessage({type:'REPAIR'});
    else try{await registration.update()}catch{render({phase:'error'})}
  }
  $('#offlineAction').addEventListener('click',()=>{if(action==='update')applyUpdate();else if(action==='check'){render({phase:'checking'});check()}else retry()});
  $('#retryOffline').addEventListener('click',retry);$('#updatePWA').addEventListener('click',applyUpdate);
  if(!window.isSecureContext||!('serviceWorker'in navigator)){render({phase:'unsupported',ready:false});return}
  navigator.serviceWorker.addEventListener('message',e=>{const data=e.data||{};if(data.type==='PWA_PROGRESS')render({phase:'saving',done:data.done,total:data.total});if(data.type==='PWA_ERROR')render({phase:'error',message:''});if(data.type==='PWA_READY')check();if(data.type==='PWA_SAVED')waiting()});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(refreshRequested)location.reload();else check()});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#installPWA').hidden=false});
  $('#installPWA').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#installPWA').hidden=true});
  window.addEventListener('appinstalled',()=>{$('#installPWA').hidden=true;$('#installHint').textContent='Застосунок встановлено.'});
  if(local&&!optIn&&!navigator.serviceWorker.controller)render({phase:'local',ready:false});else register();
}
