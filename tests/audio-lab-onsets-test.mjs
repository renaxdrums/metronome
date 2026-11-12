import assert from 'node:assert/strict';
import {detectOnsets} from '../audio-lab/analysis/onsets.mjs';
const rate=16000, count=rate*5;
function clicks(times,sign=1,volume=1) {
  const buffer=new Float32Array(count);
  for (const time of times) {
    const at=Math.round(time*rate);
    for(let i=0;i<140 && at+i<count;i++)
      buffer[at+i]+=sign*volume*Math.exp(-i/27)*Math.sin(2*Math.PI*1700*i/rate);
  }
  return buffer;
}
const times=[.45,1.08,1.73,2.35,3.12,3.78];
const left=clicks(times),before=left.slice();
const options={frameSize:512,hopSize:128};
const result=detectOnsets(left,rate,options);
for (const time of times)
  assert(result.onsets.some(e=>Math.abs(e.seconds-time)<.06),'missing synthetic hit '+time);
assert.deepEqual(left,before,'original PCM must remain unchanged');
assert(result.onsets.every(e=>e.strength>=0 && e.strength<=1 &&
  ['low','mid','high'].includes(e.band)));
const stereo=detectOnsets([left,clicks(times,-1)],rate,options);
for (const time of times)
  assert(stereo.onsets.some(e=>Math.abs(e.seconds-time)<.06),'stereo cancellation at '+time);
assert.deepEqual(detectOnsets(new Float32Array(rate),rate,options).onsets,[]);
assert(detectOnsets(clicks([.7,1.7],1,.1),rate,options).onsets
  .some(e=>Math.abs(e.seconds-.7)<.06),'soft attack should be detectable');
const constant=new Float32Array(rate*2);
for(let i=0;i<constant.length;i++)
  constant[i]=.5*Math.sin(2*Math.PI*440*i/rate);
assert(detectOnsets(constant,rate,options).onsets.length<=2,
  'sustained tone should not generate false repeated hits');
assert.throws(()=>detectOnsets([left,new Float32Array(1)],rate),/equal-length/);
assert.throws(()=>detectOnsets(left,rate,{frameSize:513}),/frameSize/);
assert.throws(()=>detectOnsets(left,-1),/sampleRate/);
const controller=new AbortController();controller.abort();
assert.throws(()=>detectOnsets(left,rate,{signal:controller.signal}),/cancelled/);
const corrupted=new Float32Array(2048);corrupted[500]=NaN;
assert.throws(()=>detectOnsets(corrupted,rate),/non-finite/);
console.log('Audio Lab: multiband onset proposals, anti-phase stereo, soft attacks, silence and validation OK');
