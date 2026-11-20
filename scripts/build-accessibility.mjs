import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pointInRegion,regionBounds} from './map-region.mjs';
import {ACCESS_KEYS,accessibilityFromOSM,mergeAccessRecords,validateAccessDataset} from './accessibility-core.mjs';
import {extractPublicState,fromGISRow,GIS_REGISTER} from './accessibility-import.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),cache=path.join(root,'.cache/accessibility');
await fs.mkdir(cache,{recursive:true});
const readJSON=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const city=(await readJSON('data/poltava-boundary.geojson')).features[0].geometry;
const refresh=process.argv.includes('--refresh'),offline=process.argv.includes('--cached');
async function resource(key,url){
  const file=path.join(cache,key+'.txt'),metaFile=path.join(cache,key+'.response.json');
  if(!refresh){try{return {body:await fs.readFile(file,'utf8'),...JSON.parse(await fs.readFile(metaFile,'utf8'))}}catch{}}
  if(offline)throw new Error(`Відсутній перевірений кеш ${key}`);
  const response=await fetch(url,{headers:{'User-Agent':'PoltavaOpenDataHackathon/1.0',Accept:'application/json,text/html,text/csv'},signal:AbortSignal.timeout(30000)});
  const metadata={url,status:response.status,content_type:response.headers.get('content-type'),retrieved_at:new Date().toISOString()};
  const body=await response.text();await fs.writeFile(file,body);await fs.writeFile(metaFile,JSON.stringify(metadata));return {body,...metadata};
}
let osm;try{if(refresh)throw Error();osm=JSON.parse(await fs.readFile(path.join(cache,'osm.json'),'utf8'))}catch{
  if(offline)throw new Error('Відсутній кеш OSM');
  const [[w,s],[e,n]]=regionBounds(city),bbox=[s,w,n,e].join(',');
  const query=`[out:json][timeout:90];(nwr["ramp"](${bbox});nwr["ramp:wheelchair"](${bbox});nwr["highway"="elevator"](${bbox});nwr["toilets:wheelchair"](${bbox});nwr["capacity:disabled"](${bbox});nwr["parking_space"="disabled"](${bbox});nwr["wheelchair"](${bbox}););out tags center;`;
  await fs.writeFile(path.join(root,'data/poltava-accessibility.overpassql'),query+'\n');
  const response=await fetch('https://www.overpass-api.de/api/interpreter?data='+encodeURIComponent(query),{headers:{'User-Agent':'PoltavaOpenDataHackathon/1.0',Accept:'application/json'},signal:AbortSignal.timeout(110000)});
  if(!response.ok)throw new Error('OSM HTTP '+response.status);osm=await response.json();if(osm.remark||!Array.isArray(osm.elements))throw new Error(osm.remark||'Некоректна відповідь OSM');await fs.writeFile(path.join(cache,'osm.json'),JSON.stringify(osm));
}
const sources=[{id:'osm',name:'OpenStreetMap',url:'https://www.openstreetmap.org/copyright',license:'ODbL-1.0',status:'connected',snapshot:osm.osm3s?.timestamp_osm_base,fields:['ramp','ramp:wheelchair','highway=elevator','toilets:wheelchair','capacity:disabled','parking_space=disabled','wheelchair'],note:'Окремі ліфти, пандуси та паркомісця не приписуються сусіднім закладам. Дата знімка бази не є датою перевірки ознаки.'}];
const extras=[],excluded={osm_outside_city:0,gis_outside_city:0,gis_missing_geometry:0},audit={schema_version:1,checked_at:new Date().toISOString(),sources,excluded};
for(const e of osm.elements){const p=e.tags||{},center=e.type==='node'?e:e.center;if(!center)continue;const point=[center.lon,center.lat];if(!pointInRegion(point,city)){excluded.osm_outside_city++;continue}
  const id=`${e.type}/${e.id}`,kind=p.highway==='elevator'?'Ліфт':p.parking_space==='disabled'?'Паркомісце для людей з інвалідністю':p.amenity==='parking'?'Паркування':p.amenity==='toilets'?'Вбиральня':p.highway==='steps'?'Сходи / пандус':p.entrance?'Вхід':'Об’єкт доступності';
  extras.push({type:'Feature',id,properties:{'@id':id,...p,...(!(p.name||p['name:uk'])?{name:kind}:{}),_source_url:`https://www.openstreetmap.org/${id}`,accessibility:accessibilityFromOSM(p,id)},geometry:{type:'Point',coordinates:point}});
}
try{
  const exported=await resource('gis-export-verified','https://mbk.rada-poltava.gov.ua/api/gis-export/register/3478674593428801516?format=geojson');
  if(exported.status!==200)throw Error('HTTP '+exported.status);const geo=JSON.parse(exported.body);if(!Array.isArray(geo.features))throw Error('Немає GeoJSON');
  const fields=[...new Set(geo.features.flatMap(f=>Object.keys(f.properties||{})))];
  const csv=await resource('gis-csv-verified','https://mbk.rada-poltava.gov.ua/api/gis-export/register/3478674593428801516?format=csv');
  const all=[];let total=1,limit=100;
  for(let page=1;(page-1)*limit<total;page++){
    if(page>50)throw Error('Непередбачена пагінація');
    const response=await resource(`gis-list-${page}`,`https://mbk.rada-poltava.gov.ua/objects/1db366f8fed34b4c843c20157210762f?limit=100&page=${page}`);
    if(response.status!==200)throw Error('HTTP '+response.status);const data=extractPublicState(response.body).store.data;total=Number(data.total);limit=Number(data.limit);if(!limit||!Array.isArray(data.rows))throw Error('Змінився формат реєстру');all.push(...data.rows);
  }
  for(const row of all){const f=fromGISRow(row);if(!f){excluded.gis_missing_geometry++;continue}if(!pointInRegion(f.geometry.coordinates,city)){excluded.gis_outside_city++;continue}extras.push(f)}
  sources.push({id:'poltava-gis',name:'ГІС Полтавської міської ради',url:GIS_REGISTER,license:'Портал вимагає посилання при використанні матеріалів. Окрема відкрита ліцензія не заявлена.',status:'general_only',retrieved_at:exported.retrieved_at,fields,csv_status:csv.status,csv_columns:csv.body.split(/\r?\n/)[0],register_rows:all.length,export_features:geo.features.length,note:'GeoJSON/CSV містять лише дату, адресу та загальну оцінку. Пандус, ліфт, вбиральня й паркування з цієї оцінки не виводяться. Імена, ID та координати взяті з публічного реєстру; контакти людей не імпортуються.'});
}catch(error){if(offline)throw error;sources.push({id:'poltava-gis',name:'ГІС Полтавської міської ради',url:GIS_REGISTER,status:'unavailable',note:error.message})}
const ckanURL='https://data.gov.ua/api/3/action/package_show?id=38997a1f-2e86-4bd7-9054-cd9cd206d825';
let ckan;try{ckan=await resource('ckan-verified',ckanURL);sources.push({id:'mindev-open-data',name:'Відкриті дані моніторингу безбар’єрності',url:'https://data.gov.ua/dataset/38997a1f-2e86-4bd7-9054-cd9cd206d825',status:ckan.status===200?'needs_review':'unavailable',http_status:ckan.status,retrieved_at:ckan.retrieved_at,note:ckan.status===200?'Доступ відновився: перевірте ресурси, ліцензію та mapping перед імпортом.':'Сторінка та CKAN API повертають 403; файли, поля й ліцензія недоступні для перевірки.'})}catch(error){sources.push({id:'mindev-open-data',name:'Відкриті дані моніторингу безбар’єрності',url:ckanURL,status:'unavailable',note:error.message})}
try{const lun=await resource('lun-verified','https://lun.ua/misto/barrier-free');sources.push({id:'lun',name:'ЛУН / Мінрозвитку — пріоритетне джерело',url:'https://lun.ua/misto/barrier-free',status:'export_unavailable',http_status:lun.status,retrieved_at:lun.retrieved_at,license:null,note:'Сайт доступний і посилається на відкритий набір data.gov.ua за 2025 рік. Цей експорт зараз повертає 403. Окрему ліцензію/публічний експорт чотирьох ознак на сайті не встановлено; непідтверджені дані ЛУН не копіюються. Адаптер accessibility-import.mjs приймає перевірений експорт з явним mapping і ліцензією.'})}catch(error){sources.push({id:'lun',name:'ЛУН / Мінрозвитку',url:'https://lun.ua/misto/barrier-free',status:'unavailable',note:error.message})}
// Optional imports must have been normalized by import-accessibility.mjs with a licensed explicit mapping.
for(const file of process.argv.filter(a=>a.startsWith('--import='))){const input=await readJSON(file.slice(9));validateAccessDataset(input);extras.push(...input.features.filter(f=>pointInRegion(f.geometry.coordinates,city)));for(const source of input.sources){const i=sources.findIndex(s=>s.id===source.id);if(i>=0)sources.splice(i,1);sources.push({...source,status:'connected',note:'Імпортовано перевірений локальний файл з явним mapping полів.'})}}
const baseline=new Map();for(const file of ['data/poltava-poi.geojson','data/poltava-recreation.geojson'])for(const f of (await readJSON(file)).features)if(f.geometry?.type==='Point'&&pointInRegion(f.geometry.coordinates,city))baseline.set(f.properties['@id']||f.id,f);
const merged=mergeAccessRecords([...baseline.values()],extras),features=merged.features.filter(f=>f.properties.accessibility);
const counts={objects:features.length,any_confirmed:features.filter(f=>ACCESS_KEYS.some(k=>f.properties.accessibility[k].value==='yes')).length,...Object.fromEntries(ACCESS_KEYS.map(key=>[key,features.filter(f=>f.properties.accessibility[key].value==='yes').length]))};
audit.counts=counts;audit.matching=merged.report;
const output={type:'FeatureCollection',schema_version:1,city:{name:'Полтава',osm_relation:1641691,boundary:'poltava-boundary.geojson'},built_at:new Date().toISOString(),sources,counts,excluded,features};validateAccessDataset(output);
await fs.writeFile(path.join(root,'data/poltava-accessibility.geojson'),JSON.stringify(output,null,2)+'\n');
await fs.writeFile(path.join(root,'data/accessibility-source-audit.json'),JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({counts,excluded,matches:merged.report.reduce((a,r)=>(a[r.method]=(a[r.method]||0)+1,a),{})}));
