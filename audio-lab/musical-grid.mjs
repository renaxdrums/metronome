/** Musical guide lines for the visible waveform. Acoustic attacks are separate data. */
import { noteUnitTicks, sourceSecondsToTick, tickToSourceSeconds } from './tempo-warp-core.mjs';
import { outputSecondsToTick, tickToOutputSeconds } from './warp/warp-timeline.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);

function firstOverlappingMeasure(measures, tick) {
  let low = 0, high = measures.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (measures[mid].endTick <= tick) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Original projects musical ticks through the source/beat map. Warp projects
 * the same ticks through the regular output timeline. Returned x coordinates
 * depend on viewport pixels; the underlying time positions never do.
 */
export function buildMusicalGrid({ mode, meterTimeline, warpMap, warpTimeline,
  viewportStartSeconds, viewportEndSeconds, widthPixels,
  subdivisionCount = 2, minSpacingPixels = 12 }) {
  if (!['original', 'warp'].includes(mode)) throw new RangeError('Invalid grid mode');
  if (!meterTimeline?.measures?.length || !Number.isSafeInteger(meterTimeline.lengthTicks))
    throw new TypeError('Valid meter timeline required');
  if (!finite(viewportStartSeconds) || !finite(viewportEndSeconds) ||
      viewportStartSeconds < 0 || viewportEndSeconds <= viewportStartSeconds ||
      !Number.isSafeInteger(widthPixels) || widthPixels <= 0 ||
      !Number.isSafeInteger(subdivisionCount) || subdivisionCount < 1 || subdivisionCount > 16 ||
      !finite(minSpacingPixels) || minSpacingPixels < 0 || minSpacingPixels > widthPixels)
    throw new RangeError('Invalid musical grid viewport');
  const duration = mode === 'original' ? warpMap?.durationSeconds : warpTimeline?.outputDurationSeconds;
  const lengthTicks = mode === 'original' ? warpMap?.lengthTicks : warpTimeline?.lengthTicks;
  if (!finite(duration) || duration <= 0 || lengthTicks !== meterTimeline.lengthTicks)
    throw new RangeError('Grid map and meter timeline must have the same musical extent');
  const toSeconds = mode === 'original'
    ? tick => tickToSourceSeconds(warpMap, tick)
    : tick => tickToOutputSeconds(warpTimeline, tick);
  const toTick = mode === 'original'
    ? seconds => sourceSecondsToTick(warpMap, seconds)
    : seconds => outputSecondsToTick(warpTimeline, seconds);
  const start = Math.min(duration, viewportStartSeconds);
  const end = Math.min(duration, viewportEndSeconds);
  if (start >= end) return { mode, lines: [], visibleTicks: { start: lengthTicks, end: lengthTicks } };
  const visibleTicks = { start: toTick(start), end: toTick(end) };
  const viewDuration = viewportEndSeconds - viewportStartSeconds;
  const candidateByTick = new Map();
  const priority = { subdivision: 0, beat: 1, group: 2, pickup: 3, measure: 3 };
  function offer(tick, kind, measureIndex) {
    if (tick < visibleTicks.start - 1e-7 || tick > visibleTicks.end + 1e-7) return;
    const previous = candidateByTick.get(tick);
    if (previous && priority[previous.kind] >= priority[kind]) return;
    const seconds = toSeconds(tick);
    const x = (seconds - viewportStartSeconds) / viewDuration * widthPixels;
    candidateByTick.set(tick, { tick, seconds, x, kind, measureIndex, label: null });
  }
  const measures = meterTimeline.measures;
  const first = firstOverlappingMeasure(measures, visibleTicks.start);
  for (let i = first; i < measures.length; i++) {
    const measure = measures[i];
    if (measure.startTick > visibleTicks.end) break;
    const unit = noteUnitTicks(1, measure.denominator);
    const measurePixels = (toSeconds(measure.endTick) - toSeconds(measure.startTick)) /
      viewDuration * widthPixels;
    offer(measure.startTick, measure.isPickup ? 'pickup' : 'measure', measure.index);
    for (const tick of measure.groupStartTicks) {
      if (tick !== measure.startTick) offer(tick, 'group', measure.index);
    }
    if (measurePixels / measure.numerator >= minSpacingPixels * .8) {
      for (let tick = measure.startTick + unit; tick < measure.endTick; tick += unit)
        offer(tick, 'beat', measure.index);
    }
    if (subdivisionCount > 1 && unit % subdivisionCount === 0 &&
        measurePixels / (measure.numerator * subdivisionCount) >= minSpacingPixels * .8) {
      const sub = unit / subdivisionCount;
      for (let tick = measure.startTick + sub; tick < measure.endTick; tick += sub)
        offer(tick, 'subdivision', measure.index);
    }
    if (candidateByTick.size > 50000) throw new RangeError('Musical grid candidate budget exceeded');
  }
  // A final boundary is useful when the source ends inside a partial measure.
  offer(lengthTicks, 'measure', measures.at(-1).index + 1);
  const candidates = [...candidateByTick.values()].sort((a, b) =>
    priority[b.kind] - priority[a.kind] || a.x - b.x);
  const selected = [];
  for (const line of candidates) {
    let low = 0, high = selected.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (selected[mid].x < line.x) low = mid + 1;
      else high = mid;
    }
    if ((low > 0 && line.x - selected[low - 1].x < minSpacingPixels) ||
        (low < selected.length && selected[low].x - line.x < minSpacingPixels)) continue;
    selected.splice(low, 0, line);
  }
  let lastLabelX = -Infinity;
  for (const line of selected) {
    if (line.kind !== 'measure' && line.kind !== 'pickup') continue;
    if (line.x - lastLabelX < Math.max(42, minSpacingPixels * 2)) continue;
    line.label = line.kind === 'pickup' ? 'Levée' : String(line.measureIndex + 1);
    lastLabelX = line.x;
  }
  return { mode, lines: selected, visibleTicks };
}
