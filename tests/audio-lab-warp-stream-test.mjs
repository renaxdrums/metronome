import assert from 'node:assert/strict';
import {createWarpMap} from '../audio-lab/tempo-warp-core.mjs';
import {createWarpTimeline} from '../audio-lab/warp/warp-timeline.mjs';
import {renderWarpPCMChunks} from '../audio-lab/dsp/warp-stream.mjs';

const rate=16000,frames=rate*1.5;
const a=new Float32Array(frames);
for(let i=0;i<frames;i++)a[i]=.4*Math.sin(2*Math.PI*440*i/rate);
const snapshot=a.slice();
const map=createWarpMap([{tick:0,sourceSeconds:0},{tick:11520,sourceSeconds:1.5}]);
const slow=createWarpTimeline(map,[{tick:0,bpm:40}]);
const pieces=[];
const gen=renderWarpPCMChunks({channels:[a,a],sampleRate:rate,timeline:slow,
  onsets:[.3,.85,1.2],chunkFrames:777});
let next;
while(!(next=gen.next()).done)pieces.push(next.value);
const metrics=next.value;
assert.equal(metrics.frames,72000);
assert(metrics.workingBytes<200000,'Chunking must not allocate full output');
assert.equal(metrics.restored,3);
assert.equal(pieces.length,93);
assert.equal(pieces.reduce((n,p)=>n+p.channels[0].length,0),72000);
let offset=0;
for(const piece of pieces){
  assert.equal(piece.frameOffset,offset,'continuity across chunk boundaries');
  assert.deepEqual(piece.channels[0],piece.channels[1],'Stereo linked WSOLA');
  offset+=piece.channels[0].length;
}
const output=Float32Array.from(pieces.flatMap(p=>Array.from(p.channels[0])));
let crossings=0;
for(let i=rate+1;i<rate*3;i++)
  if(output[i-1]<=0&&output[i]>0)crossings++;
const pitch=crossings/2;
assert(Math.abs(pitch-440)<13,'3x slowdown must preserve the pitch of a 440Hz signal: '+pitch);
assert.deepEqual(a,snapshot,'Source PCM must remain untouched');
assert(output.every(Number.isFinite),'No numerical dropouts');
const identity=createWarpTimeline(map,[{tick:0,bpm:120}]);
const outputIdentity=Array.from(renderWarpPCMChunks({
  channels:[a],sampleRate:rate,timeline:identity,chunkFrames:777
}));
assert.deepEqual(Float32Array.from(outputIdentity.flatMap(p=>Array.from(p.channels[0]))),a);
const varying=createWarpTimeline(map,[{tick:0,bpm:120},{tick:7680,bpm:80}]);
const varChunks=Array.from(renderWarpPCMChunks({
  channels:[a],sampleRate:rate,timeline:varying,chunkFrames:777
}));
assert.equal(varChunks.reduce((s,p)=>s+p.channels[0].length,0),
  Math.round(varying.outputDurationSeconds*rate));
assert.throws(()=>Array.from(renderWarpPCMChunks({
  channels:[a],sampleRate:rate,timeline:slow,maxWorkingBytes:65536,chunkFrames:8192
})),e=>e.code==='MEMORY_PRESSURE');
const signal=new AbortController();signal.abort();
assert.throws(()=>Array.from(renderWarpPCMChunks({
  channels:[a],sampleRate:rate,timeline:slow,signal:signal.signal
})),e=>e.code==='CANCELLED');
const corrupt=a.slice();corrupt[10]=NaN;
assert.throws(()=>Array.from(renderWarpPCMChunks({
  channels:[corrupt],sampleRate:rate,timeline:slow
})),e=>e.code==='INVALID_PCM');
console.log('Audio Lab Warp chunked: 72000 frames across 93 continuous blocks, stereo, 440Hz preserved at x3, identity, tempo map, memory and cancellation PASS');
