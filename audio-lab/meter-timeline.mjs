/**
 * RENAX Audio Lab — non-destructive manually editable metric timeline.
 * Changes in musical time are independent from source PCM / Warp rendering.
 */
import { noteUnitTicks } from './tempo-warp-core.mjs';

function tick(value, label) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(label + ' must be a nonnegative safe tick');
  return value;
}
function meterFrom(event) {
  const {numerator, denominator, groups} = event;
  if (!Number.isSafeInteger(numerator) || numerator <= 0)
    throw new RangeError('invalid meter numerator');
  const unitTicks = noteUnitTicks(1, denominator);
  const resolved = groups === undefined ? [numerator] : groups;
  if (!Array.isArray(resolved) || !resolved.length ||
      resolved.some(n => !Number.isSafeInteger(n) || n <= 0) ||
      resolved.reduce((sum, n) => sum + n, 0) !== numerator)
    throw new RangeError('meter groups must sum to numerator');
  const measureTicks = numerator * unitTicks;
  if (!Number.isSafeInteger(measureTicks)) throw new RangeError('meter tick count overflow');
  return Object.freeze({numerator, denominator, groups: Object.freeze([...resolved]), unitTicks, measureTicks});
}
/**
 * A marker starts a new measure even if it interrupts a previous measure.
 * firstDownbeatTick permits an intro/pickup without forcing a bar at source start.
 * @param {{tick:number,numerator:number,denominator:number,groups?:number[]}[]} markers
 * @param {number} lengthTicks
 * @param {{firstDownbeatTick?:number,maxMeasures?:number}} [options]
 */
export function createMeterTimeline(markers, lengthTicks, options = {}) {
  tick(lengthTicks, 'lengthTicks');
  if (!lengthTicks) throw new RangeError('timeline must have a positive duration');
  const firstDownbeatTick = tick(options.firstDownbeatTick ?? 0, 'firstDownbeatTick');
  if (firstDownbeatTick >= lengthTicks)
    throw new RangeError('firstDownbeatTick must be within the timeline');
  const maxMeasures = options.maxMeasures ?? 100000;
  if (!Number.isSafeInteger(maxMeasures) || maxMeasures <= 0)
    throw new RangeError('invalid maxMeasures budget');
  if (!Array.isArray(markers) || !markers.length || markers[0]?.tick !== 0)
    throw new RangeError('first meter marker must begin at tick 0');
  const events = markers.map((event, i) => {
    if (!event || typeof event !== 'object') throw new TypeError('invalid meter marker');
    const position = tick(event.tick, 'meter marker tick');
    if (position >= lengthTicks) throw new RangeError('meter marker must be inside the timeline');
    if (i && position <= markers[i-1].tick)
      throw new RangeError('meter markers must be strictly increasing');
    if (i && position < firstDownbeatTick)
      throw new RangeError('meter change cannot precede firstDownbeatTick');
    const meter = meterFrom(event);
    return Object.freeze({tick:position,numerator:meter.numerator,
      denominator:meter.denominator,groups:meter.groups});
  });
  const measures = [];
  let regularIndex = 0;
  function append(startTick, endTick, meter, isPickup = false) {
    if (measures.length >= maxMeasures)
      throw new RangeError('meter timeline exceeds measure budget');
    const groupStartTicks = [];
    if (!isPickup) {
      let start = startTick;
      for (const group of meter.groups) {
        if (start < endTick) groupStartTicks.push(start);
        start += group * meter.unitTicks;
      }
    }
    measures.push(Object.freeze({
      index:isPickup ? -1 : regularIndex++,
      startTick,endTick,numerator:meter.numerator,denominator:meter.denominator,
      groups:meter.groups,groupStartTicks:Object.freeze(groupStartTicks),
      isPickup,isPartial:endTick-startTick !== meter.measureTicks,
    }));
  }
  if (firstDownbeatTick) append(0,firstDownbeatTick,meterFrom(events[0]),true);
  for (let i = 0; i < events.length; i++) {
    const meter = meterFrom(events[i]);
    let cursor = i === 0 ? firstDownbeatTick : events[i].tick;
    const end = i + 1 < events.length ? events[i+1].tick : lengthTicks;
    while (cursor < end) {
      const next = Math.min(end,cursor+meter.measureTicks);
      if (!Number.isSafeInteger(next) || next <= cursor)
        throw new RangeError('meter timeline tick overflow');
      append(cursor,next,meter);
      cursor=next;
    }
  }
  return Object.freeze({markers:Object.freeze(events),
    firstDownbeatTick,lengthTicks,measures:Object.freeze(measures)});
}
/** An event edits only the musical grid, never the underlying source audio. */
export function upsertMeterMarker(timeline, marker) {
  const position = tick(marker?.tick, 'meter marker tick');
  const events = timeline.markers.filter(m => m.tick !== position);
  events.push(marker);
  events.sort((a,b) => a.tick - b.tick);
  return createMeterTimeline(events,timeline.lengthTicks,
    {firstDownbeatTick:timeline.firstDownbeatTick});
}
export function removeMeterMarker(timeline, position) {
  if (position === 0) throw new RangeError('initial meter marker cannot be deleted');
  if (!timeline.markers.some(m => m.tick === position)) throw new RangeError('meter marker not found');
  return createMeterTimeline(timeline.markers.filter(m => m.tick !== position),
    timeline.lengthTicks,{firstDownbeatTick:timeline.firstDownbeatTick});
}
export function moveMeterMarker(timeline, fromTick, toTick) {
  tick(fromTick,'fromTick'); tick(toTick,'toTick');
  if (!fromTick) throw new RangeError('initial meter marker cannot move');
  if (timeline.markers.some(m => m.tick === toTick))
    throw new RangeError('target meter marker already exists');
  const old = timeline.markers.find(m => m.tick === fromTick);
  if (!old) throw new RangeError('meter marker not found');
  return upsertMeterMarker(removeMeterMarker(timeline,fromTick),{...old,tick:toTick});
}
export function setFirstDownbeat(timeline, position) {
  return createMeterTimeline(timeline.markers,timeline.lengthTicks,{firstDownbeatTick:position});
}
