import assert from 'node:assert/strict';
import {inspectAiffPcm,decodeAiffPcm} from '../audio-lab/io/aiff-pcm.mjs';
import {decodeLocalAudio,sniffAudioFormat} from '../audio-lab/io/local-decode.mjs';

const rates={
  44100:[0x40,0x0e,0xac,0x44,0,0,0,0,0,0],
  48000:[0x40,0x0e,0xbb,0x80,0,0,0,0,0,0],
  96000:[0x40,0x0f,0xbb,0x80,0,0,0,0,0,0],
};
function makeAiff(rate,bits,{aifc=false,little=false,oddChunk=true}={}){
  const frames=8,channels=2,bytesPerSample=bits/8;
  const commSize=aifc?22:18,dataSize=frames*channels*bytesPerSample;
  const junkSize=oddChunk?14:0; // 8-byte header, 5-byte payload, one padding byte.
  const total=12+8+commSize+junkSize+8+8+dataSize;
  const bytes=new Uint8Array(total),view=new DataView(bytes.buffer);
  const put=(at,text)=>{for(let i=0;i<text.length;i++)bytes[at+i]=text.charCodeAt(i);};
  put(0,'FORM');view.setUint32(4,total-8,false);put(8,aifc?'AIFC':'AIFF');
  let at=12;put(at,'COMM');view.setUint32(at+4,commSize,false);
  view.setUint16(at+8,channels,false);view.setUint32(at+10,frames,false);
  view.setUint16(at+14,bits,false);bytes.set(rates[rate],at+16);
  if(aifc)put(at+26,little?'sowt':'NONE');
  at+=8+commSize;
  if(oddChunk){put(at,'NAME');view.setUint32(at+4,5,false);at+=14;}
  put(at,'SSND');view.setUint32(at+4,8+dataSize,false);
  view.setUint32(at+8,0,false);view.setUint32(at+12,0,false);
  const pcmAt=at+16;
  const signed=[[-1,.5],[.25,0],[.5,-.5],[-.25,.25],
    [-1,.5],[.25,0],[.5,-.5],[-.25,.25]];
  for(let i=0;i<frames;i++)for(let ch=0;ch<channels;ch++){
    const p=pcmAt+(i*channels+ch)*bytesPerSample;
    const n=Math.round(signed[i][ch]*2**(bits-1));
    if(bits===16)view.setInt16(p,n,little);
    else if(little){bytes[p]=n&255;bytes[p+1]=(n>>8)&255;bytes[p+2]=(n>>16)&255;}
    else{bytes[p]=(n>>16)&255;bytes[p+1]=(n>>8)&255;bytes[p+2]=n&255;}
  }
  return bytes;
}
function context(){
  return{
    createBuffer:(n,len,rate)=>{
      const channels=Array.from({length:n},()=>new Float32Array(len));
      return {numberOfChannels:n,length:len,sampleRate:rate,duration:len/rate,
        getChannelData:i=>channels[i],copyToChannel:(a,i)=>channels[i].set(a)};
    },
    decodeAudioData:()=>{throw Error('AIFF must use the independent PCM decoder');},
    close:async()=>{},
  };
}
for(const rate of [44100,48000,96000]){
  for(const bits of [16,24]){
    for(const mode of [{},{aifc:true,little:true},{aifc:true,little:false}]){
      const bytes=makeAiff(rate,bits,mode),before=bytes.slice();
      const meta=inspectAiffPcm(bytes);
      assert.equal(meta.sampleRate,rate);
      assert.equal(meta.bitDepth,bits);
      assert.equal(meta.channels,2);
      assert.equal(meta.frames,8);
      assert.equal(meta.encoding,mode.little?'pcm-le':'pcm-be');
      const decoded=decodeAiffPcm(bytes,context());
      assert.equal(decoded.buffer.sampleRate,rate);
      assert.equal(decoded.buffer.getChannelData(0)[0],-1);
      assert.equal(decoded.buffer.getChannelData(1)[0],.5);
      assert.equal(decoded.buffer.getChannelData(0)[1],.25);
      assert.equal(decoded.buffer.getChannelData(1)[2],-.5);
      assert.deepEqual(bytes,before,'input audio bytes immutable');
      assert.equal(sniffAudioFormat(bytes),'aiff');
      const original=new File([bytes],'source.aif',{type:'audio/aiff'});
      const imported=await decodeLocalAudio(original,{createContext:context,maxDecodedBytes:1024*1024});
      assert.equal(imported.format,'aiff');
      assert.equal(imported.identity.sourceSampleRate,rate);
      assert.equal(imported.identity.sourceBitDepth,bits);
      assert.equal(imported.identity.sourceChannels,2);
      await imported.context.close();
    }
  }
}
const compressed=makeAiff(44100,16,{aifc:true});
const at=compressed.indexOf(78,20); // Find N of NONE in COMM, not FORM.
assert(at>0);
compressed.set([0x75,0x6c,0x61,0x77],at); // ulaw is deliberately unsupported.
assert.equal(inspectAiffPcm(compressed),null);
assert.equal(inspectAiffPcm(makeAiff(44100,16).subarray(0,30)),null);
assert.throws(()=>decodeAiffPcm(new Uint8Array(40),context()),/Unsupported/);
assert.throws(()=>decodeAiffPcm(makeAiff(96000,24),context(),{maxDecodedBytes:16}),/memory budget/);
const asf=Uint8Array.from([0x30,0x26,0xb2,0x75,0x8e,0x66,0xcf,0x11,
  0xa6,0xd9,0,0xaa,0,0x62,0xce,0x6c]);
assert.equal(sniffAudioFormat(asf),'wma','WMA container is recognized; codec support remains browser-dependent');
console.log('Audio Lab AIFF: 18 PCM cases (AIFF/AIFC, big/little endian, 16/24-bit, 44.1/48/96 kHz), bounds, WMA recognition OK');
