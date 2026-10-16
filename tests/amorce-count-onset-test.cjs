const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start}=require('./audio-harness.cjs');
(async()=>{const h=await start();try{
 const p=await h.browser.newPage();await p.goto(h.url);await p.waitForFunction(()=>allVoiceAudioReady);
 const results=await p.evaluate(async()=>{
  const results=[];let oscillatorCalls=0;const tone=oscTone;oscTone=(...args)=>{oscillatorCalls++;return tone(...args);};
  for(const bpm of [40,60,120,240,320])for(const number of [2,3,4]){
   const buffer=VOICE_METRONOME_BUFFERS.male[String(number)],samples=buffer.getChannelData(0),onset=samples.findIndex(v=>Math.abs(v)>1e-5)/buffer.sampleRate;
   const beat=60/bpm,target=.3+(number-1)*beat,length=Math.ceil((target+buffer.duration+1)*48000);
   audioCtx=new OfflineAudioContext(1,length,48000);masterVolume=1;currentBank='voiceMale';
   playClick(2,target,false,{beatNumber:number,subIndex:0,beatDurationSec:beat});
   const rendered=(await audioCtx.startRendering()).getChannelData(0);
   const voiceGain=voiceLoudnessGain(buffer,VOICE_ATTACK_SECONDS.male[number]);
   const actual=rendered.findIndex(v=>Math.abs(v)>1e-5*.25*.82*voiceGain)/48000;
   const origin=new OfflineAudioContext(1,Math.ceil((buffer.duration+1)*48000),48000),src=origin.createBufferSource();src.buffer=buffer;src.connect(origin.destination);src.start(0);
   const ref=(await origin.startRendering()).getChannelData(0),referenceOnset=ref.findIndex(v=>Math.abs(v)>1e-5)/48000;
   const errorMs=(actual-(target-VOICE_ATTACK_SECONDS.male[number]+referenceOnset))*1000;
   results.push({bpm,number,target,firstSampleOnset:onset,attackAnchor:VOICE_ATTACK_SECONDS.male[number],errorMs,oscillatorCalls,scope:'Rendered first sample above 1e-5 threshold; unchanged human sample and pitch. No main-beat click oscillator.'});
  }
  return results;
 });
 assert.equal(results.length,15);assert(results.every(r=>Math.abs(r.errorMs)<.06&&r.oscillatorCalls===0));
 const report={cases:results.length,worstErrorMs:Math.max(...results.map(r=>Math.abs(r.errorMs))),results};
 fs.writeFileSync(path.join(__dirname,'../prototypes/amorce/count-onset-results.json'),JSON.stringify(report,null,2)+'\n');console.log({cases:report.cases,worstErrorMs:report.worstErrorMs,noClickOverlay:true});
}finally{await h.browser.close();h.server?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
