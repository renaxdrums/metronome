import assert from 'node:assert/strict';
import {createWarpMap} from '../audio-lab/tempo-warp-core.mjs';
import {createMeterTimeline} from '../audio-lab/meter-timeline.mjs';
import {createWarpTimeline} from '../audio-lab/warp/warp-timeline.mjs';
import {createAudioLabEditSession,applyAudioLabEdit,undoAudioLabEdit,redoAudioLabEdit,
  serializeAudioLabEdits,restoreAudioLabEdits} from '../audio-lab/project/edit-history.mjs';
const quarter=3840,eighth=quarter/2;
const initialMap=createWarpMap([{tick:0,sourceSeconds:0,locked:true},
  {tick:14*eighth,sourceSeconds:3.55,locked:true},
  {tick:24*eighth,sourceSeconds:5.92,locked:true}]);
const meter=createMeterTimeline([
  {tick:0,numerator:7,denominator:8,groups:[2,2,3]},
  {tick:14*eighth,numerator:5,denominator:8,groups:[2,3]},
],24*eighth);
const initial=createAudioLabEditSession({
  warpMap:initialMap,meterTimeline:meter,
  tempoPoints:[{tick:0,bpm:120,pulse:{count:1,denominator:4}}],
},{maxUndo:4});
assert.equal(initial.present.meterTimeline.measures.length,4);
assert(Object.isFrozen(initial.present.warpMap.anchors));
let state=applyAudioLabEdit(initial,{type:'warp.insert',tick:7*eighth,sourceSeconds:1.77});
assert.equal(state.present.warpMap.anchors.length,4);
state=applyAudioLabEdit(state,{type:'warp.move',index:1,sourceSeconds:1.8});
assert.equal(state.present.warpMap.anchors[1].sourceSeconds,1.8);
state=applyAudioLabEdit(state,{type:'warp.lock',index:1,locked:true});
assert.throws(()=>applyAudioLabEdit(state,{type:'warp.move',index:1,sourceSeconds:1.9}),/locked/);
assert.equal(state.present.warpMap.anchors[1].sourceSeconds,1.8,'invalid edit is atomic');
state=applyAudioLabEdit(state,{type:'meter.upsert',
  marker:{tick:3*eighth,numerator:11,denominator:16,groups:[3,3,3,2]}});
assert(state.present.meterTimeline.measures.some(m=>m.isPartial));
assert.equal(initial.present.meterTimeline.measures.length,4,'original session untouched');
state=applyAudioLabEdit(state,{type:'tempo.upsert',
  point:{tick:14*eighth,bpm:40,pulse:{count:1,denominator:4}}});
assert.equal(state.present.tempoPoints.length,2);
assert.equal(state.undo.length,4,'bounded undo budget');
const adjusted=createWarpTimeline(state.present.warpMap,state.present.tempoPoints);
assert(adjusted.outputDurationSeconds>0);
let undo=undoAudioLabEdit(state);
assert.equal(undo.present.tempoPoints.length,1);
let redo=redoAudioLabEdit(undo);
assert.equal(redo.present.tempoPoints[1].bpm,40);
const reverted=undoAudioLabEdit(redo);
const divergent=applyAudioLabEdit(reverted,{type:'tempo.upsert',point:{tick:14*eighth,bpm:80}});
assert.equal(divergent.redo.length,0,'new action clears redo');
assert.equal(redoAudioLabEdit(divergent),divergent);
assert.throws(()=>applyAudioLabEdit(initial,{type:'warp.insert',tick:5*eighth,sourceSeconds:100}),/strictly/);
assert.throws(()=>applyAudioLabEdit(divergent,{type:'meter.remove',tick:0}),/cannot be deleted/);
assert.throws(()=>applyAudioLabEdit(divergent,{type:'tempo.remove',tick:0}),/Initial tempo/);
assert.throws(()=>applyAudioLabEdit(divergent,{type:'not-a-real-action'}),/Unsupported/);
const snapshot=serializeAudioLabEdits(state);
const restored=restoreAudioLabEdits(JSON.parse(JSON.stringify(snapshot)));
assert.equal(restored.present.tempoPoints[1].bpm,40);
assert.equal(restored.present.meterTimeline.markers.length,3);
assert.equal(restored.present.warpMap.anchors[1].locked,true);
assert.equal(restored.undo.length,0,'project snapshot preserves validated state, not session history');
assert.throws(()=>restoreAudioLabEdits({...snapshot,version:2}),/schema\/version/);
const first=applyAudioLabEdit(initial,{type:'meter.downbeat',tick:2*eighth});
assert.equal(first.present.meterTimeline.measures[0].isPickup,true);
assert(Object.isFrozen(state.present.meterTimeline.markers));
console.log('Audio Lab: unlimited metric variants, Warp lock/correction, tempo edits, atomic undo/redo and project snapshot OK');
