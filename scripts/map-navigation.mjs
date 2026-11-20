import {pointInRegion,lineInRegion} from './map-region.mjs';
import {distanceMeters} from './accessibility-core.mjs';
export function nearestShelter(point, features, region) {
  if (!validMapPoint(point) || !region || !pointInRegion(point, region)) throw new Error('outsideRegion');
  let nearest = null;
  for (const feature of features) {
    const coordinates = feature.geometry?.coordinates;
    if (feature.geometry?.type !== 'Point' || !validMapPoint(coordinates) || !pointInRegion(coordinates, region)) continue;
    const distance = distanceMeters(point, coordinates);
    if (!nearest || distance < nearest.distance) nearest = {feature, distance};
  }
  return nearest;
}
export const ROUTING_ENDPOINT = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/';
export function validMapPoint(point) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 85.051129;
}
export function routeURL(start, end) {
  if (!validMapPoint(start) || !validMapPoint(end)) throw new Error('outside');
  return `${ROUTING_ENDPOINT}${start.join(',')};${end.join(',')}?overview=full&geometries=geojson&steps=false&radiuses=500;500`;
}
export function parseRoute(data) {
  const route = data?.routes?.[0];
  if (data?.code !== 'Ok' || !route || route.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2 || !route.geometry.coordinates.every(validMapPoint) || !Number.isFinite(route.distance) || route.distance < 0 || !Number.isFinite(route.duration) || route.duration < 0) throw new Error(['NoRoute', 'NoSegment'].includes(data?.code) ? 'noRoute' : 'routeError');
  return route;
}
export async function requestLocation({secureContext, geolocation, permissions, policyAllowed = true}) {
  if (!secureContext) throw new Error('insecure');
  if (!policyAllowed) throw new Error('policyBlocked');
  if (!geolocation) throw new Error('unavailable');
  const permissionState = async () => {try{return (await permissions?.query({name:'geolocation'}))?.state || 'unknown'}catch{return 'unknown'}};
  const attempt = options => new Promise((resolve,reject)=>{try{geolocation.getCurrentPosition(resolve,reject,options)}catch(error){reject({code:1,message:error.message})}});
  let failure;
  for(const options of [{enableHighAccuracy:false,timeout:15000,maximumAge:0},{enableHighAccuracy:true,timeout:20000,maximumAge:0}]) {
    try {const position=await attempt(options);const point=[position.coords.longitude,position.coords.latitude];if(!validMapPoint(point))throw new Error('outside');return point}
    catch(error){if(error.message==='outside')throw error;failure=error;const state=await permissionState();if(error.code===1&&state!=='granted')throw new Error(state==='denied'?'denied':'permissionUnknown')}
  }
  const state=await permissionState();
  if(failure?.code===3)throw new Error(state==='granted'?'deviceTimeout':'timeout');
  if(state==='granted')throw new Error('deviceUnavailable');
  throw new Error(failure?.code===1?'denied':'unavailable');
}

