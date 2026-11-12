/**
 * RENAX Audio Lab — chunked, stereo-linked WSOLA renderer.
 * Consumes decoded PCM and emits bounded Float32Array chunks in order.
 * Analysis, synthesis window and cross-chunk overlap persist for the whole song;
 * no repeated boundary grains, silence gaps, or intermediate full-length output.
 * The source PCM remains immutable. This is offline processing, not AudioWorklet DSP.
 */
import { outputSecondsToSourceSeconds, sourceSecondsToOutputSeconds } from '../warp/warp-timeline.mjs';

function clamp(n,a,b){return Math.min(b,Math.max(a,n));}
function fail(code,message){const error=new Error(message);error.code=code;throw error;}
function cancelled(signal){if(signal?.aborted)fail('CANCELLED','Warp cancelled');}

/** Returns emitted output frames and peak; yield type: {frameOffset,channels}.
 * Consumer controls backpressure by advancing the generator only when ready.
 */
export function* renderWarpPCMChunks({channels,sampleRate,timeline,onsets=[],signal,
  windowSize=2048,synthesisHop=512,searchMilliseconds=10,searchStride=12,
  chunkFrames=8192,maxWorkingBytes=32*1024*1024,onProgress}={}){
  if(!Array.isArray(channels)||!channels.length||channels.length>8||
    !channels.every(c=>c instanceof Float32Array&&c.length===channels[0].length))
    throw new TypeError('1..8 equal-length PCM Float32Array channels required');
  if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000||
    !Number.isFinite(timeline?.outputDurationSeconds)||timeline.outputDurationSeconds<=0||
    !Number.isFinite(timeline?.sourceDurationSeconds)||timeline.sourceDurationSeconds<=0||
    !Array.isArray(timeline.segments)||!timeline.segments.length)
    throw new TypeError('Valid sample rate and Warp timeline required');
  if(Math.abs(channels[0].length/sampleRate-timeline.sourceDurationSeconds)>1.5/sampleRate)
    throw new RangeError('Warp source duration disagrees with PCM');
  if(!Number.isSafeInteger(windowSize)||windowSize<512||windowSize>8192||
    (windowSize&(windowSize-1))||!Number.isSafeInteger(synthesisHop)||
    synthesisHop<64||synthesisHop>windowSize/2||
    !Number.isSafeInteger(searchStride)||searchStride<1||searchStride>64||
    !Number.isFinite(searchMilliseconds)||searchMilliseconds<0||searchMilliseconds>50||
    !Number.isSafeInteger(chunkFrames)||chunkFrames<256||chunkFrames>65536||
    !Number.isSafeInteger(maxWorkingBytes)||maxWorkingBytes<65536)
    throw new RangeError('Invalid streaming WSOLA resource or quality settings');
  if(!Array.isArray(onsets)||onsets.length>200000||
    (onProgress!==undefined&&typeof onProgress!=='function'))
    throw new TypeError('Invalid onset list or progress callback');
  const outputFrames=Math.round(timeline.outputDurationSeconds*sampleRate);
  const sourceFrames=channels[0].length;
  if(!Number.isSafeInteger(outputFrames)||outputFrames<=0||outputFrames>0x7fffffff)
    fail('OUTPUT_LENGTH','Warp output frame count exceeds supported range');
  if(sourceFrames<windowSize||outputFrames<windowSize)
    fail('TOO_SHORT','Clip too short for the selected WSOLA window');
  const ringSize=windowSize*2,ringMask=ringSize-1;
  const footprint=(ringSize*(channels.length+1)+chunkFrames*channels.length+windowSize)*4;
  if(footprint>maxWorkingBytes)fail('MEMORY_PRESSURE','Warp chunk working set exceeds memory budget');
  cancelled(signal);
  for(const c of channels)for(let i=0;i<c.length;i++)if(!Number.isFinite(c[i]))
    fail('INVALID_PCM','Nonfinite source sample');

  // Transient restoration is itself cross-chunk (a time-ordered list of anchors).
  const protectedOnsets=[];
  const pre=Math.round(.008*sampleRate),post=Math.round(.035*sampleRate);
  const fade=Math.max(1,Math.round(.006*sampleRate));
  let previousEnd=-Infinity,lastSource=-Infinity;
  for(const onset of onsets){
    const sec=typeof onset==='number'?onset:onset?.seconds;
    if(!Number.isFinite(sec)||sec<=lastSource||sec<0||sec>timeline.sourceDurationSeconds)
      throw new RangeError('Transient times must be finite, ordered and inside source');
    lastSource=sec;
    const sourceCenter=Math.round(sec*sampleRate);
    const outputCenter=Math.round(sourceSecondsToOutputSeconds(timeline,sec)*sampleRate);
    if(outputCenter-pre<=previousEnd)continue;
    protectedOnsets.push({sourceCenter,outputCenter,start:outputCenter-pre,end:outputCenter+post});
    previousEnd=outputCenter+post;
  }

  const identity=outputFrames===sourceFrames&&timeline.segments.every(seg=>
    Math.abs(seg.outputStartSeconds-seg.sourceStartSeconds)<1e-9&&
    Math.abs(seg.outputEndSeconds-seg.sourceEndSeconds)<1e-9);
  let chunk=channels.map(()=>new Float32Array(chunkFrames));
  let filled=0,emitted=0,peak=0,transientIndex=0;
  if(identity){
    for(let offset=0;offset<outputFrames;offset+=chunkFrames){
      cancelled(signal);
      const n=Math.min(chunkFrames,outputFrames-offset);
      yield {frameOffset:offset,channels:channels.map(c=>c.slice(offset,offset+n))};
      emitted+=n;
      onProgress?.(emitted/outputFrames);
    }
    return {frames:emitted,peak:null,grains:0,method:'identity-copy',workingBytes:footprint};
  }
  const sums=channels.map(()=>new Float32Array(ringSize));
  const weights=new Float32Array(ringSize),window=new Float32Array(windowSize);
  for(let i=0;i<windowSize;i++)window[i]=Math.sin(Math.PI*(i+.5)/windowSize)**2;
  const maxStart=sourceFrames-windowSize,radius=Math.round(searchMilliseconds*sampleRate/1000);
  const referenceLength=Math.min(1024,windowSize/2);
  const grains=Math.ceil(outputFrames/synthesisHop);
  let finalized=0,previousStart=null,restored=0;
  function score(candidate,frameStart,predicted){
    let xy=0,xx=0,yy=0,count=0;
    const limit=Math.min(referenceLength,outputFrames-frameStart);
    for(let k=0;k<limit;k+=4){
      const at=frameStart+k,slot=at&ringMask,w=weights[slot];
      if(w<=1e-7)continue;
      for(let ch=0;ch<channels.length;ch++){
        const a=sums[ch][slot]/w,b=channels[ch][candidate+k];
        xy+=a*b;xx+=a*a;yy+=b*b;count++;
      }
    }
    if(count<64||xx<1e-10||yy<1e-10)return -1;
    return xy/Math.sqrt(xx*yy)-.055*Math.abs(candidate-predicted)/Math.max(1,radius);
  }
  for(let grain=0;grain<grains;grain++){
    if((grain&31)===0)cancelled(signal);
    const start=grain*synthesisHop;
    const centre=Math.min(timeline.outputDurationSeconds,(start+windowSize/2)/sampleRate);
    const prediction=clamp(Math.round(outputSecondsToSourceSeconds(timeline,centre)*sampleRate-windowSize/2),0,maxStart);
    let chosen=prediction;
    if(grain>0&&radius){
      let best=-Infinity,left=Math.max(0,prediction-radius),right=Math.min(maxStart,prediction+radius);
      for(let p=left;p<=right;p+=searchStride){const s=score(p,start,prediction);if(s>best){best=s;chosen=p;}}
      const coarse=chosen;
      for(let p=Math.max(left,coarse-searchStride);p<=Math.min(right,coarse+searchStride);p++){
        const s=score(p,start,prediction);if(s>best){best=s;chosen=p;}
      }
      if(score(prediction,start,prediction)>best)chosen=prediction;
    }
    if(previousStart!==null&&chosen<previousStart-windowSize/2)
      chosen=clamp(previousStart-windowSize/2,0,maxStart);
    previousStart=chosen;
    for(let k=0;k<Math.min(windowSize,outputFrames-start);k++){
      const slot=(start+k)&ringMask,w=window[k];
      weights[slot]+=w;
      for(let ch=0;ch<channels.length;ch++)sums[ch][slot]+=channels[ch][chosen+k]*w;
    }
    const done=grain===grains-1?outputFrames:Math.min(outputFrames,(grain+1)*synthesisHop);
    for(;finalized<done;finalized++){
      const slot=finalized&ringMask,weight=weights[slot];
      while(transientIndex<protectedOnsets.length&&finalized>protectedOnsets[transientIndex].end)
        transientIndex++;
      const t=protectedOnsets[transientIndex];
      let mix=0,srcIdx=-1;
      if(t&&finalized>=t.start&&finalized<=t.end){
        const delta=finalized-t.outputCenter;
        srcIdx=t.sourceCenter+delta;
        if(srcIdx>=0&&srcIdx<sourceFrames){
          mix=delta<-pre+fade?clamp((delta+pre)/fade,0,1):
            delta>post-fade?clamp((post-delta)/fade,0,1):1;
          if(mix>0&&delta===0)restored++;
        }
      }
      for(let ch=0;ch<channels.length;ch++){
        let v=weight>1e-10?sums[ch][slot]/weight:0;
        if(mix)v=v*(1-mix)+channels[ch][srcIdx]*mix;
        if(!Number.isFinite(v))fail('DSP_NONFINITE','WSOLA emitted nonfinite PCM');
        chunk[ch][filled]=v;
        peak=Math.max(peak,Math.abs(v));
        sums[ch][slot]=0;
      }
      weights[slot]=0;
      filled++;
      if(filled===chunkFrames){
        yield {frameOffset:emitted,channels:chunk};
        emitted+=filled;
        filled=0;chunk=channels.map(()=>new Float32Array(chunkFrames));
      }
    }
    if((grain&63)===0||grain===grains-1)onProgress?.(done/outputFrames);
  }
  if(filled){yield {frameOffset:emitted,channels:chunk.map(c=>c.slice(0,filled))};emitted+=filled;}
  cancelled(signal);
  if(emitted!==outputFrames)fail('DSP_LENGTH','Warp output length mismatch');
  return {frames:emitted,peak,grains,restored,method:'wsola-stream',workingBytes:footprint};
}
