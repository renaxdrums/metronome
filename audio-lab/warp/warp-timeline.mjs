import {noteUnitTicks,tickToSourceSeconds} from '../tempo-warp-core.mjs';

/** Immutable source-to-output time plan for a future pitch-preserving Warp DSP.
 * This does NOT render/modify PCM or implement pitch-preserving time stretching.
 * Breaks at both source anchors and tempo changes; no missing audio intervals.
 */
export function createWarpTimeline(map, tempoPoints) {
  if (!map || !Array.isArray(map.anchors) || !Number.isSafeInteger(map.lengthTicks) ||
      map.lengthTicks <= 0 || !Number.isFinite(map.durationSeconds) || map.durationSeconds <= 0)
    throw new TypeError('a valid Warp map is required');
  if (!Array.isArray(tempoPoints) || !tempoPoints.length || tempoPoints[0]?.tick !== 0)
    throw new RangeError('the first tempo point must be at tick 0');
  const points = tempoPoints.map((p,i) => {
    if (!p || !Number.isSafeInteger(p.tick) || p.tick < 0 || p.tick >= map.lengthTicks ||
        (i && p.tick <= tempoPoints[i-1].tick))
      throw new RangeError('tempo ticks must be strictly increasing inside the audio domain');
    if (!Number.isFinite(p.bpm) || p.bpm <= 0)
      throw new RangeError('tempo BPM must be positive and finite');
    const pulse = p.pulse ?? {count:1,denominator:4};
    const secondsPerTick = 60/(p.bpm*noteUnitTicks(pulse.count,pulse.denominator));
    if (!Number.isFinite(secondsPerTick) || secondsPerTick <= 0)
      throw new RangeError('invalid tempo precision');
    return Object.freeze({tick:p.tick,bpm:p.bpm,
      pulse:Object.freeze({count:pulse.count,denominator:pulse.denominator}),secondsPerTick});
  });
  const boundaries=[...new Set([...map.anchors.map(a=>a.tick),...points.map(p=>p.tick),map.lengthTicks])]
    .sort((a,b)=>a-b);
  if (boundaries.length > 100001) throw new RangeError('Warp timeline segment budget exceeded');
  const segments=[];
  let pointIndex=0, output=0;
  for (let i=1;i<boundaries.length;i++) {
    const startTick=boundaries[i-1],endTick=boundaries[i];
    while(pointIndex+1<points.length && points[pointIndex+1].tick<=startTick)pointIndex++;
    const p=points[pointIndex];
    const sourceStartSeconds=tickToSourceSeconds(map,startTick);
    const sourceEndSeconds=tickToSourceSeconds(map,endTick);
    const next=output+(endTick-startTick)*p.secondsPerTick;
    if (!Number.isFinite(next)||next<=output||!Number.isFinite(sourceStartSeconds)||
        !Number.isFinite(sourceEndSeconds)||sourceEndSeconds<=sourceStartSeconds)
      throw new RangeError('Warp timeline is not strictly monotone');
    segments.push(Object.freeze({startTick,endTick,sourceStartSeconds,sourceEndSeconds,
      outputStartSeconds:output,outputEndSeconds:next,bpm:p.bpm,pulse:p.pulse,
      sourceSecondsPerOutputSecond:(sourceEndSeconds-sourceStartSeconds)/(next-output)}));
    output=next;
  }
  return Object.freeze({segments:Object.freeze(segments),lengthTicks:map.lengthTicks,
    sourceDurationSeconds:map.durationSeconds,outputDurationSeconds:output});
}

function locate(timeline,value,start,end){
  if(!timeline||!Array.isArray(timeline.segments)||!timeline.segments.length||
     !Number.isFinite(value)||value<0||value>timeline.segments.at(-1)[end])
    throw new RangeError('position outside Warp timeline');
  const arr=timeline.segments;
  let lo=0,hi=arr.length-1;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(value>arr[mid][end])lo=mid+1;else hi=mid;
  }
  const s=arr[lo];
  return {s,f:(value-s[start])/(s[end]-s[start])};
}
export function outputSecondsToSourceSeconds(timeline,value){
  const {s,f}=locate(timeline,value,'outputStartSeconds','outputEndSeconds');
  return s.sourceStartSeconds+f*(s.sourceEndSeconds-s.sourceStartSeconds);
}
export function sourceSecondsToOutputSeconds(timeline,value){
  const {s,f}=locate(timeline,value,'sourceStartSeconds','sourceEndSeconds');
  return s.outputStartSeconds+f*(s.outputEndSeconds-s.outputStartSeconds);
}
export function tickToOutputSeconds(timeline,value){
  const {s,f}=locate(timeline,value,'startTick','endTick');
  return s.outputStartSeconds+f*(s.outputEndSeconds-s.outputStartSeconds);
}
export function outputSecondsToTick(timeline,value){
  const {s,f}=locate(timeline,value,'outputStartSeconds','outputEndSeconds');
  return s.startTick+f*(s.endTick-s.startTick);
}
