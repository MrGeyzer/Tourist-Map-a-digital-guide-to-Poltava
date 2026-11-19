import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const imageDir = path.join(dataDir, 'wikimedia');
const apiAgent = 'PoltavaTouristMap/1.0 (local open-data hackathon project)';
const poi = JSON.parse(await fs.readFile(path.join(dataDir, 'poltava-poi.geojson'), 'utf8'));
await fs.mkdir(imageDir, { recursive: true });

const itemsById = new Map();
for (const feature of poi.features || []) {
  const properties = feature.properties || {};
  const qid = properties.wikidata;
  if (/^Q\d+$/.test(qid || '') && !itemsById.has(qid)) itemsById.set(qid, []);
  if (/^Q\d+$/.test(qid || '')) itemsById.get(qid).push(feature);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': apiAgent } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

const wikidataImages = new Map();
const qids = [...itemsById.keys()];
for (let offset = 0; offset < qids.length; offset += 50) {
  const batch = qids.slice(offset, offset + 50);
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({ action: 'wbgetentities', ids: batch.join('|'), props: 'claims', format: 'json' });
  const response = await fetchJson(url);
  for (const [qid, entity] of Object.entries(response.entities || {})) {
    const claims = entity.claims || {};
    const statement = claims.P18?.find((claim) => claim.rank === 'preferred') || claims.P18?.[0];
    const filename = statement?.mainsnak?.datavalue?.value;
    if (typeof filename === 'string' && filename.trim()) wikidataImages.set(qid, filename.trim());
  }
}

const normalizeTitle = (title) => String(title || '').replace(/_/g, ' ').trim().toLocaleLowerCase();
const wikipediaTitles = new Map();
for (const feature of poi.features || []) {
  const wikipedia = feature.properties?.wikipedia;
  const match = typeof wikipedia === 'string' ? wikipedia.match(/^([a-z-]+):(.+)$/i) : null;
  if (!match) continue;
  const [, language, title] = match;
  if (!wikipediaTitles.has(language.toLowerCase())) wikipediaTitles.set(language.toLowerCase(), new Set());
  wikipediaTitles.get(language.toLowerCase()).add(title.trim());
}

const wikipediaImages = new Map();
for (const [language, titles] of wikipediaTitles) {
  const titleList = [...titles];
  for (let offset = 0; offset < titleList.length; offset += 40) {
    const batch = titleList.slice(offset, offset + 40);
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
    url.search = new URLSearchParams({ action: 'query', format: 'json', prop: 'pageimages', piprop: 'name', redirects: '1', titles: batch.join('|') });
    const response = await fetchJson(url);
    for (const page of Object.values(response.query?.pages || {})) {
      if (page.pageimage) wikipediaImages.set(`${language}:${normalizeTitle(page.title)}`, page.pageimage);
    }
  }
}

const sourceByObject = new Map();
for (const feature of poi.features || []) {
  const properties = feature.properties || {};
  const objectId = properties['@id'];
  if (!objectId) continue;
  const taggedFile = properties.wikimedia_commons;
  const qid = properties.wikidata;
  const wikipedia = properties.wikipedia;
  const wikiMatch = typeof wikipedia === 'string' ? wikipedia.match(/^([a-z-]+):(.+)$/i) : null;
  const filename = typeof taggedFile === 'string' && taggedFile.startsWith('File:')
    ? taggedFile.slice(5)
    : wikidataImages.get(qid) || (wikiMatch ? wikipediaImages.get(`${wikiMatch[1].toLowerCase()}:${normalizeTitle(wikiMatch[2])}`) : null);
  const source = typeof taggedFile === 'string' && taggedFile.startsWith('File:')
    ? 'OpenStreetMap wikimedia_commons tag'
    : wikidataImages.has(qid) ? `Wikidata ${qid} (P18)` : wikiMatch ? `Wikipedia ${wikipedia}` : '';
  if (filename) sourceByObject.set(objectId, { filename, source });
}

const nearbyMatches = new Map([
  ['node/2371940502', { filename: "Пам'ятний знак «Галушки». Полтава 02.jpg", source: 'Commons geosearch: 4 m from the monument; title match' }],
  ['node/1375013124', { filename: 'Полтавський просвітницький будинок IMG 1092.jpg', source: 'Commons geosearch: 11.1 m from the building; title match' }],
]);
for (const [objectId, match] of nearbyMatches) {
  sourceByObject.set(objectId, match);
}

const fileNames = [...new Set([...sourceByObject.values()].map((item) => item.filename))];
const fileInfo = new Map();
for (let offset = 0; offset < fileNames.length; offset += 40) {
  const batch = fileNames.slice(offset, offset + 40);
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', prop: 'imageinfo', titles: batch.map((name) => `File:${name}`).join('|'),
    iiprop: 'url|extmetadata', iiurlwidth: '500',
  });
  const response = await fetchJson(url);
  for (const page of Object.values(response.query?.pages || {})) {
    const info = page.imageinfo?.[0];
    if (info?.thumburl && info?.descriptionurl) fileInfo.set(normalizeTitle(page.title.replace(/^File:/, '')), info);
  }
}

function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0*39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim().slice(0, 140);
}

const byObjectId = {};
for (const [objectId, source] of sourceByObject) {
  const info = fileInfo.get(normalizeTitle(source.filename));
  if (!info) continue;
  const digest = crypto.createHash('sha1').update(source.filename).digest('hex').slice(0, 16);
  const originalUrl = info.thumburl;
  const pathname = new URL(originalUrl).pathname;
  const extension = path.extname(pathname).toLowerCase() || '.jpg';
  const localName = `${digest}${extension}`;
  const localPath = path.join(imageDir, localName);
  try {
    await fs.access(localPath);
  } catch {
    const imageResponse = await fetch(originalUrl, { headers: { 'user-agent': apiAgent } });
    if (!imageResponse.ok) {
      console.warn(`Skipping ${source.filename}: thumbnail download returned ${imageResponse.status}`);
      continue;
    }
    await fs.writeFile(localPath, Buffer.from(await imageResponse.arrayBuffer()));
  }
  const metadata = info.extmetadata || {};
  byObjectId[objectId] = {
    image: `./data/wikimedia/${localName}`,
    fileTitle: source.filename,
    filePage: info.descriptionurl,
    author: plainText(metadata.Artist?.value || metadata.Credit?.value),
    license: plainText(metadata.LicenseShortName?.value || metadata.UsageTerms?.value),
    licenseUrl: metadata.LicenseUrl?.value || info.descriptionurl,
    source: source.source,
  };
}

const output = {
  source: 'Wikimedia Commons files linked by OSM wikimedia_commons, Wikidata P18, a matched Wikipedia article image, or a title-matched geotag within 12 m',
  attribution: 'Wikimedia Commons; license and author are recorded for each file.',
  byObjectId,
};
await fs.writeFile(path.join(dataDir, 'wikimedia-images.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`POI with exact Wikimedia image: ${Object.keys(byObjectId).length} of ${sourceByObject.size} linked candidates; files checked ${fileNames.length}.`);
