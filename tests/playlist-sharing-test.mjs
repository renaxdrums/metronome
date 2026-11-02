import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {SHARE_ID_PATTERN,sharedProfileId,shareIdInLink,publicShareLink,
  parseSharedProfile,addOrUpdateSharedPlaylist,exportSharePayload} from '../playlist-sharing-core.mjs';

const id='0123456789abcdef0123456789abcdef';
const untouched={id:'existing',name:'Mes morceaux',songs:[{id:'old',name:'Original',sections:[]}]};
const source={id:'author',name:'Concert',songs:[{
  id:'song-1',name:'Ouverture',chainNext:true,amorce:true,
  sections:[{id:'section-1',label:'Intro',count:4,continuous:false,
    measure:{numerator:4,denominator:4,tempo:120,beatSubdivisions:[1,1,1,1],beatStates:[[1],[2],[3],[0]]}
  }]
}]};
const validate = lib=>{
  assert.equal(lib.version,1);
  assert(Array.isArray(lib.profiles)&&lib.profiles.length<=128);
  for(const profile of lib.profiles)assert(typeof profile.id==='string'&&Array.isArray(profile.songs));
};
const base={version:1,activeProfile:'existing',profiles:[untouched]};
const published={schema:1,revision:1,revoked:false,payload:exportSharePayload(source,validate)};
assert(SHARE_ID_PATTERN.test(id));
assert(!SHARE_ID_PATTERN.test('../somewhere'));
assert.equal(sharedProfileId(id),'shared_'+id);
assert.equal(shareIdInLink('#renax-share='+id),id);
assert.equal(shareIdInLink('#renax-share=other'),null);
assert.equal(publicShareLink('https://renaxdrums.github.io/metronome/?old=1',id),
  'https://renaxdrums.github.io/metronome/#renax-share='+id);
assert.deepEqual(parseSharedProfile(published,validate),source);
const first=addOrUpdateSharedPlaylist(base,published,id,validate);
assert(first.added&&first.changed);
assert.equal(first.library.profiles.length,2);
assert.deepEqual(first.library.profiles[0],untouched);
assert.equal(first.library.activeProfile,base.activeProfile);
assert.equal(first.library.profiles[1].id,'shared_'+id);
assert.deepEqual(first.library.profiles[1].songs,source.songs);
const duplicate=addOrUpdateSharedPlaylist(first.library,published,id,validate);
assert(!duplicate.added&&!duplicate.changed);
assert.equal(duplicate.library.profiles.length,2);
const newer=structuredClone(source);newer.songs[0].sections[0].measure.tempo=140;
const next=addOrUpdateSharedPlaylist(first.library,{...published,revision:2,payload:JSON.stringify(newer)},id,validate);
assert(!next.added&&next.changed);
assert.equal(next.library.profiles[1].songs[0].sections[0].measure.tempo,140);
assert.deepEqual(next.library.profiles[0],untouched);
assert.equal(first.library.profiles[1].songs[0].sections[0].measure.tempo,120);
assert.throws(()=>addOrUpdateSharedPlaylist(base,{...published,revoked:true},id,validate));
assert.throws(()=>addOrUpdateSharedPlaylist(base,{...published,payload:'{invalid'},id,validate));
assert.throws(()=>addOrUpdateSharedPlaylist(base,published,'bad',validate));
assert.throws(()=>exportSharePayload({...source,name:'X'.repeat(800001)},validate));
console.log('Playlist sharing core PASS: exact structure, deduplication, isolated update, malicious input');

// Exercise the actual receive controller with storage/DOM boundaries isolated.
// A remote snapshot must never shadow the real focused field during an edit.
const client=fs.readFileSync(new URL('../playlist-sharing.js',import.meta.url),'utf8');
const receiveSource=client.slice(client.indexOf('async function apply('),client.indexOf('async function pullLink('));
assert(receiveSource.startsWith('async function apply('));
let focused=true,running=false,writes=0,replacements=0;
const queued=new Map();
const controllerStorage={readOnly:false,ready:Promise.resolve(),scope:'guest',rawToken:'local',write(){writes++;}};
const controllerApi={library:base,validateLibrary:validate,flushPending:()=>true,replaceLibrary(){replacements++;}};
const applyReceived=vm.runInNewContext(receiveSource+'\napply',{
  document:{get activeElement(){return focused?{closest:()=>true,matches:()=>true}:null;}},
  storage:controllerStorage,api:controllerApi,pending:queued,playing:()=>running,
  addOrUpdateSharedPlaylist,openReceivedPlaylists(){},
  window:{dispatchEvent(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}
});
await applyReceived(published,id);
assert(queued.has(id),'Incoming update is deferred while a field is focused');
assert.equal(writes,0);assert.equal(replacements,0);
focused=false;running=true;queued.clear();
await applyReceived(published,id);
assert(queued.has(id),'Incoming update is deferred while audio is playing');
assert.equal(writes,0);assert.equal(replacements,0);
running=false;
await applyReceived(published,id);
assert.equal(writes,1);assert.equal(replacements,1);
controllerStorage.write=()=>{throw Error('Storage unavailable');};
await assert.rejects(applyReceived(published,id),/Storage unavailable/);
assert.equal(replacements,1,'Failed durable write must not replace the displayed library');
console.log('Playlist receive PASS: editing/audio deferral and durable-write failure preserve local data');
