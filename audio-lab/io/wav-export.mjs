/**
 * RENAX Audio Lab — isolated, offline PCM WAV export for rendered Warp audio.
 * Does not modify the source PCM, historical RENAX MP3 export, or its mastering.
 */
const integer=(x)=>Number.isSafeInteger(x);
export function encodeAudioLabWav(config){
  const {channels,sampleRate,bitDepth=24,maxEncodedBytes=512*1024*1024,
    onProgress=()=>{},signal}=config||{};
  if(!Array.isArray(channels)||channels.length<1||channels.length>8||
     !channels.every(c=>c instanceof Float32Array&&c.length===channels[0].length)||
     !integer(channels[0].length)||channels[0].length<1)
    throw new TypeError('Expected 1..8 equal-length Float32Array channels');
  if(!integer(sampleRate)||sampleRate<8000||sampleRate>192000||![16,24].includes(bitDepth))
    throw new RangeError('WAV export supports 16/24-bit PCM at 8–192 kHz');
  if(typeof onProgress!=='function'||!integer(maxEncodedBytes)||maxEncodedBytes<44)
    throw new TypeError('Invalid WAV export budget or progress callback');
  const frames=channels[0].length,bytesPerSample=bitDepth/8,frameSize=bytesPerSample*channels.length;
  const pcmBytes=frames*frameSize,total=44+pcmBytes;
  if(!integer(pcmBytes)||!integer(total)||pcmBytes>0xffffffff-36||
      total>maxEncodedBytes)
    throw new RangeError('WAV export exceeds RIFF or memory budget');
  if(signal?.aborted)throw new DOMException('WAV export cancelled','AbortError');
  const bytes=new Uint8Array(total),view=new DataView(bytes.buffer);
  const write=(at,text)=>{for(let i=0;i<text.length;i++)bytes[at+i]=text.charCodeAt(i);};
  write(0,'RIFF');view.setUint32(4,total-8,true);write(8,'WAVE');
  write(12,'fmt ');view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,channels.length,true);
  view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*frameSize,true);
  view.setUint16(32,frameSize,true);view.setUint16(34,bitDepth,true);
  write(36,'data');view.setUint32(40,pcmBytes,true);
  let peak=0,clippedSamples=0;
  const scale=2**(bitDepth-1),high=scale-1;
  for(let frame=0;frame<frames;frame++){
    if((frame&16383)===0){
      if(signal?.aborted)throw new DOMException('WAV export cancelled','AbortError');
      onProgress(frame/frames);
    }
    for(let ch=0;ch<channels.length;ch++){
      const sample=channels[ch][frame];
      if(!Number.isFinite(sample))throw new RangeError('WAV export received non-finite PCM');
      peak=Math.max(peak,Math.abs(sample));
      if(sample>1||sample< -1)clippedSamples++;
      const scaled=Math.round(sample*scale);
      const value=Math.max(-scale,Math.min(high,scaled));
      const at=44+frame*frameSize+ch*bytesPerSample;
      if(bitDepth===16)view.setInt16(at,value,true);
      else {bytes[at]=value&255;bytes[at+1]=(value>>8)&255;bytes[at+2]=(value>>16)&255;}
    }
  }
  onProgress(1);
  return Object.freeze({bytes,bitDepth,sampleRate,channels:channels.length,
    frames,durationSeconds:frames/sampleRate,peak,clippedSamples,mimeType:'audio/wav'});
}
