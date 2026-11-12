import assert from 'node:assert/strict';
import {renderWarpChunksInWorker} from '../audio-lab/dsp/warp-chunk-client.mjs';

let handler, live;
const previousSelf=globalThis.self;
globalThis.self={
  addEventListener:(_type,cb)=>{handler=cb;},
  postMessage:data=>queueMicrotask(()=>{if(!live.terminated)live.onmessage?.({data});}),
};
await import('../audio-lab/dsp/warp-chunk-worker.mjs');
class FakeWorker{
  terminated=false;
  constructor(){live=this;}
  postMessage(data){queueMicrotask(()=>{if(!this.terminated)handler({data});});}
  terminate(){this.terminated=true;}
}
try{
  const rate=16000,frames=24000,input=new Float32Array(frames);
  for(let i=0;i<frames;i++)input[i]=.4*Math.sin(2*Math.PI*440*i/rate);
  const copy=input.slice();
  const timeline={sourceDurationSeconds:1.5,outputDurationSeconds:4.5,
    segments:[{sourceStartSeconds:0,sourceEndSeconds:1.5,
      outputStartSeconds:0,outputEndSeconds:4.5}]};
  const delivered=[];let chunks=0,processing=false,maximum=0;
  const info=await renderWarpChunksInWorker({
    buffer:{length:frames,numberOfChannels:1,sampleRate:rate,getChannelData:()=>input},
    timeline,chunkFrames:777,workerFactory:()=>new FakeWorker(),
    onChunk:async(channels,offset)=>{
      assert.equal(processing,false,'No second chunk before first ACK');
      processing=true;maximum=Math.max(maximum,Number(processing));
      await Promise.resolve();
      assert.equal(offset,chunks*777);
      delivered.push(...channels[0]);
      chunks++;processing=false;
    },
  });
  assert.equal(info.frames,72000);assert.equal(chunks,93);
  assert.equal(delivered.length,72000);assert.equal(maximum,1);
  assert.deepEqual(input,copy);
  assert(live.terminated,'Worker terminated after successful render');
  let crossings=0;
  for(let i=rate+1;i<rate*3;i++)if(delivered[i-1]<=0&&delivered[i]>0)crossings++;
  assert(Math.abs(crossings/2-440)<13);
  const abort=new AbortController();abort.abort();
  await assert.rejects(renderWarpChunksInWorker({
    buffer:{length:frames,numberOfChannels:1,sampleRate:rate,getChannelData:()=>input},
    timeline,onChunk:()=>{},workerFactory:()=>new FakeWorker(),signal:abort.signal,
  }),e=>e.code==='CANCELLED');
  await assert.rejects(renderWarpChunksInWorker({
    buffer:{length:frames,numberOfChannels:1,sampleRate:rate,getChannelData:()=>input},
    timeline,onChunk:()=>{throw Error('Persist failure');},workerFactory:()=>new FakeWorker(),
  }),/Persist failure/);
  assert(live.terminated,'Consumer errors must terminate Worker');
  console.log('Audio Lab: genuine chunk worker protocol, backpressure, ownership, pitch, errors and abort PASS');
}finally{globalThis.self=previousSelf;}
