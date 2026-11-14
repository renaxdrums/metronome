import assert from 'node:assert/strict';
import { inferMetricHypotheses } from '../audio-lab/analysis/metric-hypotheses.mjs';

// Eight repetitions of 7/8 grouped 2+2+3. Some unit beats have no attack;
// weak syncopated notes are present between group accents.
const onsets = [];
for (let cycle = 0; cycle < 8; cycle++) {
  for (const slot of [0, 2, 4])
    onsets.push({ seconds: cycle * 1.75 + slot * .25, strength: slot === 0 ? 1 : .8 });
  onsets.push({ seconds: cycle * 1.75 + .875, strength: .2 });
}
const result = inferMetricHypotheses(onsets, {
  tempoBpm: 120, originSeconds: 0, durationSeconds: 14,
  confirmedTempo: true, confirmedOrigin: true,
});
assert.equal(result.candidates[0].numerator, 7);
assert.equal(result.candidates[0].denominator, 8);
assert.deepEqual(result.candidates[0].groups, [2, 2, 3]);
assert(result.candidates[0].cycles >= 3);
assert(result.candidates[0].confidence < 1);
assert.equal(result.requiresConfirmation, true);

const tentative = inferMetricHypotheses(onsets, {
  tempoBpm: 120, originSeconds: 0, durationSeconds: 14,
});
assert(tentative.candidates[0].confidence <= .38,
  'unconfirmed tempo/downbeat must cap metric confidence');

const sparse = inferMetricHypotheses(onsets.slice(0, 3), {
  tempoBpm: 120, originSeconds: 0, durationSeconds: 1.75,
});
assert.deepEqual(sparse.candidates, []);
assert.equal(sparse.ambiguous, true);
const evenAccents = Array.from({ length: 64 }, (_, slot) =>
  ({ seconds: slot * .25, strength: .7 }));
const uncertain = inferMetricHypotheses(evenAccents, {
  tempoBpm: 120, originSeconds: 0, durationSeconds: 16,
  confirmedTempo: true, confirmedOrigin: true,
});
assert.equal(uncertain.ambiguous, true,
  'uniform attacks cannot distinguish one meter from another');
assert.throws(() => inferMetricHypotheses(onsets, { tempoBpm: 0 }), /input/);
assert.throws(() => inferMetricHypotheses(onsets, { tempoBpm: 120,
  candidateMeters: [{ numerator: 7, denominator: 8, groups: [2, 2, 2] }] }), /candidate/);
console.log('Audio Lab: constrained asymmetric metric hypotheses preserve uncertainty');
