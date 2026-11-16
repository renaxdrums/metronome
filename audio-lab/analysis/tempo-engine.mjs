/**
 * RENAX Audio Lab — tempo engine. Offline, deterministic, dependency-free.
 *
 * Pipeline:
 *   PCM -> onset-strength envelope (log-energy flux, full band + first difference)
 *       -> autocorrelation tempo candidates with octave relations (no 4/4 assumption)
 *       -> local tempo curve (sliding windows)
 *       -> dynamic-programming beat tracking that follows the local tempo curve.
 *
 * Outputs are proposals. A tempo is not a pulse level, a meter or a downbeat:
 * the musician validates those. Source PCM is never modified.
 */

export const TEMPO_ENGINE_LIMITS = Object.freeze({ minBpm: 40, maxBpm: 240 });
const ENVELOPE_BEAT_LATENCY_SECONDS = .0178;

const clamp01 = value => Math.max(0, Math.min(1, value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function validateChannels(channels, sampleRate) {
  const list = channels instanceof Float32Array ? [channels] : channels;
  if (!Array.isArray(list) || !list.length || list.length > 32 ||
      !list.every(c => c instanceof Float32Array && c.length === list[0].length))
    throw new TypeError('PCM must be 1..32 equal-length Float32Array channels');
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 384000)
    throw new RangeError('sampleRate outside supported range');
  return list;
}

/**
 * Onset-strength envelope, one value per hop. Values are normalised to [0, 1].
 * Log-energy rises are measured on the signal and on its first difference, so
 * both sustained broadband attacks and high-frequency transients contribute.
 */
export function onsetEnvelopeFromPcm(channels, sampleRate,
  { hopSeconds = .01, windowSeconds = .023 } = {}) {
  const list = validateChannels(channels, sampleRate);
  if (!(hopSeconds > 0 && hopSeconds <= .05) || !(windowSeconds > 0 && windowSeconds <= .2))
    throw new RangeError('invalid envelope timing');
  const hop = Math.max(1, Math.round(hopSeconds * sampleRate));
  const win = Math.max(hop, Math.round(windowSeconds * sampleRate));
  const length = list[0].length;
  for (const data of list)
    for (let i = 0; i < length; i++)
      if (!Number.isFinite(data[i])) throw new RangeError('PCM contains non-finite sample');
  const frames = length < win ? 0 : Math.floor((length - win) / hop) + 1;
  const logEnergy = new Float64Array(frames);
  const logFlux = new Float64Array(frames);
  const channelCount = list.length;
  for (let f = 0; f < frames; f++) {
    const start = f * hop;
    let energy = 0, flux = 0;
    for (const data of list) {
      for (let i = start; i < start + win; i++) {
        const x = data[i];
        if (!Number.isFinite(x)) throw new RangeError('PCM contains non-finite sample');
        energy += x * x;
        const d = i > 0 ? x - data[i - 1] : x;
        flux += d * d;
      }
    }
    logEnergy[f] = Math.log10(energy / (channelCount * win) + 1e-10);
    logFlux[f] = Math.log10(flux / (channelCount * win) + 1e-10);
  }
  const envelope = new Float64Array(frames);
  let max = 0;
  for (let f = 1; f < frames; f++) {
    const value = Math.max(0, logEnergy[f] - logEnergy[f - 1]) +
      Math.max(0, logFlux[f] - logFlux[f - 1]);
    envelope[f] = value;
    if (value > max) max = value;
  }
  if (max > 0) for (let f = 0; f < frames; f++) envelope[f] /= max;
  return { envelope, hopSeconds: hop / sampleRate };
}

/** Normalised autocorrelation of the mean-removed envelope, for lags lo..hi. */
function autocorrelation(x, lo, hi) {
  const n = x.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  const c = new Float64Array(n);
  let r0 = 0;
  for (let i = 0; i < n; i++) { c[i] = x[i] - mean; r0 += c[i] * c[i]; }
  if (r0 <= 0) return null;
  const norm = r0 / n;
  const out = new Float64Array(hi + 2);
  for (let lag = Math.max(1, lo); lag <= Math.min(hi, n - 2); lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += c[i] * c[i + lag];
    out[lag] = sum / (n - lag) / norm;
  }
  return out;
}

/**
 * Autocorrelation peaks mapped to BPM, refined by parabolic interpolation.
 * `score` ranks peaks with a weak log-normal prior centred on `centerBpm`, so
 * the prior breaks ties without overriding strong evidence.
 */
function tempoPeaks(x, fps, { minBpm, maxBpm, centerBpm, priorOctaves }) {
  const minLag = Math.max(2, Math.floor(60 * fps / maxBpm));
  const maxLag = Math.ceil(60 * fps / minBpm);
  if (x.length < 2 * maxLag + 2) return null;
  const ac = autocorrelation(x, minLag - 1, maxLag + 1);
  if (!ac) return null;
  const peaks = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    const v = ac[lag];
    if (!(v > 0 && v >= ac[lag - 1] && v >= ac[lag + 1])) continue;
    const denom = ac[lag - 1] - 2 * v + ac[lag + 1];
    const delta = denom < 0 ? clamp(.5 * (ac[lag - 1] - ac[lag + 1]) / denom, -.5, .5) : 0;
    const bpm = 60 * fps / (lag + delta);
    const prior = Math.exp(-.5 * (Math.log2(bpm / centerBpm) / priorOctaves) ** 2);
    // The prior only breaks near-ties (at most 10 % of the score): evidence decides.
    peaks.push({ bpm, strength: v, score: v * (.9 + .1 * prior) });
  }
  if (!peaks.length) return null;
  return peaks.sort((a, b) => b.score - a.score || a.bpm - b.bpm).slice(0, 8);
}

