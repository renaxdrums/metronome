/** Stream Warp DSP directly to a local WAV sink without ever allocating whole output PCM.
 * The destination is caller-controlled (OPFS or File System Access API), not a server.
 */
import {renderWarpChunksInWorker} from '../dsp/warp-chunk-client.mjs';
import {createWavStreamWriter} from './wav-stream.mjs';

export async function exportWarpWavToSink({buffer,timeline,sink,bitDepth=24,signal,
  onProgress=()=>{},chunkFrames=8192,onsets=[],workerFactory}={}){
  if(!buffer||!Number.isSafeInteger(buffer.length)||buffer.length<=0||
    !Number.isSafeInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||
    !Number.isFinite(buffer.sampleRate)||!timeline||
    !Number.isFinite(timeline.outputDurationSeconds)||
    typeof sink?.write!=='function'||typeof onProgress!=='function')
    throw new TypeError('Valid decoded audio, Warp map and local WAV sink required');
  const totalFrames=Math.round(timeline.outputDurationSeconds*buffer.sampleRate);
  const writer=createWavStreamWriter({
    sampleRate:buffer.sampleRate,channelCount:buffer.numberOfChannels,totalFrames,
    bitDepth,write:chunk=>sink.write(chunk),signal,
  });
  try{
    await writer.start();
    const options={
      buffer,timeline,signal,onsets,chunkFrames,
      onProgress:fraction=>onProgress({phase:'warp',fraction}),
      onChunk:(channels,offset)=>writer.writeChunk(channels,offset),
    };
    if(workerFactory)options.workerFactory=workerFactory;
    const dsp=await renderWarpChunksInWorker(options);
    const wav=await writer.finish();
    await sink.close?.();
    return Object.freeze({dsp,wav});
  }catch(error){
    try{await sink.abort?.(error);}catch{/* original error wins */}
    throw error;
  }
}
