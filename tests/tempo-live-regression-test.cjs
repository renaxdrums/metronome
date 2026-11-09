'use strict';
const assert=require('node:assert/strict');
const {start}=require('./audio-harness.cjs');
(async()=>{
 const h=await start(),errors=[];
 try{
  const p=await h.browser.newPage({viewport:{width:1440,height:900}});
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(h.url);await p.waitForFunction(()=>window.RENAX_WORKSPACE);
  await p.evaluate(()=>{
   window.testClickTimes=[];window.testClickLate=[];const play=playClick;
   playClick=function(type,time,...rest){window.testClickTimes.push(time);window.testClickLate.push(audioCtx.currentTime-time);return play.call(this,type,time,...rest);};
  });
  await p.locator('#playBtn').click();
  await p.waitForFunction(()=>isPlaying);
  await p.evaluate(async()=>{
   bpmSlider.max='999';
   for(let bpm=120;bpm<=999;bpm+=7){bpmSlider.value=String(bpm);bpmSlider.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,8));}
   bpmSlider.value='999';bpmSlider.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await p.waitForTimeout(2500);
  const result=await p.evaluate(()=>({tempo,playing:isPlaying,times:window.testClickTimes.slice(-25),lateness:Math.max(...window.testClickLate)}));
  assert.equal(result.tempo,999);assert(result.playing);assert(result.times.length>=20);
  for(let i=1;i<result.times.length;i++)assert(Math.abs(result.times[i]-result.times[i-1]-60/999)<.002,JSON.stringify(result));
  assert(result.lateness<.02,'audio scheduling ran late: '+JSON.stringify(result));
  assert.deepEqual(errors,[]);console.log('PASS live tempo ramp to 999 BPM and scheduled beat spacing');
 }finally{await h.browser.close();h.server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
