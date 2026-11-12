/**
 * Audio Lab: bounded, backpressured PCM WAV 16/24-bit writer. This module never
 * stores the whole rendered output. The destination callback can write to a
 * FileSystemWritableFileStream, OPFS file, or any application-controlled sink.
 */
export function createWavStreamWriter({sampleRate,channelCount,totalFrames,
  bitDepth=24,write,maxChunkBytes=2*1024*1024,signal}={}){
  if(!Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>192000||
    !Number.isSafeInteger(channelCount)||channelCount<1||channelCount>8||
    !Number.isSafeInteger(totalFrames)||totalFrames<1||
    ![16,24].includes(bitDepth)||typeof write!=='function'||
    !Number.isSafeInteger(maxChunkBytes)||maxChunkBytes<1024)
    throw new TypeError('Invalid streaming PCM WAV configuration');
  const bytesPerSample=bitDepth/8,frameSize=bytesPerSample*channelCount;
  const totalPCMBytes=totalFrames*frameSize;
  if(!Number.isSafeInteger(totalPCMBytes)||totalPCMBytes>0xffffffff-36)
    throw new RangeError('PCM file exceeds RIFF 32-bit limit');
  const header=new Uint8Array(44),view=new DataView(header.buffer);
  function ascii(pos,s){for(let i=0;i<s.length;i++)header[pos+i]=s.charCodeAt(i);}
  ascii(0,'RIFF');view.setUint32(4,totalPCMBytes+36,true);ascii(8,'WAVE');
  ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
  view.setUint16(22,channelCount,true);view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*frameSize,true);view.setUint16(32,frameSize,true);
  view.setUint16(34,bitDepth,true);ascii(36,'data');view.setUint32(40,totalPCMBytes,true);
  let begun=false,finished=false,framesWritten=0,peak=0,clippedSamples=0;
  const rejectIfCancelled=()=>{if(signal?.aborted){const e=new Error('WAV streaming cancelled');e.code='CANCELLED';throw e;}};
  async function start(){
    if(begun)throw new Error('WAV writer already started');
    rejectIfCancelled();begun=true;
    await write(header);
  }
  async function writeChunk(channels,frameOffset){
    if(!begun||finished)throw new Error('WAV writer is not active');
    rejectIfCancelled();
    if(!Array.isArray(channels)||channels.length!==channelCount||
      !channels.every(c=>c instanceof Float32Array&&c.length===channels[0].length)||
      !channels[0].length||frameOffset!==framesWritten||
      framesWritten+channels[0].length>totalFrames)
      throw new RangeError('WAV chunk missing, out of order, or incompatible');
    const frames=channels[0].length,byteLength=frames*frameSize;
    if(byteLength>maxChunkBytes)throw new RangeError('WAV output chunk exceeds budget');
    const bytes=new Uint8Array(byteLength),scale=2**(bitDepth-1),high=scale-1;
    const dv=new DataView(bytes.buffer);
    for(let i=0;i<frames;i++){
      if((i&16383)===0)rejectIfCancelled();
      for(let channel=0;channel<channelCount;channel++){
        const sample=channels[channel][i];
        if(!Number.isFinite(sample))throw new RangeError('Nonfinite output PCM');
        peak=Math.max(peak,Math.abs(sample));
        if(sample>1||sample< -1)clippedSamples++;
        const value=Math.max(-scale,Math.min(high,Math.round(sample*scale)));
        const pos=(i*channelCount+channel)*bytesPerSample;
        if(bitDepth===16)dv.setInt16(pos,value,true);
        else{bytes[pos]=value&255;bytes[pos+1]=(value>>8)&255;bytes[pos+2]=(value>>16)&255;}
      }
    }
    await write(bytes);framesWritten+=frames;
  }
  async function finish(){
    if(!begun||finished)throw new Error('WAV writer not active');
    rejectIfCancelled();
    if(framesWritten!==totalFrames)throw new Error('Incomplete WAV file: '+framesWritten+'/'+totalFrames);
    finished=true;
    return Object.freeze({frames:framesWritten,sampleRate,bitDepth,channels:channelCount,
      peak,clippedSamples,durationSeconds:framesWritten/sampleRate,encodedBytes:totalPCMBytes+44});
  }
  return Object.freeze({start,writeChunk,finish});
}
