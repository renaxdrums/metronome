/**
 * RENAX Audio Lab: deterministic multiband onset proposals, not beat/meter recognition.
 * Spectral flux is calculated per channel to avoid antiphase stereo cancellation.
 * Source PCM is immutable; all proposed attacks must remain manually correctable.
 */
const BANDS = ['low', 'mid', 'high'];
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len *= 2) {
    const half = len / 2, angle = -2 * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let start = 0; start < n; start += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < half; j++) {
        const p = start + j, q = p + half;
        const tr = cr * re[q] - ci * im[q], ti = cr * im[q] + ci * re[q];
        re[q] = re[p] - tr; im[q] = im[p] - ti;
        re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
function median(values, start, end, band) {
  const items = [];
  for (let i = start; i <= end; i++) items.push(values[i * 3 + band]);
  items.sort((a, b) => a - b);
  const mid = items.length >> 1;
  return items.length % 2 ? items[mid] : (items[mid - 1] + items[mid]) * .5;
}
/**
 * @param {Float32Array | Float32Array[]} pcm One or multiple channels.
 * @param {number} sampleRate The PCM sample rate, in Hz.
 * @param {{frameSize?:number,hopSize?:number,minSeparationSeconds?:number,
 * localWindowSeconds?:number,peakFloorRatio?:number,crossBandFloorRatio?:number,
 * relativeThreshold?:number,maxOnsets?:number,signal?:AbortSignal}} [options]
 */
export function detectOnsets(pcm, sampleRate, options = {}) {
  const channels = pcm instanceof Float32Array ? [pcm] : pcm;
  if (!Array.isArray(channels) || !channels.length || channels.length > 32 ||
      !channels.every(c => c instanceof Float32Array && c.length === channels[0].length)) {
    throw new TypeError('PCM must be 1..32 equal-length Float32Array channels');
  }
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 384000)
    throw new RangeError('sampleRate outside supported range');
  const { frameSize = 1024, hopSize = frameSize >> 2,
    minSeparationSeconds = .075, localWindowSeconds = .14,
    peakFloorRatio = .024, crossBandFloorRatio = .002,
    relativeThreshold = 1.65, maxOnsets = 100000, signal } = options;
  if (!Number.isSafeInteger(frameSize) || frameSize < 256 || frameSize > 8192 ||
      (frameSize & (frameSize - 1)) || !Number.isSafeInteger(hopSize) ||
      hopSize <= 0 || hopSize > frameSize) throw new RangeError('invalid FFT frameSize or hopSize');
  if (![minSeparationSeconds, localWindowSeconds, peakFloorRatio, crossBandFloorRatio, relativeThreshold]
      .every(Number.isFinite) || minSeparationSeconds <= 0 || localWindowSeconds <= 0 ||
      peakFloorRatio <= 0 || peakFloorRatio >= 1 || crossBandFloorRatio <= 0 ||
      crossBandFloorRatio >= 1 || relativeThreshold <= 1)
    throw new RangeError('invalid onset threshold parameters');
  if (!Number.isSafeInteger(maxOnsets) || maxOnsets <= 0)
    throw new RangeError('maxOnsets must be a positive integer');
  const cancel = () => { if (signal?.aborted) throw new DOMException('Onset analysis cancelled', 'AbortError'); };
  cancel();
  const length = channels[0].length;
  if (length < frameSize)
    return { onsets: [], diagnostics: ['Signal shorter than an FFT window'], frameCount: 0, hopSize };
  const frames = Math.floor((length - frameSize) / hopSize) + 1;
  if (frames > 1000000) throw new RangeError('Audio exceeds onset analysis frame budget');
  const flux = new Float64Array(frames * 3);
  const maxByBand = [0, 0, 0];
  const bins = frameSize >> 1, bandOf = new Uint8Array(bins + 1);
  for (let k = 1; k <= bins; k++) {
    const hz = k * sampleRate / frameSize;
    bandOf[k] = hz < 250 ? 0 : hz < 2500 ? 1 : 2;
  }
  const window = Float64Array.from({length:frameSize}, (_,i) =>
    .5 - .5 * Math.cos((2 * Math.PI * i) / (frameSize - 1)));
  const previous = channels.map(() => new Float64Array(bins + 1));
  const real = new Float64Array(frameSize), imag = new Float64Array(frameSize);
  for (let f = 0; f < frames; f++) {
    if ((f & 31) === 0) cancel();
    const offset = f * hopSize;
    for (let ch = 0; ch < channels.length; ch++) {
      const data = channels[ch];
      for (let i = 0; i < frameSize; i++) {
        const sample = data[offset + i];
        if (!Number.isFinite(sample)) throw new RangeError('PCM contains non-finite sample');
        real[i] = sample * window[i]; imag[i] = 0;
      }
      fft(real, imag);
      const prev = previous[ch];
      for (let k = 1; k <= bins; k++) {
        const magnitude = Math.hypot(real[k], imag[k]) / frameSize;
        const delta = magnitude - prev[k];
        prev[k] = magnitude;
        if (delta > 0) flux[f * 3 + bandOf[k]] += delta / channels.length;
      }
    }
    for (let b = 0; b < 3; b++)
      maxByBand[b] = Math.max(maxByBand[b], flux[f * 3 + b]);
  }
  const radius = Math.max(1, Math.round(localWindowSeconds * sampleRate / hopSize));
  const peakRadius = Math.max(1, Math.ceil(.012 * sampleRate / hopSize));
  const globalMax = Math.max(...maxByBand), proposed = [];
  for (let f = 0; f < frames; f++) {
    for (let band = 0; band < 3; band++) {
      const v = flux[f * 3 + band];
      if (v === 0 || v < Math.max(maxByBand[band] * peakFloorRatio, globalMax * crossBandFloorRatio))
        continue;
      let peak = true;
      for (let j = Math.max(0, f - peakRadius); j <= Math.min(frames - 1, f + peakRadius); j++) {
        if (j === f) continue;
        if (flux[j * 3 + band] > v || (j < f && flux[j * 3 + band] === v)) { peak = false; break; }
      }
      if (!peak) continue;
      const background = median(flux, Math.max(0, f - radius), Math.min(frames - 1, f + radius), band);
      if (v <= background * relativeThreshold) continue;
      const prominence = Math.max(0, (v - background) / (maxByBand[band] || 1));
      proposed.push({
        seconds: (f * hopSize + frameSize / 2) / sampleRate,
        strength: Math.min(1, prominence), band: BANDS[band],
      });
    }
  }
  proposed.sort((a,b) => b.strength - a.strength || a.seconds - b.seconds);
  const selected = [], buckets = new Map();
  for (const item of proposed) {
    const bucket = Math.floor(item.seconds / minSeparationSeconds);
    let collision = false;
    for (let b = bucket - 1; b <= bucket + 1; b++) {
      const neighbor = buckets.get(b);
      if (neighbor && Math.abs(neighbor.seconds - item.seconds) < minSeparationSeconds) {
        collision = true; break;
      }
    }
    if (!collision) {
      selected.push(item); buckets.set(bucket, item);
      if (selected.length >= maxOnsets) break;
    }
  }
  selected.sort((a,b) => a.seconds - b.seconds);
  return {onsets: selected, frameCount: frames, hopSize,
    diagnostics: ['Spectral-flux proposals only; no validated tempo, meter or first-beat inference']};
}
