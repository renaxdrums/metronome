/** Audio Lab WMA — self-hosted LGPL FFmpeg WASM runs entirely in a Worker. */
import decodeWMA from '../../vendor/wma/decode-wma.js';

self.addEventListener('message', async event=>{
  const {id,type,bytes,maxDecodedBytes}=event.data||{};
  if(type!=='decode-wma')return;
  try{
    if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<30||
      !Number.isSafeInteger(maxDecodedBytes)||maxDecodedBytes<4096)
      throw new TypeError('Invalid WMA worker payload');
    const audio=await decodeWMA(new Uint8Array(bytes));
    const channels=audio?.channelData,sampleRate=audio?.sampleRate;
    if(!Array.isArray(channels)||channels.length<1||channels.length>8||
      !Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||
      !channels.every(ch=>ch instanceof Float32Array&&ch.length===channels[0].length)||
      channels[0].length<1)
      throw new RangeError('WMA decoder returned invalid PCM');
    const total=channels[0].length*channels.length*4;
    if(!Number.isSafeInteger(total)||total>maxDecodedBytes){
      const error=new Error('Decoded WMA exceeds memory budget');error.code='MEMORY_PRESSURE';throw error;
    }
    for(const channel of channels)for(let i=0;i<channel.length;i++)
      if(!Number.isFinite(channel[i]))throw new RangeError('Non-finite WMA PCM');
    self.postMessage({id,type:'done',sampleRate,channels},channels.map(ch=>ch.buffer));
  }catch(cause){self.postMessage({id,type:'error',code:cause.code||'DECODE_FAILED',
    message:cause.message||'WMA decoding failed'});}
});
