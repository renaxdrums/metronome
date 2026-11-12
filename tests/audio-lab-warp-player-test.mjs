import assert from 'node:assert/strict';
import { WarpPlaybackSession } from '../audio-lab/transport/warp-player.mjs';

function fixture() {
  let current = 5, pending = false, interval = null;
  const starts = [],stops = [],graph = [],ticks = [],unplugged = [];
  const clock = {
    setInterval: callback => {interval=callback;return 17;},
    clearInterval: handle => {assert.equal(handle,17);interval=null;},
    tick: () => interval?.(),
  };
  const context = {
    state:'running', destination:{},
    get currentTime() {return current;},
    set currentTime(value) {current=value;},
    resume: async () => {
      if (pending) await new Promise(resolve => { context.resumePending = resolve; });
      context.state='running';
    },
    createBufferSource: () => {
      const id=starts.length+stops.length;
      const node={
        buffer:null,loop:false,loopStart:0,loopEnd:0,
        connect:(dest)=>graph.push(['source',dest]),
        disconnect:()=>unplugged.push(id),
        start:(when,offset=0)=>starts.push({when,offset,node}),
        stop:()=>stops.push(node),
        onended:null,
      };
      return node;
    },
    createGain:()=>({
      gain:{value:0,setTargetAtTime:(value,time)=>ticks.push([value,time])},
      connect:(dest)=>graph.push(['gain',dest]),
      disconnect:()=>{},
    }),
    delayResume:()=>{pending=true;},
    clearResume:()=>{pending=false;context.resumePending?.();},
  };
  const events=[
    {seconds:0,accent:2},{seconds:.5,accent:1},
    {seconds:1,accent:0},{seconds:1.5,accent:2},
    {seconds:2,accent:1},{seconds:2.5,accent:0},
  ];
  const clickSamples=[{duration:.05},{duration:.06},{duration:.07}];
  const player=new WarpPlaybackSession({
    context, buffer:{duration:3}, clickPlan:{events}, clickSamples,
    clock, lookaheadSeconds:.2, leadSeconds:.06, intervalMilliseconds:35,
  });
  return {context,clock,starts,stops,ticks,graph,unplugged,player};
}
const epsilon=(a,b)=>assert(Math.abs(a-b)<1e-8, 'expected '+b+', got '+a);

// One AudioContext clock for audio & click onset: no UI-frame timing.
{
  const x=fixture();
  await x.player.play();
  const audio=x.starts[0];
  assert.equal(audio.when,5.06);
  assert.equal(audio.offset,0);
  assert.equal(x.starts[1].when,5.06,'first click anchored to the audio start');
  assert.equal(x.starts[1].node.buffer.duration,.07,'accent 2 uses the strong click');
  x.context.currentTime=5.41;
  x.clock.tick();
  assert.equal(x.starts[2].when,5.56,'second click is scheduled exactly 500 ms later');
  x.clock.tick();
  assert.equal(x.starts.length,3,'no duplicate scheduling from repeated timer ticks');
  x.context.currentTime=5.88;
  x.clock.tick();
  assert.equal(x.starts[3].when,6.06);
  epsilon(x.player.positionSeconds(),.82);
  x.player.pause();
  assert.equal(x.player.playing,false);
  assert.equal(x.clock.tick(),undefined,'timer cleared');
  epsilon(x.player.positionSeconds(),.82);
  assert(x.stops.length>=2,'audio and scheduled clicks stopped on pause');
  await x.player.play();
  epsilon(x.starts.at(-1).offset,.82);
  x.player.seek(1.2);
  epsilon(x.player.positionSeconds(),1.2);
  x.player.setLevels({audio:.5,click:.25});
  assert.deepEqual(x.ticks.slice(-2).map(t=>t[0]),[.5,.25]);
  x.player.stop();
  assert.equal(x.player.positionSeconds(),0);
  x.player.dispose();
  await assert.rejects(x.player.play(),/disposed/);
}

// A/B native loop plus repeated click plans, no double scheduling at wrap.
{
  const x=fixture();
  x.player.setLoop(.5,1.5);
  x.player.seek(1.25);
  await x.player.play();
  epsilon(x.player.positionSeconds(),1.25);
  assert(x.starts.every(o=>o.when>=5));
  x.context.currentTime=5.15;
  x.clock.tick(); // The .5 click is scheduled before its 5.31 AudioContext deadline.
  x.context.currentTime=5.35; // 0.29 sec after starting: wrapped to .54
  epsilon(x.player.positionSeconds(),.54);
  const upcoming=x.starts.filter(e=>e.node.buffer?.duration);
  assert(upcoming.some(e=>Math.abs(e.when-5.31)<1e-7),'loop click at .5 scheduled after wrap');
  assert(!upcoming.some(e=>e.when<5.06),'no stale click in the past');
  x.player.clearLoop();
  assert.equal(x.player.loop,null);
  x.player.dispose();
}

// Suspend/resume can resolve after Stop or disposal without starting audio.
{
  const x=fixture();
  x.context.delayResume();
  const pending=x.player.play();
  x.player.stop();
  x.context.clearResume();
  assert.equal(await pending,null);
  assert.equal(x.starts.length,0);
  x.player.dispose();
}

// No click buffers means audio-only is still supported.
{
  const x=fixture();
  const silent=new WarpPlaybackSession({context:x.context,buffer:{duration:1.5},
    clock:x.clock,leadSeconds:.06,lookaheadSeconds:.2});
  await silent.play();
  assert.equal(silent.playing,true);
  silent.dispose();
}
console.log('Audio Lab Warp playback: shared AudioContext, seek, loops, scheduled click, pause, stale start and disposal OK');
