import assert from 'node:assert/strict';
import {copy,flatten,blankState,stage,mergeRemote,visibleRecords,materialize,resolveConflict,key,canonical} from '../../sync-core.js';
const song={id:'s',name:'Original',sections:[{id:'sec',label:'Intro',count:4,measure:{numerator:6,denominator:8,tempo:120,beatSubdivisions:[1,1,1,1,1,1],beatStates:[[3],[1],[1],[2],[1],[1]]}}]};
const library={version:1,activeProfile:'p',profiles:[{id:'p',name:'Profil',songs:[song]}]};let seq=0;const id=()=>String(++seq).padStart(36,'0'),record=(payload,revision=1,operationId='remote')=>({payload,revision,deleted:false,operationId});
const flat=flatten(library),base=Object.fromEntries(Object.entries(flat).map(([id,payload])=>[id,record(payload)])),skey=key('song','p','s');
let a=blankState(library);a.base=copy(base);let b=copy(a);
const edited=copy(library);edited.profiles[0].songs[0].name='Appareil A';a=stage(a,edited,id,()=>1000);assert.equal(Object.keys(a.pending).length,1);assert.equal(a.pending[skey].expected,1);
const editedB=copy(library);editedB.profiles[0].songs[0].name='Appareil B';b=stage(b,editedB,id,()=>2000);
const remote={...base,[skey]:record(a.pending[skey].payload,2,a.pending[skey].operationId)};
a=mergeRemote(a,remote);assert.equal(Object.keys(a.pending).length,0);
b=mergeRemote(b,remote);assert.equal(Object.keys(b.conflicts).length,0);assert.equal(b.pending[skey].expected,2);assert.equal(materialize(visibleRecords(b),library).profiles[0].songs[0].name,'Appareil B');
// Automatic latest-edit resolution is the current policy. Keep compatibility
// coverage for explicitly supplied historical manual conflicts as well.
const legacy={...copy(b),conflicts:{[skey]:{local:copy(b.pending[skey]),remote:copy(remote[skey])}}};
const chooseLocal=resolveConflict(legacy,skey,'local',id);assert.equal(chooseLocal.pending[skey].expected,2);assert.equal(Object.keys(chooseLocal.conflicts).length,0);
const chooseRemote=resolveConflict(legacy,skey,'remote',id);delete chooseRemote.pending[skey];assert.equal(materialize(visibleRecords(chooseRemote),library).profiles[0].songs[0].name,'Appareil A');
let offline=stage({ ...blankState(library),base:copy(base)},editedB,id);
offline=mergeRemote(offline,{...base,[skey]:{payload:null,deleted:true,revision:2,operationId:'delete',modifiedAt:Date.now()+1000}});assert.equal(Object.keys(offline.conflicts).length,0);assert.equal(offline.base[skey].deleted,true);assert.equal(offline.pending[skey],undefined);
const removed=copy(library);removed.profiles[0].songs=[];const deletion=stage({...blankState(library),base:copy(base)},removed,id);assert.equal(deletion.pending[skey].deleted,true);assert.equal(deletion.pending[skey].expected,1);
assert.deepEqual(JSON.parse(JSON.stringify(deletion)),deletion); // Persistent outbox survives restart.
assert.deepEqual(materialize(base,library),library);assert.deepEqual(stage(a,edited,id).pending,{});assert.equal(library.profiles[0].songs[0].name,'Original');
const independent=copy(library);independent.profiles[0].songs.push({...copy(song),id:'other',name:'Autre'});const second=stage(b,independent,id);assert.equal(Object.keys(second.conflicts).length,0);assert(second.pending[key('song','p','other')]);
const newer=stage(a,{...edited,profiles:[{...edited.profiles[0],songs:[{...edited.profiles[0].songs[0],name:'Encore'}]}]},id);assert.equal(newer.pending[skey].expected,2);
console.log('Core PASS: versioned roundtrip, effective edits, coalescing, simultaneous edits, per-song conflicts, delete/edit, resolutions, idempotence, restart and no source mutation');
console.log('Representative library bytes:',new TextEncoder().encode(JSON.stringify(library)).length,'; song payload bytes:',new TextEncoder().encode(flat[skey]).length);

// Strict contracts preserve the canonicalizer's historical optional result.
assert.equal(canonical(undefined),undefined);
assert.equal(canonical({b:2,a:1}),'{"a":1,"b":2}');
const wrongCatalog={catalog:record(JSON.stringify({type:'song',song}))};
assert.throws(()=>materialize(wrongCatalog,library),/Données distantes incompatibles/);
const wrongSong={...base,[skey]:record(JSON.stringify({type:'catalog',profileIds:[]}))};
assert.throws(()=>materialize(wrongSong,library),/Données distantes incompatibles/);
assert.equal(library.profiles[0].songs[0].name,'Original');