/**
 * Pulse-level selection constants, fitted on a tuning split (synthetic click banks
 * plus half of an annotated drum corpus) and verified on a held-out half. They are
 * stated here because they are empirical, not derived.
 */
const LEVEL = Object.freeze({
  salienceWeight: .1,   // weight on log grid energy: rejects levels with an empty grid
  infillWeight: 2,      // penalty once midpoints rival the beats themselves
  infillFloor: .85,     // below this, a midpoint is an ordinary subdivision, not a missed beat
  restCenterBpm: 90,    // log-normal preference centre for a perceived pulse
  restOctaves: 2,       // its width, in octaves: deliberately gentle
  toleranceFrames: 3,   // ±30 ms at a 10 ms hop, so phase quantisation cannot hide a peak
});

/** Names a level by the note value it would carry if the selected pulse is a quarter note. */
const UNIT_IF_QUARTER = new Map([[.25, 'ronde'], [.5, 'blanche'], [1, 'noire'],
  [2, 'croche'], [4, 'double-croche']]);

/** Strongest envelope value within the tolerance window around a grid position. */
function peakNear(envelope, frame) {
  const lo = Math.max(0, Math.round(frame) - LEVEL.toleranceFrames);
  const hi = Math.min(envelope.length - 1, Math.round(frame) + LEVEL.toleranceFrames);
  let best = 0;
  for (let i = lo; i <= hi; i++) if (envelope[i] > best) best = envelope[i];
  return best;
}

/**
 * Evidence for one candidate pulse level, at its best phase.
 * - `salience`: mean onset energy carried by the grid.
 * - `alternation`: how unevenly that energy splits between odd and even beats. Near 1
 *   means every other slot is empty, so the level subdivides a slower pulse.
 * - `infill`: energy at the midpoints relative to the beats. Near 1 means a full beat
 *   sits between every pair, so the level is too coarse.
 */
function levelEvidence(envelope, fps, bpm) {
  const period = 60 * fps / bpm;
  if (period < 2 * LEVEL.toleranceFrames + 2 || period * 3 >= envelope.length) return null;
  let best = null;
  for (let step = 0; step < 48; step++) {
    let evenSum = 0, evenCount = 0, oddSum = 0, oddCount = 0, midSum = 0, midCount = 0, index = 0;
    for (let t = period * step / 48; t < envelope.length - 1; t += period, index++) {
      const value = peakNear(envelope, t);
      if (index % 2) { oddSum += value; oddCount++; } else { evenSum += value; evenCount++; }
      const mid = t + period / 2;
      if (mid < envelope.length - 1) { midSum += peakNear(envelope, mid); midCount++; }
    }
    if (!evenCount || !oddCount || !midCount) continue;
    const even = evenSum / evenCount, odd = oddSum / oddCount;
    const salience = (evenSum + oddSum) / (evenCount + oddCount);
    if (best && salience <= best.salience) continue;
    best = { salience, alternation: Math.abs(even - odd) / (even + odd + 1e-12),
      infill: (midSum / midCount) / (salience + 1e-12) };
  }
  return best;
}

/**
 * Choose which metrical level is the pulse, among a rate and its neighbouring octaves.
 *
 * Acoustically the level is not fully determined: a bar of quarter notes with eighth
 * hi-hats and a bar of eighth notes carry the same evidence. So this ranks levels by a
 * cost and returns all of them, leaving the musician the final say.
 */
