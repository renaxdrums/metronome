import assert from 'node:assert/strict';
import { createWarpMap } from '../audio-lab/tempo-warp-core.mjs';
import { createWarpTimeline } from '../audio-lab/warp/warp-timeline.mjs';
import { renderWarpPCM, createWebAudioBuffer } from '../audio-lab/dsp/wsola.mjs';
const sampleRate=16000, length=sampleRate*1.5;
const source=new Float32Array(length);
for(let i=0;i<length;i++)source[i]=.4*Math.sin(2*Math.PI*440*i/sampleRate);
const before=source.slice();
const map=createWarpMap([{tick:0,sourceSeconds:0,locked:true},{tick:11520,sourceSeconds:1.5,locked:true}]);
const slow=createWarpTimeline(map,[{tick:0,bpm:40}]);
const steps=[];
const output=renderWarpPCM({channels:[source],sampleRate,timeline:slow,onProgress:x=>steps.push(x),maxOutputBytes:32*1024*1024});
assert.equal(output.channels[0].length,sampleRate*4.5);
assert.equal(output.durationSeconds,4.5);
assert.deepEqual(source,before,'source PCM immutable');
assert.equal(steps.at(-1),1);
assert(output.metrics.peak<1.1);
function measuredPitch(x,start,end){let n=0;const a=start*sampleRate,b=end*sampleRate;for(let i=a+1;i<b;i++)if(x[i-1]<=0&&x[i]>0)n++;return n*sampleRate/(b-a);}
const pitch=measuredPitch(output.channels[0],1.2,3.2);
assert(Math.abs(pitch-440)<13,'3x slowdown pitch changed: '+pitch);
const stereo=renderWarpPCM({channels:[source,source],sampleRate,timeline:slow,maxOutputBytes:32*1024*1024});
assert.deepEqual(stereo.channels[0],stereo.channels[1],'stereo channels must share alignment');
const identity=renderWarpPCM({channels:[source],sampleRate,timeline:createWarpTimeline(map,[{tick:0,bpm:120}])});
assert.equal(identity.method,'identity-copy');
assert.deepEqual(identity.channels[0],source);
assert.notEqual(identity.channels[0],source);
const varied=renderWarpPCM({channels:[source],sampleRate,timeline:createWarpTimeline(map,[{tick:0,bpm:120},{tick:7680,bpm:80}]),maxOutputBytes:32*1024*1024});
assert(Math.abs(varied.durationSeconds-1.75)<1/sampleRate);
assert(varied.channels[0].every(Number.isFinite));
assert.throws(()=>renderWarpPCM({channels:[source],sampleRate,timeline:slow,maxOutputBytes:1024}),e=>e.code==='MEMORY_PRESSURE');
const ctl=new AbortController();ctl.abort();
assert.throws(()=>renderWarpPCM({channels:[source],sampleRate,timeline:slow,signal:ctl.signal}),e=>e.code==='CANCELLED');
const corrupt=source.slice();corrupt[2]=NaN;
assert.throws(()=>renderWarpPCM({channels:[corrupt],sampleRate,timeline:slow}),e=>e.code==='INVALID_PCM');
assert.throws(()=>renderWarpPCM({channels:[source,source.subarray(1)],sampleRate,timeline:slow}),/equal-length/);
let copied=[];
const buffer=createWebAudioBuffer({createBuffer:(n,len,rate)=>({copyToChannel:(ch,i)=>copied[i]=ch.slice(),numberOfChannels:n,length:len,sampleRate:rate})},output);
assert.equal(buffer.length,output.channels[0].length);
assert.deepEqual(copied[0],output.channels[0]);
// Test rough attack localization under 3x slow-down; not subjective transient quality.
const beats=new Float32Array(length);
for(const s of [.3,.85,1.2]){const at=Math.round(s*sampleRate);for(let j=0;j<160;j++)beats[at+j]+=.7*Math.exp(-j/28)*Math.sin(2*Math.PI*j*.3);}
const rendered=renderWarpPCM({channels:[beats],sampleRate,timeline:slow});
for(const expected of [.9,2.55,3.6]){
  const at=Math.floor(expected*sampleRate),radius=Math.floor(.1*sampleRate);
  let peak=0;
  for(let j=Math.max(0,at-radius);j<Math.min(rendered.channels[0].length,at+radius);j++)
    peak=Math.max(peak,Math.abs(rendered.channels[0][j]));
  assert(peak>.1,'missing transient around '+expected);
}
console.log('Audio Lab WSOLA: 3x real PCM stretch, pitch='+pitch.toFixed(1)+'Hz, stereo, identity, tempo change, transients and budgets OK');