const messages = {
  uk: {
    nearestShelter:'Найближче укриття',shelterTitle:'Пошук найближчого укриття',shelterPick:'Виберіть своє місце на карті в межах Полтави. Після вибору покажемо найближче укриття.',shelterManual:'Вибрати моє місце на карті',shelterFallback:'Не вдалося визначити вашу позицію. Натисніть «Вибрати моє місце на карті» та позначте, де ви перебуваєте.',shelterCard:'Картка укриття',shelterClear:'Прибрати результат',shelterReady:'Знайдено найближче укриття за відстанню по прямій.',shelterEmpty:'У межах міста немає укриттів із відомими координатами.',shelterLoading:'Дані укриттів завантажуються. Спробуйте за мить.',shelterError:'Не вдалося завантажити укриття. Оновіть сторінку.',shelterCaveat:'Відстань по прямій; пішохідний шлях може бути довшим. Режим доступу та поточний стан укриття не підтверджені.',
    openLocalhost:'Відкрити на ноутбуці через localhost',locate: 'Показати моє місцезнаходження', routePick: 'Дістатися до місця', routeTo: 'Прокласти маршрут',
    title: 'Пішохідний маршрут', close: 'Закрити маршрут', pickDestination: 'Виберіть точку в межах міста Полтави, до якої хочете дістатися. Потім натисніть «Прокласти маршрут» у її картці.',
    pickStart: 'Виберіть початкову точку маршруту в межах міста Полтави.', selected: 'Точку вибрано. Натисніть «Прокласти маршрут» у картці.',
    locating: 'Визначаю ваше місцезнаходження…', locationShown: 'Ваше місцезнаходження позначене синім.', building: 'Будую пішохідний маршрут…',
    insecure: 'Браузер не дозволяє геолокацію через HTTP. Відкрийте сайт через HTTPS або виберіть початок маршруту вручну на карті.',
    denied: 'Доступ до координат заблокований браузером або системою. Перевірте дозвіл для цього сайту та службу «Розташування» у Windows або виберіть початок на карті.',
    timeout: 'Не вдалося визначити місце за відведений час. Спробуйте ще раз або виберіть початок на карті.',
    unavailable: 'Місцезнаходження недоступне. Увімкніть геолокацію або виберіть початок на карті.',
    outside: 'Некоректні координати місцезнаходження.',outsideRegion:'Ви за межами міста Полтави.',outsideDestination:'Точку B можна обрати лише в межах міста Полтави.',outsideStart:'Точку A можна обрати лише в межах міста Полтави.',routeOutsideRegion:'Знайдений маршрут виходить за межі міста Полтави. Оберіть іншу точку.',regionLoading:'Завантажую межу міста Полтави… Спробуйте за мить.',regionUnavailable:'Не вдалося завантажити межу міста Полтави. Оновіть сторінку; вибір точок поки недоступний.',deviceTimeout:'Дозвіл надано, але пристрій не повернув координати вчасно. Перевірте службу «Розташування» у Windows і доступ до інтернету та спробуйте ще раз.',deviceUnavailable:'Дозвіл сайту надано, але пристрій не визначив координати. Перевірте службу «Розташування» у параметрах Windows і доступ до інтернету або виберіть старт на карті.',permissionUnknown:'Браузер не надав координати. Відкрийте сайт у звичайному браузері, перевірте дозвіл на геолокацію та службу «Розташування» у Windows.',policyBlocked:'Вбудоване вікно або політика браузера блокує геолокацію. Відкрийте сайт у звичайному браузері.',
    noRoute: 'Не знайдено пішохідного маршруту між точками. Спробуйте точку ближче до дороги або стежки.',
    routeError: 'Сервіс маршрутів не відповів або повернув помилку. Спробуйте ще раз.',
    manualStart: 'Обрати початок на карті', retry: 'Спробувати ще раз', chooseDestination: 'Обрати іншу точку', clear: 'Прибрати маршрут',
    startReady: 'Початок маршруту позначено. Тепер виберіть, куди дістатися.', chosenPoint: 'Обрана точка',
    you: 'Ваше місцезнаходження', manual: 'Початок маршруту (обрано вручну)', destination: 'Місце призначення',
    ready: 'Маршрут готовий', min: 'хв', km: 'км', m: 'м', loading: 'Карта завантажується. Спробуйте за мить.',
    credit: 'Маршрути: FOSSGIS / OSRM · © OpenStreetMap', privacy: 'Для розрахунку сервіс отримує координати початку й кінця.', snap: 'Маршрут прив’язаний до найближчих пішохідних шляхів; пунктир — підхід до них.'
  },
  en: {
    nearestShelter:'Nearest shelter',shelterTitle:'Find the nearest shelter',shelterPick:'Choose your location on the map inside Poltava. We will show the nearest shelter.',shelterManual:'Choose my location on map',shelterFallback:'Could not determine your position. Press “Choose my location on map” and mark where you are.',shelterCard:'Shelter details',shelterClear:'Clear result',shelterReady:'Nearest shelter found by straight-line distance.',shelterEmpty:'No shelters with known coordinates inside the city.',shelterLoading:'Shelters are loading. Try again shortly.',shelterError:'Could not load shelters. Reload the page.',shelterCaveat:'Straight-line distance; the walking route may be longer. Current access and shelter condition are unconfirmed.',
    openLocalhost:'Open on this computer via localhost',locate: 'Show my location', routePick: 'Get directions', routeTo: 'Build route', title: 'Walking route', close: 'Close route',
    pickDestination: 'Choose a destination inside Poltava city, then press “Build route” in its card.', pickStart: 'Choose a starting point inside Poltava city.', selected: 'Destination selected. Press “Build route” in its card.',
    locating: 'Finding your location…', locationShown: 'Your location is marked in blue.', building: 'Building a walking route…',
    insecure: 'Your browser blocks location over HTTP. Open this site over HTTPS or choose a starting point on the map.',
    denied: 'Location access is blocked by the browser or operating system. Check site permissions and Windows Location services, or choose a starting point on the map.',
    timeout: 'Location request timed out. Try again or choose a starting point on the map.', unavailable: 'Location is unavailable. Enable location or choose a starting point on the map.',
    outside:'Invalid location coordinates.',outsideRegion:'You are outside Poltava city.',outsideDestination:'Point B must be inside Poltava city.',outsideStart:'Point A must be inside Poltava city.',routeOutsideRegion:'This route leaves Poltava city. Choose another destination.',regionLoading:'Loading the Poltava city boundary… Try again shortly.',regionUnavailable:'Could not load the city boundary. Reload the page; point selection is currently unavailable.',deviceTimeout:'Permission is granted, but the device did not return coordinates in time. Check Windows Location services and internet access, then try again.',deviceUnavailable:'Site permission is granted, but the device could not determine your position. Check Windows Location services and internet access, or choose a starting point on the map.',permissionUnknown:'The browser did not provide coordinates. Open the site in a regular browser and check location permission and Windows Location services.',policyBlocked:'The embedded window or browser policy blocks geolocation. Open the site in a regular browser.', noRoute: 'No walking route found. Choose a point closer to a road or path.', routeError: 'The routing service did not respond or returned an error. Try again.',
    manualStart: 'Choose start on map', retry: 'Try again', chooseDestination: 'Choose another point', clear: 'Clear route', startReady: 'Starting point marked. Now choose a destination.', chosenPoint: 'Selected point',
    you: 'Your location', manual: 'Starting point (chosen manually)', destination: 'Destination', ready: 'Route ready', min: 'min', km: 'km', m: 'm', loading: 'The map is loading. Try again in a moment.',
    credit: 'Routes: FOSSGIS / OSRM · © OpenStreetMap', privacy: 'The service receives start and destination coordinates to calculate the route.', snap: 'The route follows nearby walkable paths; dashed lines show the approach.'
  }
};

