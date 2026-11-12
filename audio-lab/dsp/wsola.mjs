/** RENAX Audio Lab — offline stereo-linked WSOLA PCM Warp reference.
 * Non-destructive, self-contained, bounded. Not yet mastering-grade DSP.
 */
import { outputSecondsToSourceSeconds } from '../warp/warp-timeline.mjs';

export class WarpRenderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'WarpRenderError';
    this.code = code;
  }
}
function fail(code, message) { throw new WarpRenderError(code, message); }
function abortIfNeeded(signal) {
  if (signal?.aborted) fail('CANCELLED', 'Warp rendering cancelled');
}
function validateInputs(channels, sampleRate, timeline, options) {
  if (!Array.isArray(channels) || channels.length < 1 || channels.length > 8 ||
      !channels.every(ch => ch instanceof Float32Array && ch.length === channels[0].length))
    throw new TypeError('channels must contain 1..8 equal-length Float32Array PCM channels');
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
    throw new RangeError('sampleRate must be 8000..192000');
  if (!Number.isFinite(timeline?.outputDurationSeconds) || timeline.outputDurationSeconds <= 0 ||
      !Number.isFinite(timeline?.sourceDurationSeconds) || timeline.sourceDurationSeconds <= 0 ||
      !Array.isArray(timeline.segments) || !timeline.segments.length)
    throw new TypeError('validated Warp timeline is required');
  if (Math.abs(channels[0].length / sampleRate - timeline.sourceDurationSeconds) > 1.5 / sampleRate)
    throw new RangeError('Warp source duration differs from decoded PCM');
  const {windowSize = 2048, synthesisHop = windowSize / 4,
    searchMilliseconds = 10, searchStride = 12,
    maxOutputBytes = 256 * 1024 * 1024} = options;
  if (!Number.isSafeInteger(windowSize) || windowSize < 512 || windowSize > 8192 ||
      (windowSize & (windowSize - 1)) || !Number.isSafeInteger(synthesisHop) ||
      synthesisHop < 64 || synthesisHop > windowSize / 2)
    throw new RangeError('invalid WSOLA windowSize or synthesisHop');
  if (!Number.isFinite(searchMilliseconds) || searchMilliseconds < 0 || searchMilliseconds > 50 ||
      !Number.isSafeInteger(searchStride) || searchStride < 1 || searchStride > 64)
    throw new RangeError('invalid WSOLA search settings');
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1024)
    throw new RangeError('invalid output memory budget');
  const outputFrames = Math.round(timeline.outputDurationSeconds * sampleRate);
  if (!Number.isSafeInteger(outputFrames) || outputFrames < 1)
    fail('OUTPUT_LENGTH', 'Warp output frame count out of range');
  const requiredBytes = outputFrames * (channels.length + 1) * 4;
  if (!Number.isSafeInteger(requiredBytes) || requiredBytes > maxOutputBytes)
    fail('MEMORY_PRESSURE', 'Warp output exceeds safe memory budget');
  if (channels[0].length < windowSize || outputFrames < windowSize)
    fail('TOO_SHORT', 'Audio too short for current WSOLA window');
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      if (!Number.isFinite(ch[i])) fail('INVALID_PCM', 'Non-finite input sample');
    }
  }
  return {windowSize,synthesisHop,searchMilliseconds,searchStride,outputFrames};
}
function clamp(v, low, high) { return Math.min(high, Math.max(low, v)); }

/** Render a validated map to actual PCM; common analysis positions for every channel.
 * Calls from UI must use warp-client.mjs (Worker), not this CPU-bound function.
 */
