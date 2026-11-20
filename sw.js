const BUILD_VERSION="1df4a7ea802e069fb55f";
/* Build adds a content version below. Keep this template out of the public file list. */
const PREFIX='poltava-pwa:'+self.registration.scope+':';
const CACHE=PREFIX+BUILD_VERSION;
const base=new URL(self.registration.scope);
const absolute=relative=>new URL(relative,base).href;
const READY=absolute('__pwa_ready__');
async function notify(message){for(const client of await self.clients.matchAll({includeUncontrolled:true}))client.postMessage(message)}
async function savePackage(repair=false){
  try{
    const response=await fetch(absolute('offline-files.json'),{cache:'no-store'});
    if(!response.ok)throw new Error('Не вдалося отримати список офлайн-файлів');
    const manifest=await response.json();
    if(manifest.version!==BUILD_VERSION||!Array.isArray(manifest.files)||!manifest.files.length)throw new Error('Версії файлів не узгоджені');
    const cache=await caches.open(CACHE);let index=0,done=0;
    const results=await Promise.allSettled(Array.from({length:4},async()=>{
      while(index<manifest.files.length){
        const file=manifest.files[index++],url=new URL(file,base);
        if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw new Error('Файл за межами застосунку');
        const result=await fetch(url.href,{cache:'reload'});
        if(!result.ok)throw new Error('Не завантажено: '+file);
        await cache.put(url.href,result);done++;
        await notify({type:'PWA_PROGRESS',done,total:manifest.files.length});
      }
    }));
    const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
    await cache.put(READY,new Response(JSON.stringify({version:BUILD_VERSION,files:done,paths:manifest.files,saved_at:new Date().toISOString()})));
    await notify({type:'PWA_SAVED'});
  }catch(error){if(!repair)await caches.delete(CACHE);await notify({type:'PWA_ERROR',message:error.message});throw error}
}
self.addEventListener('install',event=>event.waitUntil(savePackage()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();await notify({type:'PWA_READY'});
})()));
self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
  if(event.data?.type==='REPAIR')event.waitUntil(savePackage(true).then(()=>notify({type:'PWA_READY'})).catch(()=>{}));
  if(event.data?.type==='STATUS')event.waitUntil((async()=>{
    const cache=await caches.open(CACHE),response=await cache.match(READY),receipt=response?await response.json():{};
    const paths=receipt.paths||[],missing=paths.length?(await Promise.all(paths.map(async file=>!(await cache.match(absolute(file)))))).filter(Boolean).length:0;
    event.ports[0]?.postMessage({...receipt,type:'PWA_STATUS',ready:Boolean(response)&&paths.length>0&&missing===0,missing});
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
  if(url.pathname.endsWith('/sw.js')||url.pathname.endsWith('/offline-files.json'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const key=request.mode==='navigate'?absolute('index.html'):url.origin+url.pathname;
    const saved=await cache.match(key);if(saved)return saved;
    try{return await fetch(request)}catch{return new Response('Цей файл не збережено для офлайн-роботи.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}
  })());
});
