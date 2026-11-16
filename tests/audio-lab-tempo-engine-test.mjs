import assert from 'node:assert/strict';
import { analyseTempo, inferTempoFromEnvelope, onsetEnvelopeFromPcm }
  from '../audio-lab/analysis/tempo-engine.mjs';

// Deterministic click-track synthesis: noise bursts with exponential decay.
const SR = 22050;
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000) * 2 - 1;
}
function clickTrack({ beats, seconds, dropEvery = 0, noise = 0, seed = 1 }) {
  const rnd = lcg(seed);
  const out = new Float32Array(Math.round(seconds * SR));
  if (noise) for (let i = 0; i < out.length; i++) out[i] = noise * rnd();
  beats.forEach((t, k) => {
    if (dropEvery && k % dropEvery === dropEvery - 1) return;
    const start = Math.round(t * SR), len = Math.round(.03 * SR);
    for (let i = 0; i < len && start + i < out.length; i++)
      out[start + i] += .9 * rnd() * Math.exp(-i / (.006 * SR));
  });
  return out;
}
const uniformBeats = (bpm, seconds, offset = .5) =>
  Array.from({ length: Math.floor((seconds - offset) * bpm / 60) }, (_, k) => offset + k * 60 / bpm);
function matchRate(detected, truth, tolerance = .03) {
  let hits = 0;
  for (const t of truth) if (detected.some(d => Math.abs(d - t) <= tolerance)) hits++;
  return hits / truth.length;
}

// 1. Steady tempos: BPM within 0.5 and at least 90% of beats within 30 ms.
for (const bpm of [120, 87, 72, 150, 200]) {
  const seconds = 30, truth = uniformBeats(bpm, seconds);
  const r = analyseTempo([clickTrack({ beats: truth, seconds })], SR);
  assert(r.bpm !== null, `${bpm} BPM: no tempo`);
  assert(Math.abs(r.bpm - bpm) <= .5, `${bpm} BPM: measured ${r.bpm.toFixed(2)}`);
  assert(matchRate(r.beats, truth) >= .9, `${bpm} BPM: beat match ${matchRate(r.beats, truth)}`);
  assert.equal(r.candidates[0].relation, 'primary');
  // Median absolute timing error of tracked beats, in seconds.
  const errors = truth.map(t => Math.min(...r.beats.map(d => Math.abs(d - t))))
    .sort((a, b) => a - b);
  assert(errors[errors.length >> 1] <= .012, `${bpm} BPM: median beat error ${errors[errors.length >> 1]}`);
}

// 2. Missing attacks (every 4th click removed) must not break the tempo.
{
  const truth = uniformBeats(100, 30);
  const r = analyseTempo([clickTrack({ beats: truth, seconds: 30, dropEvery: 4 })], SR);
  assert(Math.abs(r.bpm - 100) <= 1, `dropout: measured ${r.bpm}`);
}

// 3. Octave: a 60 BPM click track must report 60 as primary, not 120.
{
  const truth = uniformBeats(60, 30);
  const r = analyseTempo([clickTrack({ beats: truth, seconds: 30 })], SR);
  assert(Math.abs(r.bpm - 60) <= .5, `60 BPM octave: measured ${r.bpm}`);
}

// 4. Tempo drift 100 -> 120 BPM over 30 s: the local curve must follow it.
{
  const beats = [];
  let t = .5;
  while (t < 29) { beats.push(t); t += 60 / (100 + 20 * t / 30); }
  const r = analyseTempo([clickTrack({ beats, seconds: 30 })], SR);
  const early = r.tempoCurve.filter(p => p.seconds < 6).map(p => p.bpm);
  const late = r.tempoCurve.filter(p => p.seconds > 24).map(p => p.bpm);
  assert(early.length && late.length, 'drift: curve missing');
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert(Math.abs(mean(early) - 102) <= 4, `drift early: ${mean(early)}`);
  assert(Math.abs(mean(late) - 118) <= 4, `drift late: ${mean(late)}`);
  assert(mean(late) > mean(early) + 8, 'drift curve must rise');
}

// 5. Noise without any pulse must not claim confidence.
{
  const noise = clickTrack({ beats: [], seconds: 20, noise: .5, seed: 7 });
  const r = analyseTempo([noise], SR);
  assert(r.confidence < .5, `noise confidence ${r.confidence}`);
}

// 6. Silence and very short input.
assert.deepEqual(analyseTempo([new Float32Array(SR * 10)], SR).candidates, []);
assert.equal(inferTempoFromEnvelope(new Float64Array(20), .01).ambiguous, true);
assert.equal(analyseTempo([new Float32Array(100)], SR).bpm, null);

// 7. Validation.
assert.throws(() => onsetEnvelopeFromPcm([], SR), /PCM/);
assert.throws(() => onsetEnvelopeFromPcm([new Float32Array(10)], 0), /sampleRate/);
assert.throws(() => onsetEnvelopeFromPcm([new Float32Array([NaN, 0, 0])], SR, {}), /non-finite/);
assert.throws(() => inferTempoFromEnvelope([1, 2], .01), /typed array/);
assert.throws(() => inferTempoFromEnvelope(new Float64Array(10), .01, { minBpm: 200, maxBpm: 100 }), /range/);

console.log('Audio Lab: tempo engine steady, dropout, octave, drift, noise, silence and validation checks passed');
