import assert from 'node:assert/strict';
import { createWarpMap } from '../audio-lab/tempo-warp-core.mjs';
import { createMeterTimeline } from '../audio-lab/meter-timeline.mjs';
import { createWarpTimeline } from '../audio-lab/warp/warp-timeline.mjs';
import { buildMusicalGrid } from '../audio-lab/musical-grid.mjs';

// A 7/8 measure with 2+2+3 groups followed by 5/8 with 2+3 groups.
// Source tempo changes at the measure boundary; output Warp tempo changes too.
const lengthTicks = 23040;
const meterTimeline = createMeterTimeline([
  { tick: 0, numerator: 7, denominator: 8, groups: [2, 2, 3] },
  { tick: 13440, numerator: 5, denominator: 8, groups: [2, 3] },
], lengthTicks);
const warpMap = createWarpMap([
  { tick: 0, sourceSeconds: 0 },
  { tick: 13440, sourceSeconds: 3.5 },
  { tick: lengthTicks, sourceSeconds: 8.5 },
]);
const warpTimeline = createWarpTimeline(warpMap, [
  { tick: 0, bpm: 120 },
  { tick: 13440, bpm: 60 },
]);
const common = { meterTimeline, warpMap, warpTimeline,
  viewportStartSeconds: 0, widthPixels: 1000, subdivisionCount: 2 };
const original = buildMusicalGrid({ ...common, mode: 'original', viewportEndSeconds: 8.5 });
const warped = buildMusicalGrid({ ...common, mode: 'warp', viewportEndSeconds: 4.25 });
const at = (grid, tick) => grid.lines.find(line => line.tick === tick);

assert.equal(at(original, 0).kind, 'measure');
assert.equal(at(original, 3840).kind, 'group');
assert.equal(at(original, 7680).kind, 'group');
assert.equal(at(original, 13440).kind, 'measure');
assert.equal(at(original, 17280).kind, 'group');
assert.equal(at(original, 13440).seconds, 3.5);
assert.equal(at(original, 17280).seconds, 5.5);
assert.equal(at(warped, 13440).seconds, 1.75);
assert.equal(at(warped, 17280).seconds, 2.75);
assert(at(original, 960)?.kind === 'subdivision');
assert.equal(at(original, 0).label, '1');
assert.equal(at(original, 13440).label, '2');
assert(original.lines.every(line => Number.isFinite(line.x) && line.x >= 0 && line.x <= 1000));

const compact = buildMusicalGrid({ ...common, mode: 'original',
  viewportEndSeconds: 8.5, widthPixels: 50 });
assert(compact.lines.length < original.lines.length / 4,
  'zoomed-out grid must suppress beats and subdivisions');
assert(!compact.lines.some(line => line.kind === 'subdivision'));
assert.equal(at(compact, 13440).seconds, at(original, 13440).seconds,
  'time position must not depend on pixel density');

const detail = buildMusicalGrid({ ...common, mode: 'original',
  viewportStartSeconds: 3, viewportEndSeconds: 5, widthPixels: 800 });
assert(detail.lines.every(line => line.seconds >= 3 && line.seconds <= 5));
assert.equal(at(detail, 13440).seconds, 3.5);

assert.throws(() => buildMusicalGrid({ ...common, mode: 'invalid', viewportEndSeconds: 8.5 }), /mode/);
assert.throws(() => buildMusicalGrid({ ...common, mode: 'original',
  viewportEndSeconds: 8.5, widthPixels: 0 }), /viewport/);
assert.throws(() => buildMusicalGrid({ ...common, mode: 'original',
  meterTimeline: { ...meterTimeline, lengthTicks: 1 }, viewportEndSeconds: 8.5 }), /extent/);
console.log('Audio Lab: original/warp grid, asymmetric groups, tempo changes and adaptive density passed');
