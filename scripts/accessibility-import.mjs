import {ACCESS_KEYS,emptyAccessibility,resolveFacts,isoDate} from './accessibility-core.mjs';
export const GIS_REGISTER = 'https://mbk.rada-poltava.gov.ua/registers/1db366f8fed34b4c843c20157210762f';
export function extractPublicState(html){
  const marker='window.__pinia =',offset=html.indexOf(marker);if(offset<0)throw new Error('Публічний стан реєстру відсутній');
  const start=html.indexOf('{',offset+marker.length);let depth=0,quoted=false,escape=false;
  for(let i=start;i<html.length;i++){const c=html[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth)return JSON.parse(html.slice(start,i+1).replace(/:\s*undefined(?=[,}])/g,':null'))}
  throw new Error('Неповний стан реєстру');
}
export function fromGISRow(row){
  if(!row.id||row.geom?.type!=='Point')return null;
  const url=`https://mbk.rada-poltava.gov.ua/object-page/1db366f8fed34b4c843c20157210762f?id=${encodeURIComponent(row.id)}`;
  const source={id:'poltava-gis',name:'ГІС Полтавської міської ради',url,license:'Умови порталу: обов’язкове посилання на джерело; окрема відкрита ліцензія не вказана'};
  const accessibility=emptyAccessibility(),raw=row.results_text||row.results||'';
  const value=/безбар.?єрним/i.test(raw)?'yes':/частков/i.test(raw)?'limited':/є бар.?єрним/i.test(raw)?'no':'unknown';
  if(raw)accessibility.general.push({value,raw,field:'results',checked_at:isoDate(row.date_ex),source});
  // The verified municipal export has no ramp/elevator/toilet/parking columns.
  // Even a general "barrier-free" verdict confirms none of those four elements.
  return {type:'Feature',id:`gis/${row.id}`,properties:{'@id':`gis/${row.id}`,name:row.name_service||'Обстежений об’єкт','addr:full':row.address||'','_source_url':url,accessibility},geometry:row.geom};
}
const get=(obj,path)=>String(path||'').split('.').filter(Boolean).reduce((v,key)=>v?.[key],obj);
export function parseCSV(text,delimiter=';'){
  const rows=[];let row=[],cell='',quoted=false;const data=text.replace(/^\uFEFF/,'');
  for(let i=0;i<data.length;i++){const c=data[i];if(c==='"'){if(quoted&&data[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===delimiter&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&data[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell=''}else cell+=c}
  if(quoted)throw new Error('Незакрите поле CSV');row.push(cell);if(row.some(v=>v!==''))rows.push(row);const headers=rows.shift()||[];return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]||''])));
}
// For a future licensed LUN/data.gov.ua export. Mapping is supplied explicitly;
// no undocumented field names or general-to-element inference is built in.
export function adaptMappedRecords(input,mapping){
  const source=mapping?.source;
  if(!source?.id||!source.name||!/^https:\/\//.test(source.url||'')||!source.license)throw new Error('Для імпорту потрібні джерело, URL та перевірена ліцензія');
  const rows=input.type==='FeatureCollection'?input.features:Array.isArray(input)?input:null;if(!rows)throw new Error('Потрібен GeoJSON або масив записів');
  return rows.map((row,index)=>{
    const p=row.type==='Feature'?row.properties:row,id=get(p,mapping.id);
    const coordinate=value=>value===undefined||value===null||String(value).trim()===''?NaN:Number(value);
    const coordinates=row.geometry?.type==='Point'?row.geometry.coordinates:[coordinate(get(p,mapping.longitude)),coordinate(get(p,mapping.latitude))];
    if(id===undefined||id===null||id===''||!coordinates?.every(Number.isFinite))throw new Error(`Некоректний ID або координати в рядку ${index+1}`);
    const accessibility=emptyAccessibility(),checked=isoDate(get(p,mapping.checked_at));
    for(const key of ACCESS_KEYS){const config=mapping.features?.[key];if(!config)continue;const raw=get(p,config.field);if(raw===undefined||raw===null||raw==='')continue;
      const value=(config.yes||['yes']).includes(raw)?'yes':(config.no||['no']).includes(raw)?'no':'unknown';
      accessibility[key]=resolveFacts([{value,raw:String(raw),field:config.field,source,checked_at:isoDate(get(p,config.checked_at))||checked}]);
    }
    const general=get(p,mapping.general);if(general!==undefined&&general!==null&&general!=='')accessibility.general.push({value:'unknown',raw:String(general),field:mapping.general,source,checked_at:checked});
    return {type:'Feature',id:`${source.id}/${id}`,properties:{'@id':`${source.id}/${id}`,name:String(get(p,mapping.name)||'Обстежений об’єкт'),'addr:full':String(get(p,mapping.address)||''),_source_url:source.url,accessibility},geometry:{type:'Point',coordinates}};
  });
}
