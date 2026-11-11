/**
 * RENAX Audio Lab — pure musical-grid and source-time mapping primitives.
 * No Web Audio context, globals, file I/O, playback, or mutation of source audio.
 */
export const TICKS_PER_QUARTER = 3840;

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(label + ' must be a positive safe integer');
  return value;
}

/** A musical unit is count notes of 1/denominator, e.g. 3/8 is a dotted quarter. */
export function noteUnitTicks(count, denominator) {
  positiveInteger(count, 'count');
  positiveInteger(denominator, 'denominator');
  if ((denominator & (denominator - 1)) !== 0 || denominator > 1024)
    throw new RangeError('denominator must be a supported binary note value (1..1024)');
  const ticks = (4 * TICKS_PER_QUARTER * count) / denominator;
  if (!Number.isSafeInteger(ticks)) throw new RangeError('musical unit is not representable as exact ticks');
  return ticks;
}

/**
 * Repeat a meter cycle without converting asymmetric meters into 4/4.
 * A group defines an accent boundary, not a change in subdivision duration.
 * @param {Array<{numerator:number, denominator:number, groups?:number[]}>} cycle
 * @param {number} repeats
 */
export function buildMeterGrid(cycle, repeats = 1) {
  if (!Array.isArray(cycle) || cycle.length === 0) throw new TypeError('meter cycle must not be empty');
  positiveInteger(repeats, 'repeats');
  const count = cycle.length * repeats;
  if (!Number.isSafeInteger(count) || count > 100000)
    throw new RangeError('meter grid exceeds memory budget of 100000 measures');
  const validated = cycle.map((meter) => {
    if (!meter || typeof meter !== 'object') throw new TypeError('invalid meter');
    const numerator = positiveInteger(meter.numerator, 'numerator');
    const denominator = positiveInteger(meter.denominator, 'denominator');
    const unit = noteUnitTicks(1, denominator);
    const groups = meter.groups === undefined ? [numerator] : meter.groups;
    if (!Array.isArray(groups) || !groups.length || groups.some((n) => !Number.isSafeInteger(n) || n <= 0))
      throw new RangeError('groups must be a nonempty list of positive integers');
    if (groups.reduce((sum, n) => sum + n, 0) !== numerator)
      throw new RangeError('groups must sum exactly to meter numerator');
    if (!Number.isSafeInteger(numerator * unit)) throw new RangeError('measure tick count overflow');
    return { numerator, denominator, unit, groups: [...groups] };
  });
  const measures = [];
  let offset = 0;
  for (let pass = 0; pass < repeats; pass++) {
    for (const meter of validated) {
      const startTick = offset;
      const groupStartTicks = [];
      let groupTick = startTick;
      for (const group of meter.groups) {
        groupStartTicks.push(groupTick);
        groupTick += group * meter.unit;
      }
      offset += meter.numerator * meter.unit;
      if (!Number.isSafeInteger(offset)) throw new RangeError('song tick count overflow');
      measures.push(Object.freeze({
        index: measures.length,
        numerator: meter.numerator,
        denominator: meter.denominator,
        unitTicks: meter.unit,
        groups: Object.freeze([...meter.groups]),
        groupStartTicks: Object.freeze(groupStartTicks),
        startTick,
        endTick: offset,
      }));
    }
  }
  return Object.freeze({ measures: Object.freeze(measures), lengthTicks: offset });
}

function checkAnchor(anchor, index) {
  if (!anchor || !Number.isSafeInteger(anchor.tick) || anchor.tick < 0)
    throw new RangeError('anchor ' + index + ': tick must be nonnegative safe integer');
  if (typeof anchor.sourceSeconds !== 'number' || !Number.isFinite(anchor.sourceSeconds) || anchor.sourceSeconds < 0)
    throw new RangeError('anchor ' + index + ': sourceSeconds must be finite and nonnegative');
  return Object.freeze({ tick: anchor.tick, sourceSeconds: anchor.sourceSeconds, locked: anchor.locked === true });
}