export function renderWarpPCM(config) {
  if (!config || typeof config !== 'object') throw new TypeError('render configuration is required');
  const {channels, sampleRate, timeline, signal, onProgress} = config;
  const {windowSize, synthesisHop, searchMilliseconds, searchStride, outputFrames} =
    validateInputs(channels, sampleRate, timeline, config);
  if (onProgress !== undefined && typeof onProgress !== 'function')
    throw new TypeError('onProgress must be a function');
  abortIfNeeded(signal);

  const inputFrames = channels[0].length;
  const isIdentity = outputFrames === inputFrames && timeline.segments.every(s =>
    Math.abs((s.outputEndSeconds-s.outputStartSeconds)-
      (s.sourceEndSeconds-s.sourceStartSeconds)) < 1e-9 &&
    Math.abs(s.outputStartSeconds-s.sourceStartSeconds) < 1e-9);
  if (isIdentity) {
    abortIfNeeded(signal);
    onProgress?.(1);
    return {
      channels: channels.map(ch => ch.slice()), sampleRate,
      durationSeconds: inputFrames / sampleRate, method: 'identity-copy',
      diagnostics: ['Identity mapping: bit-identical source PCM copied without DSP'],
      metrics: {grains:0,peak:null,windowSize,synthesisHop,searchMilliseconds},
    };
  }

  const out = channels.map(() => new Float32Array(outputFrames));
  const weight = new Float32Array(outputFrames);
  const window = new Float32Array(windowSize);
  for (let i = 0; i < windowSize; i++)
    window[i] = Math.sin(Math.PI * (i + .5) / windowSize) ** 2;
  const maxStart = inputFrames - windowSize;
  const radius = Math.round(searchMilliseconds * sampleRate / 1000);
  const grainCount = Math.ceil(outputFrames / synthesisHop);
  const referenceWindowLength = Math.min(1024, windowSize / 2);
  const previousValid = new Uint8Array(referenceWindowLength);
  let grains = 0, previousSourceStart = null, peak = 0;

  function alignmentScore(candidate, outputStart, predicted) {
    let xy = 0, xx = 0, yy = 0, samples = 0;
    const overlap = Math.min(referenceWindowLength, outputFrames - outputStart);
    for (let k = 0; k < overlap; k += 4) {
      if (!previousValid[k]) continue;
      const at = outputStart + k;
      if (!(weight[at] > 1e-7)) continue;
      const w = 1 / weight[at];
      for (let channel = 0; channel < channels.length; channel++) {
        const ref = out[channel][at] * w;
        const cur = channels[channel][candidate + k];
        xy += ref * cur; xx += ref * ref; yy += cur * cur;
        samples++;
      }
    }
    if (samples < 64 || xx < 1e-10 || yy < 1e-10) return -1;
    const corr = xy / Math.sqrt(xx * yy);
    return corr - .055 * (Math.abs(candidate - predicted) / Math.max(1, radius));
  }

  for (let grain = 0; grain < grainCount; grain++) {
    if ((grain & 31) === 0) abortIfNeeded(signal);
    const outputStart = grain * synthesisHop;
    const outputCentreTime = Math.min(timeline.outputDurationSeconds,
      (outputStart + windowSize / 2) / sampleRate);
    const sourceCentreTime = outputSecondsToSourceSeconds(timeline, outputCentreTime);
    const predicted = clamp(Math.round(sourceCentreTime * sampleRate - windowSize / 2), 0, maxStart);
    let chosen = predicted;

    if (grain > 0 && radius > 0) {
      for (let k = 0; k < referenceWindowLength; k++) {
        const at = outputStart + k;
        previousValid[k] = at < outputFrames && weight[at] > 1e-7 ? 1 : 0;
      }
      let bestScore = -Infinity;
      const left = Math.max(0, predicted - radius);
      const right = Math.min(maxStart, predicted + radius);
      for (let pos = left; pos <= right; pos += searchStride) {
        const score = alignmentScore(pos, outputStart, predicted);
        if (score > bestScore) { bestScore = score; chosen = pos; }
      }
      const coarse = chosen;
      for (let pos = Math.max(left, coarse - searchStride);
           pos <= Math.min(right, coarse + searchStride); pos++) {
        const score = alignmentScore(pos, outputStart, predicted);
        if (score > bestScore) { bestScore = score; chosen = pos; }
      }
      const direct = alignmentScore(predicted, outputStart, predicted);
      if (direct > bestScore) chosen = predicted;
    }
    if (previousSourceStart !== null && chosen < previousSourceStart - windowSize / 2)
      chosen = clamp(previousSourceStart - windowSize / 2, 0, maxStart);
    previousSourceStart = chosen;

    const end = Math.min(windowSize, outputFrames - outputStart);
    for (let k = 0; k < end; k++) {
      const at = outputStart + k, w = window[k];
      weight[at] += w;
      for (let ch = 0; ch < channels.length; ch++)
        out[ch][at] += channels[ch][chosen + k] * w;
    }
    grains++;
    if (onProgress && (grain % 64 === 0 || grain === grainCount - 1))
      onProgress((grain + 1) / grainCount);
  }
  abortIfNeeded(signal);
  for (let i = 0; i < outputFrames; i++) {
    const w = weight[i];
    for (const ch of out) {
      ch[i] = w > 1e-10 ? ch[i] / w : 0;
      if (!Number.isFinite(ch[i])) fail('DSP_NONFINITE', 'Warp renderer produced non-finite PCM');
      peak = Math.max(peak, Math.abs(ch[i]));
    }
  }
  return {
    channels: out, sampleRate, durationSeconds: outputFrames / sampleRate,
    method: 'wsola-js-reference',
    diagnostics: ['Offline WSOLA reference: pitch-preserving stretch; not yet perceptually validated for mastering'],
    metrics: {grains,peak,windowSize,synthesisHop,searchMilliseconds},
  };
}

/** Convert PCM into Web Audio without touching the original source. */
export function createWebAudioBuffer(context, rendered) {
  if (!context || typeof context.createBuffer !== 'function' ||
      !Array.isArray(rendered?.channels) || !rendered.channels.length ||
      !rendered.channels.every(ch => ch instanceof Float32Array && ch.length === rendered.channels[0].length) ||
      !Number.isFinite(rendered.sampleRate)) throw new TypeError('invalid rendered PCM');
  const buffer = context.createBuffer(rendered.channels.length, rendered.channels[0].length, rendered.sampleRate);
  for (let ch = 0; ch < rendered.channels.length; ch++) buffer.copyToChannel(rendered.channels[ch], ch);
  return buffer;
}
