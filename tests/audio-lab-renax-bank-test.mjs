import assert from 'node:assert/strict';
import {prepareRenaxClickSamples,loadRenaxClickSamples,RENAX_CLICK_SAMPLE_REVISION}
  from '../audio-lab/transport/renax-click-presets.mjs';
import {scheduleWarpClickRange} from '../audio-lab/transport/warp-click.mjs';
const rate=24000,frames=rate;
const makeSample=()=>{
  const a=new Float32Array(frames);
  for(let i=0;i<2400;i++)a[480+i]=.33*Math.sin(2*Math.PI*1100*i/rate)*Math.exp(-i/360);
  return {sampleRate:rate,length:frames,numberOfChannels:1,duration:1,
    getChannelData:()=>a};
};
const originals=Array.from({length:3},makeSample);
const before=originals[0].getChannelData(0).slice();
const clips=prepareRenaxClickSamples(originals,'clic');
assert.equal(clips.length,3);
assert(clips.every(c=>c.bank==='clic'&&c.revision===RENAX_CLICK_SAMPLE_REVISION));
assert(clips.every(c=>c.offset>0&&c.offset<.025&&c.duration<=.065));
assert.equal(clips[0].rate,1);assert.equal(clips[1].rate,1);
assert(Math.abs(clips[2].rate-2**(1/12))<1e-12);
assert(clips.every(c=>c.volume>0&&Number.isFinite(c.volume)));
assert.deepEqual(originals[0].getChannelData(0),before);
assert(Object.isFrozen(clips));assert(Object.isFrozen(clips[0]));
assert.throws(()=>prepareRenaxClickSamples(originals,'unknown'),/Expected/);
let starts=[],rates=[],volumes=[];
const context={currentTime:3,destination:{},
  createBufferSource:()=>({
    playbackRate:{setValueAtTime:(r,t)=>rates.push([r,t])},connect:()=>{},disconnect:()=>{},
    start:(...args)=>starts.push(args),
  }),
  createGain:()=>({gain:{set value(v){volumes.push(v)},get value(){return 1}},connect:()=>{},disconnect:()=>{}}),
};
const plan={events:[{seconds:0,accent:2},{seconds:.5,accent:1},{seconds:1,accent:0}]};
const nodes=scheduleWarpClickRange({context,clickSamples:clips,plan,sessionStartAudioTime:3});
assert.equal(nodes.length,3);
assert.equal(starts.length,3);
assert.deepEqual(starts.map(v=>v[0]),[3,3.5,4]);
assert(starts.every(v=>v.length===3&&v[1]>0&&v[2]>.01));
assert.equal(rates.length,1);assert(Math.abs(rates[0][0]-2**(1/12))<1e-12);
assert(volumes.every(v=>v>0));
const bare={duration:.1};
starts=[];rates=[];volumes=[];
scheduleWarpClickRange({context,clickSamples:[bare,bare,bare],plan,sessionStartAudioTime:3});
assert(starts.every(a=>a.length===1),'legacy bare AudioBuffers preserved');
let seen=[];let decoded=0;
const loaded=await loadRenaxClickSamples({
  decodeAudioData:async()=>{decoded++;return makeSample()},
},{
  bank:'claves',
  fetchImpl:async(url,opts)=>{
    seen.push(String(url));
    assert.equal(opts.cache,'force-cache');
    return {ok:true,headers:{get:()=>String(12000)},arrayBuffer:async()=>new ArrayBuffer(12000)};
  },
});
assert.equal(decoded,3);
assert.equal(loaded.length,3);
assert(seen.every(u=>u.includes('assets/metronome/claves-')&&
  u.includes('v='+RENAX_CLICK_SAMPLE_REVISION)));
const ctrl=new AbortController();ctrl.abort();
await assert.rejects(loadRenaxClickSamples({decodeAudioData:async()=>makeSample()},
  {signal:ctrl.signal,fetchImpl:async()=>({ok:true})}),/cancelled/);
console.log('Audio Lab: validated RENAX CC0 sample references, original trim/gain ratios, first-beat pitch, clock scheduling and abort OK');
