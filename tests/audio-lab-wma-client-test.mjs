import assert from 'node:assert/strict';
import {decodeWmaInWorker} from '../audio-lab/io/wma-client.mjs';
const marker=Uint8Array.from([0x30,0x26,0xb2,0x75,0x8e,0x66,0xcf,0x11,
  0xa6,0xd9,0,0xaa,0,0x62,0xce,0x6c,...Array(40).fill(0)]);
const original=marker.slice();
let terminated=0,posted=0;
const workerFactory=()=>({
  postMessage(data,transfer){
    posted++;
    assert.equal(data.type,'decode-wma');
    assert.notEqual(data.bytes,marker.buffer,'input must be copied before transfer');
    assert.equal(transfer.length,1);
    queueMicrotask(()=>this.onmessage({data:{
      id:1,type:'done',sampleRate:48000,
      channels:[new Float32Array([.1,.2]),new Float32Array([.3,.4])],
    }}));
  },
  terminate(){terminated++;},
});
const result=await decodeWmaInWorker({bytes:marker,workerFactory});
assert.equal(result.sampleRate,48000);assert.equal(result.channels.length,2);
assert.deepEqual(marker,original);assert.equal(posted,1);assert.equal(terminated,1);
const abort=new AbortController();abort.abort();
await assert.rejects(decodeWmaInWorker({bytes:marker,workerFactory,signal:abort.signal}),
  e=>e.code==='CANCELLED');
assert.throws(()=>decodeWmaInWorker({bytes:marker,maxEncodedBytes:30,workerFactory}),
  e=>e.code==='MEMORY_PRESSURE');
await assert.rejects(decodeWmaInWorker({bytes:marker,workerFactory:()=>({
  postMessage(){queueMicrotask(()=>this.onmessage({data:{id:1,type:'done',
    sampleRate:0,channels:[]}}));},terminate(){}
})}),/invalid\/oversized/);
await assert.rejects(decodeWmaInWorker({bytes:marker,workerFactory:()=>({
  postMessage(){queueMicrotask(()=>this.onmessage({data:{id:1,type:'error',
    code:'DECODE_FAILED',message:'Malformed ASF'}}));},terminate(){}
})}),e=>e.code==='DECODE_FAILED');
console.log('Audio Lab WMA: isolated worker PCM transfer, cancellation, corruption, budget and original bytes PASS');
