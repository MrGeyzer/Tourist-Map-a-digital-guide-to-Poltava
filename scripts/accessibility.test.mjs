import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ACCESS_KEYS,emptyAccessibility,accessibilityFromOSM,accessibilityOf,resolveFacts,mergeAccessibility,matchesAccessibility,matchesPlace,parseBarrierParams,writeBarrierParams,matchEntity,mergeAccessRecords,validateAccessDataset} from './accessibility-core.mjs';
import {adaptMappedRecords,fromGISRow,parseCSV,extractPublicState} from './accessibility-import.mjs';
import {pointInRegion} from './map-region.mjs';
import {accessibilityCard} from './accessibility-ui.mjs';
const source={id:'test-source',name:'Тестове джерело — лише автоматичні перевірки',url:'https://example.org/data',license:'CC0'};
const fact=value=>({value,field:'test',raw:value,source,checked_at:null});
const properties=(values={})=>({accessibility:{...emptyAccessibility(),...Object.fromEntries(Object.entries(values).map(([key,value])=>[key,resolveFacts([fact(value)])]))}});
const feature=(id,name,address,coordinates=[34.55,49.59],props={})=>({type:'Feature',id,properties:{'@id':id,name,'addr:full':address,...props},geometry:{type:'Point',coordinates}});

