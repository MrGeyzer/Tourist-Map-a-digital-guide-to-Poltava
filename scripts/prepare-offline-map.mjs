import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const headers={'User-Agent':'PoltavaPoruch-Offline/1.0 (Poltava city centre offline package)'};
const bounds=[34.50,49.55,34.61,49.62],minzoom=10,maxzoom=14;
async function download(url,file){
  const dest=path.join(root,file);
  if(!process.argv.includes('--refresh'))try{await fs.access(dest);return (await fs.stat(dest)).size}catch{}
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error(`${response.status}: ${url}`);
  const body=Buffer.from(await response.arrayBuffer());await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,body);return body.length;
}
const response=await fetch('https://tiles.openfreemap.org/planet',{headers});if(!response.ok)throw new Error('TileJSON unavailable');
const planet=await response.json();
if(!process.argv.includes('--refresh')){try{const old=JSON.parse(await fs.readFile(path.join(root,'data/offline/metadata.json'),'utf8'));if(old.snapshot)planet.tiles=[old.snapshot]}catch{}}
const x=(lon,z)=>Math.floor((lon+180)/360*2**z);
const y=(lat,z)=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z);
const jobs=[];
for(let z=minzoom;z<=maxzoom;z++)for(let a=x(bounds[0],z);a<=x(bounds[2],z);a++)for(let b=y(bounds[3],z);b<=y(bounds[1],z);b++)jobs.push({url:planet.tiles[0].replace('{z}',z).replace('{x}',a).replace('{y}',b),file:`data/offline/tiles/${z}/${a}/${b}.pbf`});
if(jobs.length>3000)throw new Error('Tile limit exceeded');
let index=0,bytes=0;
await Promise.all(Array.from({length:4},async()=>{while(index<jobs.length){const job=jobs[index++];bytes+=await download(job.url,job.file);if(bytes>50*1024*1024)throw new Error('Offline package exceeds 50 MB')}}));
for(const font of ['Noto Sans Regular','Noto Sans Bold'])for(const range of ['0-255','256-511','1024-1279','8192-8447'])await download(`https://tiles.openfreemap.org/fonts/${encodeURIComponent(font)}/${range}.pbf`,`data/offline/fonts/${font}/${range}.pbf`);
await download('https://unpkg.com/maplibre-gl@6.19.0/dist/maplibre-gl.mjs','vendor/maplibre-gl.mjs');
await download('https://unpkg.com/maplibre-gl@6.19.0/dist/maplibre-gl-worker.mjs','vendor/maplibre-gl-worker.mjs');
await download('https://unpkg.com/maplibre-gl@6.19.0/dist/maplibre-gl.css','vendor/maplibre-gl.css');
await download('https://unpkg.com/maplibre-gl@6.19.0/LICENSE.txt','vendor/MAPLIBRE-LICENSE.txt');
await download('https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/OFL.txt','data/offline/NOTO-SANS-OFL.txt');
await fs.writeFile(path.join(root,'data/offline/metadata.json'),JSON.stringify({bounds,minzoom,maxzoom,tiles:jobs.length,tile_bytes:bytes,retrieved_at:new Date().toISOString(),source:'https://tiles.openfreemap.org/planet',snapshot:planet.tiles[0],attribution:planet.attribution,license:'OpenStreetMap ODbL; OpenMapTiles attribution; Noto Sans OFL',terms:'https://openfreemap.org/tos/',note:'Bounded city-centre package; at most 4 requests, identifying User-Agent. Outside the centre only POIs and shelters remain available offline.'},null,2)+'\n');
console.log(`Offline centre: ${jobs.length} tiles, ${(bytes/1024/1024).toFixed(2)} MB; local renderer and fonts ready.`);
