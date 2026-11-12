/**
 * RENAX Audio Lab: read the original CC0 one-shots from the validated bank,
 * without mutating SOUND_BANKS, audioCtx, bank mastering or the old scheduler.
 *
 * Derived trim/gain parameters mirror metronome-audio.js (20261011-cc0-pro1).
 * The caller must route audio through its chosen existing safety bus.
 */
const BANKS = Object.freeze({
  clic:[0.065,0.065,0.065],
  cloche:[Infinity,Infinity,Infinity],
  claves:[0.09,0.09,0.09],
  clic808:[0.085,0.085,0.20],
  beep:[0.09,0.09,0.09],
});
export const RENAX_CLICK_SAMPLE_REVISION = '20261011-cc0-pro1';
const FIRST_RATE = 2**(1/12);
const BANK_GAIN = 0.42;

function prepareSample(buffer, maximumDuration) {
  if (!buffer || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate<=0 ||
      !Number.isSafeInteger(buffer.length)||buffer.length<=0||
      !Number.isSafeInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||
      typeof buffer.getChannelData!=='function')
    throw new TypeError('Invalid RENAX sample AudioBuffer');
  const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  const rate=buffer.sampleRate,frames=buffer.length;
  let maxPeak=0;
  for(let i=0;i<frames;i++){
    let x=0;for(const ch of channels)x+=ch[i];
    maxPeak=Math.max(maxPeak,Math.abs(x/channels.length));
  }
  if(maxPeak<.00001)throw new Error('Empty RENAX click sample');
  const threshold=maxPeak*.018;
  const windowLength=Math.max(8,Math.round(rate*.0005));
  let onset=0,energy=0;
  for(let i=0;i<frames;i++){
    let x=0;for(const ch of channels)x+=ch[i];
    x/=channels.length;
    energy+=x*x;
    if(i>=windowLength){
      let y=0;for(const ch of channels)y+=ch[i-windowLength];
      y/=channels.length;
      energy-=y*y;
    }
    if(i>=windowLength && Math.sqrt(Math.max(0,energy)/windowLength)>=threshold){
      onset=Math.max(0,i-windowLength-Math.round(rate*.0005));break;
    }
  }
  const offset=onset/rate;
  const duration=Math.min(maximumDuration,buffer.duration-offset);
  if(duration<.015)throw new Error('RENAX recorded one-shot too short');
  const last=Math.min(frames,onset+Math.floor(duration*rate));
  const loudnessFrames=Math.min(last-onset,Math.floor(rate*.045));
  let sum=0,peak=0;
  for(let i=onset;i<last;i++){
    let x=0;for(const ch of channels)x+=ch[i];
    x/=channels.length;
    for(const ch of channels)peak=Math.max(peak,Math.abs(ch[i]));
    if(i<onset+loudnessFrames)sum+=x*x;
  }
  const rms=Math.sqrt(sum/Math.max(1,loudnessFrames));
  if(rms<.00001||peak<.00001)throw new Error('RENAX sample has no usable attack');
  const gain=Math.min(.115/rms,.78/peak);
  return Object.freeze({buffer,offset,duration,gain,rms:rms*gain,peak:peak*gain});
}

export function prepareRenaxClickSamples(decoded, bank='clic') {
  const limits=BANKS[bank];
  if(!limits||!Array.isArray(decoded)||decoded.length!==3)
    throw new RangeError('Expected 3 decoded samples from a supported RENAX bank');
  const samples=decoded.map((buffer,i)=>prepareSample(buffer,limits[i]));
  const presets=samples.map((sample,i)=>{
    const state=i+1,isFirst=state===3;
    const stateGain=state===1?.78:state===2?.91:1;
    const accentGain=isFirst?1.12:state===2?1.08:1;
    return Object.freeze({
      buffer:sample.buffer,offset:sample.offset,duration:sample.duration,
      volume:BANK_GAIN*sample.gain*stateGain*accentGain,
      rate:isFirst?FIRST_RATE:1,
      bank,state,revision:RENAX_CLICK_SAMPLE_REVISION,
    });
  });
  return Object.freeze(presets);
}

/** Explicit local URL loading; no third-party service, no account data. */
export async function loadRenaxClickSamples(context,{
  bank='clic',signal,fetchImpl=globalThis.fetch,maxEncodedBytes=4*1024*1024,
  onProgress=()=>{},
}={}){
  if(!BANKS[bank])throw new RangeError('Unknown RENAX CC0 click bank');
  if(!context||typeof context.decodeAudioData!=='function'||
     typeof fetchImpl!=='function'||typeof onProgress!=='function'||
     !Number.isSafeInteger(maxEncodedBytes)||maxEncodedBytes<1024)
    throw new TypeError('Invalid RENAX bank loader configuration');
  const samples=[];
  for(let state=1;state<=3;state++){
    if(signal?.aborted)throw new DOMException('Click sample load cancelled','AbortError');
    const url=new URL('../../assets/metronome/'+bank+'-'+state+'.wav?v='+
      RENAX_CLICK_SAMPLE_REVISION,import.meta.url);
    const response=await fetchImpl(url.href,{cache:'force-cache',signal});
    if(!response?.ok)throw new Error('RENAX CC0 sample unavailable: '+bank+'-'+state);
    const headerLength=Number(response.headers?.get?.('content-length'));
    if(Number.isFinite(headerLength)&&headerLength>maxEncodedBytes)
      throw new RangeError('RENAX sample exceeds input memory budget');
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength<44||bytes.byteLength>maxEncodedBytes)
      throw new RangeError('Invalid RENAX click file size');
    if(signal?.aborted)throw new DOMException('Click sample load cancelled','AbortError');
    samples.push(await context.decodeAudioData(bytes));
    onProgress(state/3);
  }
  return prepareRenaxClickSamples(samples,bank);
}
