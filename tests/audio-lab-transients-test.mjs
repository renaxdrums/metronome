import assert from 'node:assert/strict';
import {createWarpMap} from '../audio-lab/tempo-warp-core.mjs';
import {createWarpTimeline} from '../audio-lab/warp/warp-timeline.mjs';
import {renderWarpPCM} from '../audio-lab/dsp/wsola.mjs';
import {protectWarpTransients} from '../audio-lab/dsp/transients.mjs';
const rate=16000,length=rate*1.5,source=new Float32Array(length);
for(const second of [.3,.85,1.2]){
  const p=Math.round(second*rate);
  for(let i=0;i<200;i++)source[p+i]+=.8*Math.exp(-i/22)*Math.sin(2*Math.PI*.3*i);
}
const original=source.slice();
const timeline=createWarpTimeline(createWarpMap([{tick:0,sourceSeconds:0},{tick:11520,sourceSeconds:1.5}]),[{tick:0,bpm:40}]);
const out=renderWarpPCM({channels:[source,source],sampleRate:rate,timeline});
const before=out.channels[0].slice();
const stats=protectWarpTransients({source:[source,source],rendered:out.channels,sampleRate:rate,timeline,onsets:[.3,.85,1.2]});
assert.equal(stats.protectedCount,3);
assert.deepEqual(out.channels[0],out.channels[1],'stereo transient alignment');
assert.deepEqual(source,original,'source unchanged');
for(const second of [.3,.85,1.2]){
  const center=Math.round(second*3*rate);let oldPeak=0,newPeak=0;
  for(let j=center-100;j<center+350;j++){
    oldPeak=Math.max(oldPeak,Math.abs(before[j]));newPeak=Math.max(newPeak,Math.abs(out.channels[0][j]));
  }
  assert(newPeak>.4,'attack lost at '+second);
  assert(newPeak>=oldPeak*.9,'attack amplitude reduced');
}
assert.throws(()=>protectWarpTransients({source:[source],rendered:[before],sampleRate:rate,timeline,onsets:[.85,.3]}),/ordered/);
console.log('Audio Lab: onset-guided transient protection retains attacks in Warp output OK');
