import assert from 'node:assert/strict';
import { inferTempoFromOnsets } from '../audio-lab/analysis/tempo-hypotheses.mjs';

const steady = Array.from({ length: 32 }, (_, i) => ({ seconds: i * .5, strength: 1 }));
const estimated = inferTempoFromOnsets(steady);
assert.equal(estimated.candidates[0].bpm, 120);
assert(estimated.candidates.some(candidate => candidate.bpm === 60 && candidate.relation === 'half'));
assert(estimated.candidates.some(candidate => candidate.bpm === 240 && candidate.relation === 'double'));
assert(estimated.confidence < 1, 'attack regularity alone cannot prove the perceived pulse');
const binaryGuided = inferTempoFromOnsets(steady, { subdivision:'binary' });
const ternaryGuided = inferTempoFromOnsets(steady, { subdivision:'ternary' });
assert(binaryGuided.candidates.length > 0 && ternaryGuided.candidates.length > 0,
  'soft musician guidance preserves acoustic candidates');
assert.throws(() => inferTempoFromOnsets(steady, { subdivision:'forced' }), /range/);
assert.throws(() => inferTempoFromOnsets(steady, { originSeconds:-1 }), /range/);

// A missing played attack must not remove the inferred periodicity entirely.
const implicit = steady.filter((_, i) => i % 4 !== 2);
assert(Math.abs(inferTempoFromOnsets(implicit).candidates[0].bpm - 120) <= 2);

const variable = [
  ...Array.from({ length: 24 }, (_, i) => ({ seconds: i * .5, strength: 1 })),
  ...Array.from({ length: 24 }, (_, i) => ({ seconds: 12 + i * .6, strength: 1 })),
];
const changing = inferTempoFromOnsets(variable);
assert(changing.localTempo.some(window => window.startSeconds < 5 && Math.abs(window.bpm - 120) <= 2));
assert(changing.localTempo.some(window => window.startSeconds >= 15 && Math.abs(window.bpm - 100) <= 2));
assert.deepEqual(inferTempoFromOnsets([]).candidates, []);
assert.equal(inferTempoFromOnsets([]).ambiguous, true);
assert.throws(() => inferTempoFromOnsets(null), /array/);
assert.throws(() => inferTempoFromOnsets(steady, { minBpm: 200, maxBpm: 100 }), /range/);
console.log('Audio Lab: tempo alternatives, implicit-beat evidence, local tempo and uncertainty passed');
