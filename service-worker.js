/* Atomic public application cache. Never cache account requests or library records. */
'use strict';
const MANIFEST_REVISION='9f0f9b1b59e528a1';
const base=new URL('./',self.location.href),prefix='renax-offline:'+encodeURIComponent(base.pathname)+':';
const shellName=prefix+'shell:'+MANIFEST_REVISION,audioName=prefix+'audio';
let manifestPromise;
const digest=async(response,text)=>{const bytes=text?new TextEncoder().encode((await response.text()).replace(/\r\n/g,'\n')):await response.arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');};
function manifest(){if(!manifestPromise)manifestPromise=fetch(new URL('offline-manifest.json',base),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Offline manifest unavailable');return r.json()}).then(value=>{if(value.revision!==MANIFEST_REVISION)throw Error('Deployment still updating');return value;});return manifestPromise;}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const data=await manifest(),cache=await caches.open(shellName);
 try{for(const entry of data.resources){const url=new URL(entry.path,base),response=await fetch(new URL(entry.path+'?v='+entry.sha256.slice(0,12),base),{cache:'reload'});if(!response.ok||await digest(response.clone(),entry.text)!==entry.sha256)throw Error('Offline file verification failed: '+entry.path);const headers=new Headers(response.headers);headers.set('X-Renax-Hash',entry.sha256.slice(0,12));headers.delete('Content-Encoding');headers.delete('Content-Length');await cache.put(url,new Response(response.body,{status:response.status,statusText:response.statusText,headers}));}}
 catch(error){await caches.delete(shellName);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith(prefix+'shell:')&&name!==shellName)await caches.delete(name);await self.clients.claim();})()));
function audioURL(url){return url.origin===base.origin&&url.pathname.startsWith(base.pathname+'assets/voices/')&&url.pathname.endsWith('.wav');}
async function cacheAudio(request){
 const cache=await caches.open(audioName),hit=await cache.match(request);if(hit)return hit;
 const response=await fetch(request);if(response.ok){try{await cache.put(request,response.clone());const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-64)))await cache.delete(key);}catch{}}
 return response;
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2500);try{return await fetch(new Request(request,{signal:controller.signal}));}catch{return await (await caches.open(shellName)).match(new URL('index.html',base))||new Response('Application indisponible hors connexion.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}finally{clearTimeout(timer);}})());return;
 }
 if(audioURL(url)){event.respondWith(cacheAudio(request).catch(()=>new Response('Son non téléchargé.',{status:503})));return;}
 event.respondWith((async()=>{
  // The installed snapshot remains usable offline even if a newer manifest is deployed.
  const cache=await caches.open(shellName),canonical=new URL(url.pathname,base.origin),cached=await cache.match(canonical);
  if(!cached)return fetch(request);
  const version=url.searchParams.get('v');
  if(!version)return cached;
  if(/^[a-f0-9]{12}$/.test(version)){
   // Cache entries carry their expected content hash; never serve old code for a new hash.
   const expected=cached.headers.get('X-Renax-Hash');
   if(expected===version)return cached;
   const exact=await cache.match(request);if(exact)return exact;
   const response=await fetch(request);return response;
  }
  // Historical pinned imports use dated versions; prefer the network and retain the verified snapshot as fallback.
  try{return await fetch(request);}catch{return cached;}
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_VOICES'||!event.source?.url?.startsWith(base.href))return;
 event.waitUntil((async()=>{let saved=0;const cache=await caches.open(audioName);for(const value of (Array.isArray(event.data.urls)?event.data.urls:[]).slice(0,40)){try{const url=new URL(value,base);if(!audioURL(url))continue;await cacheAudio(new Request(url,{cache:'force-cache'}));if((await cache.match(url))?.ok)saved++;}catch{}}event.ports[0]?.postMessage({saved});})());
});