function selectPulseLevel(envelope, fps, bpm, minBpm, maxBpm) {
  const levels = [];
  for (const ratio of [.25, .5, 1, 2, 4]) {
    const rate = bpm * ratio;
    if (rate < minBpm || rate > maxBpm) continue;
    const evidence = levelEvidence(envelope, fps, rate);
    if (!evidence) continue;
    const cost = -LEVEL.salienceWeight * Math.log(evidence.salience + 1e-6)
      + LEVEL.infillWeight * Math.max(0, evidence.infill - LEVEL.infillFloor)
      + (Math.log2(rate / LEVEL.restCenterBpm) / LEVEL.restOctaves) ** 2;
    levels.push({ bpm: rate, cost, evidence });
  }
  if (!levels.length) return null;
  levels.sort((a, b) => a.cost - b.cost);
  const chosen = levels[0];
  // How far ahead the winner is. Measured on the evaluation corpus, this gap separates
  // right from wrong only weakly (wrong answers span 0.00-0.17, right ones 0.00-0.41),
  // so it is reported as a graded value and the flag below is set deliberately wide:
  // every level error in that corpus falls under 0.20, at the cost of flagging most
  // tracks. The level really is ambiguous in most music, so the honest interface is a
  // x2 / half toggle over `levels`, not a rare warning.
  const gap = levels.length > 1 ? levels[1].cost - chosen.cost : Infinity;
  return {
    bpm: chosen.bpm,
    ambiguous: gap < .2,
    levelConfidence: clamp01(gap / .4),
    levels: levels.map(level => {
      const ratio = level.bpm / chosen.bpm;
      const rounded = [.25, .5, 1, 2, 4].find(r => Math.abs(ratio / r - 1) < .05);
      return { bpm: level.bpm, ratio: rounded ?? ratio,
        unitIfQuarter: UNIT_IF_QUARTER.get(rounded) ?? null,
        relativeCost: level.cost - chosen.cost, evidence: level.evidence };
    }),
  };
}

function relationTo(bpm, primaryBpm) {
  const ratio = bpm / primaryBpm;
  if (Math.abs(ratio - 1) < .03) return 'primary';
  if (Math.abs(ratio - .5) < .03) return 'half';
  if (Math.abs(ratio - 2) < .06) return 'double';
  return 'alternative';
}

/** Dynamic-programming beat tracker (Ellis-style). `periodFrames[t]` is the expected beat period at frame t. */
function trackBeats(envelope, periodFrames, lambda) {
  const n = envelope.length;
  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    const period = periodFrames[t];
    const lo = Math.max(0, Math.floor(t - 2 * period));
    const hi = Math.floor(t - period / 2);
    let best = -Infinity, from = -1;
    for (let tau = lo; tau <= hi; tau++) {
      const d = (t - tau) / period;
      const value = score[tau] - lambda * Math.log2(d) ** 2;
      if (value > best) { best = value; from = tau; }
    }
    if (from >= 0 && best > 0) { score[t] = envelope[t] + best; back[t] = from; }
    else score[t] = envelope[t];
  }
  if (n === 0) return [];
  let end = 0;
  for (let t = 1; t < n; t++) if (score[t] > score[end]) end = t;
  const beats = [];
  for (let t = end; t >= 0; t = back[t]) beats.push(t);
  return beats.reverse();
}

/**
 * Tempo inference from an onset envelope.
 * @returns {{bpm:number|null, pulseUnit:string|null,
 *   pulseLevels:Array<{bpm:number,ratio:number,unitIfQuarter:string|null,relativeCost:number,
 *     evidence:{salience:number,alternation:number,infill:number}}>,
 *   pulseLevelConfidence:number,
 *   candidates:Array<{bpm:number,relation:string,confidence:number}>,
 *   confidence:number, ambiguous:boolean, octaveAmbiguity:boolean,
 *   tempoCurve:Array<{seconds:number,bpm:number}>, beats:number[], diagnostics:string[]}}
 */
