import {readAnnouncement,saveAnnouncement} from './piper-cache.mjs?v=20261010-label-fast1';
import {synthesize as phoneticReference,piperInput} from './engine.mjs?v=20261010-label-fast1';
import {phonemeInput} from './neural-core.mjs?v=20261009-levels';
let worker,sequence=0;const pending=new Map();
let frenchWorker,frenchSequence=0;const frenchPending=new Map();
async function french(text){
 const input=await piperInput(text);
 if(!frenchWorker){
  frenchWorker=new Worker(new URL('./piper-worker.mjs?v=20261009-piper-fast2',import.meta.url),{type:'module'});
  frenchWorker.onmessage=({data})=>{if(data.progress){window.dispatchEvent(new CustomEvent('amorce-neural-progress',{detail:data.progress}));return;}const job=frenchPending.get(data.id);if(!job)return;frenchPending.delete(data.id);data.error?job.reject(new Error(data.error)):job.resolve(data.result);};
  frenchWorker.onerror=()=>{for(const job of frenchPending.values())job.reject(new Error('PIPER_ENGINE_FAILED'));frenchPending.clear();frenchWorker.terminate();frenchWorker=null;};
 }
 const id=++frenchSequence;return new Promise((resolve,reject)=>{frenchPending.set(id,{resolve,reject});frenchWorker.postMessage({id,input});});
}

async function generate(text,language='fr'){
 if(language==='fr'){const saved=await readAnnouncement(text);if(saved)return {...saved,persistentCacheHit:true};const result=await french(text);saveAnnouncement(text,result).catch(()=>{});return result;}
 const reference=await phoneticReference(text,language),input=phonemeInput(reference.events);
 if(!worker){
  worker=new Worker(new URL('./neural-worker.mjs?v=20261009-male-restored',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{if(data.progress){window.dispatchEvent(new CustomEvent('amorce-neural-progress',{detail:data.progress}));return;}const job=pending.get(data.id);if(!job)return;pending.delete(data.id);if(data.error)job.reject(new Error(data.error));else job.resolve(data.result);};
  worker.onerror=()=>{for(const job of pending.values())job.reject(new Error('NEURAL_ENGINE_FAILED'));pending.clear();worker.terminate();worker=null;};
 }
 const id=++sequence;
 return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,input,language,device:'wasm'});});
}

const cache=new Map();
export function synthesize(text,language='fr'){
 text=text.trim().replace(/\s+/gu,' ');
 const key=JSON.stringify([text,language]);
 if(cache.has(key))return cache.get(key);
 const started=performance.now();
 const job=generate(text,language).then(result=>({...result,preparationMs:performance.now()-started})).catch(error=>{cache.delete(key);throw error;});
 cache.set(key,job);
 // Bound retained PCM, while keeping the three current announcements.
 if(cache.size>24)cache.delete(cache.keys().next().value);
 return job;
}
