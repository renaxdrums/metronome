import assert from 'node:assert/strict';
import { createAudioLabLocalProject, serializeAudioLabLocalProject,
  restoreAudioLabLocalProject, readAudioLabLocalProjectFile } from '../audio-lab/project/local-project.mjs';

const source={name:'prise.wav',sizeBytes:441044,mimeType:'audio/wav',sampleRate:44100,
  sourceSampleRate:44100,sourceBitDepth:16,sourceChannels:1,channels:1,durationSeconds:5};
const state={markers:[
  {id:1,kind:'downbeat',seconds:.1},
  {id:2,kind:'meter',seconds:1,meter:{numerator:7,denominator:8,groups:[2,2,3]}},
  {id:3,kind:'warp',seconds:2.1,beat:4,validated:true},
  {id:4,kind:'tempo',seconds:3,bpm:100,validated:true},
],baseMeter:{numerator:7,denominator:8,groups:[2,2,3]},
  loopA:1,loopB:4,loopEnabled:true,manualBpm:93,sourceBpm:120,targetBpm:40,confirmed:true,
  zoom:3,start:1,selected:3,kind:'warp',snap:true,playbackMode:'warp',clickEnabled:true,
  audioVolume:.6,clickVolume:.4,selection:{a:1.5,b:2.5}};

const snapshot=createAudioLabLocalProject({source,state});
const json=serializeAudioLabLocalProject(snapshot);
assert(!json.includes('PCM') && !json.includes('data:audio/'));
const restored=restoreAudioLabLocalProject(json,source);
assert.deepEqual(restored,state);
assert.deepEqual(restored.baseMeter,{numerator:7,denominator:8,groups:[2,2,3]});
assert.equal(restored.manualBpm,93,'manual click BPM is independent of source BPM');
state.markers[2].beat=99;
assert.equal(restored.markers[2].beat,4,'snapshot is independent of mutable UI state');
assert.deepEqual(await readAudioLabLocalProjectFile({size:new TextEncoder().encode(json).length,
  text:async()=>json},source),restored);

assert.throws(()=>restoreAudioLabLocalProject(json,{...source,name:'autre.wav'}),/does not match/);
assert.throws(()=>restoreAudioLabLocalProject(json,{...source,sizeBytes:source.sizeBytes+1}),/does not match/);
assert.throws(()=>restoreAudioLabLocalProject(json,{...source,durationSeconds:4.5}),/does not match/);
const hash='a'.repeat(64),otherHash='b'.repeat(64);
const hashed=serializeAudioLabLocalProject(createAudioLabLocalProject({source:{...source,sha256:hash},state:restored}));
assert.throws(()=>restoreAudioLabLocalProject(hashed,{...source,sha256:otherHash}),/SHA-256/);
assert.throws(()=>restoreAudioLabLocalProject(hashed,source),/SHA-256/);
assert.deepEqual(restoreAudioLabLocalProject(hashed,{...source,sha256:hash}),restored);

assert.throws(()=>restoreAudioLabLocalProject('{bad json',source),/JSON/);
assert.throws(()=>restoreAudioLabLocalProject({...snapshot,version:2},source),/version/);
assert.throws(()=>createAudioLabLocalProject({source,state:{...restored,pcm:[1,2,3]}}),/unsupported field/);
assert.throws(()=>createAudioLabLocalProject({source,state:{...restored,markers:[
  restored.markers[0],{...restored.markers[0]}]}}),/unique/);
assert.throws(()=>createAudioLabLocalProject({source,state:{...restored,loopB:.5}}),/follow/);
assert.throws(()=>createAudioLabLocalProject({source,state:{...restored,baseMeter:{numerator:7,denominator:8,groups:[2,2,2]}}}),/sum/);
assert.throws(()=>createAudioLabLocalProject({source,state:{...restored,manualBpm:501}}),/manual click BPM/);
assert.throws(()=>createAudioLabLocalProject({source,state:{...restored,
  markers:[{id:9,kind:'warp',seconds:2,beat:1/7,validated:true}],selected:null}}),/ticks/);
assert.throws(()=>createAudioLabLocalProject({source,state:{...restored,
  markers:[{id:9,kind:'warp',seconds:2,beat:100,validated:true}],selected:null}}),/increasing/);
await assert.rejects(readAudioLabLocalProjectFile({size:3*1024*1024,text:async()=>json},source),/size/);
console.log('Audio Lab: explicit versioned local project round-trip and source guard passed');
