import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PitchDetector,
  PitchTracker,
  targetFrequency,
  selectTarget,
  noteName,
  TEMPERAMENTS,
  parseNote,
} from '../tuner-core.mjs';
const detector = new PitchDetector(),
  runs = [];
let seed = 1349;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
};
function wave(
  frequency,
  sampleRate,
  { phase = 0, harmonics = [1], noise = 0, dc = 0, decay = 0 } = {},
) {
  return Float32Array.from(
    { length: 8192 },
    (_, i) =>
      dc +
      Math.exp((-decay * i) / sampleRate) *
        (harmonics.reduce(
          (sum, a, h) =>
            sum + a * Math.sin((2 * Math.PI * frequency * (h + 1) * i) / sampleRate + phase),
          0,
        ) *
          0.3 +
          noise * random()),
  );
}
for (const sampleRate of [44100, 48000])
  for (const frequency of [
    16.3516, 27.5, 30.8677, 41.2034, 55, 82.4069, 110, 146.832, 220, 440, 442, 880, 1760, 2093,
    3135.96, 4186,
  ])
    for (const phase of [0, 0.7, 2]) {
      const result = detector.detect(wave(frequency, sampleRate, { phase }), sampleRate);
      assert(result, JSON.stringify({ frequency, sampleRate, phase }));
      const cents = 1200 * Math.log2(result.frequency / frequency);
      assert(Math.abs(cents) < 0.1, JSON.stringify({ frequency, sampleRate, phase, cents }));
      runs.push({ kind: 'sine', sampleRate, frequency, phase, cents });
    }
for (const sampleRate of [44100, 48000])
  for (const frequency of [30.8677, 41.2034, 82.4069, 110, 220, 440, 880, 1760])
    for (const [kind, options, limit] of [
      ['harmonics', { harmonics: [0.2, 1, 0.5, 0.25] }, 0.5],
      ['weak-fundamental', { harmonics: [0.1, 1, 0.02] }, 0.5],
      ['decaying-pluck', { harmonics: [1, 0.4, 0.2, 0.1], decay: 5, dc: 0.1 }, 1],
      ['noise', { harmonics: [1, 0.2, 0.1], noise: 0.02 }, 2],
    ]) {
      const result = detector.detect(wave(frequency, sampleRate, options), sampleRate);
      assert(result, kind + ' ' + frequency);
      const cents = 1200 * Math.log2(result.frequency / frequency);
      assert(Math.abs(cents) < limit, JSON.stringify({ kind, frequency, sampleRate, cents }));
      runs.push({ kind, sampleRate, frequency, cents });
    }
// Sweep quarter-semitone steps and two phases instead of relying only on
// convenient musical frequencies. The upper register stresses interpolation.
for (const sampleRate of [44100, 48000])
  for (let step = 0; 12.7 * 2 ** (step / 48) <= 5390; step++)
    for (const phase of [0, 1.3]) {
      const frequency = 12.7 * 2 ** (step / 48),
        result = detector.detect(wave(frequency, sampleRate, { phase }), sampleRate);
      assert(result, JSON.stringify({ kind: 'sweep', sampleRate, frequency, phase }));
      const cents = 1200 * Math.log2(result.frequency / frequency);
      assert(
        Math.abs(cents) < 0.2,
        JSON.stringify({ kind: 'sweep', sampleRate, frequency, phase, cents }),
      );
      runs.push({ kind: 'sweep', sampleRate, frequency, phase, cents });
    }
for (const signal of [
  new Float32Array(8192),
  new Float32Array(8192).fill(0.4),
  Float32Array.from({ length: 8192 }, () => random() * 0.5),
  wave(440, 48000, { harmonics: [0.0001] }),
])
  assert.equal(detector.detect(signal, 48000), null);
assert.equal(detector.detect(new Float32Array(1), 48000), null);
assert.equal(detector.detect(wave(440, 48000), NaN), null);
const bad = wave(440, 48000);
bad[20] = NaN;
assert.equal(detector.detect(bad, 48000), null);
const tracker = new PitchTracker();
assert.equal(tracker.update({ frequency: 440, clarity: 1 }, 0), null);
assert.equal(tracker.update({ frequency: 440, clarity: 1 }, 60), null);
assert.equal(tracker.update({ frequency: 440, clarity: 1 }, 120).frequency, 440);
assert.equal(tracker.update(null, 180), null, 'Silence never preserves a green reading');
assert.equal(
  tracker.update({ frequency: 880, clarity: 1 }, 240),
  null,
  'Real note changes reset smoothing',
);
assert.equal(tracker.update({ frequency: 880, clarity: 1 }, 300), null);
assert(Math.abs(tracker.update({ frequency: 880, clarity: 1 }, 360).frequency - 880) < 1e-8);
assert.equal(tracker.update(null, 700), null);
assert.equal(tracker.values.length, 0);
for (const a4 of [340, 400, 415, 432, 440, 442, 480, 540])
  for (const temperament of Object.keys(TEMPERAMENTS).filter((k) => k !== 'custom'))
    for (let tonic = 0; tonic < 12; tonic++)
      assert(Math.abs(targetFrequency(69, { a4, temperament, tonic }) - a4) < 1e-8, 'A4 anchor');
assert.equal(selectTarget(442, { a4: 442 }).midi, 69);
assert.equal(selectTarget(442, { a4: 442 }).cents, 0);
assert.equal(selectTarget(442, { a4: 440 }, 57).midi, 57);
assert.equal(selectTarget(31, { instrument: 'bass5' }).midi, 23);
assert.equal(noteName(69, true), 'La4');
assert.equal(noteName(61, false, true), 'D♭4');
assert(
  Math.abs(
    targetFrequency(60, { temperament: 'justMajor', tonic: 0 }) * 1.5 -
      targetFrequency(67, { temperament: 'justMajor', tonic: 0 }),
  ) < 1e-8,
);
assert(
  Math.abs(
    1200 *
      Math.log2(
        targetFrequency(60, { temperament: 'custom', offsets: [10] }) / targetFrequency(60),
      ) -
      10,
  ) < 1e-8,
);
assert.equal(parseNote('E2'), 40);
assert.equal(parseNote('Ré♭4'), 61);
assert.equal(parseNote('B0'), 23);
assert.equal(parseNote('C9'), null);
assert.equal(parseNote('40'), null);
const dir = process.env.TEST_OUTPUT_DIR || path.resolve('tests/results/tuner-core');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, 'tuner-measurements.json'),
  JSON.stringify(
    {
      syntheticOnly: true,
      runs,
      maxSineCents: Math.max(
        ...runs.filter((r) => r.kind === 'sine').map((r) => Math.abs(r.cents)),
      ),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'PASS ' +
    runs.length +
    ' pitch measurements; silence/noise rejection, stability, A4, instruments and temperament math',
);
