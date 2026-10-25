const { start, save } = require('./audio-harness.cjs');
const fs = require('fs');
const assert = require('node:assert/strict');
(async () => {
  const runtime = await start();
  const browser = runtime.browser;
  const reports = [];
  try {
    for (const sampleRate of [44100, 48000])
      for (const injectedOffset of [0, 0.025]) {
        const page = await browser.newPage();
        await page.addInitScript((rate) => {
          const Native = window.AudioContext;
          window.AudioContext = class extends Native {
            constructor(options = {}) {
              super({ ...options, sampleRate: rate });
            }
          };
        }, sampleRate);
        if (process.env.BASELINE_INDEX)
          await page.route('**/*', (r) =>
            new URL(r.request().url()).pathname === '/'
              ? r.fulfill({
                  contentType: 'text/html',
                  body: fs.readFileSync(process.env.BASELINE_INDEX, 'utf8'),
                })
              : r.continue(),
          );
        await page.goto(runtime.url);
        await page.evaluate(() => prepareAllVoiceAudio());
        await page.waitForFunction(() => allVoiceAudioReady);
        const result = await page.evaluate(
          async ({ anchors, sampleRate, injectedOffset }) => {
            const realCtx = audioCtx,
              originalClick = playClick,
              originalVisual = scheduleVisualUpdate;
            const nativeTimeout = window.setTimeout;
            window.setTimeout = () => 0;
            scheduleVisualUpdate = () => {};
            const results = [];
            let maxAttackError = 0,
              maxIntervalError = 0,
              lateStarts = 0;
            const cases = [
              { name: 'Groupes 20/16 a 120 BPM', ms: [[20, 120, [2], 16]] },
              { name: 'Groupes 20/32 a 120 BPM', ms: [[20, 120, [1], 32]] },
              { name: 'Tous les nombres 1-20 a 60 BPM', ms: [[20, 60, [1]]] },
              { name: 'Tous les nombres 1-20', ms: [[20, 120, [1]]] },
              { name: '60 BPM 4/4', ms: [[4, 60, [1]]] },
              { name: '120 BPM 4/4', ms: [[4, 120, [1]]] },
              { name: '60 BPM 3/4', ms: [[3, 60, [1]]] },
              { name: '120 BPM 5/4', ms: [[5, 120, [1]]] },
              {
                name: 'subdivisions 2/3/4/5/6/7/8',
                ms: [
                  [4, 120, [2, 3, 4, 5]],
                  [3, 60, [6, 7, 8]],
                ],
              },
              {
                name: 'mesures et tempos 60->120->90',
                ms: [
                  [4, 60, [1]],
                  [3, 120, [2, 3, 4]],
                  [5, 90, [1]],
                ],
              },
            ];
            for (const bank of ['voiceMale', 'voiceFemale']) {
              for (const test of injectedOffset ? cases.slice(0, 1) : cases) {
                currentBank = bank;
                appMode = 'metronome';
                training.active = false;
                silentModeEnabled = false;
                measures = test.ms.map(([n, bpm, subs, denominator = 4]) => {
                  const m = createMeasure(n, denominator);
                  m.tempo = bpm;
                  m.beatSubdivisions = Array.from({ length: n }, (_, i) => subs[i % subs.length]);
                  m.beatStates = m.beatSubdivisions.map((n) => Array(n).fill(1));
                  return m;
                });
                playingMeasureIndex = 0;
                currentStepInMeasure = 0;
                nextNoteTime = 0.4;
                let expected = [],
                  t = 0.4;
                while (expected.length < 20) {
                  for (const m of measures) {
                    for (let beat = 0; beat < m.numerator; beat++) {
                      const group = m.denominator >= 16 ? m.denominator / 4 : 1;
                      if (beat % group === 0)
                        expected.push({ time: t, number: Math.floor(beat / group) + 1 });
                      t += ((60 / m.tempo) * 4) / m.denominator;
                      if (expected.length === 20) break;
                    }
                    if (expected.length === 20) break;
                  }
                }
                const offline = new OfflineAudioContext(
                  20,
                  Math.ceil((t + 2) * sampleRate),
                  sampleRate,
                );
                const merger = offline.createChannelMerger(20);
                merger.connect(offline.destination);
                let clock = 0,
                  events = [],
                  starts = [];
                audioCtx = {
                  get currentTime() {
                    return clock;
                  },
                  createGain: () => offline.createGain(),
                  createOscillator: () => offline.createOscillator(),
                  createBufferSource: () => {
                    const s = offline.createBufferSource();
                    const start = s.start.bind(s);
                    s.start = (when, offset = 0) => {
                      starts.push({ when, offset, clock });
                      start(when, offset);
                    };
                    return s;
                  },
                };
                playClick = (state, time, first, context) => {
                  if (context.subIndex === 0 && context.beatNumber > 0 && events.length < 20) {
                    const dest = offline.createGain();
                    dest.connect(merger, 0, events.length);
                    events.push({ ...context, time });
                    SOUND_BANKS[currentBank].play(
                      dest,
                      time + injectedOffset,
                      state,
                      first,
                      context,
                    );
                  }
                };
                // Uneven callbacks exercise the actual scheduler; Web Audio owns the grid.
                for (let i = 0; clock < t + 0.5; i++) {
                  scheduler();
                  clock += [0.025, 0.017, 0.04, 0.028][i % 4];
                }
                const rendered = await offline.startRendering();
                let errors = [];
                for (let i = 0; i < 20; i++) {
                  if (events[i].beatNumber !== expected[i].number)
                    throw Error('Wrong count ' + test.name);
                  const gridError = Math.abs(events[i].time - expected[i].time);
                  if (gridError > 1e-9) throw Error('Grid changed');
                  const x = rendered.getChannelData(i),
                    start = starts[i];
                  if (start.offset > 0) lateStarts++;
                  // Match a stable original-word region independently of scheduling.
                  // For "two", keep the vowel as a resampling-stable match window;
                  // its independently measured offset from T locates the beat.
                  const gender = { voiceMale: 'male', voiceFemale: 'female' }[bank];
                  const annotation = anchors.find(
                    (a) => a.gender === gender && a.number === expected[i].number,
                  );
                  const raw =
                    VOICE_METRONOME_BUFFERS[gender][String(expected[i].number)].getChannelData(0);
                  const matchMs = annotation.waveform_match_ms ?? annotation.anchor_ms,
                    referenceSeconds = matchMs / 1000,
                    rawRate =
                      VOICE_METRONOME_BUFFERS[gender][String(expected[i].number)].sampleRate;
                  const ref = Math.round(referenceSeconds * rawRate),
                    center = Math.round(
                      (expected[i].time + (matchMs - annotation.anchor_ms) / 1000) *
                        rendered.sampleRate,
                    ),
                    radius = Math.round(rawRate * 0.005),
                    stride = Math.max(1, Math.round(rawRate / 12000));
                  let bestError = Infinity,
                    bestDelta = 0,
                    energy = 0;
                  for (let j = -radius; j < radius; j += stride) energy += (raw[ref + j] || 0) ** 2;
                  if (energy < 1e-7)
                    throw Error('Missing vowel nucleus in ' + bank + ' ' + expected[i].number);
                  for (let ms = -250; ms <= 250; ms++)
                    for (const phase of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
                      // Correlate shape independently of the approved loudness normalization.
                      let xy = 0,
                        yy = 0;
                      for (let j = -radius; j < radius; j += stride) {
                        const target = raw[ref + j] || 0,
                          position =
                            center +
                            (ms / 1000) * rendered.sampleRate +
                            (j / rawRate) * rendered.sampleRate +
                            phase,
                          frame = Math.floor(position),
                          fraction = position - frame,
                          actual =
                            (x[frame] || 0) * (1 - fraction) + (x[frame + 1] || 0) * fraction;
                        xy += target * actual;
                        yy += actual * actual;
                      }
                      const error =
                        yy > 1e-12 && xy > 0
                          ? Math.max(0, 1 - (xy * xy) / (energy * yy))
                          : Infinity;
                      if (error < bestError) {
                        bestError = error;
                        bestDelta = ms;
                      }
                    }
                  if (bestError > 1e-3)
                    throw Error(
                      'Rendered word/landmark differs from reference ' +
                        JSON.stringify({
                          sampleRate,
                          bank,
                          case: test.name,
                          index: i,
                          bestError,
                          bestDelta,
                          injectedOffset,
                        }),
                    );
                  const err = bestDelta;
                  errors.push(err);
                  maxAttackError = Math.max(maxAttackError, Math.abs(err));
                  if (i)
                    maxIntervalError = Math.max(maxIntervalError, Math.abs(err - errors[i - 1]));
                }
                results.push({
                  bank,
                  case: test.name,
                  beats: 20,
                  maxAttackErrorMs: Math.max(...errors.map(Math.abs)),
                  maxIntervalErrorMs: Math.max(
                    ...errors.slice(1).map((e, i) => Math.abs(e - errors[i])),
                  ),
                  lateStarts: starts.filter((s) => s.offset > 0).length,
                });
              }
            }
            audioCtx = realCtx;
            playClick = originalClick;
            scheduleVisualUpdate = originalVisual;
            window.setTimeout = nativeTimeout;
            return {
              sampleRate,
              decodedSampleRate: VOICE_METRONOME_BUFFERS.male['1'].sampleRate,
              injectedOffset,
              criterion:
                'Waveform-matched independently annotated vowel-nucleus landmarks, 1 ms search step',
              maxAttackErrorMs: maxAttackError,
              maxIntervalErrorMs: maxIntervalError,
              lateStarts,
              results,
            };
          },
          {
            anchors: JSON.parse(
              fs.readFileSync(require('path').join(__dirname, 'voice-anchors.json'), 'utf8'),
            ),
            sampleRate,
            injectedOffset,
          },
        );
        assert.equal(result.decodedSampleRate, sampleRate);
        const validate = () => {
          assert(result.maxAttackErrorMs <= 1.1, 'Rendered timing exceeds 1.1 ms');
          assert(result.maxIntervalErrorMs <= 1.1, 'Rendered interval exceeds 1.1 ms');
          assert.equal(result.lateStarts, 0, 'Late audio source start');
        };
        if (injectedOffset) {
          // Apply the same acceptance criterion: shifted audio must be rejected.
          assert.throws(validate, /Rendered timing exceeds 1.1 ms/);
          for (const scenario of result.results)
            assert(Math.abs(scenario.maxAttackErrorMs - injectedOffset * 1000) <= 1.1);
        } else {
          validate();
          assert.equal(result.results.length, 20);
        }
        reports.push(result);
        await page.close();
      }
    save('timing-results.json', reports);
    console.log(
      'PASS 20 scenarios at 44100 and 48000 Hz; injected 25 ms shifts detected at both rates',
    );
  } finally {
    await browser.close();
    runtime.server?.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
