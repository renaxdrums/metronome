/** RENAX Audio Lab: pure click-event plan tied to the output Warp timeline.
 * No DOM timers; actual audio is scheduled on the session AudioContext.
 */
import { tickToOutputSeconds } from '../warp/warp-timeline.mjs';
import { noteUnitTicks } from '../tempo-warp-core.mjs';

/** Grouped asymmetric meters, alternations and tempo changes remain explicit. */
export function createWarpClickPlan(options) {
  const {warpTimeline,meterTimeline,mode='group',subdivisions=1,maxEvents=200000}=options||{};
  if(!warpTimeline||!Array.isArray(meterTimeline?.measures)||
     !['group','unit'].includes(mode)||!Number.isSafeInteger(subdivisions)||
     subdivisions<1||subdivisions>16||!Number.isSafeInteger(maxEvents)||maxEvents<=0)
    throw new RangeError('invalid click plan options');
  const events=[];
  const append=(tick,accent,measureIndex)=>{
    if (tick<0||tick>=warpTimeline.lengthTicks)return;
    if(events.length>=maxEvents)throw new RangeError('click plan event budget exceeded');
    const seconds=tickToOutputSeconds(warpTimeline,tick);
    if(!Number.isFinite(seconds)||seconds<0)throw new RangeError('invalid click time');
    if(events.length && seconds <= events.at(-1).seconds)
      throw new RangeError('click schedule must be strictly chronological');
    events.push(Object.freeze({tick,seconds,accent,measureIndex}));
  };
  for(const m of meterTimeline.measures){
    if(m.isPickup)continue;
    const span=m.endTick-m.startTick;
    if(span<=0)throw new RangeError('invalid meter measure');
    const unit=noteUnitTicks(1,m.denominator);
    if(!Number.isSafeInteger(unit/subdivisions)||unit/subdivisions<1)
      throw new RangeError('subdivision not representable as integer ticks');
    const groupStarts=new Set(m.groupStartTicks);
    if(mode==='group'){
      for(let k=0;k<m.groupStartTicks.length;k++){
        const g=m.groupStartTicks[k];
        const limit=k+1<m.groupStartTicks.length ? m.groupStartTicks[k+1] : m.endTick;
        const step=(limit-g)/subdivisions;
        if(!Number.isSafeInteger(step))throw new RangeError('group subdivision not representable');
        for(let n=0;n<subdivisions;n++){
          const tick=g+n*step;
          if(tick<m.endTick)append(tick,n===0?(g===m.startTick?2:1):0,m.index);
        }
      }
    }else{
      const step=unit/subdivisions;
      for(let tick=m.startTick;tick<m.endTick;tick+=step){
        const accent=groupStarts.has(tick)?(tick===m.startTick?2:1):0;
        append(tick,accent,m.index);
      }
    }
  }
  return Object.freeze({events:Object.freeze(events),mode,subdivisions});
}

/** Schedule a non-overlapping window with a single AudioContext shared by Warp audio. */
export function scheduleWarpClickRange({context,clickSamples,destination,plan,sessionStartAudioTime,
    fromSeconds=0,toSeconds=Infinity,gain=1}){
  if(!context||typeof context.createBufferSource!=='function'||
    !Array.isArray(clickSamples)||clickSamples.length!==3||
    !clickSamples.every(b=>b&&Number.isFinite(b.duration)&&b.duration>0)||
    !Array.isArray(plan?.events)||!Number.isFinite(sessionStartAudioTime)||
    !Number.isFinite(fromSeconds)||fromSeconds<0||!(toSeconds>fromSeconds)||
    !Number.isFinite(gain)||gain<0||gain>2)
    throw new TypeError('invalid click-scheduler arguments');
  const nodes=[];
  for(const event of plan.events){
    if(event.seconds<fromSeconds)continue;
    if(event.seconds>=toSeconds)break;
    const when=sessionStartAudioTime+event.seconds;
    if(when<context.currentTime)continue;
    const source=context.createBufferSource(),level=context.createGain();
    source.buffer=clickSamples[event.accent];
    level.gain.value=gain;
    source.connect(level);level.connect(destination||context.destination);
    source.onended=()=>{source.disconnect();level.disconnect();};
    source.start(when);
    nodes.push(source);
  }
  return nodes;
}
