// Retain a bounded set of French announcements across page opens. Failure of
// browser storage must never prevent playback or a fresh synthesis.
const revision='siwis-c10ece1a-scales-default-levels-v3-exact-ipa',limit=64;
let database;
function open(){if(!database)database=new Promise(resolve=>{try{const request=indexedDB.open('renax-piper-announcements',1);request.onupgradeneeded=()=>request.result.createObjectStore('audio',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);}catch{resolve(null);}});return database;}
const key=text=>JSON.stringify([revision,text]);
export async function readAnnouncement(text){try{const db=await open();if(!db)return null;return await new Promise(resolve=>{const tx=db.transaction('audio','readonly'),request=tx.objectStore('audio').get(key(text));request.onsuccess=()=>resolve(request.result?.result||null);request.onerror=()=>resolve(null);tx.onabort=()=>resolve(null);});}catch{return null;}}
export async function saveAnnouncement(text,result){try{const db=await open();if(!db)return;await new Promise(resolve=>{const tx=db.transaction('audio','readwrite'),store=tx.objectStore('audio');store.put({key:key(text),created:Date.now(),result});const all=store.getAll();all.onsuccess=()=>{const rows=all.result.sort((a,b)=>b.created-a.created);for(const row of rows.slice(limit))store.delete(row.key);};tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve;});}catch{/* Private browsing or quota: keep the in-memory cache. */}}
