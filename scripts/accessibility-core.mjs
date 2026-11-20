export const ACCESS_FEATURES = Object.freeze({ramp:'Пандус',elevator:'Ліфт',toilet:'Доступна вбиральня',parking:'Паркування для людей з інвалідністю'});
export const ACCESS_KEYS = Object.keys(ACCESS_FEATURES);
export const DISCLAIMER = 'Наявність окремих елементів не гарантує повної доступності об’єкта';
export const OSM_SOURCE = {id:'osm',name:'OpenStreetMap',url:'https://www.openstreetmap.org/copyright',license:'ODbL-1.0'};
export function isoDate(value) {
  if(typeof value!=='string')return null;
  const match=value.match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/);if(!match)return null;
  const date=new Date(match[1]+'T00:00:00Z');return Number.isFinite(+date)&&date.toISOString().slice(0,10)===match[1]?match[1]:null;
}
export const triState = value => value==='yes'?'yes':value==='no'?'no':'unknown';
export function resolveFacts(assertions=[]) {
  const facts=assertions.map(a=>({...a,value:triState(a.value),checked_at:isoDate(a.checked_at)}));
  const known=new Set(facts.map(a=>a.value).filter(v=>v!=='unknown'));
  return {value:known.size===1?[...known][0]:'unknown',conflict:known.size>1,assertions:facts};
}
export function emptyAccessibility(){return Object.fromEntries([...ACCESS_KEYS.map(key=>[key,resolveFacts()]),['general',[]]])}
export function accessibilityOf(properties={}) {
  let model=properties.accessibility;if(typeof model==='string'){try{model=JSON.parse(model)}catch{model=null}}
  const result=emptyAccessibility();if(!model||typeof model!=='object')return result;
  for(const key of ACCESS_KEYS)result[key]=resolveFacts(Array.isArray(model[key]?.assertions)?model[key].assertions:[]);
  result.general=Array.isArray(model.general)?model.general:[];return result;
}
function checkDate(tags,key){return isoDate(tags[`check_date:${key}`])||isoDate(tags['survey:date'])}
export function accessibilityFromOSM(tags={},id='') {
  const result=emptyAccessibility(),url=/^(node|way|relation)\/\d+$/.test(id)?`https://www.openstreetmap.org/${id}`:OSM_SOURCE.url;
  const source={...OSM_SOURCE,url};
  const fact=(field,value)=>({value,field,raw:String(tags[field]),checked_at:checkDate(tags,field),source});
  for(const field of ['ramp','ramp:wheelchair'])if(field in tags)result.ramp.assertions.push(fact(field,triState(tags[field])));
  if(tags.highway==='elevator')result.elevator.assertions.push(fact('highway','yes'));
  if('toilets:wheelchair' in tags)result.toilet.assertions.push(fact('toilets:wheelchair',triState(tags['toilets:wheelchair'])));
  if('capacity:disabled' in tags){const raw=String(tags['capacity:disabled']);result.parking.assertions.push(fact('capacity:disabled',/^\d+$/.test(raw)?(Number(raw)>0?'yes':'no'):'unknown'))}
  if(tags.parking_space==='disabled')result.parking.assertions.push(fact('parking_space','yes'));
  for(const key of ACCESS_KEYS)result[key]=resolveFacts(result[key].assertions);
  if('wheelchair' in tags)result.general.push({value:['yes','no','limited'].includes(tags.wheelchair)?tags.wheelchair:'unknown',raw:String(tags.wheelchair),field:'wheelchair',checked_at:checkDate(tags,'wheelchair'),source});
  return result;
}
export function mergeAccessibility(left,right){
  const a=accessibilityOf({accessibility:left}),b=accessibilityOf({accessibility:right}),result=emptyAccessibility();
  const unique=facts=>[...new Map(facts.map(f=>[JSON.stringify([f.source?.id,f.source?.url,f.field,f.raw,f.value,f.checked_at]),f])).values()];
  for(const key of ACCESS_KEYS)result[key]=resolveFacts(unique([...a[key].assertions,...b[key].assertions]));
  result.general=unique([...a.general,...b.general]);return result;
}
export function matchesAccessibility(properties,enabled,selected=[]){
  if(!enabled)return true;const data=accessibilityOf(properties),keys=selected.filter(k=>ACCESS_KEYS.includes(k));
  return keys.length?keys.every(key=>data[key].value==='yes'):ACCESS_KEYS.some(key=>data[key].value==='yes');
}
export function matchesPlace(feature,{categories,category='',query='',searchText='',wheelchair=false,barrierEnabled=false,accessFeatures=[]}={}){
  const p=feature.properties||{};
  if(categories&&!categories.has(p._category))return false;if(category&&category!==p._category)return false;
  if(wheelchair&&p.wheelchair!=='yes')return false;
  if(query){const text=normalizeName(searchText||[p.name,p['name:uk'],p['name:en'],p['addr:full'],p.address,p['addr:street'],p['addr:housenumber']].filter(Boolean).join(' ')),words=text.split(' '),terms=normalizeName(query).split(' ').filter(Boolean);if(!terms.every(term=>/^\d+$/.test(term)?words.includes(term):text.includes(term)))return false;}
  return matchesAccessibility(p,barrierEnabled,accessFeatures);
}
export function parseBarrierParams(search){const p=new URLSearchParams(search);return {enabled:p.get('bf')==='1',selected:[...new Set((p.get('bf_features')||'').split(',').filter(k=>ACCESS_KEYS.includes(k)))].sort()}}
export function writeBarrierParams(url,state){const result=new URL(url);if(state.enabled)result.searchParams.set('bf','1');else result.searchParams.delete('bf');if(state.selected.length)result.searchParams.set('bf_features',[...state.selected].sort().join(','));else result.searchParams.delete('bf_features');return result}
export function normalizeName(value){return String(value||'').normalize('NFKC').toLocaleLowerCase('uk').replace(/[’'`]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
export function addressKey(properties){
  let street=properties['addr:street'],number=properties['addr:housenumber'];
  if(!street||!number){const full=String(properties['addr:full']||properties.address||'');const match=full.match(/^(?:м\.?\s*Полтава[,\s]+)?(.+?)[,\s]+(\d+[\p{L}]?(?:[\/-]\d+[\p{L}]?)?)\s*$/iu);if(match){street=match[1];number=match[2]}}
  if(!street||!number)return '';return normalizeName(street).replace(/(?:^|\s)(?:вул|вулиця|проспект|просп|провулок|пров)(?=\s|$)/gu,' ').replace(/\s+/g,' ').trim()+'|'+normalizeName(number);
}
export function distanceMeters(a,b){const lat=(a[1]+b[1])/2*Math.PI/180;return Math.hypot((a[0]-b[0])*Math.cos(lat),a[1]-b[1])*111195}
export function matchEntity(record,candidates){
  const id=record.properties?.['@id']||record.id,exact=id&&candidates.find(f=>(f.properties?.['@id']||f.id)===id);if(exact)return {target:exact,method:'same-id'};
  const p=record.properties||{},name=normalizeName(p['name:uk']||p.name),address=addressKey(p);
  // Name + exact street/house + geometry are required. Proximity alone never transfers an element to a venue.
  const matches=candidates.filter(f=>{const q=f.properties||{};return name&&address&&name===normalizeName(q['name:uk']||q.name)&&address===addressKey(q)&&distanceMeters(record.geometry.coordinates,f.geometry.coordinates)<=35});
  return matches.length===1?{target:matches[0],method:'name-address-coordinate'}:{target:null,method:matches.length?'ambiguous':'unmatched'};
}
export function mergeAccessRecords(base,additional){
  const output=base.map(f=>({...f,properties:{...f.properties}})),report=[];
  for(const record of additional){const match=matchEntity(record,output),p=record.properties||{};
    if(match.target){const target=match.target,existing=target.properties;target.properties={...existing,accessibility:mergeAccessibility(existing.accessibility,p.accessibility)};
      for(const key of ['wheelchair'])if(key in p)target.properties[key]=p[key];report.push({id:p['@id']||record.id,target:existing['@id']||target.id,method:match.method});
    }else{output.push({...record,properties:{...p}});report.push({id:p['@id']||record.id,target:null,method:match.method})}
  }return {features:output,report};
}
export function validateAccessDataset(data){
  if(data?.type!=='FeatureCollection'||data.schema_version!==1||!Array.isArray(data.features)||!Array.isArray(data.sources))throw new Error('Некоректний формат даних доступності');
  for(const f of data.features){if(f.geometry?.type!=='Point'||f.geometry.coordinates.length!==2||!f.geometry.coordinates.every(Number.isFinite)||!f.properties?.['@id'])throw new Error('Некоректний об’єкт доступності');
    for(const key of ACCESS_KEYS){const item=f.properties.accessibility?.[key];if(!item||!['yes','no','unknown'].includes(item.value)||!Array.isArray(item.assertions))throw new Error('Некоректні ознаки доступності');if(resolveFacts(item.assertions).value!==item.value)throw new Error('Суперечливий підсумок ознаки')}
  }return data;
}
