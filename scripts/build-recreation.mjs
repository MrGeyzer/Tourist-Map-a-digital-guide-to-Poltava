import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const boundary = JSON.parse(await fs.readFile(path.join(dataDir, 'poltava-boundary.geojson'), 'utf8')).features[0].geometry;
const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates;
const vertices = polygons.flatMap(poly => poly[0]);
const bbox = [Math.min(...vertices.map(p => p[1])), Math.min(...vertices.map(p => p[0])), Math.max(...vertices.map(p => p[1])), Math.max(...vertices.map(p => p[0]))].join(',');
const query = `[out:json][timeout:90];(
  nwr[leisure~"^(park|garden|nature_reserve|playground|recreation_ground|beach_resort|swimming_area)$"](${bbox});
  nwr[tourism~"^(picnic_site|picnic_table)$"](${bbox});
  nwr[landuse~"^(forest|village_green|grass|recreation_ground)$"](${bbox});
  nwr[natural~"^(wood|beach)$"](${bbox});
);out body center geom;`;
await fs.writeFile(path.join(dataDir, 'poltava-recreation.overpassql'), query + '\n');
const rawPath = path.join(dataDir, 'poltava-recreation.overpass.json');
let raw;
let endpoint;
if (process.argv.includes('--cached')) {
  raw = JSON.parse(await fs.readFile(rawPath, 'utf8'));
  endpoint = 'https://www.overpass-api.de/api/interpreter';
} else {
  for (const url of ['https://www.overpass-api.de/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
    try {
      const response = await fetch(`${url}?data=${encodeURIComponent(query)}`, {headers: {'User-Agent': 'PoltavaOpenDataHackathon/1.0', Accept: 'application/json'}, signal: AbortSignal.timeout(115000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      raw = await response.json();
      if (raw.remark || !Array.isArray(raw.elements)) throw new Error(raw.remark || 'Invalid Overpass response');
      endpoint = url;
      break;
    } catch (error) { console.error(`${url}: ${error.message}`); }
  }
  if (!raw || raw.remark || !Array.isArray(raw.elements)) throw new Error('No complete Overpass response. Existing GeoJSON kept.');
  await fs.writeFile(rawPath, JSON.stringify(raw));
}

function inRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const inCity = point => polygons.some(poly => inRing(point, poly[0]) && !poly.slice(1).some(ring => inRing(point, ring)));
function category(tags) {
  if (tags.leisure === 'playground') return 'playgrounds';
  if (['picnic_site', 'picnic_table'].includes(tags.tourism) || ['recreation_ground', 'beach_resort', 'swimming_area'].includes(tags.leisure) || tags.landuse === 'recreation_ground' || tags.natural === 'beach') return 'recreation';
  if (['park', 'garden', 'nature_reserve'].includes(tags.leisure)) return 'parks';
  return 'green';
}
const features = [], ids = new Set();
let restricted = 0, outside = 0;
for (const element of raw.elements) {
  const tags = element.tags || {}, id = `${element.type}/${element.id}`;
  if (ids.has(id)) continue;
  ids.add(id);
  if (['private', 'no', 'customers', 'permit'].includes(tags.access)) { restricted++; continue; }
  const geometry = element.geometry || (element.members || []).flatMap(member => member.geometry || []);
  const coordinates = geometry.filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  const location = element.type === 'node' ? element : element.center || (coordinates.length ? {
    lon: (Math.min(...coordinates.map(p => p.lon)) + Math.max(...coordinates.map(p => p.lon))) / 2,
    lat: (Math.min(...coordinates.map(p => p.lat)) + Math.max(...coordinates.map(p => p.lat))) / 2,
  } : null);
  if (!location || !Number.isFinite(location.lon) || !Number.isFinite(location.lat)) continue;
  const point = [location.lon, location.lat];
  if (!inCity(point)) { outside++; continue; }
  features.push({type: 'Feature', id, properties: {'@id': id, ...tags, '@geometry': element.type === 'node' ? 'node' : 'center', _category: category(tags)}, geometry: {type: 'Point', coordinates: point}});
}
const counts = Object.fromEntries(['recreation', 'playgrounds', 'green', 'parks'].map(cat => [cat, features.filter(f => f.properties._category === cat).length]));
const result = {type: 'FeatureCollection', generator: 'scripts/build-recreation.mjs', timestamp: raw.osm3s?.timestamp_osm_base, source: 'OpenStreetMap contributors', source_url: 'https://www.openstreetmap.org/copyright', license: 'ODbL-1.0', license_url: 'https://opendatacommons.org/licenses/odbl/1-0/', endpoint, query_file: 'poltava-recreation.overpassql', boundary: 'OpenStreetMap relation/1641691', counts, excluded: {restricted, outside}, note: 'Points for areas use the OSM bounding-box center, not an entrance. Absence of access tags does not confirm public access. OSM coverage is incomplete.', features};
await fs.writeFile(path.join(dataDir, 'poltava-recreation.geojson'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({timestamp: result.timestamp, counts, excluded: result.excluded, total: features.length}));
