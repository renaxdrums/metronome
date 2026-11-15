/** Tempo evidence from acoustic attacks. No beat, meter or downbeat is asserted here. */
const BIN_BPM = 2;
const clamp01 = value => Math.max(0, Math.min(1, value));

function scoreWindow(events, minBpm, maxBpm) {
  if (events.length < 5) return [];
  const histogram = new Map();
  let totalWeight = 0;
  // A time-dense passage may contain many attacks inside one slow beat. Scan
  // enough neighbors to reach that beat while retaining a fixed work budget.
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < Math.min(i + 129, events.length); j++) {
      const delta = events[j].seconds - events[i].seconds;
      if (delta > 8) break;
      if (delta <= 0) continue;
      const weight = Math.sqrt(events[i].strength * events[j].strength) / Math.sqrt(j - i);
      totalWeight += weight;
      // The number of pulses between attacks is unknown; some beats may be silent.
      for (let pulses = 1; pulses <= 8; pulses++) {
        const bpm = 60 * pulses / delta;
        if (bpm < minBpm || bpm > maxBpm) continue;
        const center = Math.round(bpm / BIN_BPM) * BIN_BPM;
        const distance = Math.abs(bpm - center);
        const contribution = weight * (1 - distance / BIN_BPM) / Math.sqrt(pulses);
        histogram.set(center, (histogram.get(center) || 0) + contribution);
      }
    }
  }
  if (!histogram.size || totalWeight === 0) return [];
  const smoothed = [...histogram].map(([bpm, raw]) => ({
    bpm, score: raw + .5 * (histogram.get(bpm - BIN_BPM) || 0) +
      .5 * (histogram.get(bpm + BIN_BPM) || 0),
  })).sort((a, b) => b.score - a.score || a.bpm - b.bpm);
  const best = smoothed[0].score;
  const candidates = [];
  for (const item of smoothed) {
    if (candidates.some(other => Math.abs(other.bpm - item.bpm) < 6)) continue;
    candidates.push({ bpm: item.bpm, score: item.score, relativeEvidence: item.score / best });
    if (candidates.length === 8) break;
  }
  return candidates;
}

/** Acoustic onset periodicity; every candidate still requires human validation. */
export function inferTempoFromOnsets(onsets, { minBpm = 40, maxBpm = 240,
  localWindowSeconds = 10 } = {}) {
  if (!Array.isArray(onsets)) throw new TypeError('onsets must be an array');
  if (![minBpm, maxBpm, localWindowSeconds].every(Number.isFinite) ||
      minBpm < 20 || maxBpm > 400 || minBpm >= maxBpm ||
      localWindowSeconds < 4 || localWindowSeconds > 60)
    throw new RangeError('invalid tempo analysis range');
  const events = onsets.filter(o => Number.isFinite(o?.seconds) && o.seconds >= 0)
    .map(o => ({ seconds: o.seconds, strength: clamp01(Number.isFinite(o.strength) ? o.strength : 1) }))
    .filter(o => o.strength > 0)
    .sort((a, b) => a.seconds - b.seconds);
  const ranked = scoreWindow(events, minBpm, maxBpm);
  if (!ranked.length) return { candidates: [], confidence: 0, ambiguous: true,
    localTempo: [], diagnostics: ['Insufficient acoustic evidence for tempo'] };

  const first = ranked[0], runner = ranked[1];
  const contrast = runner ? clamp01((first.score - runner.score) / first.score) : 1;
  const span = events.at(-1).seconds - events[0].seconds;
  const coverage = clamp01(span / Math.max(6, localWindowSeconds));
  const density = clamp01(events.length / Math.max(8, span));
  // Pairwise onset periodicity cannot prove the perceptual pulse level.
  const confidence = Math.min(.78, .24 + .32 * contrast + .12 * coverage + .10 * density);
  const ambiguous = !!runner && runner.relativeEvidence >= .82;
  const candidates = ranked.slice(0, 3).map((candidate, index) => ({
    ...candidate, confidence: clamp01(confidence * candidate.relativeEvidence),
    relation: index === 0 ? 'primary' :
      Math.abs(candidate.bpm / first.bpm - .5) < .08 ? 'half' :
      Math.abs(candidate.bpm / first.bpm - 2) < .16 ? 'double' : 'alternative',
  }));

  const localTempo = [];
  if (span >= localWindowSeconds * 1.5) {
    const step = localWindowSeconds / 2;
    for (let start = events[0].seconds; start < events.at(-1).seconds && localTempo.length < 32; start += step) {
      const end = start + localWindowSeconds;
      const subset = events.filter(e => e.seconds >= start && e.seconds < end);
      const local = scoreWindow(subset, minBpm, maxBpm);
      if (local.length) {
        const localContrast = local[1] ? 1 - local[1].relativeEvidence : 1;
        localTempo.push({ startSeconds: start, endSeconds: Math.min(end, events.at(-1).seconds),
          bpm: local[0].bpm, confidence: Math.min(.72, .2 + .45 * clamp01(localContrast)) });
      }
    }
  }
  return { candidates, confidence, ambiguous, localTempo,
    diagnostics: ['Attack periodicity only; pulse level, meter and downbeat require musician validation'] };
}
