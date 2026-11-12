import assert from 'node:assert/strict';
import {createWarpMap} from '../audio-lab/tempo-warp-core.mjs';
import {createWarpTimeline} from '../audio-lab/warp/warp-timeline.mjs';
import {renderWarpWithTransients} from '../audio-lab/dsp/warp-render.mjs';
const rate=16000,len=24000,x=new Float32Array(len);
for(const second of [.3,.85,1.2]){
  const p=Math.round(second*rate);
  for(let j=0;j<200;j++)x[p+j]+=.8*Math.exp(-j/22)*Math.sin(2*Math.PI*.3*j);
}
const before=x.slice();
const map=createWarpMap([{tick:0,sourceSeconds:0},{tick:11520,sourceSeconds:1.5}]);
const timeline=createWarpTimeline(map,[{tick:0,bpm:40}]);
const rendered=renderWarpWithTransients({channels:[x],sampleRate:rate,timeline,onsets:[.3,.85,1.2]});
assert.deepEqual(x,before);
assert.equal(rendered.metrics.transients.protectedCount,3);
assert(rendered.diagnostics.some(x=>x.includes('transient')));
const identity=renderWarpWithTransients({channels:[x],sampleRate:rate,timeline:createWarpTimeline(map,[{tick:0,bpm:120}]),onsets:[.3]});
assert.equal(identity.method,'identity-copy');assert.deepEqual(identity.channels[0],x);
console.log('Audio Lab Warp: user-reviewed attacks restored in offline DSP pipeline OK');
