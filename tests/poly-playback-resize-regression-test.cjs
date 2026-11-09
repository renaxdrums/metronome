'use strict';
const assert=require('node:assert/strict');
const {start}=require('./audio-harness.cjs');
(async()=>{
 const h=await start();const errors=[];
 try{
  const p=await h.browser.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(h.url);await p.waitForFunction(()=>window.RENAX_WORKSPACE);
  await p.evaluate(()=>{
   RENAX_WORKSPACE.go('polyrhythm');
   const a=createPolyMeasure(3,2,300),b=createPolyMeasure(4,3,300);
   polyrhythmMeasures=[a,b];measures=polyrhythmMeasures;activeMeasureIndex=0;renderSequencerList();renderActiveMeasure();
   window.polyEvents=[];window.polyVisualTimes=[];window.polyStarts=[];
   const visual=schedulePolyVisualUpdate,render=renderActiveMeasure;
   schedulePolyVisualUpdate=function(index,event,time){
    if(event.u===0)window.polyStarts.push({index,time});
    return visual.apply(this,arguments);
   };
   renderActiveMeasure=function(){
    const result=render.apply(this,arguments);
    if(isPlaying&&!document.hidden){
     const now=audioCtx.currentTime;
     const start=window.polyStarts.find(item=>item.index===activeMeasureIndex&&!item.seen&&Math.abs(item.time-now)<.15);
     if(start){start.seen=true;requestAnimationFrame(()=>window.polyVisualTimes.push({index:start.index,start:start.time,delay:audioCtx.currentTime-start.time-(window.RENAX_PLAYBACK?.delayMs(audioCtx)||0)/1000}));}
    }
    return result;
   };
   for(const [id,bank] of Object.entries(SOUND_BANKS)){
    if(typeof bank.play!=='function')continue;const original=bank.play;
    bank.play=function(dest,time,state,first,context){
     if(context?.mode==='polyrhythm')window.polyEvents.push({id,measure:playingMeasureIndex,time,late:audioCtx.currentTime-time,beat:context.beatNumber});
     return original.apply(this,arguments);
    };
   }
  });
  await p.locator('#playBtn').click();await p.waitForFunction(()=>isPlaying);
  await p.waitForTimeout(2000);await p.setViewportSize({width:390,height:844});await p.waitForTimeout(1000);
  // Simulate a long main-thread stall after the page becomes hidden: the
  // previously scheduled audio must cover it without catch-up bursts.
  await p.evaluate(()=>{
   window.polyHiddenAt=audioCtx.currentTime;
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
   document.dispatchEvent(new Event('visibilitychange'));
   const end=performance.now()+1200;while(performance.now()<end){ /* Simulate a blocked UI thread. */ }
   delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(1800);
  await p.setViewportSize({width:1440,height:900});await p.waitForTimeout(2500);
  const data=await p.evaluate(()=>({events:window.polyEvents,visual:window.polyVisualTimes,hiddenAt:window.polyHiddenAt,playing:isPlaying,length:measures.length,ids:measures.map(m=>[m.numerator,m.denominator])}));
  assert(data.playing);assert.equal(data.length,2);assert.deepEqual(data.ids,[[3,2],[4,3]]);
  for(const measure of [0,1])assert(data.events.filter(e=>e.measure===measure).length>=5,JSON.stringify(data));
  assert(Math.max(...data.events.map(e=>e.late))<.05,JSON.stringify(data.events.filter(e=>e.late>=.05)));
  const visible=data.visual.filter(v=>v.start<data.hiddenAt);
  assert(visible.length>=2,JSON.stringify(data.visual));
  assert(visible.every(v=>v.delay>=-.1&&v.delay<.08),JSON.stringify(visible));
  await p.evaluate(async()=>{
   stopMetronome();for(const m of measures)m.tempo=999;
   window.polyEvents=[];await startMetronome();
  });
  await p.waitForTimeout(2300);
  const fast=await p.evaluate(()=>({times:window.RENAX_PLAYBACK.beats.slice(-25).map(b=>b.time),late:window.polyEvents.filter(e=>e.late>=.05)}));
  assert(fast.times.length>=20,JSON.stringify(fast));
  for(let i=1;i<fast.times.length;i++)assert(Math.abs(fast.times[i]-fast.times[i-1]-60/999)<.002,JSON.stringify(fast.times));
  assert.deepEqual(fast.late,[]);
  assert.deepEqual(errors,[]);console.log('PASS two poly measures retain sound and timing across resize');
 }finally{await h.browser.close();h.server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
