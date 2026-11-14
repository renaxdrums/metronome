import assert from 'node:assert/strict';
import { planManualClickEvents } from '../audio-lab/transport/manual-click.mjs';

const config={bpm:120,downbeat:0,numerator:4,denominator:4,groups:[2,2]};
const player={startedAt:10,startedOffset:.3,buffer:{duration:8},
  loop:{start:.3,end:1.7}};
const events=planManualClickEvents({player,fromSeconds:10,toSeconds:12,...config});
const times=events.map(event=>event.seconds);
for(const expected of [10.2,10.7,11.2,11.6])
  assert(times.some(time=>Math.abs(time-expected)<1e-8),
    `source beat ${expected} should be scheduled across a free-length loop`);
assert(!times.some(time=>Math.abs(time-11.7)<1e-8),
  'the old absolute grid must not create an out-of-phase click after wrap');

const aligned=planManualClickEvents({player:{...player,startedOffset:0,
  loop:{start:0,end:2}},fromSeconds:10,toSeconds:12.1,...config});
assert.deepEqual(aligned.map(event=>+event.seconds.toFixed(2)),
  [10,10.5,11,11.5,12]);
assert.equal(aligned[0].accent,2);
assert.equal(aligned[2].accent,1);
assert.deepEqual(planManualClickEvents({player:{...player,loop:null},
  fromSeconds:10,toSeconds:10.8,...config}).map(event=>+event.seconds.toFixed(2)),
  [10.2,10.7]);
console.log('Audio Lab: manual click follows source beats through free and aligned A/B loops');
