import assert from 'node:assert/strict';
import {
  TICKS_PER_QUARTER, noteUnitTicks, buildMeterGrid, createWarpMap,
  tickToSourceSeconds, sourceSecondsToTick, tickToWarpSeconds,
  warpSecondsToSourceSeconds, moveWarpAnchor, insertWarpAnchor, removeWarpAnchor,
} from '../audio-lab/tempo-warp-core.mjs';

assert.equal(TICKS_PER_QUARTER, 3840);
assert.equal(noteUnitTicks(3, 8), 5760);
assert.equal(noteUnitTicks(1, 16), 960);
assert.throws(() => noteUnitTicks(1, 3), /denominator/);
assert.throws(() => noteUnitTicks(1, 2048), /denominator/);

// Alternating 7/8 and 5/8 stay as separate measures with independent accents.
const mixed = buildMeterGrid([
  { numerator: 7, denominator: 8, groups: [2, 2, 3] },
  { numerator: 5, denominator: 8, groups: [3, 2] },
], 2);
assert.deepEqual(mixed.measures.map((m) => m.startTick), [0, 13440, 23040, 36480]);
assert.equal(mixed.lengthTicks, 46080);
assert.deepEqual(mixed.measures[0].groupStartTicks, [0, 3840, 7680]);
assert.deepEqual(mixed.measures[1].groupStartTicks, [13440, 19200]);
assert.equal(mixed.measures[0].unitTicks, mixed.measures[1].unitTicks);

const seventeen = buildMeterGrid([{ numerator: 17, denominator: 16, groups: [3, 3, 3, 4, 4] }]);
assert.equal(seventeen.lengthTicks, 16320);
assert.deepEqual(seventeen.measures[0].groupStartTicks, [0, 2880, 5760, 8640, 12480]);
assert.throws(() => buildMeterGrid([{ numerator: 17, denominator: 16, groups: [4, 4, 4, 4] }]), /sum/);
assert.throws(() => buildMeterGrid([{ numerator: 7, denominator: 8, groups: [0, 7] }]), /positive/);
assert.throws(() => buildMeterGrid([], 1), /empty/);

// The source pulse fluctuates; the warped pulse is regular and explicitly not audio rendering.
const map = createWarpMap([
  { tick: 0, sourceSeconds: 0, locked: true },
  { tick: 3840, sourceSeconds: 0.53 },
  { tick: 7680, sourceSeconds: 1.02, locked: true },
]);
assert.equal(tickToSourceSeconds(map, 3840), 0.53);
assert.equal(tickToWarpSeconds(3840, 120), 0.5);
assert.throws(() => warpSecondsToSourceSeconds(map, 0, 0), /bpm/);
assert.throws(() => tickToWarpSeconds(1e308, 0.1), /numeric range/);
assert.equal(tickToWarpSeconds(5760, 120, { count: 3, denominator: 8 }), 0.5);
assert(Math.abs(warpSecondsToSourceSeconds(map, 0.5, 120) - 0.53) < 1e-10);
assert(Math.abs(sourceSecondsToTick(map, 0.53) - 3840) < 1e-9);
assert.throws(() => tickToSourceSeconds(map, 9000), /outside/);
assert.throws(() => sourceSecondsToTick(map, -0.1), /outside/);
assert.throws(() => createWarpMap([{ tick: 0, sourceSeconds: 0 }, { tick: 0, sourceSeconds: 1 }]), /strictly/);
assert.throws(() => createWarpMap([{ tick: 0, sourceSeconds: 0 }, { tick: 10, sourceSeconds: 0 }]), /strictly/);
assert.throws(() => createWarpMap([{ tick: 0, sourceSeconds: 0.2 }, { tick: 10, sourceSeconds: 1 }]), /start/);

const moved = moveWarpAnchor(map, 1, 0.5);
assert.equal(map.anchors[1].sourceSeconds, 0.53);
assert.equal(moved.anchors[1].sourceSeconds, 0.5);
assert.throws(() => moveWarpAnchor(map, 0, 0.1), /interior/);
assert.throws(() => moveWarpAnchor(map, 1, 1.5), /strictly/);
assert.throws(() => moveWarpAnchor(createWarpMap([
  { tick: 0, sourceSeconds: 0 }, { tick: 3, sourceSeconds: 0.2, locked: true },
  { tick: 8, sourceSeconds: 0.4 },
]), 1, 0.3), /locked/);
const inserted = insertWarpAnchor(map, 5760, 0.77);
assert.equal(inserted.anchors.length, 4);
assert.equal(removeWarpAnchor(inserted, 2).anchors.length, 3);
assert.throws(() => insertWarpAnchor(map, 3840, 0.5), /duplicate/);
assert.throws(() => insertWarpAnchor(map, 5000, 2), /strictly/);
assert.throws(() => removeWarpAnchor(map, 2), /interior/);
assert(Object.isFrozen(map.anchors));
assert(Object.isFrozen(map.anchors[0]));
for (let tick = 0; tick <= map.lengthTicks; tick += 120) {
  const seconds = tickToSourceSeconds(map, tick);
  assert(Math.abs(sourceSecondsToTick(map, seconds) - tick) < 1e-7, 'inverse at ' + tick);
}
console.log('Audio Lab: meter, grouping, monotone warp and source time invariants passed');
