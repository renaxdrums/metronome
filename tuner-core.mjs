/* Independent pitch measurement. No dependency on the metronome or microphone APIs.
 * Normalized square difference (McLeod): FFT autocorrelation, energy normalization,
 * first strong periodic peak, then seven-point interpolation. No copied library code.
 */
export class PitchDetector {
  constructor(size = 8192) {
    if (size < 4096 || size > 32768 || size & (size - 1))
      throw new RangeError('Invalid frame size');
    this.size = size;
    const n = size * 2;
    this.real = new Float64Array(n);
    this.imag = new Float64Array(n);
    this.energy = new Float64Array(size + 1);
    this.nsdf = new Float64Array(size);
    this.reverse = new Uint32Array(n);
    for (let i = 1; i < n; i++)
      this.reverse[i] = (this.reverse[i >> 1] >> 1) | (i & 1 ? n >> 1 : 0);
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((2 * Math.PI * i) / n);
    }
  }
  fft(inverse = false) {
    const { real: r, imag: im, reverse, cos, sin } = this,
      n = r.length;
    for (let i = 0; i < n; i++) {
      const j = reverse[i];
      if (i < j) {
        [r[i], r[j]] = [r[j], r[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let width = 2; width <= n; width *= 2) {
      const half = width / 2,
        stride = n / width;
      for (let base = 0; base < n; base += width)
        for (let j = 0; j < half; j++) {
          const p = j * stride,
            c = cos[p],
            s = inverse ? sin[p] : -sin[p];
          const a = base + j,
            b = a + half,
            re = r[b] * c - im[b] * s,
            ii = r[b] * s + im[b] * c;
          r[b] = r[a] - re;
          im[b] = im[a] - ii;
          r[a] += re;
          im[a] += ii;
        }
    }
    if (inverse)
      for (let i = 0; i < n; i++) {
        r[i] /= n;
        im[i] /= n;
      }
  }
  detect(input, sampleRate, { minFrequency = 12, maxFrequency = 5400, noiseFloor = 0.0015 } = {}) {
    if (input.length !== this.size || !Number.isFinite(sampleRate) || sampleRate < 8000)
      return null;
    const { real: r, imag: im, energy: e, nsdf: d, size } = this;
    let mean = 0;
    for (let i = 0; i < size; i++) {
      if (!Number.isFinite(input[i])) return null;
      mean += input[i];
    }
    mean /= size;
    r.fill(0);
    im.fill(0);
    e[0] = 0;
    for (let i = 0; i < size; i++) {
      const v = input[i] - mean;
      r[i] = v;
      e[i + 1] = e[i] + v * v;
    }
    const rms = Math.sqrt(e[size] / size);
    if (rms < noiseFloor) return null;
    this.fft();
    for (let i = 0; i < r.length; i++) {
      r[i] = r[i] * r[i] + im[i] * im[i];
      im[i] = 0;
    }
    this.fft(true);
    const minLag = Math.max(3, Math.floor(sampleRate / maxFrequency) - 1);
    const maxLag = Math.min(size / 2 - 3, Math.ceil(sampleRate / minFrequency) + 1);
    for (let lag = 0; lag <= maxLag + 2; lag++) {
      const energy = e[size - lag] + e[size] - e[lag];
      d[lag] = energy > 1e-20 ? (2 * r[lag]) / energy : 0;
    }
    const peaks = [];
    let negative = false,
      best = 0;
    for (let lag = 1; lag < maxLag; lag++) {
      if (d[lag] <= 0) negative = true;
      if (negative && lag >= minLag && d[lag] > d[lag - 1] && d[lag] >= d[lag + 1]) {
        const refined = refinePeak(d, lag);
        peaks.push(refined);
        best = Math.max(best, refined.height);
      }
    }
    if (best < 0.9) return null;
    // Compare interpolated heights. Comparing integer samples alone mistakes
    // high notes for an octave below when the first peak falls between samples.
    const peak = peaks.find((item) => item.height >= Math.max(0.9, best * 0.99));
    if (!peak) return null;
    const frequency = sampleRate / peak.period;
    return frequency >= minFrequency * 0.999 && frequency <= maxFrequency * 1.001
      ? { frequency, clarity: peak.height, rms }
      : null;
  }
}

const INTERPOLATION_WEIGHTS = [
  [0, 0, 0, 1, 0, 0, 0],
  [-1 / 60, 3 / 20, -3 / 4, 0, 3 / 4, -3 / 20, 1 / 60],
  [1 / 180, -3 / 40, 3 / 4, -49 / 36, 3 / 4, -3 / 40, 1 / 180],
  [1 / 48, -1 / 6, 13 / 48, 0, -13 / 48, 1 / 6, -1 / 48],
  [-1 / 144, 1 / 12, -13 / 48, 7 / 18, -13 / 48, 1 / 12, -1 / 144],
  [-1 / 240, 1 / 60, -1 / 48, 0, 1 / 48, -1 / 60, 1 / 240],
  [1 / 720, -1 / 120, 1 / 48, -1 / 36, 1 / 48, -1 / 120, 1 / 720],
];
// Seven-point interpolation limits upper-register bias without narrowing the
// advertised range or relaxing the frequency sweep's error threshold.
function refinePeak(d, peak) {
  const c = INTERPOLATION_WEIGHTS.map((weights) =>
    weights.reduce((sum, w, i) => sum + w * d[peak + i - 3], 0),
  );
  let x = 0;
  for (let iteration = 0; iteration < 6; iteration++) {
    let first = 0,
      second = 0;
    for (let i = 6; i >= 1; i--) first = first * x + i * c[i];
    for (let i = 6; i >= 2; i--) second = second * x + i * (i - 1) * c[i];
    if (Math.abs(second) < 1e-15) break;
    x = Math.max(-0.6, Math.min(0.6, x - first / second));
  }
  let height = c[6];
  for (let i = 5; i >= 0; i--) height = height * x + c[i];
  return { period: peak + x, height: Math.min(1, height) };
}

export class PitchTracker {
  constructor() {
    this.reset();
  }
  reset() {
    this.values = [];
    this.value = null;
    this.last = -Infinity;
  }
  update(result, now) {
    if (!result || !Number.isFinite(result.frequency) || result.frequency <= 0) {
      if (now - this.last > 250) this.reset();
      return null; // A stale reading must never look like current evidence of tuning.
    }
    const pitch = 69 + 12 * Math.log2(result.frequency / 440);
    if (now - this.last > 250 || (this.values.length && Math.abs(pitch - this.values.at(-1)) > 0.8))
      this.reset();
    this.last = now;
    this.values.push(pitch);
    if (this.values.length > 5) this.values.shift();
    if (this.values.length < 3) return null;
    const sorted = [...this.values].sort((a, b) => a - b),
      median = sorted[Math.floor(sorted.length / 2)];
    this.value = this.value === null ? median : this.value + 0.45 * (median - this.value);
    return {
      ...result,
      frequency: 440 * 2 ** ((this.value - 69) / 12),
      spread: (sorted.at(-1) - sorted[0]) * 100,
    };
  }
}

export const TEMPERAMENTS = Object.freeze({
  equal: { name: 'Tempérament égal', ratios: null },
  justMajor: {
    name: 'Juste (5 limites)',
    ratios: [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8],
  },
  pythagorean: {
    name: 'Pythagoricien',
    ratios: [
      1,
      256 / 243,
      9 / 8,
      32 / 27,
      81 / 64,
      4 / 3,
      729 / 512,
      3 / 2,
      128 / 81,
      27 / 16,
      16 / 9,
      243 / 128,
    ],
  },
  meantone: {
    name: 'Mésotonique — ¼ de comma',
    ratios: [0, 7, 2, -3, 4, -1, 6, 1, 8, 3, -2, 5].map(
      (k) => 2 ** (((((k * Math.log2(5)) / 4) % 1) + 1) % 1),
    ),
  },
  custom: { name: 'Personnalisé', ratios: null },
});
export const INSTRUMENTS = Object.freeze({
  chromatic: { name: 'Chromatique', notes: [] },
  guitar: { name: 'Guitare — standard', notes: [40, 45, 50, 55, 59, 64] },
  dropD: { name: 'Guitare — Drop D', notes: [38, 45, 50, 55, 59, 64] },
  dadgad: { name: 'Guitare — DADGAD', notes: [38, 45, 50, 55, 57, 62] },
  openG: { name: 'Guitare — Open G', notes: [38, 43, 50, 55, 59, 62] },
  bass: { name: 'Basse — 4 cordes', notes: [28, 33, 38, 43] },
  bass5: { name: 'Basse — 5 cordes', notes: [23, 28, 33, 38, 43] },
  bass6: { name: 'Basse — 6 cordes', notes: [23, 28, 33, 38, 43, 48] },
  violin: { name: 'Violon / mandoline', notes: [55, 62, 69, 76] },
  viola: { name: 'Alto', notes: [48, 55, 62, 69] },
  cello: { name: 'Violoncelle', notes: [36, 43, 50, 57] },
  ukulele: { name: 'Ukulélé — Sol aigu', notes: [67, 60, 64, 69] },
  custom: { name: 'Accordage personnalisé', notes: [] },
});
export function targetFrequency(
  midi,
  { a4 = 440, temperament = 'equal', tonic = 0, offsets = [] } = {},
) {
  const pitchClass = ((midi % 12) + 12) % 12;
  const ratios = TEMPERAMENTS[temperament]?.ratios;
  // A4 stays the calibrated reference; temperament offsets are anchored to it.
  const offset = (pc) =>
    ratios ? 1200 * Math.log2(ratios[(pc - tonic + 12) % 12]) - ((pc - tonic + 12) % 12) * 100 : 0;
  const correction =
    temperament === 'custom' ? Number(offsets[pitchClass] || 0) : offset(pitchClass) - offset(9);
  return a4 * 2 ** ((midi - 69) / 12 + correction / 1200);
}
export function selectTarget(frequency, settings = {}, locked = null) {
  const instrument = INSTRUMENTS[settings.instrument] || INSTRUMENTS.chromatic;
  const notes = settings.instrument === 'custom' ? settings.customNotes || [] : instrument.notes;
  const near = Math.round(69 + 12 * Math.log2(frequency / (settings.a4 || 440)));
  const choices = locked !== null ? [locked] : notes.length ? notes : [near - 1, near, near + 1];
  const midi = choices.reduce((a, b) =>
    Math.abs(Math.log2(frequency / targetFrequency(a, settings))) <=
    Math.abs(Math.log2(frequency / targetFrequency(b, settings)))
      ? a
      : b,
  );
  const target = targetFrequency(midi, settings);
  return { midi, target, cents: 1200 * Math.log2(frequency / target) };
}
export function noteName(midi, solfege = false, flats = false) {
  const names = solfege
    ? flats
      ? ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si']
      : ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si']
    : flats
      ? ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']
      : ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

export function parseNote(value) {
  const raw = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replaceAll('♯', '#')
    .replaceAll('♭', 'B');
  const match = raw.match(/^(DO|RE|MI|FA|SOL|LA|SI|[A-G])([#B]?)(-?\d)$/);
  if (!match) return null;
  const base = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
    DO: 0,
    RE: 2,
    MI: 4,
    FA: 5,
    SOL: 7,
    LA: 9,
    SI: 11,
  }[match[1]];
  const midi =
    (Number(match[3]) + 1) * 12 + base + (match[2] === '#' ? 1 : match[2] === 'B' ? -1 : 0);
  return midi >= 12 && midi <= 108 ? midi : null;
}
