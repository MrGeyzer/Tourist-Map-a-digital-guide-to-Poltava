import {ACCESS_FEATURES,ACCESS_KEYS,DISCLAIMER,accessibilityOf,parseBarrierParams,writeBarrierParams,accessibilityFromOSM} from './accessibility-core.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={yes:'Є',no:'Немає',unknown:'Немає даних'},symbols={yes:'✓',no:'−',unknown:'?'};
const date=value=>value?new Intl.DateTimeFormat('uk-UA',{timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')):'Немає даних';
function sourceHTML(source){return source&&/^https:\/\//.test(source.url||'')?`<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.name||'Джерело')}</a>`:'Не вказано'}
function evidenceHTML(fact){return `<div class="bf-evidence">Джерело: ${sourceHTML(fact.source)} · Перевірено: ${date(fact.checked_at)}${fact.field?`<span class="bf-raw">${esc(fact.field)}: ${esc(fact.raw)}</span>`:''}</div>`}
export function accessibilityCard(properties){
  const data=accessibilityOf(properties);
  if(!data.general.length&&properties.wheelchair)data.general=accessibilityFromOSM(properties,properties['@id']).general;
  const generalStates=new Set(data.general.map(f=>f.value).filter(v=>v!=='unknown'));
  return `<section class="bf-card" aria-label="Ознаки доступності"><h4>Ознаки доступності</h4><ul>${ACCESS_KEYS.map(key=>{
    const item=data[key];return `<li><div class="bf-fact"><b>${ACCESS_FEATURES[key]}</b><span class="bf-state bf-${item.value}">${symbols[item.value]} ${labels[item.value]}</span></div>${item.conflict?'<p class="bf-conflict">⚠ Джерела суперечать одне одному. Ознака не вважається підтвердженою.</p>':''}${item.assertions.length?item.assertions.map(f=>`${item.conflict?`<span class="bf-evidence">${symbols[f.value]} ${labels[f.value]}</span>`:''}${evidenceHTML(f)}`).join(''):'<div class="bf-evidence">Джерело: не вказано · Перевірено: немає даних</div>'}</li>`;
  }).join('')}</ul><h4>Загальна оцінка — окремо</h4>${generalStates.size>1?'<p class="bf-conflict">⚠ У джерелах наведені різні загальні оцінки.</p>':''}${data.general.length?data.general.map(f=>`<p class="bf-general">${f.field==='wheelchair'?({yes:'Доступно для крісла колісного',no:'Недоступно для крісла колісного',limited:'Частково доступно для крісла колісного',unknown:'Немає даних'})[f.value]||'Немає даних':esc(f.raw)}</p>${evidenceHTML(f)}`).join(''):'<p>Немає даних</p>'}<p class="bf-disclaimer">${DISCLAIMER}.</p></section>`;
}
export function accessibilityBadge(properties){const model=accessibilityOf(properties),keys=ACCESS_KEYS.filter(key=>model[key].value==='yes');return keys.length?`<span class="bf-list-badge">✓ Ознаки: ${keys.map(key=>ACCESS_FEATURES[key]).join(' · ')}</span>`:''}
export function mountBarrierFilters({onChange}){
  const $=selector=>document.querySelector(selector),mode=$('#barrierMode'),options=$('#barrierOptions');
  let state=parseBarrierParams(location.search),loadState='loading',dataset=null;
  function render(){
    mode.checked=state.enabled;mode.setAttribute('aria-expanded',String(state.enabled));options.hidden=!state.enabled;
    for(const input of options.querySelectorAll('[data-access-feature]'))input.checked=state.selected.includes(input.dataset.accessFeature);
    $('#resetBarrierFeatures').disabled=!state.selected.length;
    const status=$('#barrierDataStatus');status.classList.toggle('bf-data-error',loadState==='error');
    status.textContent=loadState==='loading'?'Завантажуємо локальні дані доступності…':loadState==='error'?'Не вдалося завантажити дані доступності. Підтверджені збіги не показуються; решта карти працює. Спробуйте перезавантажити дані.':!dataset?.counts?.any_confirmed?'У завантаженому наборі немає підтверджених ознак. Загальна оцінка не підтверджує окремі елементи.':`У локальному наборі ${dataset.counts.any_confirmed} об’єктів Полтави з хоча б однією підтвердженою ознакою.`;
    $('#retryBarrierData').hidden=loadState!=='error';
    $('#barrierSourceList').innerHTML=dataset?.sources?.map(s=>`<li>${sourceHTML(s)}: ${esc(({connected:'підключено',general_only:'лише загальні оцінки',export_unavailable:'відкритий експорт недоступний',unavailable:'джерело недоступне',needs_review:'потрібна перевірка формату'})[s.status]||'Імпортований набір')}${s.http_status?` (HTTP ${s.http_status})`:''}</li>`).join('')||'<li>Відомості про джерела ще не завантажено.</li>';
    const lun=dataset?.sources?.find(s=>s.id==='lun'),open=dataset?.sources?.find(s=>s.id==='mindev-open-data');
    $('#barrierPriorityNote').textContent=lun?.status==='connected'?'Пріоритетне джерело ЛУН / Мінрозвитку підключено з перевіреного локального експорту.':`Пріоритетне джерело — ЛУН / Мінрозвитку. ${open?.http_status===403?'Відкритий набір, на який посилається ЛУН, наразі недоступний (HTTP 403).':'Перевіреного відкритого експорту чотирьох ознак поки немає.'} Ознаки з нього ще не підключено.`;
  }
  function commit(){render();const url=writeBarrierParams(location.href,state);history.replaceState(null,'',url);onChange()}
  mode.addEventListener('change',()=>{state.enabled=mode.checked;commit()});
  for(const input of options.querySelectorAll('[data-access-feature]'))input.addEventListener('change',()=>{state.selected=[...options.querySelectorAll('[data-access-feature]:checked')].map(el=>el.dataset.accessFeature);commit()});
  $('#resetBarrierFeatures').addEventListener('click',()=>{state.selected=[];commit()});
  window.addEventListener('popstate',()=>{state=parseBarrierParams(location.search);render();onChange()});
  render();return {get enabled(){return state.enabled},get selected(){return [...state.selected]},get loadState(){return loadState},setDataset(data,status='loaded'){dataset=data;loadState=status;render()},reset(){state={enabled:false,selected:[]};commit()},readURL(){state=parseBarrierParams(location.search);render()},cardHTML:accessibilityCard,listBadge:accessibilityBadge};
}
