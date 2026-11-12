/**
 * Renders an arbitrary-length output as bounded PCM chunks in a dedicated
 * Worker. onChunk can be async (IndexedDB, a streaming WAV writer, etc.);
 * the Worker waits for explicit ACK before computing the next chunk.
 * Consumer receives a transferable, owned chunk and must not retain it forever.
 */
export function renderWarpChunksInWorker({buffer,timeline,onChunk,signal,
  onProgress=()=>{},windowSize=2048,synthesisHop=512,searchMilliseconds=10,
  searchStride=12,chunkFrames=8192,maxWorkingBytes=32*1024*1024,
  maxInputBytes=512*1024*1024,onsets=[],
  workerFactory=()=>new Worker(new URL('./warp-chunk-worker.mjs',import.meta.url),{type:'module'})}={}){
  if(!buffer||!Number.isSafeInteger(buffer.length)||buffer.length<1||
    !Number.isSafeInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||
    buffer.numberOfChannels>8||!Number.isFinite(buffer.sampleRate)||
    typeof buffer.getChannelData!=='function'||!timeline||
    !Number.isFinite(timeline.outputDurationSeconds)||typeof onChunk!=='function'||
    typeof onProgress!=='function'||typeof workerFactory!=='function')
    throw new TypeError('Valid decoded PCM, timeline and onChunk callback required');
  const inputBytes=buffer.length*buffer.numberOfChannels*4;
  if(!Number.isSafeInteger(inputBytes)||inputBytes>maxInputBytes)
    throw new RangeError('Source PCM copy exceeds worker memory budget');
  const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i).slice());
  const transferable=channels.map(c=>c.buffer);
  return new Promise((resolve,reject)=>{
    let worker=null,closed=false,busy=false,expectedFrame=0;
    const finish=(error,metrics)=>{
      if(closed)return;
      closed=true;
      signal?.removeEventListener('abort',abort);
      try{worker?.terminate();}catch{}
      if(error)reject(error);else resolve(metrics);
    };
    const abort=()=>{const err=new Error('Streaming Warp cancelled');err.code='CANCELLED';finish(err);};
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return;}
    try{
      worker=workerFactory();
      worker.onerror=e=>finish(new Error(e?.message||'Warp Worker crashed'));
      worker.onmessage=async event=>{
        const data=event.data||{};
        if(closed||data.id!==1)return;
        if(data.type==='progress'){
          try{onProgress(data.progress);}catch(e){finish(e);}return;
        }
        if(data.type==='error'){
          const e=new Error(data.message||'Streaming Warp error');e.code=data.code;finish(e);return;
        }
        if(data.type==='done'){
          if(busy)return finish(new Error('Worker finished with unacknowledged chunk'));
          if(data.metrics?.frames!==expectedFrame)return finish(new Error('Warp chunk frame count mismatch'));
          finish(null,data.metrics);return;
        }
        if(data.type!=='chunk')return;
        if(busy)return finish(new Error('Warp Worker violated chunk backpressure'));
        if(data.frameOffset!==expectedFrame||!Array.isArray(data.channels)||
          data.channels.length!==buffer.numberOfChannels||
          !data.channels.every(c=>c instanceof Float32Array&&c.length===data.channels[0].length)||
          data.channels[0].length<1)
          return finish(new Error('Warp Worker sent malformed/out-of-order PCM chunk'));
        busy=true;
        try{
          await onChunk(data.channels,data.frameOffset);
          if(closed)return;
          expectedFrame+=data.channels[0].length;
          busy=false;
          worker.postMessage({id:1,type:'ack'});
        }catch(e){finish(e);}
      };
      worker.postMessage({id:1,type:'render-chunks',config:{channels,sampleRate:buffer.sampleRate,
        timeline,onsets,windowSize,synthesisHop,searchMilliseconds,searchStride,
        chunkFrames,maxWorkingBytes}},transferable);
    }catch(e){finish(e);}
  });
}
