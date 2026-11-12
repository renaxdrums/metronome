/**
 * RENAX Audio Lab — immutable, non-destructive musical editing with undo/redo.
 * User edits take precedence over any proposals from the beat detector.
 * Every action is atomic: invalid Warp/meter/tempo changes leave the session intact.
 */
import {createWarpMap,insertWarpAnchor,moveWarpAnchor,removeWarpAnchor} from '../tempo-warp-core.mjs';
import {createMeterTimeline,upsertMeterMarker,moveMeterMarker,removeMeterMarker,
  setFirstDownbeat} from '../meter-timeline.mjs';
import {createWarpTimeline} from '../warp/warp-timeline.mjs';

function validatePresent({warpMap,meterTimeline,tempoPoints}) {
  const warp=createWarpMap(warpMap?.anchors);
  if(!meterTimeline||!Array.isArray(meterTimeline.markers)||
      meterTimeline.lengthTicks!==warp.lengthTicks)
    throw new RangeError('Meter timeline must cover the exact Warp musical duration');
  const meter=createMeterTimeline(meterTimeline.markers,warp.lengthTicks,
    {firstDownbeatTick:meterTimeline.firstDownbeatTick??0});
  if(!Array.isArray(tempoPoints))throw new TypeError('Tempo points must be an array');
  const tempo=tempoPoints.map(p=>Object.freeze({
    tick:p?.tick,bpm:p?.bpm,pulse:Object.freeze({
      count:p?.pulse?.count??1,denominator:p?.pulse?.denominator??4}),
  }));
  createWarpTimeline(warp,tempo);
  return Object.freeze({warpMap:warp,meterTimeline:meter,tempoPoints:Object.freeze(tempo)});
}

export function createAudioLabEditSession(present,{maxUndo=100}={}){
  if(!Number.isSafeInteger(maxUndo)||maxUndo<1||maxUndo>1000)
    throw new RangeError('Undo history budget must be 1..1000');
  return Object.freeze({
    present:validatePresent(present),
    undo:Object.freeze([]),redo:Object.freeze([]),
    maxUndo,revision:0,
  });
}
function assertSession(session){
  if(!session||!session.present||!Array.isArray(session.undo)||!Array.isArray(session.redo)||
     !Number.isSafeInteger(session.maxUndo)||!Number.isSafeInteger(session.revision))
    throw new TypeError('A valid Audio Lab edit session is required');
}
function limit(items,max){return Object.freeze(items.length>max?items.slice(-max):items);}
function tempoAction(points,action,maxTick){
  let result=points.map(p=>({...p,pulse:{...p.pulse}}));
  if(action.type==='tempo.upsert'){
    const p=action.point;
    if(!p||!Number.isSafeInteger(p.tick))throw new RangeError('Invalid tempo point');
    result=result.filter(item=>item.tick!==p.tick);
    result.push({tick:p.tick,bpm:p.bpm,pulse:p.pulse??{count:1,denominator:4}});
  }else if(action.type==='tempo.move'){
    if(!Number.isSafeInteger(action.fromTick)||!Number.isSafeInteger(action.toTick)||
        action.fromTick<=0||action.toTick<=0||action.toTick>=maxTick)
      throw new RangeError('Only interior tempo points can move');
    const old=result.find(x=>x.tick===action.fromTick);
    if(!old||result.some(x=>x.tick===action.toTick))throw new RangeError('Tempo point not found or target occupied');
    old.tick=action.toTick;
  }else if(action.type==='tempo.remove'){
    if(!Number.isSafeInteger(action.tick)||action.tick<=0||!result.some(x=>x.tick===action.tick))
      throw new RangeError('Initial tempo point is required; interior point not found');
    result=result.filter(p=>p.tick!==action.tick);
  }
  return result.sort((a,b)=>a.tick-b.tick);
}
/**
 * Actions:
 * warp.insert {tick,sourceSeconds,locked?}
 * warp.move {index,sourceSeconds}
 * warp.remove {index}
 * warp.lock {index,locked}
 * meter.upsert {marker}
 * meter.move {fromTick,toTick}
 * meter.remove {tick}
 * meter.downbeat {tick}
 * tempo.upsert {point:{tick,bpm,pulse?}}
 * tempo.move {fromTick,toTick}
 * tempo.remove {tick}
 */
