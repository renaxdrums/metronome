/** Convert musician-validated positions into a non-destructive, monotone Warp map.
 * An acoustic attack has no musical tick by itself. Positional markers therefore
 * require an explicit quarter-note position (`beat`) confirmed by the user.
 */
import { createWarpMap, TICKS_PER_QUARTER } from '../tempo-warp-core.mjs';

function beatToTick(beat) {
  if (!Number.isFinite(beat) || beat < 0) throw new RangeError('Marker beat must be nonnegative');
  const raw = beat * TICKS_PER_QUARTER, tick = Math.round(raw);
  if (!Number.isSafeInteger(tick) || Math.abs(raw - tick) > 1e-6)
    throw new RangeError('Marker beat is not exactly representable as musical ticks');
  return tick;
}

/**
 * @param {{durationSeconds:number,sourceBpm:number,markers?:Array<{
 * kind:'warp'|'downbeat'|'tempo',seconds:number,beat?:number,bpm?:number,
 * validated:true,locked?:boolean}>}} config
 * @returns {ReturnType<typeof createWarpMap>}
 */
export function buildValidatedWarpMap({ durationSeconds, sourceBpm, markers = [] }) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
      !Number.isFinite(sourceBpm) || sourceBpm < 20 || sourceBpm > 400 ||
      !Array.isArray(markers) || markers.length > 100000)
    throw new RangeError('Invalid validated Warp map configuration');
  const sorted = [...markers].sort((a, b) => a.seconds - b.seconds);
  for (const marker of sorted) {
    if (!marker || !['warp', 'downbeat', 'tempo'].includes(marker.kind) ||
        marker.validated !== true || !Number.isFinite(marker.seconds) ||
        marker.seconds <= 0 || marker.seconds >= durationSeconds)
      throw new RangeError('Only validated interior musical markers can shape Warp');
    if (marker.kind === 'tempo') {
      if (!Number.isFinite(marker.bpm) || marker.bpm < 20 || marker.bpm > 400)
        throw new RangeError('Validated tempo marker requires a BPM from 20 to 400');
    } else if (marker.beat === undefined) {
      throw new RangeError('Positional Warp marker requires a confirmed musical beat');
    }
  }
  // Tempo changes define the projected musical extent and an anchor at each
  // change. Positional markers may then correct that projection locally.
  let projectedTick = 0, previousSeconds = 0, bpm = sourceBpm;
  const anchors = [];
  for (const marker of sorted) {
    const elapsed = marker.seconds - previousSeconds;
    if (elapsed < 0) throw new RangeError('Marker times must increase');
    projectedTick += elapsed * bpm * TICKS_PER_QUARTER / 60;
    previousSeconds = marker.seconds;
    const tick = marker.beat === undefined ? Math.round(projectedTick) : beatToTick(marker.beat);
    if (marker.kind === 'tempo') bpm = marker.bpm;
    const anchor = { tick, sourceSeconds: marker.seconds, locked: marker.locked === true };
    const previous = anchors.at(-1);
    if (previous?.sourceSeconds === anchor.sourceSeconds) {
      if (previous.tick !== anchor.tick)
        throw new RangeError('Markers at one source time disagree on musical position');
      previous.locked ||= anchor.locked;
    } else anchors.push(anchor);
  }
  projectedTick += (durationSeconds - previousSeconds) * bpm * TICKS_PER_QUARTER / 60;
  const endTick = Math.round(projectedTick);
  if (!Number.isSafeInteger(endTick) || endTick <= 0)
    throw new RangeError('Projected musical extent is invalid');
  return createWarpMap([
    { tick: 0, sourceSeconds: 0, locked: true },
    ...anchors,
    { tick: endTick, sourceSeconds: durationSeconds, locked: true },
  ]);
}