/** Endpoints are explicit; no implicit extrapolation or dropping of source content. */
export function createWarpMap(anchors) {
  if (!Array.isArray(anchors) || anchors.length < 2) throw new RangeError('at least two warp anchors are required');
  const checked = anchors.map(checkAnchor);
  if (checked[0].tick !== 0 || checked[0].sourceSeconds !== 0)
    throw new RangeError('mapping must start at tick 0 and source second 0');
  for (let i = 1; i < checked.length; i++) {
    if (checked[i].tick <= checked[i - 1].tick || checked[i].sourceSeconds <= checked[i - 1].sourceSeconds)
      throw new RangeError('anchors must be strictly increasing in musical and source time');
  }
  return Object.freeze({
    anchors: Object.freeze(checked),
    lengthTicks: checked.at(-1).tick,
    durationSeconds: checked.at(-1).sourceSeconds,
  });
}

function interpolate(anchors, value, key, outputKey) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > anchors.at(-1)[key])
    throw new RangeError('position outside mapped audio domain');
  let low = 0, high = anchors.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (anchors[mid][key] <= value) low = mid;
    else high = mid;
  }
  const a = anchors[low], b = anchors[high];
  return a[outputKey] + ((value - a[key]) / (b[key] - a[key])) * (b[outputKey] - a[outputKey]);
}

export function tickToSourceSeconds(map, tick) {
  return interpolate(map.anchors, tick, 'tick', 'sourceSeconds');
}

export function sourceSecondsToTick(map, seconds) {
  return interpolate(map.anchors, seconds, 'sourceSeconds', 'tick');
}

/** Tempo is stated in the explicit displayed pulse unit, never assumed to be quarter-note BPM. */
export function tickToWarpSeconds(tick, bpm, pulse = { count: 1, denominator: 4 }) {
  if (!Number.isFinite(tick) || tick < 0 || !Number.isFinite(bpm) || bpm <= 0)
    throw new RangeError('tick and bpm must be nonnegative and positive finite, respectively');
  return (tick * 60) / (noteUnitTicks(pulse.count, pulse.denominator) * bpm);
}

export function warpSecondsToSourceSeconds(map, warpSeconds, bpm, pulse = { count: 1, denominator: 4 }) {
  if (!Number.isFinite(warpSeconds) || warpSeconds < 0) throw new RangeError('invalid warp time');
  const tick = (warpSeconds * noteUnitTicks(pulse.count, pulse.denominator) * bpm) / 60;
  return tickToSourceSeconds(map, tick);
}

/** Corrections return a new immutable map and refuse to move locked/end anchors. */
export function moveWarpAnchor(map, index, sourceSeconds) {
  if (!Number.isSafeInteger(index) || index <= 0 || index >= map.anchors.length - 1)
    throw new RangeError('only interior anchors can move');
  if (map.anchors[index].locked) throw new Error('warp anchor is locked');
  return createWarpMap(map.anchors.map((anchor, i) =>
    i === index ? { ...anchor, sourceSeconds } : anchor));
}

export function insertWarpAnchor(map, tick, sourceSeconds, locked = false) {
  if (!Number.isSafeInteger(tick) || tick <= 0 || tick >= map.lengthTicks)
    throw new RangeError('new anchor must be interior');
  let index = 1;
  while (index < map.anchors.length && map.anchors[index].tick < tick) index++;
  if (map.anchors[index].tick === tick) throw new RangeError('duplicate warp tick');
  return createWarpMap([
    ...map.anchors.slice(0, index), { tick, sourceSeconds, locked }, ...map.anchors.slice(index),
  ]);
}

export function removeWarpAnchor(map, index) {
  if (!Number.isSafeInteger(index) || index <= 0 || index >= map.anchors.length - 1)
    throw new RangeError('only interior anchors can be removed');
  if (map.anchors[index].locked) throw new Error('warp anchor is locked');
  return createWarpMap(map.anchors.filter((_, i) => i !== index));
}
