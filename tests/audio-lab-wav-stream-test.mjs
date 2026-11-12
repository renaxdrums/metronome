import assert from 'node:assert/strict';
import {createWavStreamWriter} from '../audio-lab/io/wav-stream.mjs';
for(const bits of [16,24]){
 const pieces=[];const frames=1024;const ch=Float32Array.from({length:frames},(_,i)=>Math.sin(i*.02)*.8);
 const sink=createWavStreamWriter({sampleRate:96000,channelCount:2,totalFrames:frames,bitDepth:bits,write:async bytes=>pieces.push(bytes.slice())});
 await sink.start();await sink.writeChunk([ch,ch],0);const meta=await sink.finish();
 assert.equal(meta.frames,1024);assert.equal(pieces.length,2);
 const header=new DataView(pieces[0].buffer);assert.equal(header.getUint32(40,true),frames*2*bits/8);
 assert.equal(header.getUint32(24,true),96000);assert.equal(meta.encodedBytes,pieces[0].length+pieces[1].length);
 await assert.rejects(sink.writeChunk([ch,ch],0),/not active/);
 const partial=createWavStreamWriter({sampleRate:48000,channelCount:2,totalFrames:frames+1,bitDepth:bits,write:async()=>{}});
 await partial.start();await partial.writeChunk([ch,ch],0);await assert.rejects(partial.finish(),/Incomplete/);
}
console.log('PASS stream WAV 16/24 bits, byte exact framing, backpressure, truncation guards');
