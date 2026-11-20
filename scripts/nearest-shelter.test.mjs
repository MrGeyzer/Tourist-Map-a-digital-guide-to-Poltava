import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nearestShelter,mountNavigation} from './map-navigation.mjs';
import {pointInRegion} from './map-region.mjs';

const region={type:'Polygon',coordinates:[[[34.5,49.5],[34.6,49.5],[34.6,49.6],[34.5,49.6],[34.5,49.5]]]};
const feature=(id,coordinates)=>({type:'Feature',id,properties:{address:`Адреса ${id}`},geometry:{type:'Point',coordinates}});

test('nearest shelter ignores list order, malformed points and points outside the allowed city',()=>{
  const close=feature('close',[34.55,49.551]),far=feature('far',[34.58,49.58]);
  const result=nearestShelter([34.55,49.55],[far,feature('outside',[34.61,49.55]),feature('bad',[NaN,49.55]),close],region);
  assert.equal(result.feature,close);assert.ok(result.distance>100&&result.distance<120);
  assert.equal(nearestShelter([34.55,49.55],[],region),null);
  assert.equal(nearestShelter([34.55,49.55],[feature('same',[34.55,49.55])],region).distance,0);
  assert.throws(()=>nearestShelter([34.61,49.55],[close],region),/outsideRegion/);
});

test('nearest shelter works with the real municipal data and exact city boundary',()=>{
  const city=JSON.parse(fs.readFileSync(new URL('../data/poltava-boundary.geojson',import.meta.url))).features[0].geometry;
  const shelters=JSON.parse(fs.readFileSync(new URL('../data/poltava-shelters.geojson',import.meta.url))).features;
  const result=nearestShelter([34.5514,49.5883],shelters,city);
  assert.ok(result);assert.ok(pointInRegion(result.feature.geometry.coordinates,city));
  assert.ok(Number.isFinite(result.distance));
});

// Exercise the actual controller without requesting the user's GPS or any routing API.
function harness(t,{fail=false,point=[34.55,49.55],state='loaded'}={}){
  const nodes=new Map(),handlers={},markers=[],popups=[];
  const node=()=>({hidden:false,textContent:'',style:{},dataset:{},classList:{toggle(){}},events:{},setAttribute(){},addEventListener(name,fn){this.events[name]=fn},offsetHeight:120});
  const $=selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)};
  const document={documentElement:{lang:'uk'},querySelector:$,createElement:node,addEventListener(){},permissionsPolicy:{allowsFeature:()=>true}};
  let gpsRequests=0;
  const navigator={permissions:{query:async()=>({state:fail?'denied':'granted'})},geolocation:{getCurrentPosition(ok,bad){gpsRequests++;if(fail)bad({code:1});else ok({coords:{longitude:point[0],latitude:point[1]}})}}};
  for(const [key,value] of Object.entries({document,navigator,window:{isSecureContext:true},location:{port:'8002',pathname:'/'},matchMedia:()=>({matches:false})})){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]});
  }
  const map={on(name,fn){handlers[name]=fn},getLayer:()=>true,getSource:()=>null,getCanvas:node,getContainer:()=>({clientHeight:700}),fitBounds(){},flyTo(){}};
  class Marker{constructor({element}){this.element=element;markers.push(this)}setLngLat(p){this.point=p;return this}addTo(){return this}remove(){this.removed=true}}
  class Bounds{extend(){return this}}
  const shelter=feature('nearest',[34.55,49.551]);
  mountNavigation({map,maplibregl:{Marker,LngLatBounds:Bounds},createPopup:()=>({on(){return this},setLngLat(p){this.point=p;return this},setHTML(html){this.html=html;return this},addTo(){popups.push(this);return this}}),setPanelOpen(){},esc:String,closePopup(){},getRegion:()=>region,getRegionState:()=> 'loaded',getShelters:()=>[shelter],getShelterState:()=>state,shelterPopupHTML:f=>f.properties.address});
  return {$,handlers,markers,popups,get gpsRequests(){return gpsRequests}};
}

test('GPS success marks both points and displays distance; details open separately without covering the result',async t=>{
  const h=harness(t);await h.$('#nearestShelter').events.click();
  assert.equal(h.gpsRequests,1);assert.equal(h.popups.length,0);
  assert.equal(h.$('#openNearestShelter').hidden,false);h.$('#openNearestShelter').events.click();
  assert.equal(h.$('#routePanel').hidden,true);assert.equal(h.popups[0].html,'Адреса nearest');
  assert.deepEqual(h.markers.map(m=>m.element.textContent),['A','У']);
  assert.match(h.$('#routeMessage').textContent,/Знайдено найближче укриття/);
  assert.match(h.$('#routeMetrics').textContent,/\d+ м/);
});

test('GPS denial offers manual selection; an outside click is rejected and an inside click finds a shelter without GPS',async t=>{
  const h=harness(t,{fail:true});await h.$('#nearestShelter').events.click();
  assert.match(h.$('#routeMessage').textContent,/Вибрати моє місце на карті/);
  assert.equal(h.$('#retryRoute').hidden,false);assert.equal(h.popups.length,0);
  h.$('#manualStart').events.click();
  h.handlers.click({lngLat:{lng:34.7,lat:49.55},originalEvent:{}});
  assert.match(h.$('#routeMessage').textContent,/лише в межах міста Полтави/);
  assert.equal(h.popups.length,0);
  h.handlers.click({lngLat:{lng:34.55,lat:49.55},originalEvent:{}});
  assert.equal(h.$('#openNearestShelter').hidden,false);h.$('#openNearestShelter').events.click();
  assert.equal(h.popups[0].html,'Адреса nearest');assert.equal(h.gpsRequests,1);
});

test('a GPS position outside Poltava cannot be used for shelter search',async t=>{
  const h=harness(t,{point:[30.52,50.45]});await h.$('#nearestShelter').events.click();
  assert.equal(h.popups.length,0);assert.equal(h.markers.length,0);
  assert.match(h.$('#routeMessage').textContent,/Ви за межами міста Полтави/);
});

test('failed shelter data produces an error without requesting GPS',async t=>{
  const h=harness(t,{state:'error'});await h.$('#nearestShelter').events.click();
  assert.equal(h.gpsRequests,0);assert.match(h.$('#routeMessage').textContent,/Не вдалося завантажити укриття/);
});
