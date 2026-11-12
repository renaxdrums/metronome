/** Local WMA/ASF v1/v2/Pro/Lossless decode; no network, no server or UI blocking. */
export function decodeWmaInWorker({bytes,signal,onProgress=()=>{},
  maxEncodedBytes=128*1024*1024,maxDecodedBytes=512*1024*1024,
  workerFactory=()=>new Worker(new URL('./wma-worker.mjs',import.meta.url),{type:'module'})}={}){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<30||
    !Number.isSafeInteger(maxEncodedBytes)||maxEncodedBytes<30||
    !Number.isSafeInteger(maxDecodedBytes)||maxDecodedBytes<4096||
    typeof workerFactory!=='function'||typeof onProgress!=='function')
    throw new TypeError('Invalid WMA decoder options');
  if(bytes.byteLength>maxEncodedBytes){const e=new Error('WMA source exceeds memory budget');e.code='MEMORY_PRESSURE';throw e;}
  return new Promise((resolve,reject)=>{
    let worker,finished=false;
    const finish=(error,value)=>{
      if(finished)return;
      finished=true;
      signal?.removeEventListener('abort',abort);
      try{worker?.terminate();}catch{}
      if(error)reject(error);else resolve(value);
    };
    const abort=()=>{const e=new Error('WMA decoding cancelled');e.code='CANCELLED';finish(e);};
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return;}
    try{
      worker=workerFactory();
      worker.onerror=e=>finish(new Error(e?.message||'WMA Worker crashed'));
      worker.onmessage=event=>{
        const data=event.data||{};
        if(finished||data.id!==1)return;
        if(data.type==='error'){
          const e=new Error(data.message||'WMA codec failure');e.code=data.code||'DECODE_FAILED';finish(e);return;
        }
        if(data.type!=='done')return;
        const {sampleRate,channels}=data;
        if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||
          !Array.isArray(channels)||channels.length<1||channels.length>8||
          !channels.every(ch=>ch instanceof Float32Array&&ch.length===channels[0].length)||
          !channels[0].length||channels[0].length*channels.length*4>maxDecodedBytes)
          return finish(new Error('WMA Worker returned invalid/oversized PCM'));
        finish(null,{sampleRate,channels});
      };
      const copy=bytes.slice();
      worker.postMessage({id:1,type:'decode-wma',bytes:copy.buffer,maxDecodedBytes},[copy.buffer]);
      onProgress(.05);
    }catch(e){finish(e);}
  });
}