export function mountNavigation({ map, maplibregl, createPopup, setPanelOpen, esc, closePopup, getRegion, getRegionState, getShelters, getShelterState, shelterPopupHTML }) {
  const $ = selector => document.querySelector(selector);
  const t = key => messages[document.documentElement.lang === 'en' ? 'en' : 'uk'][key] || key;
  const empty = () => ({type: 'FeatureCollection', features: []});
  let origin = null, destination = null, originMarker = null, endMarker = null, selecting = null, message = '', route = null, controller = null, generation = 0, lastRequest = 0, locationPromise = null, shelterMode = false, nearestInfo = null;
  const panel = $('#routePanel');

  function show(key, error = false) { message = key; panel.hidden = false; panel.classList.toggle('route-error', error); updateLanguage(); }
  function setSelecting(mode) {
    selecting = mode; map.getCanvas().classList.toggle('choosing-point', Boolean(mode));
    $('#mapRoute').setAttribute('aria-pressed', String(mode === 'destination'));
    if (mode) { closePopup(); $('#layerMenu').open = false; if (matchMedia('(max-width:800px)').matches) setPanelOpen(false); show(mode === 'shelterStart' ? 'shelterPick' : mode === 'start' ? 'pickStart' : 'pickDestination'); }
  }
  function ensureLayers() {
    if (!map.getSource('walking-route')) {
      map.addSource('walking-route', {type: 'geojson', data: empty()});
      map.addLayer({id: 'walking-route-halo', type: 'line', source: 'walking-route', layout: {'line-join': 'round', 'line-cap': 'round'}, paint: {'line-color': '#ffffff', 'line-width': 9}});
      map.addLayer({id: 'walking-route-line', type: 'line', source: 'walking-route', layout: {'line-join': 'round', 'line-cap': 'round'}, paint: {'line-color': '#2469d8', 'line-width': 5}});
      map.addSource('walking-approaches', {type: 'geojson', data: empty()});
      map.addLayer({id: 'walking-approach-line', type: 'line', source: 'walking-approaches', paint: {'line-color': '#2469d8', 'line-width': 3, 'line-dasharray': [1, 2]}});
    }
  }
  function resetGeometry() {
    for (const id of ['walking-route', 'walking-approaches']) map.getSource(id)?.setData(empty());
    endMarker?.remove(); endMarker = null; route = null;
  }
  function marker(point, label, title, color) {
    const element = document.createElement('div'); element.className = 'navigation-marker'; element.style.background = color; element.textContent = label; element.title = title; element.setAttribute('aria-label', title); element.setAttribute('role', 'img');
    return new maplibregl.Marker({element}).setLngLat(point).addTo(map);
  }
  function setOrigin(point, manual = false) {
    if (!validMapPoint(point)) throw new Error('outside');
    if (!pointInRegion(point,getRegion())) throw new Error(manual?'outsideStart':'outsideRegion');
    origin = {point, manual, timestamp: Date.now()}; originMarker?.remove(); originMarker = marker(point, 'A', t(manual ? 'manual' : 'you'), '#2469d8');
  }
  async function getLocation() {
    if (!locationPromise) locationPromise = requestLocation({secureContext: window.isSecureContext, geolocation: navigator.geolocation, permissions:navigator.permissions, policyAllowed:(document.permissionsPolicy||document.featurePolicy)?.allowsFeature('geolocation') ?? true}).finally(() => { locationPromise = null; });
    return locationPromise;
  }
  function ready() { if (!getRegion()){show(getRegionState()==='error'?'regionUnavailable':'regionLoading',getRegionState()==='error');return false}if (!map.getLayer('unclustered-points')) { show('loading'); return false; } return true; }
  async function locate() {
    if (!ready()) return;
    shelterMode=false;nearestInfo=null;
    const id = ++generation; controller?.abort(); setSelecting(null); resetGeometry(); destination = null; origin=null;originMarker?.remove();originMarker=null;show('locating');
    try {
      const point = await getLocation(); if (id !== generation) return; setOrigin(point); map.flyTo({center: point, zoom: 15});
      if (matchMedia('(max-width:800px)').matches) setPanelOpen(false); show('locationShown');
    } catch (error) { if (id === generation) show(error.message in messages.uk ? error.message : 'unavailable', true); }
  }
  function showNearestShelter() {
    const result=nearestShelter(origin.point,getShelters(),getRegion());
    if(!result){show('shelterEmpty',true);return}
    nearestInfo=result;const point=result.feature.geometry.coordinates;
    endMarker=marker(point,'У',t('nearestShelter'),'#c6422a');
    show('shelterReady');
    fitShelterResult();

    if(matchMedia('(max-width:800px)').matches)setPanelOpen(false);
  }
  function fitShelterResult(){
    if(!origin||!nearestInfo)return;
    const bounds=new maplibregl.LngLatBounds();bounds.extend(origin.point);bounds.extend(nearestInfo.feature.geometry.coordinates);
    map.fitBounds(bounds,{padding:{top:80,right:60,bottom:Math.min(map.getContainer().clientHeight*.4,260),left:40},maxZoom:16,duration:600});
  }
  async function findShelter() {
    if(!ready())return;
    shelterMode=true;nearestInfo=null;
    const id=++generation;controller?.abort();setSelecting(null);resetGeometry();closePopup();destination=null;
    if(matchMedia('(max-width:800px)').matches)setPanelOpen(false);
    if(getShelterState()!=='loaded'){show(getShelterState()==='error'?'shelterError':'shelterLoading',true);return}
    origin=null;originMarker?.remove();originMarker=null;show('locating');
    try { const point=await getLocation();if(id!==generation)return;setOrigin(point);showNearestShelter(); }
    catch(error){if(id===generation)show(error.message in messages.uk?error.message:'unavailable',true)}
  }
  async function buildRoute(point, name) {
    if (!ready()) return;
    shelterMode=false;nearestInfo=null;
    const id = ++generation; controller?.abort(); setSelecting(null); resetGeometry(); destination = {point, name}; closePopup();
    if (matchMedia('(max-width:800px)').matches) setPanelOpen(false);
    if (!validMapPoint(point)) { destination=null;show('outside', true); return; }
    if (!pointInRegion(point,getRegion())) {destination=null;show('outsideDestination',true);return}
    try {
      if (!origin || (!origin.manual && Date.now() - origin.timestamp > 120000)) { show('locating'); const start = await getLocation(); if (id !== generation) return; setOrigin(start); }
      if (id !== generation) return;
      if(!pointInRegion(origin.point,getRegion()))throw new Error('outsideRegion');
      show('building');
      const delay = Math.max(0, 1100 - (Date.now() - lastRequest)); if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (id !== generation) return;
      const requestController = new AbortController(); controller = requestController; const timer = setTimeout(() => requestController.abort(), 25000); lastRequest = Date.now();
      let data;
      try { const response = await fetch(routeURL(origin.point, point), {signal: requestController.signal}); data = await response.json(); if (!response.ok && !['NoRoute','NoSegment'].includes(data.code)) throw new Error('routeError'); }
      finally { clearTimeout(timer); }
      if (id !== generation) return;
      route = parseRoute(data);
      if(!lineInRegion([origin.point,...route.geometry.coordinates,point],getRegion()))throw new Error('routeOutsideRegion');
      ensureLayers();
      map.getSource('walking-route').setData({type: 'Feature', properties: {}, geometry: route.geometry});
      const coordinates = route.geometry.coordinates;
      map.getSource('walking-approaches').setData({type: 'FeatureCollection', features: [[origin.point, coordinates[0]], [coordinates.at(-1), point]].map(pair => ({type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates: pair}}))});
      endMarker = marker(point, 'B', name || t('destination'), '#17664f'); show('ready');
      const bounds = new maplibregl.LngLatBounds(); [...coordinates, origin.point, point].forEach(p => bounds.extend(p));
      const small = matchMedia('(max-width:800px)').matches, bottom = Math.min(panel.offsetHeight + 48, map.getContainer().clientHeight * .55);
      map.fitBounds(bounds, {padding: {top: 70, right: small ? 70 : 60, bottom, left: 35}, maxZoom: 16, duration: 700});
    } catch (error) { if (id === generation) { resetGeometry(); show(error.message in messages.uk ? error.message : 'routeError', true); } }
  }
  function updateLanguage() {
    for (const [selector, key] of [['#nearestShelter','nearestShelter'],['#locate','locate'],['#routePick','routePick'],['#routeTitle','title'],['#manualStart','manualStart'],['#retryRoute','retry'],['#chooseDestination','chooseDestination'],['#clearRoute','clear'],['#openLocalhost','openLocalhost']]) $(selector).textContent = t(key);
    for (const [selector, key] of [['#mapLocate','locate'],['#mapRoute','routePick'],['#closeRoute','close']]) { $(selector).setAttribute('aria-label', t(key)); $(selector).title = t(key); }
    $('#openNearestShelter').hidden=!shelterMode||!nearestInfo;
    $('#openNearestShelter').textContent=t('shelterCard');
    $('#routeTitle').textContent=t(shelterMode?'shelterTitle':'title');
    $('#manualStart').textContent=t(shelterMode?'shelterManual':'manualStart');
    $('#chooseDestination').hidden=shelterMode;
    const shelterLocationFailed=shelterMode&&['insecure','denied','timeout','unavailable','outside','deviceTimeout','deviceUnavailable','permissionUnknown','policyBlocked'].includes(message);
    $('#routeMessage').textContent = t(message)+(shelterLocationFailed?' '+t('shelterFallback'):''); $('#routeCredit').textContent = t('credit'); $('#routePrivacy').textContent = t('privacy'); $('#routeSnap').textContent = t('snap');
    $('#routeSnap').hidden = !route; $('#retryRoute').hidden = Boolean(route) || !destination || ['building','locating','pickStart','pickDestination'].includes(message);
    if(shelterMode)$('#retryRoute').hidden=!shelterLocationFailed;
    $('#clearRoute').textContent=t(shelterMode?'shelterClear':'clear');
    $('#closeRoute').setAttribute('aria-label',t(shelterMode?'shelterClear':'close'));
    $('#routeMetrics').textContent = route ? `${route.distance >= 1000 ? (route.distance / 1000).toFixed(1) + ' ' + t('km') : Math.round(route.distance) + ' ' + t('m')} · ≈ ${Math.max(1, Math.round(route.duration / 60))} ${t('min')}` : '';
    if(shelterMode){$('#routePrivacy').textContent=t('shelterCaveat');$('#routeCredit').hidden=true;$('#routeMetrics').textContent=nearestInfo?(nearestInfo.distance>=1000?(nearestInfo.distance/1000).toFixed(2)+' '+t('km'):Math.round(nearestInfo.distance)+' '+t('m')):'';$('#routeDestination').textContent=nearestInfo?.feature.properties?.address||''}else $('#routeCredit').hidden=false;
    const mobile=navigator.userAgentData?.mobile ?? /Android|iPhone|iPad/i.test(navigator.userAgent);$('#openLocalhost').hidden=message!=='insecure'||mobile;$('#openLocalhost').href=`http://localhost:${location.port||80}${location.pathname}`;
    $('#routeOrigin').textContent = origin ? `A · ${t(origin.manual ? 'manual' : 'you')}` : '';
    $('#routeDestination').textContent = shelterMode?(nearestInfo?.feature.properties?.address||''):(destination ? `B · ${destination.name || t('destination')}` : '');
  }
  function clear() { if(shelterMode){originMarker?.remove();originMarker=null;origin=null} shelterMode=false;nearestInfo=null;generation++; controller?.abort(); setSelecting(null); resetGeometry(); destination = null; closePopup(); panel.hidden = true; }
  map.on('click', event => {
    if (!selecting) return;
    const point = [((event.lngLat.lng + 180) % 360 + 360) % 360 - 180, event.lngLat.lat], mode = selecting;
    if(!getRegion()){event.originalEvent.navigationHandled=true;show('regionUnavailable',true);return}
    if(!pointInRegion(point,getRegion())){event.originalEvent.navigationHandled=true;show(mode==='start'||mode==='shelterStart'?'outsideStart':'outsideDestination',true);return}
    setSelecting(null);
    if (!validMapPoint(point)) { show('outside', true); return; }
    if(mode==='shelterStart'){event.originalEvent.navigationHandled=true;generation++;controller?.abort();resetGeometry();setOrigin(point,true);showNearestShelter();return}
    if (mode === 'start') { event.originalEvent.navigationHandled = true; generation++; controller?.abort(); resetGeometry(); setOrigin(point, true); if (destination) buildRoute(destination.point, destination.name); else show('startReady'); return; }
    const layers = ['unclustered-points','shelter-points'].filter(id => map.getLayer(id));
    const feature = layers.length ? map.queryRenderedFeatures(event.point, {layers})[0] : null;
    if (feature) { show('selected'); return; }
    event.originalEvent.navigationHandled = true;
    show('selected');
    createPopup({offset: 10, maxWidth: '300px'}).setLngLat(point).setHTML(`<div class="popup"><h3>${esc(t('chosenPoint'))}</h3>${routeButton(point, t('chosenPoint'))}<p>${point[1].toFixed(5)}, ${point[0].toFixed(5)}</p></div>`).addTo(map);
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-route-point]'); if (!button) return;
    const point = button.dataset.routePoint.split(',').map(Number); buildRoute(point, button.dataset.routeName || t('chosenPoint'));
  });
  $('#openNearestShelter').addEventListener('click',()=>{
    if(!shelterMode||!nearestInfo)return;
    const result=nearestInfo;panel.hidden=true;
    const popup=createPopup({offset:12,maxWidth:'320px'}).setLngLat(result.feature.geometry.coordinates).setHTML(shelterPopupHTML(result.feature));
    popup.on('close',()=>{if(shelterMode&&nearestInfo===result){panel.hidden=false;panel.scrollTop=0;fitShelterResult()}});
    popup.addTo(map);
  });
  $('#nearestShelter').addEventListener('click',findShelter);
  $('#locate').addEventListener('click', locate); $('#mapLocate').addEventListener('click', locate);
  for (const id of ['routePick','mapRoute','chooseDestination']) $('#' + id).addEventListener('click', () => {if(!ready())return;shelterMode=false;nearestInfo=null;generation++; controller?.abort(); setSelecting('destination'); });
  $('#manualStart').addEventListener('click', () => {if(!ready())return;if(shelterMode&&getShelterState()!=='loaded'){show(getShelterState()==='error'?'shelterError':'shelterLoading',true);return}generation++; controller?.abort(); setSelecting(shelterMode?'shelterStart':'start'); });
  $('#retryRoute').addEventListener('click', () => { if(shelterMode)findShelter();else if (destination) buildRoute(destination.point, destination.name); });
  $('#clearRoute').addEventListener('click', clear); $('#closeRoute').addEventListener('click', clear);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && selecting) { setSelecting(null); route ? show('ready') : (panel.hidden = true); } });
  function routeButton(point, name) { return `<button type="button" class="route-to" data-route-point="${point.join(',')}" data-route-name="${esc(name)}">${esc(t('routeTo'))}</button>`; }
  updateLanguage();
  return {updateLanguage, routeButton};
}
