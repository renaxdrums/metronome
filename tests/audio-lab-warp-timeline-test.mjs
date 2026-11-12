import assert from 'node:assert/strict';
import {createWarpMap} from '../audio-lab/tempo-warp-core.mjs';
import {createWarpTimeline,outputSecondsToSourceSeconds,sourceSecondsToOutputSeconds,
  tickToOutputSeconds,outputSecondsToTick} from '../audio-lab/warp/warp-timeline.mjs';
const approx=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const map=createWarpMap([
  {tick:0,sourceSeconds:0,locked:true},{tick:3840,sourceSeconds:0.53},
  {tick:7680,sourceSeconds:1.02,locked:true},{tick:11520,sourceSeconds:1.48}
]);
const regular=createWarpTimeline(map,[{tick:0,bpm:120,pulse:{count:1,denominator:4}}]);
approx(regular.outputDurationSeconds,1.5);
approx(tickToOutputSeconds(regular,7680),1);
approx(outputSecondsToSourceSeconds(regular,0.5),0.53);
approx(sourceSecondsToOutputSeconds(regular,1.02),1);
const change=createWarpTimeline(map,[{tick:0,bpm:120},{tick:7680,bpm:80,pulse:{count:1,denominator:4}}]);
approx(change.outputDurationSeconds,1.75);
assert.equal(change.segments.length,3);
approx(change.segments[2].outputStartSeconds,1);
for(let tick=0;tick<=map.lengthTicks;tick+=120){
  const out=tickToOutputSeconds(change,tick);
  approx(outputSecondsToTick(change,out),tick);
}
for(let i=0;i<=100;i++){
  const s=map.durationSeconds*i/100;
  approx(outputSecondsToSourceSeconds(change,sourceSecondsToOutputSeconds(change,s)),s);
}
approx(createWarpTimeline(map,[{tick:0,bpm:40}]).outputDurationSeconds,4.5);
approx(createWarpTimeline(map,[{tick:0,bpm:120,pulse:{count:3,denominator:8}}]).outputDurationSeconds,1);
assert.throws(()=>createWarpTimeline(map,[{tick:200,bpm:120}]),/first tempo/);
assert.throws(()=>createWarpTimeline(map,[{tick:0,bpm:120},{tick:0,bpm:110}]),/strictly/);
assert.throws(()=>createWarpTimeline(map,[{tick:0,bpm:0}]),/positive/);
assert.throws(()=>createWarpTimeline(map,[{tick:0,bpm:100,pulse:{count:1,denominator:3}}]),/denominator/);
assert.throws(()=>outputSecondsToTick(change,-0.1),/outside/);
assert.throws(()=>outputSecondsToSourceSeconds(change,2),/outside/);
assert(Object.isFrozen(change.segments));assert(Object.isFrozen(change.segments[0]));
console.log('Audio Lab: Warp timeline mapping and low tempo bounds passed');
