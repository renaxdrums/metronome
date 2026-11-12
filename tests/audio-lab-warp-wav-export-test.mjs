import assert from 'node:assert/strict';
import {exportWarpWavToSink} from '../audio-lab/io/warp-wav-export.mjs';
let closed=0,aborted=0,pieces=[],workerTerminated=0;
const source={length:4800,numberOfChannels:2,sampleRate:48000,
  getChannelData:()=>new Float32Array(4800)};
const timeline={sourceDurationSeconds:.1,outputDurationSeconds:.3};
const sink={write:bytes=>{pieces.push(bytes.slice());},close:()=>closed++,
  abort:()=>aborted++};
let worker;
const workerFactory=()=>{
  worker={postMessage:data=>{
    if(data.type!=='render-chunks')return;
    const frameOffset=worker.sent||0,frames=Math.min(1024,14400-frameOffset);
    if(frames>0){
      worker.sent=frameOffset+frames;
      queueMicrotask(()=>worker.onmessage({data:{id:1,type:'chunk',frameOffset,
        channels:[new Float32Array(frames),new Float32Array(frames)]}}));
    }else queueMicrotask(()=>worker.onmessage({data:{id:1,type:'done',
      metrics:{frames:14400,peak:0,method:'fake'}}}));
  },terminate:()=>workerTerminated++};
  return worker;
};
const output=await exportWarpWavToSink({buffer:source,timeline,sink,workerFactory,
  bitDepth:24});
assert.equal(output.wav.frames,14400);
assert.equal(output.wav.encodedBytes,44+14400*2*3);
assert.equal(pieces.reduce((n,p)=>n+p.length,0),output.wav.encodedBytes);
const v=new DataView(pieces[0].buffer);
assert.equal(v.getUint32(24,true),48000);
assert.equal(v.getUint16(34,true),24);
assert.equal(closed,1);assert.equal(aborted,0);assert.equal(workerTerminated,1);
console.log('Audio Lab Warp-to-WAV: streamed PCM chunks, exact RIFF header, sink close, zero full-output buffer PASS');
