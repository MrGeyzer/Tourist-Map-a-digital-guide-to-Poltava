import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createMapStyle,OFFLINE_BOUNDS,baseLayers} from './map-style.mjs';
const template=await fs.readFile(new URL('./sw-template.js',import.meta.url),'utf8');
function worker({failure=null,scope='https://example.test/project/'}={}){
  const listeners={},storage=new Map(),messages=[];let disconnected=false,requests=0;
  const key=value=>typeof value==='string'?value:value.url;
  const caches={async keys(){return [...storage.keys()]},async delete(name){return storage.delete(name)},async open(name){if(!storage.has(name))storage.set(name,new Map());const map=storage.get(name);return {async put(url,response){map.set(key(url),response.clone())},async match(url){return map.get(key(url))?.clone()}}}};
  const files=['index.html','scripts/pwa.mjs','data/poltava-shelters.geojson','vendor/maplibre-gl-worker.mjs','data/offline/tiles/14/9762/5580.pbf'];
  const self={registration:{scope},clients:{async matchAll(){return[{postMessage:m=>messages.push(m)}]},async claim(){}},skipWaiting(){},addEventListener(type,fn){listeners[type]=fn}};
  vm.runInNewContext('const BUILD_VERSION="test";\n'+template,{self,caches,URL,Response,fetch:async input=>{
    requests++;if(disconnected)throw new Error('offline');const url=String(input.url||input);
    if(url.endsWith('offline-files.json'))return Response.json({version:'test',files});
    if(failure&&url.endsWith(failure))return new Response('failure',{status:503});
    return new Response(url.endsWith('index.html')?'saved app':'saved data');
  }});
  return {storage,caches,messages,scope,files,get requests(){return requests},offline(){disconnected=true},async event(type,values={}){let promise;listeners[type]({...values,waitUntil(p){promise=p},respondWith(p){promise=p}});return promise}};
}
test('worker caches complete first-open package and serves a filtered navigation and shelter data without a network',async()=>{
  const w=worker();await w.event('install');await w.event('activate');w.offline();const count=w.requests;
  const page=await w.event('fetch',{request:{url:w.scope+'?bf=1&q=park',method:'GET',mode:'navigate'}});
  assert.equal(await page.text(),'saved app');
  const data=await w.event('fetch',{request:{url:w.scope+'data/poltava-shelters.geojson?x=1',method:'GET',mode:'cors'}});
  assert.equal(await data.text(),'saved data');assert.equal(w.requests,count);
  let status;await w.event('message',{data:{type:'STATUS'},ports:[{postMessage:m=>status=m}]});
  assert.equal(status.ready,true);assert.equal(status.files,w.files.length);
});
test('an incomplete or quota-failed download never announces ready or deletes the older usable version',async()=>{
  const w=worker({failure:'scripts/pwa.mjs'});const old='poltava-pwa:'+w.scope+':old';await w.caches.open(old);
  await assert.rejects(w.event('install'),/Не завантажено/);
  assert.equal(w.storage.size,1);assert.ok(w.storage.has(old));assert.ok(w.messages.some(m=>m.type==='PWA_ERROR'));assert.ok(!w.messages.some(m=>m.type==='PWA_SAVED'));
});
test('activation removes only old versions in this app scope, retaining other sites and project subfolders',async()=>{
  const w=worker();await w.caches.open('another-app');await w.caches.open('poltava-pwa:https://example.test/other/:old');await w.caches.open('poltava-pwa:'+w.scope+':old');
  await w.event('install');await w.event('activate');
  assert.ok(w.storage.has('another-app'));assert.ok(w.storage.has('poltava-pwa:https://example.test/other/:old'));assert.ok(!w.storage.has('poltava-pwa:'+w.scope+':old'));
});
test('routing service, other origins, non-GET and service-worker updates are never cached as application data',async()=>{
  const w=worker();for(const request of [{url:'https://routing.openstreetmap.de/route',method:'GET'},{url:'https://example.test/other/',method:'GET'},{url:w.scope+'sw.js',method:'GET'},{url:w.scope+'offline-files.json',method:'GET'},{url:w.scope,method:'POST'}])assert.equal(await w.event('fetch',{request}),undefined);
});
test('offline basemap has entirely local tile and glyph URLs, remains bounded, and themes preserve layer identities',()=>{
  const style=createMapStyle('https://example.test/repo/',{offline:true,dark:true});
  assert.equal(style.glyphs,'https://example.test/repo/data/offline/fonts/{fontstack}/{range}.pbf');
  for(const source of Object.values(style.sources)){assert.equal(source.url,undefined);assert.ok(source.tiles.every(url=>url.startsWith('https://example.test/repo/')))}
  assert.deepEqual(style.sources.offline.bounds,OFFLINE_BOUNDS);assert.equal(style.sources.online.bounds,undefined);
  assert.deepEqual(baseLayers('offline',false).map(l=>l.id),baseLayers('offline',true).map(l=>l.id));
  assert.notEqual(baseLayers('offline',false)[0].paint['fill-color'],baseLayers('offline',true)[0].paint['fill-color']);
});
test('manifest uses project-relative scope and start URL and install icons have actual declared PNG dimensions',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.scope,'./');assert.equal(manifest.id,'./');assert.ok(manifest.start_url.startsWith('./'));assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons){const data=await fs.readFile(new URL('../'+icon.src,import.meta.url));const size=Number(icon.sizes.split('x')[0]);assert.equal(data.readUInt32BE(16),size);assert.equal(data.readUInt32BE(20),size)}
});
test('offline package includes renderer worker, styles, every centre tile, Cyrillic glyphs and all local photos',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../offline-files.json',import.meta.url),'utf8'));
  for(const file of ['vendor/maplibre-gl-worker.mjs','vendor/maplibre-gl.mjs','vendor/maplibre-gl.css','styles/theme.css','data/poltava-shelters.geojson','data/poltava-accessibility.geojson','data/offline/fonts/Noto Sans Bold/1024-1279.pbf'])assert.ok(manifest.files.includes(file),file);
  const meta=JSON.parse(await fs.readFile(new URL('../data/offline/metadata.json',import.meta.url),'utf8'));
  assert.equal(manifest.files.filter(f=>f.startsWith('data/offline/tiles/')).length,meta.tiles);assert.ok(meta.tiles<=3000&&meta.tile_bytes<=50*1024*1024);
  for(const file of manifest.files)await fs.access(new URL('../'+file,import.meta.url));
});


