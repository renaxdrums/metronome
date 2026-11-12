import assert from 'node:assert/strict';
import {WarpPlaybackSession} from '../audio-lab/transport/warp-player.mjs';
const period=.6,duration=1800,events=[];
for(let i=0;i<duration/period;i++)events.push({seconds:i*period,accent:i%4===0?2:1});
assert.equal(events.length,3000);
let currentTime=10,callback=null;const started=[];
const context={
 state:'running',destination:{},
 get currentTime(){return currentTime;},
 resume:async()=>{},
 createBufferSource:()=>({
   buffer:null,connect:()=>{},disconnect:()=>{},stop:()=>{},
   start:(when,offset=0)=>started.push({when,offset}),
 }),
 createGain:()=>({gain:{value:1,setTargetAtTime:()=>{}},connect:()=>{},disconnect:()=>{}}),
};
const player=new WarpPlaybackSession({
 context,buffer:{duration},clickPlan:{events},
 clickSamples:[{duration:.035},{duration:.035},{duration:.035}],
 clock:{setInterval:cb=>{callback=cb;return 1;},clearInterval:()=>{callback=null;}},
 leadSeconds:.06,lookaheadSeconds:.24,intervalMilliseconds:35,
});
const anchor=await player.play();
assert.equal(started[0].when,anchor,'audio source anchor');
const last=anchor+duration;
for(let t=10;t<last+.1;t+=.035){
  currentTime=t;
  callback?.();
}
const clicks=started.slice(1),indices=new Set(clicks.map(v=>Math.round((v.when-anchor)/period)));
assert.equal(clicks.length,events.length,'no missed or duplicated click over 30 minutes');
assert.equal(indices.size,events.length,'every beat triggered once');
let maxDrift=0;
for(let i=0;i<events.length;i++){
 const error=Math.abs(clicks[i].when-(anchor+events[i].seconds));
 maxDrift=Math.max(maxDrift,error);
 assert(error<1e-9,'simulated AudioContext clock drift at event '+i);
}
player.stop();player.dispose();
console.log('Audio Lab: simulated 30-minute AudioContext clock, 3000 beat starts, no duplication/miss; max mathematical drift '+maxDrift);
