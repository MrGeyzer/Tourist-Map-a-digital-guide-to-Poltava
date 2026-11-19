import fs from 'node:fs';

const sourcePath = new URL('../data/poltava-boundary.osm', import.meta.url);
const outputPath = new URL('../data/poltava-boundary.geojson', import.meta.url);
const xml = fs.readFileSync(sourcePath, 'utf8');

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

const nodes = new Map();
for (const match of xml.matchAll(/<node\b[^>]*\bid="(\d+)"[^>]*\blat="([^"]+)"[^>]*\blon="([^"]+)"[^>]*\/?\s*>/g)) {
  nodes.set(match[1], [Number(match[3]), Number(match[2])]);
}

const ways = new Map();
for (const match of xml.matchAll(/<way\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  ways.set(match[1], [...match[2].matchAll(/<nd\b[^>]*\bref="(\d+)"[^>]*\/?\s*>/g)].map((m) => m[1]));
}

const relationText = xml.match(/<relation\b[^>]*>[\s\S]*?<\/relation>/)?.[0];
if (!relationText) throw new Error('Boundary relation was not found in the OSM source file.');
const relationAttrs = attributes(relationText.match(/<relation\b[^>]*>/)[0]);
const members = [...relationText.matchAll(/<member\b[^>]*\/?\s*>/g)].map((m) => attributes(m[0]));

function buildRings(role) {
  const segments = members
    .filter((member) => member.type === 'way' && member.role === role)
    .map((member) => {
      const refs = ways.get(member.ref);
      if (!refs) throw new Error(`Missing way ${member.ref} in the OSM source file.`);
      return [...refs];
    });
  const rings = [];

  while (segments.length) {
    const ring = segments.shift();
    while (ring[0] !== ring.at(-1)) {
      const index = segments.findIndex((segment) =>
        segment[0] === ring.at(-1) || segment.at(-1) === ring.at(-1) ||
        segment.at(-1) === ring[0] || segment[0] === ring[0]);
      if (index < 0) throw new Error(`Could not close a ${role} boundary ring.`);
      const segment = segments.splice(index, 1)[0];
      if (segment[0] === ring.at(-1)) ring.push(...segment.slice(1));
      else if (segment.at(-1) === ring.at(-1)) ring.push(...segment.slice(0, -1).reverse());
      else if (segment.at(-1) === ring[0]) ring.unshift(...segment.slice(0, -1));
      else ring.unshift(...segment.slice(1).reverse());
    }
    rings.push(ring.map((ref) => {
      const coordinate = nodes.get(ref);
      if (!coordinate) throw new Error(`Missing node ${ref} in the OSM source file.`);
      return coordinate;
    }));
  }
  return rings;
}

function signedArea(ring) {
  return ring.slice(0, -1).reduce((sum, point, index) => {
    const next = ring[index + 1];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

const outerRings = buildRings('outer').map((ring) => signedArea(ring) < 0 ? ring.reverse() : ring);
const innerRings = buildRings('inner').map((ring) => signedArea(ring) > 0 ? ring.reverse() : ring);
if (!outerRings.length) throw new Error('The boundary has no outer ring.');

const feature = {
  type: 'Feature',
  properties: {
    name: 'Полтава',
    osm_type: 'relation',
    osm_id: Number(relationAttrs.id),
    source: 'OpenStreetMap contributors',
    license: 'ODbL-1.0',
  },
  geometry: { type: 'MultiPolygon', coordinates: outerRings.map((ring) => [ring, ...innerRings]) },
};

fs.writeFileSync(outputPath, `${JSON.stringify({ type: 'FeatureCollection', features: [feature] })}\n`, 'utf8');

function inRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    if ((y1 > point[1]) !== (y2 > point[1]) && point[0] < ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

for (const filename of ['poltava-poi.geojson', 'poltava-shelters.geojson']) {
  const data = JSON.parse(fs.readFileSync(new URL(`../data/${filename}`, import.meta.url), 'utf8'));
  const pointFeatures = data.features.filter((item) => item.geometry?.type === 'Point');
  const outside = pointFeatures.filter((item) => !outerRings.some((ring) => inRing(item.geometry.coordinates, ring)) || innerRings.some((ring) => inRing(item.geometry.coordinates, ring)));
  const examples = outside.slice(0, 3).map((item) => ({
    coordinates: item.geometry.coordinates,
    name: item.properties?.name || item.properties?.address || '',
  }));
  console.log(`${filename}: ${pointFeatures.length} точки, поза контуром ${outside.length}${examples.length ? `; приклади ${JSON.stringify(examples)}` : ''}`);
}

const coordinates = outerRings.flat();
const lons = coordinates.map(([lon]) => lon);
const lats = coordinates.map(([, lat]) => lat);
console.log(`relation ${relationAttrs.id}: ${outerRings.length} зовнішніх кілець, ${innerRings.length} внутрішніх; межі ${Math.min(...lons)},${Math.min(...lats)} – ${Math.max(...lons)},${Math.max(...lats)}`);
