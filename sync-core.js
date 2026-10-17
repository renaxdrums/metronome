/* Pure, versioned synchronization model. No audio or browser dependencies. */
export const VERSION=1;
/** Clone JSON-compatible model data only. @template T @param {T} value @returns {T} */
export const copy=value=>JSON.parse(JSON.stringify(value));
/**
 * @overload
 * @param {Record<string,unknown>|unknown[]|string|number|boolean|null} value
 * @returns {string}
 */
/** @overload @param {unknown} value @returns {string|undefined} */
/** @param {unknown} value @returns {string|undefined} */
export function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(/** @type {Record<string,unknown>} */ (value)[k])).join(',')+'}';return JSON.stringify(value);}
/** @param {string} type @param {...string} ids */
export const key=(type,...ids)=>type+'_'+encodeURIComponent(JSON.stringify(ids));
/** @param {import('./types/library').Library} library */
export function flatten(library){
  /** @type {Record<string,string>} */
  const out={};out.catalog=canonical({type:'catalog',profileIds:library.profiles.map(p=>p.id)});
  for(const p of library.profiles){out[key('profile',p.id)]=canonical({type:'profile',id:p.id,name:p.name,songIds:p.songs.map(s=>s.id)});for(const song of p.songs)out[key('song',p.id,song.id)]=canonical({type:'song',profileId:p.id,song});}return out;
}
/** @param {Record<string,import('./types/library').Payload>} records @param {import('./types/library').Library} fallback */
export function materialize(records,fallback){
  /** @type {Record<string,import('./types/library').StoredEntity>} */
  const live={};for(const [id,r] of Object.entries(records))if(!r.deleted&&r.payload!==null)live[id]=JSON.parse(r.payload);
  const catalog=live.catalog;if(!catalog)return copy(fallback);if(catalog.type!=='catalog')throw Error('Données distantes incompatibles. Aucune bibliothèque remplacée.');
  const profiles=[];for(const id of catalog.profileIds){const p=live[key('profile',id)];if(!p)continue;if(p.type!=='profile')throw Error('Données distantes incompatibles. Aucune bibliothèque remplacée.');const songs=[];for(const songId of p.songIds){const s=live[key('song',id,songId)];if(s){if(s.type!=='song')throw Error('Données distantes incompatibles. Aucune bibliothèque remplacée.');songs.push(copy(s.song));}}profiles.push({id:p.id,name:p.name,songs});}
  if(!profiles.length)return copy(fallback);
  return {version:1,activeProfile:profiles.some(p=>p.id===fallback.activeProfile)?fallback.activeProfile:profiles[0].id,profiles};
}
/** @param {import('./types/library').Library} library @returns {import('./types/library').SyncState} */
export function blankState(library){return {version:VERSION,library:copy(library),base:{},pending:{},conflicts:{},importDecisions:{}};}
/** @param {()=>string} operationId @param {number} time */
export function timestampedOperation(operationId,time){
  const raw=operationId().replaceAll('-','');
  const hex=Math.trunc(time).toString(16).padStart(12,'0')+ '7'+raw.slice(13);
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}
/** @param {string|undefined} id */
export function operationTime(id){return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/i.test(id||'')?parseInt((id||'').slice(0,8)+(id||'').slice(9,13),16):0;}
/** @param {import('./types/library').SyncState} state @param {import('./types/library').Library} library @param {()=>string} operationId @param {()=>number} [now] */
export function stage(state,library,operationId,now=Date.now){
  const next=copy(state),current=flatten(library);next.library=copy(library);
  const ids=new Set([...Object.keys(next.base),...Object.keys(next.pending),...Object.keys(current)]);
  for(const id of ids){const payload=current[id]??null,deleted=payload===null,base=next.base[id];
    if(next.conflicts[id]){next.conflicts[id].local={payload,deleted};continue;}
    if(base&&base.deleted===deleted&&base.payload===payload){delete next.pending[id];continue;}
    if(!base&&deleted){delete next.pending[id];continue;}
    if(next.pending[id]?.payload===payload&&next.pending[id]?.deleted===deleted)continue;
    const modifiedAt=now();next.pending[id]={payload,deleted,expected:base?.revision??0,operationId:timestampedOperation(operationId,modifiedAt),modifiedAt};
  }return next;
}
// Membership changes merge against their common base; unrelated additions survive.
/** @param {string} id @param {import('./types/library').Payload} local @param {import('./types/library').Payload} remote @param {import('./types/library').Payload|undefined} base */
function mergePayload(id,local,remote,base){
  if(local.deleted||remote.deleted||local.payload===null||remote.payload===null)return null;
  const l=JSON.parse(local.payload),r=JSON.parse(remote.payload),b=base&&!base.deleted&&base.payload!==null?JSON.parse(base.payload):null;
  const field=l.type==='catalog'?'profileIds':l.type==='profile'?'songIds':null;
  if(!field)return null;
  const previous=new Set(b?.[field]||[]),ls=new Set(l[field]),rs=new Set(r[field]);
  const ids=[...new Set([...r[field],...l[field]])].filter(x=>!previous.has(x)||(ls.has(x)&&rs.has(x)));
  const winner=newer(local,remote)?l:r;
  return canonical(/** @type {Record<string,unknown>} */ ({...winner,[field]:ids}));
}
/** @param {Partial<import('./types/library').Payload>|undefined} r */
const editTime=r=>r?.modifiedAt||operationTime(r?.operationId)||r?.updatedAt||0;
// Stable tie break when clocks give the same millisecond.
/** @param {import('./types/library').Payload} a @param {import('./types/library').Payload} b */
const newer=(a,b)=>editTime(a)!==editTime(b)?editTime(a)>editTime(b):String(a.operationId)>String(b.operationId);
/** @param {import('./types/library').SyncState} state @param {Record<string,import('./types/library').RemoteRecord>} remote @param {()=>string} [operationId] */
export function mergeRemote(state,remote,operationId=()=>crypto.randomUUID()){
  const next=copy(state);
  // Convert existing manual conflicts to the automatic policy as well.
  for(const [id,c] of Object.entries(next.conflicts)){
    next.pending[id]={...c.local,expected:next.base[id]?.revision??0,operationId:c.local.operationId||timestampedOperation(operationId,0),modifiedAt:c.local.modifiedAt||0};
    remote={...remote,[id]:remote[id]||c.remote};delete next.conflicts[id];
  }
  for(const [id,record] of Object.entries(remote)){
    const known=next.base[id];if(known&&record.revision<known.revision)continue;
    const pending=next.pending[id];
    if(pending){
      if(record.operationId===pending.operationId||(record.deleted===pending.deleted&&record.payload===pending.payload)){
        next.base[id]=copy(record);delete next.pending[id];
      }else if(record.revision!==pending.expected){
        const merged=mergePayload(id,pending,record,known);
        next.base[id]=copy(record);
        if(merged!==null){
          if(merged===record.payload)delete next.pending[id];
          else next.pending[id]={...pending,payload:merged,expected:record.revision,modifiedAt:Math.max(editTime(pending),editTime(record))};
        }else if(newer(pending,record))next.pending[id].expected=record.revision;
        else delete next.pending[id];
      }
    }else next.base[id]=copy(record);
  }
  return next;
}
// Guest and account libraries share song identities. Keep each unique song;
// resolve edits later against record modification timestamps.
/** @param {import('./types/library').Library} account @param {import('./types/library').Library} guest */
export function mergeLibraries(account,guest){
  const next=copy(account);
  /** @param {import('./types/library').Song} value */
  const signature=({id,...song})=>canonical({...song,sections:song.sections.map(({id,...section})=>section)});
  const known=new Set(next.profiles.flatMap(p=>p.songs.map(signature)));
  for(const p of guest.profiles){
    let target=next.profiles.find(x=>x.id===p.id);
    if(!target){target={id:p.id,name:p.name,songs:[]};next.profiles.push(target);}
    for(const song of p.songs){if(!target.songs.some(x=>x.id===song.id)&&!known.has(signature(song))){target.songs.push(copy(song));known.add(signature(song));}}
  }
  return next;
}
/** @param {import('./types/library').SyncState} state */
export function visibleRecords(state){
  /** @type {Record<string,Pick<import('./types/library').Payload,'payload'|'deleted'>>} */
  const out=copy(state.base);
  for(const [id,p] of Object.entries(state.pending))out[id]=p;
  for(const [id,c] of Object.entries(state.conflicts))out[id]=c.local;
  return out;
}
/** @param {import('./types/library').SyncState} state @param {string} id @param {'local'|'remote'} choice @param {()=>string} operationId */
export function resolveConflict(state,id,choice,operationId){
  const next=copy(state),conflict=next.conflicts[id];if(!conflict)throw Error('Conflit absent.');
  next.base[id]=copy(conflict.remote);delete next.conflicts[id];
  if(choice==='local')next.pending[id]={...conflict.local,expected:conflict.remote.revision,operationId:operationId()};else if(choice!=='remote')throw Error('Choix de résolution incorrect.');return next;
}
