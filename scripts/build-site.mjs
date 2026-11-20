import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(root,'dist');
const entries=[
  'index.html',
  'scripts/accessibility-core.mjs','scripts/accessibility-ui.mjs',
  'scripts/map-navigation.mjs','scripts/map-region.mjs',
  'data/poltava-poi.geojson','data/poltava-recreation.geojson',
  'data/poltava-boundary.geojson','data/poltava-shelters.geojson',
  'data/poltava-accessibility.geojson','data/accessibility-source-audit.json',
  'data/wikimedia-images.json','data/shelters-geocode-report.csv'
];
const images=JSON.parse(await fs.readFile(path.join(root,'data/wikimedia-images.json'),'utf8'));
for(const image of Object.values(images.byObjectId||{})){
  if(!/^\.\/data\/wikimedia\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|avif)$/.test(image.image||''))throw new Error('Некоректний шлях до локального фото');
  entries.push(image.image.slice(2));
}
const files=[...new Set(entries)].sort();
for(const relative of files){
  const source=path.resolve(root,relative),stat=await fs.lstat(source);
  if(!source.startsWith(root+path.sep)||!stat.isFile()||stat.isSymbolicLink())throw new Error(`Некоректний файл: ${relative}`);
}
// Only the generated dist directory may be replaced; never follow a directory link.
if(output!==path.join(root,'dist')||path.dirname(output)!==root)throw new Error('Некоректна папка збірки');
const previous=await fs.lstat(output).catch(error=>{if(error.code!=='ENOENT')throw error;return null});
if(previous?.isSymbolicLink()||(previous&&!previous.isDirectory()))throw new Error('dist має бути звичайною папкою');
await fs.rm(output,{recursive:true,force:true});
await fs.mkdir(output,{recursive:true});
for(const relative of files){
  const destination=path.join(output,relative);await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.copyFile(path.join(root,relative),destination);
}
await fs.writeFile(path.join(output,'.nojekyll'),'');

// Fail a release when a new local dependency was omitted from the explicit public file list.
async function checkReference(relative,from){
  const destination=path.resolve(path.dirname(path.join(output,from)),relative.split(/[?#]/)[0]);
  if(!destination.startsWith(output+path.sep))throw new Error(`Посилання за межами сайту: ${relative}`);
  await fs.access(destination).catch(()=>{throw new Error(`У збірці немає ${relative} (використано в ${from})`)});
}
for(const file of files.filter(f=>f==='index.html'||f.endsWith('.mjs'))){
  const source=await fs.readFile(path.join(output,file),'utf8');
  if(file==='index.html'){
    if(/<base\b/i.test(source)||/(?:src|href)=["']\/(?!\/)/.test(source))throw new Error('Шляхи мають працювати й у підпапці GitHub Pages');
    for(const match of source.matchAll(/["'](\.\/(?:data|scripts)\/[^"'\s]+)["']/g))await checkReference(match[1],file);
  }
  for(const match of source.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g))await checkReference(match[1],file);
}
for(const image of Object.values(images.byObjectId||{}))await checkReference(image.image,'index.html');
const bytes=(await Promise.all(files.map(f=>fs.stat(path.join(output,f))))).reduce((n,s)=>n+s.size,0);
console.log(`Готово: dist — ${files.length+1} файлів, ${(bytes/1024/1024).toFixed(2)} МБ. Локальні шляхи й фотографії перевірено.`);