export function applyAudioLabEdit(session,action){
  assertSession(session);
  if(!action||typeof action.type!=='string')throw new TypeError('Edit action type required');
  const p=session.present;
  let warp=p.warpMap,meter=p.meterTimeline,tempo=p.tempoPoints;
  switch(action.type){
    case 'warp.insert':
      warp=insertWarpAnchor(warp,action.tick,action.sourceSeconds,action.locked===true);break;
    case 'warp.move':
      warp=moveWarpAnchor(warp,action.index,action.sourceSeconds);break;
    case 'warp.remove':
      warp=removeWarpAnchor(warp,action.index);break;
    case 'warp.lock':{
      const idx=action.index;
      if(!Number.isSafeInteger(idx)||idx<=0||idx>=warp.anchors.length-1||
          typeof action.locked!=='boolean')
        throw new RangeError('Only interior Warp anchors may be locked/unlocked');
      warp=createWarpMap(warp.anchors.map((a,i)=>i===idx?{...a,locked:action.locked}:a));
      break;
    }
    case 'meter.upsert':
      meter=upsertMeterMarker(meter,action.marker);break;
    case 'meter.move':
      meter=moveMeterMarker(meter,action.fromTick,action.toTick);break;
    case 'meter.remove':
      meter=removeMeterMarker(meter,action.tick);break;
    case 'meter.downbeat':
      meter=setFirstDownbeat(meter,action.tick);break;
    case 'tempo.upsert':case 'tempo.move':case 'tempo.remove':
      tempo=tempoAction(tempo,action,warp.lengthTicks);break;
    default:throw new RangeError('Unsupported Audio Lab edit action: '+action.type);
  }
  const next=validatePresent({warpMap:warp,meterTimeline:meter,tempoPoints:tempo});
  return Object.freeze({
    ...session,present:next,
    undo:limit([...session.undo,p],session.maxUndo),
    redo:Object.freeze([]),revision:session.revision+1,
  });
}
export function undoAudioLabEdit(session){
  assertSession(session);
  if(!session.undo.length)return session;
  return Object.freeze({...session,
    present:session.undo.at(-1),
    undo:Object.freeze(session.undo.slice(0,-1)),
    redo:limit([...session.redo,session.present],session.maxUndo),
    revision:session.revision+1});
}
export function redoAudioLabEdit(session){
  assertSession(session);
  if(!session.redo.length)return session;
  return Object.freeze({...session,
    present:session.redo.at(-1),
    redo:Object.freeze(session.redo.slice(0,-1)),
    undo:limit([...session.undo,session.present],session.maxUndo),
    revision:session.revision+1});
}
export function serializeAudioLabEdits(session){
  assertSession(session);
  const {warpMap,meterTimeline,tempoPoints}=session.present;
  return {
    schema:'renax.audio-lab.edits',version:1,
    warpAnchors:warpMap.anchors.map(a=>({...a})),
    meterMarkers:meterTimeline.markers.map(m=>({...m,groups:[...m.groups]})),
    firstDownbeatTick:meterTimeline.firstDownbeatTick,
    tempoPoints:tempoPoints.map(t=>({...t,pulse:{...t.pulse}})),
  };
}
export function restoreAudioLabEdits(snapshot,{maxUndo=100}={}){
  if(!snapshot||snapshot.schema!=='renax.audio-lab.edits'||snapshot.version!==1)
    throw new RangeError('Unknown Audio Lab edit snapshot schema/version');
  const warpMap=createWarpMap(snapshot.warpAnchors);
  const meterTimeline=createMeterTimeline(snapshot.meterMarkers,warpMap.lengthTicks,
    {firstDownbeatTick:snapshot.firstDownbeatTick});
  return createAudioLabEditSession({warpMap,meterTimeline,tempoPoints:snapshot.tempoPoints},{maxUndo});
}
