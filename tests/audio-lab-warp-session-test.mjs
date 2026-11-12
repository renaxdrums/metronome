import assert from 'node:assert/strict';
import {createWarpMap} from '../audio-lab/tempo-warp-core.mjs';
import {createWarpTimeline} from '../audio-lab/warp/warp-timeline.mjs';
import {prepareWarpPlayback} from '../audio-lab/transport/warp-session.mjs';

const rate=16000,source=new Float32Array(rate*1.5);
for(let i=0;i<source.length;i++)source[i]=.25*Math.sin(2*Math.PI*440*i/rate);
const snapshot=source.slice();
const original={length:source.length,numberOfChannels:1,sampleRate:rate,duration:1.5,
  getChannelData:()=>source};
const warpTimeline=createWarpTimeline(createWarpMap([
  {tick:0,sourceSeconds:0},{tick:11520,sourceSeconds:1.5},
]),[{tick:0,bpm:40}]);
const meterTimeline={measures:[{index:0,startTick:0,endTick:11520,denominator:4,groupStartTicks:[0,3840,7680]}]};
const clickBuffer=()=>{
  const pcm=new Float32Array(rate*.1);
  for(let i=0;i<pcm.length;i++)pcm[i]=.3*Math.sin(2*Math.PI*i*.03)*Math.exp(-i/330);
  return {sampleRate:rate,length:pcm.length,numberOfChannels:1,duration:pcm.length/rate,
    getChannelData:()=>pcm};
};
let stopCount=0,posted=0,started=[],tick=null,decoded=0;
const clock={setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>tick=null};
const context={state:'running',currentTime:5,destination:{},
  resume:async()=>{},
  createBuffer:(channels,length,sampleRate)=>({
    numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,
    copyToChannel(arr,index){this['ch'+index]=arr.slice();},
  }),
  createBufferSource:()=>({playbackRate:{setValueAtTime:()=>{}},connect:()=>{},disconnect:()=>{},
    start:(time,offset)=>started.push([time,offset]),stop:()=>{stopCount++;}}),
  createGain:()=>({gain:{value:1,setTargetAtTime:()=>{}},connect:()=>{},disconnect:()=>{}}),
  decodeAudioData:async()=>{decoded++;return clickBuffer()},
};
const workerFactory=()=>({
  onmessage:null,postMessage(message,transfer){
    posted++;assert.equal(message.config.channels.length,1);
    assert.notEqual(message.config.channels[0].buffer,source.buffer);
    const frames=Math.round(warpTimeline.outputDurationSeconds*rate);
    const rendered={channels:[new Float32Array(frames)],sampleRate:rate,
      durationSeconds:frames/rate,metrics:{grains:123,peak:.4},diagnostics:['test DSP']};
    this.onmessage({data:{id:1,type:'done',rendered}});
  },
  terminate:()=>{},
});
const progress=[];
const prepared=await prepareWarpPlayback({
  context,sourceBuffer:original,warpTimeline,meterTimeline,workerFactory,
  onProgress:e=>progress.push(e),
  fetchImpl:async()=>({ok:true,headers:{get:()=>String(11000)},
    arrayBuffer:async()=>new ArrayBuffer(11000)}),
});
assert.equal(posted,1);assert.equal(decoded,3);
assert.equal(prepared.clickEventCount,3);
assert.equal(prepared.buffer.duration,4.5);
assert.deepEqual(source,snapshot);
assert(progress.some(e=>e.phase==='clicks'&&e.fraction===1));
await prepared.session.play();
assert.equal(prepared.session.playing,true);
assert.equal(started[0][0],started[1][0],'PCM and RENAX click share the exact clock origin');
prepared.session.stop();
prepared.session.dispose();
assert(stopCount>=2);
const noClick=await prepareWarpPlayback({
  context,sourceBuffer:original,warpTimeline,clickEnabled:false,workerFactory,
});
assert.equal(noClick.clickEventCount,0);
noClick.session.dispose();
assert.equal(decoded,3,'audio-only mode must not fetch click samples');
const cancel=new AbortController();cancel.abort();
await assert.rejects(prepareWarpPlayback({
  context,sourceBuffer:original,warpTimeline,clickEnabled:false,workerFactory,signal:cancel.signal,
}),e=>e.name==='AbortError');
console.log('Audio Lab: Warp PCM -> AudioBuffer -> RENAX source click -> shared clock playback, abort and audio-only OK');
