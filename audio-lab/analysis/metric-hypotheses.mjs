/** Ranked accent-pattern evidence given a tempo and first-downbeat hypothesis.
 * Acoustic attacks and musical beats remain separate. Nothing here validates
 * a meter or writes a Warp map without a musician's confirmation.
 */
import { noteUnitTicks } from '../tempo-warp-core.mjs';

const DEFAULT_METERS = Object.freeze([
  { numerator: 2, denominator: 4, groups: [2] },
  { numerator: 3, denominator: 4, groups: [3] },
  { numerator: 4, denominator: 4, groups: [4] },
  { numerator: 6, denominator: 8, groups: [3, 3] },
  { numerator: 9, denominator: 8, groups: [3, 3, 3] },
  { numerator: 12, denominator: 8, groups: [3, 3, 3, 3] },
  { numerator: 5, denominator: 8, groups: [2, 3] },
  { numerator: 5, denominator: 8, groups: [3, 2] },
  { numerator: 7, denominator: 8, groups: [2, 2, 3] },
  { numerator: 7, denominator: 8, groups: [2, 3, 2] },
  { numerator: 7, denominator: 8, groups: [3, 2, 2] },
  { numerator: 11, denominator: 8, groups: [3, 3, 3, 2] },
  { numerator: 13, denominator: 8, groups: [3, 3, 3, 2, 2] },
  { numerator: 17, denominator: 16, groups: [4, 4, 4, 5] },
]);
const clamp = value => Math.max(0, Math.min(1, value));

function nearestStrength(events, time, tolerance) {
  let low = 0, high = events.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (events[mid].seconds < time - tolerance) low = mid + 1;
    else high = mid;
  }
  let strength = 0;
  for (let i = low; i < events.length && events[i].seconds <= time + tolerance; i++)
    strength = Math.max(strength, events[i].strength);
  return strength;
}

function validateMeter(meter) {
  const { numerator, denominator, groups } = meter || {};
  if (!Number.isSafeInteger(numerator) || numerator < 2 || numerator > 64 ||
      !Number.isSafeInteger(denominator) || denominator < 2 || denominator > 64 ||
      !Array.isArray(groups) || !groups.length ||
      groups.some(group => !Number.isSafeInteger(group) || group <= 0) ||
      groups.reduce((sum, group) => sum + group, 0) !== numerator)
    throw new RangeError('Invalid metric hypothesis candidate');
  noteUnitTicks(1, denominator);
  return { numerator, denominator, groups: [...groups] };
}

/**
 * `tempoBpm` is BPM of `pulse`, which defaults to the quarter note. The first
 * downbeat and tempo may be tentative; the returned confidence is capped lower
 * until both are confirmed. Custom and alternating meters can be supplied via
 * candidateMeters; this function scores one repeating meter at a time.
 */
export function inferMetricHypotheses(onsets, {
  tempoBpm, originSeconds = 0, durationSeconds,
  pulse = { count: 1, denominator: 4 },
  candidateMeters = DEFAULT_METERS,
  confirmedTempo = false, confirmedOrigin = false,
  minCycles = 3,
} = {}) {
  if (!Array.isArray(onsets) || onsets.length > 100000 ||
      !Number.isFinite(tempoBpm) || tempoBpm < 20 || tempoBpm > 400 ||
      !Number.isFinite(originSeconds) || originSeconds < 0 ||
      !Number.isSafeInteger(minCycles) || minCycles < 2 || minCycles > 16 ||
      !Array.isArray(candidateMeters) || !candidateMeters.length || candidateMeters.length > 128)
    throw new RangeError('Invalid metric analysis input');
  const pulseTicks = noteUnitTicks(pulse.count, pulse.denominator);
  const meters = candidateMeters.map(validateMeter);
  const events = onsets.filter(event => Number.isFinite(event?.seconds) && event.seconds >= 0)
    .map(event => ({ seconds: event.seconds,
      strength: clamp(Number.isFinite(event.strength) ? event.strength : 1) }))
    .filter(event => event.strength > 0)
    .sort((a, b) => a.seconds - b.seconds);
  const duration = durationSeconds ?? (events.at(-1)?.seconds ?? 0);
  if (!Number.isFinite(duration) || duration <= originSeconds)
    return { candidates: [], ambiguous: true, requiresConfirmation: true,
      diagnostics: ['Duration or first-downbeat evidence is insufficient'] };
  const scored = [];
  for (const meter of meters) {
    const unitSeconds = 60 / tempoBpm * noteUnitTicks(1, meter.denominator) / pulseTicks;
    const cycleSeconds = meter.numerator * unitSeconds;
    const cycles = Math.min(128, Math.floor((duration - originSeconds) / cycleSeconds));
    if (cycles < minCycles) continue;
    const groupStarts = new Set([0]);
    let offset = 0;
    for (const group of meter.groups) { offset += group; if (offset < meter.numerator) groupStarts.add(offset); }
    let expected = 0, ordinary = 0, expectedCount = 0, ordinaryCount = 0;
    let hitCount = 0, consistentCycles = 0, downbeat = 0;
    const tolerance = Math.min(.09, unitSeconds * .18);
    for (let cycle = 0; cycle < cycles; cycle++) {
      let cycleExpected = 0, cycleOrdinary = 0;
      for (let slot = 0; slot < meter.numerator; slot++) {
        const time = originSeconds + (cycle * meter.numerator + slot) * unitSeconds;
        const strength = nearestStrength(events, time, tolerance);
        if (groupStarts.has(slot)) {
          expected += strength; expectedCount++; cycleExpected += strength;
          if (strength >= .35) hitCount++;
          if (slot === 0) downbeat += strength;
        } else { ordinary += strength; ordinaryCount++; cycleOrdinary += strength; }
      }
      if (ordinaryCount > 0 && cycleExpected / groupStarts.size > cycleOrdinary /
          Math.max(1, meter.numerator - groupStarts.size) + .12) consistentCycles++;
    }
    const startMean = expected / expectedCount;
    const otherMean = ordinaryCount ? ordinary / ordinaryCount : 0;
    const contrast = ordinaryCount ? clamp((startMean - otherMean) / Math.max(.25, startMean)) : 0;
    const coverage = hitCount / expectedCount;
    const consistency = consistentCycles / cycles;
    const downbeatEvidence = downbeat / cycles;
    const score = .42 * contrast + .20 * coverage + .25 * consistency + .13 * downbeatEvidence;
    if (score < .18) continue;
    scored.push({ ...meter, score, cycles, evidence: {
      groupContrast: contrast, accentCoverage: coverage,
      cycleConsistency: consistency, downbeatStrength: downbeatEvidence,
    } });
  }
  scored.sort((a, b) => b.score - a.score || b.cycles - a.cycles);
  const candidates = scored.slice(0, 5).map(candidate => ({ ...candidate,
    confidence: Math.min(confirmedTempo && confirmedOrigin ? .68 : .38,
      candidate.score * (confirmedTempo && confirmedOrigin ? .68 : .38)),
    provenance: 'accent-pattern-with-supplied-pulse',
  }));
  const ambiguous = candidates.length < 1 || candidates[0].score < .5 ||
    (candidates.length > 1 && candidates[1].score >= candidates[0].score * .85);
  return { candidates, ambiguous, requiresConfirmation: true,
    diagnostics: candidates.length
      ? ['Accent pattern is a hypothesis; syncopation and silent beats may mimic another meter']
      : ['No metric candidate has enough repeated accent evidence'] };
}
