import assert from 'node:assert/strict';
import { buildValidatedWarpMap } from '../audio-lab/warp/validated-map.mjs';
import { tickToSourceSeconds, sourceSecondsToTick, TICKS_PER_QUARTER } from '../audio-lab/tempo-warp-core.mjs';

const map = buildValidatedWarpMap({ durationSeconds: 8, sourceBpm: 120, markers: [
  { kind: 'warp', seconds: 5.9, beat: 12, validated: true, locked: true },
  { kind: 'downbeat', seconds: 2.1, beat: 4, validated: true },
] });
assert.deepEqual(map.anchors.map(anchor => anchor.tick),
  [0, 4 * TICKS_PER_QUARTER, 12 * TICKS_PER_QUARTER, 16 * TICKS_PER_QUARTER]);
assert.deepEqual(map.anchors.map(anchor => anchor.sourceSeconds), [0, 2.1, 5.9, 8]);
assert.equal(map.anchors[2].locked, true);
assert.equal(tickToSourceSeconds(map, 4 * TICKS_PER_QUARTER), 2.1);
assert.equal(sourceSecondsToTick(map, 5.9), 12 * TICKS_PER_QUARTER);

const changing = buildValidatedWarpMap({ durationSeconds: 8, sourceBpm: 120, markers: [
  { kind: 'tempo', seconds: 4, bpm: 60, validated: true },
] });
assert.deepEqual(changing.anchors.map(anchor => anchor.tick),
  [0, 8 * TICKS_PER_QUARTER, 12 * TICKS_PER_QUARTER]);
assert.equal(changing.durationSeconds, 8);
const combined = buildValidatedWarpMap({ durationSeconds: 8, sourceBpm: 120, markers: [
  { kind: 'warp', seconds: 2.1, beat: 4, validated: true, locked: true },
  { kind: 'tempo', seconds: 4, bpm: 60, validated: true },
] });
assert.deepEqual(combined.anchors.map(anchor => anchor.tick),
  [0, 4 * TICKS_PER_QUARTER, 8 * TICKS_PER_QUARTER, 12 * TICKS_PER_QUARTER]);
assert.equal(combined.anchors[1].locked, true);

const empty = buildValidatedWarpMap({ durationSeconds: 8, sourceBpm: 120 });
assert.equal(empty.anchors.length, 2);
assert.throws(() => buildValidatedWarpMap({ durationSeconds: 8, sourceBpm: 120,
  markers: [{ kind: 'warp', seconds: 2, beat: 4, validated: false }] }), /validated/);
assert.throws(() => buildValidatedWarpMap({ durationSeconds: 8, sourceBpm: 120,
  markers: [{ kind: 'warp', seconds: 2, validated: true }] }), /beat/);
assert.throws(() => buildValidatedWarpMap({ durationSeconds: 8, sourceBpm: 120,
  markers: [{ kind: 'warp', seconds: 2, beat: 17, validated: true }] }), /increasing/);
assert.throws(() => buildValidatedWarpMap({ durationSeconds: 8, sourceBpm: 120,
  markers: [{ kind: 'warp', seconds: 2, beat: 1 / 7, validated: true }] }), /representable/);
assert.throws(() => buildValidatedWarpMap({ durationSeconds: 8, sourceBpm: 120,
  markers: [{ kind: 'tempo', seconds: 4, validated: true }] }), /BPM/);
console.log('Audio Lab: validated anchors and tempo changes build monotone Warp maps');