test('offline status distinguishes not saved, progress, verified receipt and failed updates',async()=>{
  const {offlineStatusView:view}=await import('./offline-status.mjs');
  assert.equal(view({phase:'local'}).ready,false);
  assert.equal(view({phase:'local'}).action,'save');
  assert.equal(view({phase:'saving',done:40,total:80}).percent,50);
  assert.equal(view({phase:'saving',done:40,total:80}).ready,false);
  assert.match(view({phase:'ready',ready:true,savedAt:'2026-11-20T10:00:00Z'}).detail,/20.11.26/);
  assert.equal(view({phase:'error',ready:true}).ready,true);
  assert.match(view({phase:'error',ready:true}).detail,/Попередня збережена копія/);
  assert.equal(view({phase:'incomplete'}).ready,false);
});

test('status rejects a previously complete cache after a saved file is removed; repair restores it',async()=>{
  const w=worker();await w.event('install');
  const cache=[...w.storage.values()][0];cache.delete(w.scope+'data/poltava-shelters.geojson');
  let status;const ask=()=>w.event('message',{data:{type:'STATUS'},ports:[{postMessage:m=>status=m}]});
  await ask();assert.equal(status.ready,false);assert.equal(status.missing,1);
  await w.event('message',{data:{type:'REPAIR'}});await ask();assert.equal(status.ready,true);assert.equal(status.missing,0);
});
