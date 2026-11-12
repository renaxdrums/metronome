import assert from 'node:assert/strict';
import {createMeterTimeline,upsertMeterMarker,moveMeterMarker,removeMeterMarker,setFirstDownbeat} from '../audio-lab/meter-timeline.mjs';
import {noteUnitTicks} from '../audio-lab/tempo-warp-core.mjs';
const eighth=noteUnitTicks(1,8),sixteenth=noteUnitTicks(1,16);
const original=createMeterTimeline([
  {tick:0,numerator:7,denominator:8,groups:[2,2,3]},
  {tick:14*eighth,numerator:11,denominator:16,groups:[3,3,3,2]},
],14*eighth+22*sixteenth);
assert.deepEqual(original.measures.map(x=>x.startTick),
  [0,7*eighth,14*eighth,14*eighth+11*sixteenth]);
assert.equal(original.measures.at(-1).endTick,original.lengthTicks);
assert.deepEqual(original.measures[0].groupStartTicks,[0,2*eighth,4*eighth]);
const pickup=setFirstDownbeat(original,2*eighth);
assert.equal(pickup.measures[0].isPickup,true);
assert.equal(pickup.measures[0].endTick,2*eighth);
assert.equal(pickup.measures[1].startTick,2*eighth);
assert.equal(original.firstDownbeatTick,0,'updates must not mutate inputs');
const inserted=upsertMeterMarker(original,
  {tick:3*eighth,numerator:5,denominator:8,groups:[2,3]});
assert.equal(inserted.measures[0].endTick,3*eighth);
assert.equal(inserted.measures[0].isPartial,true);
assert.equal(inserted.measures[1].numerator,5);
assert(inserted.measures[0].groupStartTicks.every(x=>x<3*eighth));
const moved=moveMeterMarker(inserted,3*eighth,4*eighth);
assert(moved.markers.some(m=>m.tick===4*eighth));
assert(!moved.markers.some(m=>m.tick===3*eighth));
assert.equal(removeMeterMarker(moved,4*eighth).markers.length,original.markers.length);
assert.throws(()=>moveMeterMarker(original,0,11),/cannot move/);
assert.throws(()=>removeMeterMarker(original,0),/cannot be deleted/);
assert.throws(()=>moveMeterMarker(original,14*eighth,0),/already exists/);
assert.throws(()=>upsertMeterMarker(original,
  {tick:1,numerator:5,denominator:8,groups:[2,2]}),/sum/);
assert.throws(()=>setFirstDownbeat(original,14*eighth+1),/precede/);
assert.throws(()=>createMeterTimeline([{tick:0,numerator:4,denominator:4}],
  1000000,{maxMeasures:1}),/budget/);
assert.throws(()=>createMeterTimeline([{tick:1,numerator:4,denominator:4}],100),/tick 0/);
assert.throws(()=>createMeterTimeline([{tick:0,numerator:4,denominator:4}],0),/positive duration/);
assert(Object.isFrozen(original.measures[0].groupStartTicks));
console.log('Audio Lab: arbitrary meter markers, partial bars, pickup and non-destructive edits OK');