export function inferTempoFromEnvelope(envelope, hopSeconds, {
  minBpm = TEMPO_ENGINE_LIMITS.minBpm, maxBpm = TEMPO_ENGINE_LIMITS.maxBpm,
  localWindowSeconds = 8, lambda = 4,
} = {}) {
  if (!(envelope instanceof Float64Array || envelope instanceof Float32Array))
    throw new TypeError('envelope must be a typed array');
  if (!(hopSeconds > 0 && hopSeconds <= .05)) throw new RangeError('invalid hopSeconds');
  if (!(minBpm >= 20 && maxBpm <= 400 && minBpm < maxBpm)) throw new RangeError('invalid tempo range');
  if (!(localWindowSeconds >= 4 && localWindowSeconds <= 60)) throw new RangeError('invalid local window');
  if (!(lambda > 0)) throw new RangeError('invalid lambda');
  const fps = 1 / hopSeconds;
  const empty = { bpm: null, pulseUnit: null, pulseLevels: [], pulseLevelConfidence: 0,
    candidates: [], confidence: 0, ambiguous: true, octaveAmbiguity: false, tempoCurve: [], beats: [],
    diagnostics: ['Insufficient acoustic evidence for tempo'] };

  const peaks = tempoPeaks(envelope, fps, { minBpm, maxBpm, centerBpm: 120, priorOctaves: 1.5 });
  if (!peaks) return empty;
  // Autocorrelation locates the grid; it does not say which metrical level is the pulse.
  const selection = selectPulseLevel(envelope, fps, peaks[0].bpm, minBpm, maxBpm);
  const primary = { ...peaks[0], bpm: selection ? selection.bpm : peaks[0].bpm };
  const competing = peaks.find(p => relationTo(p.bpm, primary.bpm) === 'alternative');
  const contrast = competing ? clamp01(1 - competing.strength / primary.strength) : 1;
  const octave = selection ? selection.ambiguous
    : peaks.some(p => ['half', 'double'].includes(relationTo(p.bpm, primary.bpm)) &&
      p.strength >= .9 * primary.strength);
  const confidence = Math.min(.9, .5 * clamp01(primary.strength / .5) + .4 * contrast);
  const candidates = peaks.slice(0, 5).map(p => ({
    bpm: p.bpm, relation: relationTo(p.bpm, primary.bpm),
    confidence: clamp01(p.strength),
  }));

  // Local tempo curve: sliding windows, prior centred on the global estimate.
  const winFrames = Math.round(localWindowSeconds * fps);
  const stepFrames = Math.max(1, Math.round(fps));
  const tempoCurve = [];
  for (let start = 0; start + winFrames <= envelope.length; start += stepFrames) {
    const segment = envelope.subarray(start, start + winFrames);
    const local = tempoPeaks(segment, fps, { minBpm, maxBpm, centerBpm: primary.bpm, priorOctaves: .5 });
    if (local && local[0].strength > .05) {
      // The pulse level is settled once, globally. A window may only follow the tempo,
      // never switch metrical level on its own, which would tear the beat grid apart.
      const octaves = Math.round(Math.log2(primary.bpm / local[0].bpm));
      const bpm = local[0].bpm * 2 ** clamp(octaves, -2, 2);
      tempoCurve.push({ seconds: (start + winFrames / 2) / fps, bpm });
    }
  }

  const periodFrames = new Float64Array(envelope.length);
  for (let t = 0; t < envelope.length; t++) {
    const seconds = t / fps;
    let bpm = primary.bpm;
    if (tempoCurve.length) {
      if (seconds <= tempoCurve[0].seconds) bpm = tempoCurve[0].bpm;
      else if (seconds >= tempoCurve.at(-1).seconds) bpm = tempoCurve.at(-1).bpm;
      else {
        const k = tempoCurve.findIndex(p => p.seconds >= seconds);
        const a = tempoCurve[k - 1], b = tempoCurve[k];
        bpm = a.bpm + (b.bpm - a.bpm) * (seconds - a.seconds) / (b.seconds - a.seconds);
      }
    }
    periodFrames[t] = 60 * fps / bpm;
  }
  const beatFrames = trackBeats(envelope, periodFrames, lambda);
  // Envelope frames lag the attack by roughly one analysis window. This constant was
  // measured on the synthetic click bank (mean -17.8 ms, see the test); it must be
  // re-measured on real recordings before any sample-accurate use.
  const beats = beatFrames.map(f => f * hopSeconds + ENVELOPE_BEAT_LATENCY_SECONDS);

  return {
    bpm: primary.bpm,
    // The selected level is reported as the quarter note by convention. That convention
    // is wrong often enough — asymmetric meters are frequently counted in eighths or
    // sixteenths — that `pulseLevels` carries the alternatives for the musician to pick.
    pulseUnit: selection ? 'noire' : null,
    pulseLevels: selection ? selection.levels : [],
    pulseLevelConfidence: selection ? selection.levelConfidence : 0,
    candidates, confidence,
    ambiguous: contrast < .2,
    octaveAmbiguity: octave,
    tempoCurve,
    beats,
    diagnostics: ['Attack periodicity and tracked pulses only; pulse level, meter and downbeat require musician validation'],
  };
}

/** Convenience: PCM to tempo result in one call. */
export function analyseTempo(channels, sampleRate, options = {}) {
  const { envelope, hopSeconds } = onsetEnvelopeFromPcm(channels, sampleRate, options.envelope);
  return inferTempoFromEnvelope(envelope, hopSeconds, options.tempo);
}
