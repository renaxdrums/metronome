import assert from 'node:assert/strict';
import {createWarpMap} from '../audio-lab/tempo-warp-core.mjs';
import {createWarpTimeline} from '../audio-lab/warp/warp-timeline.mjs';
import {createWarpClickPlan,scheduleWarpClickRange} from '../audio-lab/transport/warp-click.mjs';
const map=createWarpMap([{tick:0,sourceSeconds:0},{tick:13440,sourceSeconds:1.75}]);
const time=createWarpTimeline(map,[{tick:0,bpm:120}]);
const meter={measures:[{index:0,startTick:0,endTick:13440,numerator:7,denominator:8,groupStartTicks:[0,3840,7680]}]};
const clicks=createWarpClickPlan({warpTimeline:time,meterTimeline:meter});
assert.deepEqual(clicks.events.map(e=>e.seconds),[0,.5,1]);
assert.deepEqual(clicks.events.map(e=>e.accent),[2,1,1]);
const subdiv=createWarpClickPlan({warpTimeline:time,meterTimeline:meter,mode:'unit'});
assert.equal(subdiv.events.length,7);
assert.deepEqual(subdiv.events.map(e=>e.accent),[2,0,1,0,1,0,0]);
const variable=createWarpTimeline(map,[{tick:0,bpm:120},{tick:7680,bpm:80}]);
assert.deepEqual(createWarpClickPlan({warpTimeline:variable,meterTimeline:meter}).events.map(e=>e.seconds),[0,.5,1]);
const starts=[];
const context={currentTime:10,destination:{},
  createGain:()=>({gain:{value:1},connect:()=>{},disconnect:()=>{}}),
  createBufferSource:()=>({connect:()=>{},disconnect:()=>{},start:x=>starts.push(x)})};
const buffer={duration:.1};
const nodes=scheduleWarpClickRange({context,clickSamples:[buffer,buffer,buffer],plan:clicks,sessionStartAudioTime:10,fromSeconds:0,toSeconds:1.4});
assert.deepEqual(starts,[10,10.5,11]);assert.equal(nodes.length,3);
assert.throws(()=>createWarpClickPlan({warpTimeline:time,meterTimeline:meter,mode:'unit',subdivisions:7}),/integer ticks/);
assert(Object.isFrozen(clicks.events));
console.log('Audio Lab: asymmetric grouped click plan and shared AudioContext scheduling OK');
