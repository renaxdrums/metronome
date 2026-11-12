import assert from 'node:assert/strict';
import {encodeAudioLabWav} from '../audio-lab/io/wav-export.mjs';
const left=Float32Array.from([-1,-.5,0,.5,1,1.2]);
const right=Float32Array.from([.5,0,-.5,-1,.25,0]);
const frozenLeft=left.slice(),frozenRight=right.slice();
for(const sampleRate of [44100,48000,96000]){
 for(const bitDepth of [16,24]){
  const progress=[];
  const result=encodeAudioLabWav({channels:[left,right],sampleRate,bitDepth,
    onProgress:p=>progress.push(p)});
  const view=new DataView(result.bytes.buffer);
  const cc=at=>String.fromCharCode(...result.bytes.subarray(at,at+4));
  assert.equal(cc(0),'RIFF');assert.equal(cc(8),'WAVE');assert.equal(cc(12),'fmt ');
  assert.equal(cc(36),'data');assert.equal(view.getUint32(4,true),result.bytes.length-8);
  assert.equal(view.getUint16(20,true),1);assert.equal(view.getUint16(22,true),2);
  assert.equal(view.getUint32(24,true),sampleRate);assert.equal(view.getUint16(34,true),bitDepth);
  assert.equal(view.getUint32(40,true),6*2*(bitDepth/8));
  assert.equal(result.frames,6);assert.equal(result.clippedSamples,1);
  assert(Math.abs(result.durationSeconds-6/sampleRate)<1e-10);
  const bps=bitDepth/8;
  function read(frame,ch){
   const at=44+(frame*2+ch)*bps;
   if(bitDepth===16)return view.getInt16(at,true);
   const n=result.bytes[at]|(result.bytes[at+1]<<8)|(result.bytes[at+2]<<16);
   return n&0x800000?n-0x1000000:n;
  }
  const scale=2**(bitDepth-1);
  assert.equal(read(0,0),-scale);assert.equal(read(0,1),scale/2);
  assert.equal(read(1,0),-scale/2);
  assert.equal(read(2,0),0);assert.equal(read(3,0),scale/2);
  assert.equal(read(4,0),scale-1);assert.equal(read(5,0),scale-1);
  assert.equal(progress.at(-1),1);
 }
}
assert.deepEqual(left,frozenLeft);assert.deepEqual(right,frozenRight);
assert.throws(()=>encodeAudioLabWav({channels:[left,right],sampleRate:96000,maxEncodedBytes:45}),/budget/);
assert.throws(()=>encodeAudioLabWav({channels:[left,right],sampleRate:96000,bitDepth:20}),/16\/24/);
const invalid=left.slice();invalid[1]=NaN;
assert.throws(()=>encodeAudioLabWav({channels:[invalid],sampleRate:48000}),/non-finite/);
const abort=new AbortController();abort.abort();
assert.throws(()=>encodeAudioLabWav({channels:[left],sampleRate:48000,signal:abort.signal}),e=>e.name==='AbortError');
assert.throws(()=>encodeAudioLabWav({channels:[left,right.subarray(0,5)],sampleRate:48000}),/equal-length/);
console.log('Audio Lab: independent stereo PCM WAV 16/24-bit export at 44.1/48/96 kHz, peak/budget/cancel and unchanged source OK');