test('barrier mode uses AND and defaults to any confirmed element; unknown/no never confirm a feature',()=>{
  const p=properties({ramp:'yes',elevator:'yes',toilet:'unknown',parking:'no'});
  assert.equal(matchesAccessibility(p,true,[]),true);
  assert.equal(matchesAccessibility(p,true,['ramp','elevator']),true);
  assert.equal(matchesAccessibility(p,true,['ramp','toilet']),false);
  assert.equal(matchesAccessibility(p,true,['ramp','parking']),false);
  assert.equal(matchesAccessibility(properties(),true,[]),false);
  assert.equal(matchesAccessibility(properties({parking:'no'}),true,[]),false);
  assert.equal(matchesAccessibility(properties(),false,['ramp']),true);
});
test('all 16 feature combinations follow AND for every yes/no/unknown input',()=>{
  for(const values of ['yes','no','unknown'].flatMap(a=>['yes','no','unknown'].flatMap(b=>['yes','no','unknown'].flatMap(c=>['yes','no','unknown'].map(d=>[a,b,c,d]))))){
    const p=properties(Object.fromEntries(ACCESS_KEYS.map((key,i)=>[key,values[i]])));
    for(let mask=0;mask<16;mask++){const keys=ACCESS_KEYS.filter((_,i)=>mask&(1<<i));const expected=keys.length?keys.every(key=>values[ACCESS_KEYS.indexOf(key)]==='yes'):values.includes('yes');assert.equal(matchesAccessibility(p,true,keys),expected)}
  }
});
test('general wheelchair=yes never creates ramp/elevator/toilet/parking evidence',()=>{
  const data=accessibilityFromOSM({wheelchair:'yes'},'node/1');
  for(const key of ACCESS_KEYS)assert.equal(data[key].value,'unknown');
  assert.equal(data.general[0].value,'yes');assert.equal(matchesAccessibility({accessibility:data},true),false);
});
test('explicit OSM tags retain provenance, dates, numeric disabled capacity and conflicts',()=>{
  const data=accessibilityFromOSM({ramp:'yes','ramp:wheelchair':'no',highway:'elevator','toilets:wheelchair':'yes','capacity:disabled':'0','check_date:toilets:wheelchair':'2025-04-01',check_date:'2026-11-19'},'way/123');
  assert.equal(data.ramp.value,'unknown');assert.equal(data.ramp.conflict,true);
  assert.equal(data.elevator.value,'yes');assert.equal(data.parking.value,'no');
  assert.equal(data.toilet.assertions[0].checked_at,'2025-04-01');assert.equal(data.elevator.assertions[0].checked_at,null);
  assert.equal(data.elevator.assertions[0].source.url,'https://www.openstreetmap.org/way/123');
  assert.equal(accessibilityFromOSM({'capacity:disabled':'2'}).parking.value,'yes');
  assert.equal(accessibilityFromOSM({'capacity:disabled':'unknown'}).parking.value,'unknown');
  assert.equal(accessibilityFromOSM({parking_space:'disabled'}).parking.value,'yes');
});
test('barrier filters intersect name, categories, old wheelchair filter, and enabled map layers',()=>{
  const f=feature('node/1','Банк','Соборності, 1',[34.55,49.59],{_category:'accessibility',wheelchair:'yes',...properties({ramp:'yes'})});
  const options={categories:new Set(['accessibility']),query:'банк',barrierEnabled:true,accessFeatures:['ramp'],wheelchair:true};
  assert.equal(matchesPlace(f,options),true);
  for(const change of [{query:'музей'},{category:'food'},{categories:new Set()},{accessFeatures:['toilet']}])assert.equal(matchesPlace(f,{...options,...change}),false);
  assert.equal(matchesPlace({...f,properties:{...f.properties,wheelchair:'unknown'}},options),false);
});
test('conflicting sources are retained and are excluded from confirmed matches',()=>{
  const merged=mergeAccessibility(properties({ramp:'yes'}).accessibility,properties({ramp:'no'}).accessibility);
  assert.equal(merged.ramp.value,'unknown');assert.equal(merged.ramp.conflict,true);assert.equal(merged.ramp.assertions.length,2);
  assert.equal(matchesAccessibility({accessibility:merged},true,['ramp']),false);
  assert.equal(mergeAccessibility(merged,merged).ramp.assertions.length,2);
});
test('coordinates alone, a shared address, or a neighboring elevator never merge separate venues',()=>{
  const cafe=feature('node/1','Кафе','вул. Соборності, 1'),lift=feature('node/2','Ліфт','вул. Соборності, 1',[34.55001,49.59],properties({elevator:'yes'}));
  assert.equal(matchEntity(lift,[cafe]).target,null);
  const merged=mergeAccessRecords([cafe],[lift]);assert.equal(merged.features.length,2);assert.equal(accessibilityOf(merged.features[0].properties).elevator.value,'unknown');
  assert.equal(matchEntity(feature('gis/2','Інший заклад','Соборності, 1'),[cafe]).target,null);
});
test('matching requires an exact ID or a unique matching name, address and nearby coordinate',()=>{
  const osm=feature('node/1','Музей','Соборності, 1'),gis=feature('gis/5','МУЗЕЙ','м. Полтава, вул. Соборності, 1',[34.55005,49.59]);
  assert.equal(matchEntity(gis,[osm]).method,'name-address-coordinate');
  assert.equal(matchEntity({...gis,geometry:{type:'Point',coordinates:[34.56,49.60]}},[osm]).target,null);
  assert.equal(matchEntity(gis,[osm,{...osm,id:'way/2',properties:{...osm.properties,'@id':'way/2'}}]).method,'ambiguous');
  assert.equal(mergeAccessRecords([osm],[{...osm,properties:{...osm.properties,...properties({ramp:'yes'})}}]).features.length,1);
});
test('municipal general verdict and its survey date confirm none of the four features',()=>{
  const f=fromGISRow({id:'1',name_service:'Тестова установа',date_ex:'2024-09-04',results_text:"Об’єкт є безбар'єрним",geom:{type:'Point',coordinates:[34.55,49.59]}});
  assert.equal(f.properties.accessibility.general[0].checked_at,'2024-09-04');
  assert.equal(f.properties.accessibility.general[0].value,'yes');
  for(const key of ACCESS_KEYS)assert.equal(f.properties.accessibility[key].value,'unknown');
});
test('future LUN/open-data import requires a license and explicit per-feature mapping',()=>{
  assert.throws(()=>adaptMappedRecords([],{source:{id:'lun'}}),/ліцензія/);
  const rows=parseCSV('id;name;lon;lat;summary;has_ramp;date\n1;"Назва; із крапкою";34.55;49.59;Безбар’єрний;Так;2025-03-11');
  const mapping={source,id:'id',name:'name',longitude:'lon',latitude:'lat',general:'summary',checked_at:'date',features:{ramp:{field:'has_ramp',yes:['Так'],no:['Ні']}}};
  const f=adaptMappedRecords(rows,mapping)[0];assert.equal(f.properties.name,'Назва; із крапкою');assert.equal(f.properties.accessibility.ramp.value,'yes');
  assert.equal(f.properties.accessibility.elevator.value,'unknown');assert.equal(f.properties.accessibility.ramp.assertions[0].checked_at,'2025-03-11');
  assert.throws(()=>parseCSV('id;name\n1;"broken'),/Незакрите/);
});
test('URL round trip preserves only known, independent feature keys and unrelated parameters',()=>{
  const state=parseBarrierParams('?bf=1&bf_features=toilet,ramp,ramp,bogus');assert.deepEqual(state,{enabled:true,selected:['ramp','toilet']});
  const url=writeBarrierParams('https://example.org/map/?q=банк',state);assert.equal(url.searchParams.get('q'),'банк');assert.deepEqual(parseBarrierParams(url.search),state);
  const cleared=writeBarrierParams(url,{enabled:false,selected:[]});assert.equal(cleared.searchParams.has('bf'),false);assert.equal(cleared.searchParams.has('bf_features'),false);
});
test('cards show four text states, missing dates, source conflicts and escaped external text',()=>{
  const p=properties({ramp:'yes'});p.accessibility.general=[{raw:'<script>bad()</script>',field:'summary',value:'unknown',checked_at:null,source}];
  const html=accessibilityCard(p);for(const name of ['Пандус','Ліфт','Доступна вбиральня','Паркування для людей з інвалідністю','Немає даних','Загальна оцінка'])assert.ok(html.includes(name));
  assert.ok(html.includes('&lt;script&gt;'));assert.equal(html.includes('<script>'),false);assert.ok(html.includes('Наявність окремих елементів не гарантує'));
});
test('published real data has unique canonical IDs, exact city geometry and reproducible counts',()=>{
  const data=validateAccessDataset(JSON.parse(fs.readFileSync(new URL('../data/poltava-accessibility.geojson',import.meta.url))));
  const city=JSON.parse(fs.readFileSync(new URL('../data/poltava-boundary.geojson',import.meta.url))).features[0].geometry;
  assert.equal(new Set(data.features.map(f=>f.properties['@id'])).size,data.features.length);
  for(const f of data.features)assert.equal(pointInRegion(f.geometry.coordinates,city),true);
  for(const key of ACCESS_KEYS)assert.equal(data.counts[key],data.features.filter(f=>f.properties.accessibility[key].value==='yes').length);
  assert.equal(data.counts.any_confirmed,data.features.filter(f=>matchesAccessibility(f.properties,true,[])).length);
  assert.equal(data.sources.find(s=>s.id==='lun').status,'export_unavailable');
  assert.equal(pointInRegion([34.56,49.7],city),false);
});
test('empty data is valid while malformed/failed loads must not fabricate confirmations',()=>{
  assert.equal(validateAccessDataset({type:'FeatureCollection',schema_version:1,features:[],sources:[]}).features.length,0);
  assert.throws(()=>validateAccessDataset({features:[]}),/Некоректний/);
  assert.equal(matchesAccessibility({},true,[]),false);
  assert.throws(()=>extractPublicState('<html>not a dataset</html>'),/відсутній/);
});

test('address search ignores commas and case, combines street and house, and distinguishes 36 from 136',()=>{
  const item=feature('address-test','Місце','м. Полтава, вул. Соборності, 36');
  assert.equal(matchesPlace(item,{query:'СОБОРНОСТІ 36'}),true);
  assert.equal(matchesPlace(item,{query:'36, Соборності'}),true);
  assert.equal(matchesPlace(item,{query:'вул. Соборності, 36'}),true);
  assert.equal(matchesPlace(feature('other','Інше','Соборності, 136'),{query:'Соборності 36'}),false);
  assert.equal(matchesPlace(item,{query:'Соборності 36',category:'food'}),false);
});
