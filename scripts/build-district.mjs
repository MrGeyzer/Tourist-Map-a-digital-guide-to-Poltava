import fs from 'node:fs/promises';
const rawPath = new URL('../data/poltava-district.osm.json', import.meta.url);
let raw;
if (process.argv.includes('--cached')) raw = JSON.parse(await fs.readFile(rawPath, 'utf8'));
else {
  const response = await fetch('https://www.openstreetmap.org/api/0.6/relation/11823489/full.json', {headers: {'User-Agent':'PoltavaOpenDataHackathon/1.0',Accept:'application/json'},signal:AbortSignal.timeout(60000)});
  if (!response.ok) throw new Error(`OSM HTTP ${response.status}`);
  raw = await response.json(); await fs.writeFile(rawPath, JSON.stringify(raw));
}
const relation = raw.elements.find(e=>e.type==='relation'&&e.id===11823489);
if (relation?.tags?.katotth !== 'UA53080000000068029' || relation.tags.admin_level !== '6') throw new Error('Unexpected district relation');
const nodes = new Map(raw.elements.filter(e=>e.type==='node').map(e=>[e.id,[e.lon,e.lat]]));
const ways = new Map(raw.elements.filter(e=>e.type==='way').map(e=>[e.id,e.nodes]));
function rings(role) {
  const segments=relation.members.filter(m=>m.type==='way'&&m.role===role).map(m=>{if(!ways.has(m.ref))throw new Error(`Missing way ${m.ref}`);return [...ways.get(m.ref)]});
  const result=[];
  while(segments.length){const ring=segments.shift();while(ring[0]!==ring.at(-1)){
    const i=segments.findIndex(s=>s[0]===ring.at(-1)||s.at(-1)===ring.at(-1));
    if(i<0)throw new Error(`Unclosed ${role} ring`);
    const next=segments.splice(i,1)[0];if(next[0]!==ring.at(-1))next.reverse();ring.push(...next.slice(1));
  }result.push(ring.map(id=>{if(!nodes.has(id))throw new Error(`Missing node ${id}`);return nodes.get(id)}))}return result;
}
const outer=rings('outer'),inner=rings('inner');
if(outer.length!==1||inner.length)throw new Error('Boundary topology changed; review polygon assembly before updating');
const coordinates=outer[0];
const bbox=[Math.min(...coordinates.map(p=>p[0])),Math.min(...coordinates.map(p=>p[1])),Math.max(...coordinates.map(p=>p[0])),Math.max(...coordinates.map(p=>p[1]))];
const data={type:'FeatureCollection',source:'OpenStreetMap contributors',source_url:'https://www.openstreetmap.org/relation/11823489',license:'ODbL-1.0',license_url:'https://opendatacommons.org/licenses/odbl/1-0/',bbox,features:[{type:'Feature',properties:{...relation.tags,osm_id:11823489,source:'OpenStreetMap contributors',license:'ODbL-1.0'},geometry:{type:'Polygon',coordinates:outer}}]};
await fs.writeFile(new URL('../data/poltava-district.geojson',import.meta.url),JSON.stringify(data)+'\n');
console.log(JSON.stringify({name:relation.tags.name,katotth:relation.tags.katotth,bbox,vertices:coordinates.length}));
