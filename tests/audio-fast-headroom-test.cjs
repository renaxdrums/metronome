'use strict';
const assert=require('node:assert/strict');
const {start}=require('./audio-harness.cjs');
(async()=>{
 const h=await start();
 try{
  const p=await h.browser.newPage();await p.goto(h.url);
  await p.evaluate(async()=>{await initAudio();await prepareAllVoiceAudio();for(const name of Object.keys(SOUND_BANKS))await ensureInstrumentBankReady(name);});
  const result=await p.evaluate(async()=>{
   getAudioMixDestination=ctx=>ctx.destination;
   const report=[];
   for(const bank of Object.keys(SOUND_BANKS)){
    for(const counts of [[3,2],[3,2,4,5]]){
     audioCtx=new OfflineAudioContext(1,48000*3,48000);currentBank=bank;masterVolume=counts.length===2?1:2/counts.length;
     const cycle=3*60/999;
     for(let bar=0;bar<8;bar++)for(const count of counts)for(let beat=0;beat<count;beat++){
      playClick(3,.2+bar*cycle+beat*cycle/count,beat===0,{mode:'polyrhythm',isMainBeat:true,beatNumber:beat+1,subIndex:0,beatDurationSec:cycle/count});
     }
     const pcm=(await audioCtx.startRendering()).getChannelData(0);let peak=0;
     for(const sample of pcm)peak=Math.max(peak,Math.abs(sample));
     report.push({bank,voices:counts.length,peak});
    }
   }
   return report;
  });
  const ceiling=Math.pow(10,-.5/20),bad=result.filter(row=>row.peak>ceiling);
  assert.deepEqual(bad,[],JSON.stringify(bad));
  console.log('PASS 999 BPM peak headroom for all built-in banks, two and four voices',result.length);
 }finally{await h.browser.close();h.server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
