/**
 * Non-destructive transient restoration for WSOLA output. An accepted onset
 * is copied at the ORIGINAL sample rate into its mapped output position with
 * short fades. Source PCM is never changed; rendered output is modified.
 */
import {sourceSecondsToOutputSeconds} from '../warp/warp-timeline.mjs';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

export function protectWarpTransients(config){
  const {source,rendered,sampleRate,timeline,onsets=[],preMilliseconds=8,
    postMilliseconds=35,fadeMilliseconds=6,signal}=config||{};
  if(!Array.isArray(source)||!Array.isArray(rendered)||source.length!==rendered.length||
    source.length===0||!source.every(x=>x instanceof Float32Array&&x.length===source[0].length)||
    !rendered.every(x=>x instanceof Float32Array&&x.length===rendered[0].length)||
    !Number.isFinite(sampleRate)||sampleRate<8000||!timeline||!Array.isArray(onsets))
    throw new TypeError('invalid transient DSP buffers or onset list');
  if(onsets.length>200000||![preMilliseconds,postMilliseconds,fadeMilliseconds].every(Number.isFinite)||
    preMilliseconds<=0||postMilliseconds<=0||fadeMilliseconds<=0||
    fadeMilliseconds>Math.min(preMilliseconds,postMilliseconds))
    throw new RangeError('invalid transient protection parameters');
  if(signal?.aborted)throw new Error('Transient protection cancelled');
  const before=Math.ceil(preMilliseconds*sampleRate/1000),after=Math.ceil(postMilliseconds*sampleRate/1000);
  const ramp=Math.max(1,Math.ceil(fadeMilliseconds*sampleRate/1000));
  const limit=source[0].length/sampleRate,srcLength=source[0].length,outLength=rendered[0].length;
  let last=Number.NEGATIVE_INFINITY,protectedCount=0,skipped=0,lastProtectedAt=Number.NEGATIVE_INFINITY;
  for(const item of onsets){
    if(signal?.aborted)throw new Error('Transient protection cancelled');
    const second=typeof item==='number'?item:item?.seconds;
    if(!Number.isFinite(second)||second<0||second>limit||second<=last)
      throw new RangeError('onsets must be ordered, unique, and inside the source');
    last=second;
    const outSeconds=sourceSecondsToOutputSeconds(timeline,second);
    const dstCentre=Math.round(outSeconds*sampleRate),srcCentre=Math.round(second*sampleRate);
    if(protectedCount && dstCentre-lastProtectedAt<before+after){skipped++;continue;}
    lastProtectedAt=dstCentre;
    for(let dt=-before;dt<=after;dt++){
      const dst=dstCentre+dt,src=srcCentre+dt;
      if(dst<0||dst>=outLength||src<0||src>=srcLength)continue;
      let mix=1;
      if(dt<-before+ramp)mix=clamp((dt+before)/ramp,0,1);
      else if(dt>after-ramp)mix=clamp((after-dt)/ramp,0,1);
      for(let ch=0;ch<source.length;ch++){
        rendered[ch][dst]=rendered[ch][dst]*(1-mix)+source[ch][src]*mix;
      }
    }
    protectedCount++;
  }
  return {protectedCount,skipped,onsetsReviewed:onsets.length};
}
