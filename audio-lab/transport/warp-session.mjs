/**
 * Audio Lab Warp pipeline: decoded source -> non-destructive offline Worker DSP
 * -> AudioBuffer -> metrical click plan -> one AudioContext playback session.
 *
 * This is pre-rendered playback, not on-the-fly time stretching.
 * The caller owns the AudioContext and must explicitly dispose the session.
 */
import { renderWarpInWorker } from '../dsp/warp-client.mjs';
import { createWebAudioBuffer } from '../dsp/wsola.mjs';
import { createWarpClickPlan } from './warp-click.mjs';
import { loadRenaxClickSamples } from './renax-click-presets.mjs';
import { WarpPlaybackSession } from './warp-player.mjs';

/**
 * @param {object} cfg
 * @param {AudioContext} cfg.context Shared clock; owned by the caller.
 * @param {AudioBuffer} cfg.sourceBuffer Immutable decoded source.
 * @param {object} cfg.warpTimeline Source/output Warp mapping.
 * @param {object} cfg.meterTimeline Manually approved musical meter timeline.
 */
export async function prepareWarpPlayback(cfg) {
  const {
    context,sourceBuffer,warpTimeline,meterTimeline,signal,
    bank='clic',clickEnabled=true,clickMode='group',subdivisions=1,
    destination=context?.destination,
    onProgress=()=>{},onState=()=>{},maxOutputBytes=128*1024*1024,
    workerFactory,fetchImpl,
    onsets=[],
  }=cfg||{};
  if(!context||typeof context.createBuffer!=='function'||
    typeof context.createBufferSource!=='function'||
    !sourceBuffer||typeof sourceBuffer.getChannelData!=='function'||
    !warpTimeline||!Number.isFinite(warpTimeline.outputDurationSeconds)||
    !Array.isArray(onsets)||typeof onProgress!=='function'||
    typeof onState!=='function')
    throw new TypeError('Invalid Warp session configuration');
  if(signal?.aborted)throw new DOMException('Warp preparation cancelled','AbortError');
  const workerOptions={
    buffer:sourceBuffer,timeline:warpTimeline,signal,onsets,maxOutputBytes,
    onProgress:fraction=>onProgress({phase:'warp',fraction}),
  };
  if(workerFactory)workerOptions.workerFactory=workerFactory;
  const rendered=await renderWarpInWorker(workerOptions);
  if(signal?.aborted)throw new DOMException('Warp preparation cancelled','AbortError');
  const outputBuffer=createWebAudioBuffer(context,rendered);
  let plan={events:[]},clickSamples=null;
  if(clickEnabled){
    plan=createWarpClickPlan({warpTimeline,meterTimeline,mode:clickMode,subdivisions});
    const loadOptions={bank,signal,onProgress:fraction=>onProgress({phase:'clicks',fraction})};
    if(fetchImpl)loadOptions.fetchImpl=fetchImpl;
    clickSamples=await loadRenaxClickSamples(context,loadOptions);
  }
  if(signal?.aborted)throw new DOMException('Warp preparation cancelled','AbortError');
  const session=new WarpPlaybackSession({
    context,buffer:outputBuffer,clickPlan:plan,clickSamples,
    destination,onState,
  });
  return Object.freeze({
    session,buffer:outputBuffer,warpTimeline,
    diagnostics:Object.freeze([...rendered.diagnostics]),
    metrics:Object.freeze({...rendered.metrics}),
    clickEventCount:plan.events.length,
  });
}
