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
 * @returns {{bpm:number|null, candidates:Array<{bpm:number,relation:string,confidence:number}>,
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
  const empty = { bpm: null, candidates: [], confidence: 0, ambiguous: true,
    octaveAmbiguity: false, tempoCurve: [], beats: [],
    diagnostics: ['Insufficient acoustic evidence for tempo'] };

  const peaks = tempoPeaks(envelope, fps, { minBpm, maxBpm, centerBpm: 120, priorOctaves: 1.5 });
  if (!peaks) return empty;
  const primary = peaks[0];
  const competing = peaks.find(p => relationTo(p.bpm, primary.bpm) === 'alternative');
  const contrast = competing ? clamp01(1 - competing.strength / primary.strength) : 1;
  const octave = peaks.some(p => ['half', 'double'].includes(relationTo(p.bpm, primary.bpm)) &&
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
    if (local && local[0].strength > .05)
      tempoCurve.push({ seconds: (start + winFrames / 2) / fps, bpm: local[0].bpm });
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
    bpm: primary.bpm, candidates, confidence,
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
