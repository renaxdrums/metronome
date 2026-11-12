/**
 * RENAX Audio Lab — independent local uncompressed AIFF/AIFC PCM decoder.
 * No proprietary codec, no network, and no modification of input audio bytes.
 * Supports signed 16/24-bit big-endian AIFF or AIFC 'NONE'/'twos' and
 * little-endian AIFC 'sowt'. Other codecs must fail explicitly.
 */
const ascii=(b,at,len)=>String.fromCharCode(...b.subarray(at,at+len));
function readExtended80(view,at){
  const negative=(view.getUint8(at)&0x80)!==0;
  const exponent=((view.getUint8(at)&127)<<8)|view.getUint8(at+1);
  const high=view.getUint32(at+2,false),low=view.getUint32(at+6,false);
  if(negative||exponent===0x7fff||exponent===0)return NaN;
  const mantissa=high*4294967296+low;
  return mantissa*2**(exponent-16383-63);
}
function inspect(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<12)return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
  if(ascii(bytes,0,4)!=='FORM')return null;
  const kind=ascii(bytes,8,4);
  if(kind!=='AIFF'&&kind!=='AIFC')return null;
  const declared=view.getUint32(4,false);
  if(declared<4||declared>bytes.length-8)return null;
  const end=declared+8;
  let comm=null,sound=null;
  for(let pos=12;pos+8<=end;){
    const length=view.getUint32(pos+4,false),start=pos+8;
    if(length>end-start)return null;
    const type=ascii(bytes,pos,4);
    if(type==='COMM'){
      if(comm||length<(kind==='AIFF'?18:22))return null;
      const channels=view.getUint16(start,false),frames=view.getUint32(start+2,false);
      const bits=view.getUint16(start+6,false),sampleRate=readExtended80(view,start+8);
      const compression=kind==='AIFF'?'NONE':ascii(bytes,start+18,4);
      if(![16,24].includes(bits)||channels<1||channels>8||frames<1||
         !Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000||
         !Number.isInteger(sampleRate)||!['NONE','twos','sowt'].includes(compression))
        return null;
      comm={channels,frames,bitDepth:bits,sampleRate,compression};
    }
    if(type==='SSND'){
      if(sound||length<8)return null;
      const offset=view.getUint32(start,false);
      if(offset>length-8)return null;
      sound={start:start+8+offset,end:start+length};
    }
    pos=start+length+(length&1);
  }
  if(!comm||!sound)return null;
  const bytesPerSample=comm.bitDepth/8,frameBytes=bytesPerSample*comm.channels;
  if(!Number.isSafeInteger(comm.frames*frameBytes)||
      comm.frames*frameBytes>sound.end-sound.start)return null;
  return Object.freeze({...comm,dataOffset:sound.start,
    encoding:comm.compression==='sowt'?'pcm-le':'pcm-be'});
}
/** Validate an AIFF header, including all audio-data bounds, without decoding PCM. */
export function inspectAiffPcm(bytes){
  const result=inspect(bytes);
  if(!result)return null;
  const {channels,frames,bitDepth,sampleRate,encoding}=result;
  return Object.freeze({channels,frames,bitDepth,sampleRate,encoding});
}
/**
 * Decode signed integer PCM directly into Web Audio, at the ORIGINAL sample rate.
 * The resulting AudioBuffer is separate; original bytes remain unchanged.
 */
export function decodeAiffPcm(bytes,context,{maxDecodedBytes=768*1024*1024,signal}={}){
  const info=inspect(bytes);
  if(!info)throw new RangeError('Unsupported, malformed or compressed AIFF/AIFC');
  if(!context||typeof context.createBuffer!=='function')
    throw new TypeError('AudioContext.createBuffer is required for AIFF');
  const {channels,frames,bitDepth,sampleRate,dataOffset,encoding}=info;
  if(!Number.isSafeInteger(maxDecodedBytes)||maxDecodedBytes<=0||
     frames*channels*4>maxDecodedBytes)
    throw new RangeError('AIFF decoded PCM exceeds memory budget');
  if(signal?.aborted)throw new DOMException('AIFF import cancelled','AbortError');
  const result=context.createBuffer(channels,frames,sampleRate);
  const little=encoding==='pcm-le',view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
  const bytesPerSample=bitDepth/8,frameBytes=channels*bytesPerSample;
  const outputs=Array.from({length:channels},(_,channel)=>result.getChannelData(channel));
  for(let frame=0;frame<frames;frame++){
    if((frame&16383)===0&&signal?.aborted)
      throw new DOMException('AIFF import cancelled','AbortError');
    const base=dataOffset+frame*frameBytes;
    for(let channel=0;channel<channels;channel++){
      const at=base+channel*bytesPerSample;
      let value;
      if(bitDepth===16)value=view.getInt16(at,little)/32768;
      else {
        let n=little?
          bytes[at]|(bytes[at+1]<<8)|(bytes[at+2]<<16):
          (bytes[at]<<16)|(bytes[at+1]<<8)|bytes[at+2];
        if(n&0x800000)n-=0x1000000;
        value=n/8388608;
      }
      outputs[channel][frame]=value;
    }
  }
  return {buffer:result,metadata:inspectAiffPcm(bytes)};
}
