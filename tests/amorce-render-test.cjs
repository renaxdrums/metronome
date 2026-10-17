const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start}=require('./audio-harness.cjs');
(async()=>{
 const h=await start();
 try{
  const page=await h.browser.newPage();
  await require('./amorce-runtime-route.cjs').install(page);
  await page.route('**/*.mjs',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'..',new URL(route.request().url()).pathname),'utf8')}));
  await page.goto(h.url);await page.evaluate(()=>prepareAllVoiceAudio());await page.waitForFunction(()=>allVoiceAudioReady);
  const result=await page.evaluate(async()=>{
   const {synthesize}=await import('/prototypes/amorce/engine.mjs');
   const {lastSyllableCandidate}=await import('/prototypes/amorce/syllables.mjs');
   const {renderExperiment}=await import('/prototypes/amorce/render.mjs');
   const labels=[['Couplet','fr'],['Introduction','fr'],['Refrain personnalisé de David','fr'],['Transition très longue avant le solo de batterie','fr'],['Chorus','en'],['Introduction','en'],['My custom drum breakdown','en']];
   const results=[],listeningSamples=[];let worstPeak=0,worstTransportErrorMs=0;
   for(const [text,language] of labels){
    const speech=await synthesize(text,language),candidate=lastSyllableCandidate(speech.events,language);
    const configurations=[60,240].flatMap(bpm=>[3,4,7].map(beatsPerMeasure=>({bpm,beatsPerMeasure,bank:'claves',subdivisions:2})));
    if(text==='Introduction'&&language==='fr')for(const bank of ['clic','cloche','clic808','beep','voiceMale','voiceFemale'])for(const bpm of [60,240])configurations.push({bpm,beatsPerMeasure:4,bank,subdivisions:4});
    for(const {bpm,beatsPerMeasure,bank,subdivisions} of configurations){
     const rate=48000,beat=60/bpm,measure=beatsPerMeasure*beat;
     const length=Math.ceil((candidate.anchorSeconds+measure*4+speech.pcm.length/speech.sampleRate+1)*rate);
     // Two channels: channel zero is the true mixed experiment; channel one
     // is an independent scheduling witness of the unchanged speech waveform.
     audioCtx=new OfflineAudioContext(2,length,rate);masterVolume=1;
     const speechStarts=[];const original=audioCtx.createBufferSource.bind(audioCtx);
     audioCtx.createBufferSource=()=>{const source=original();const start=source.start.bind(source);source.start=(t,...args)=>{if(source.buffer?.sampleRate===speech.sampleRate&&source.buffer?.length===speech.pcm.length)speechStarts.push(t);return start(t,...args)};return source;};
     const merger=audioCtx.createChannelMerger(2);merger.connect(audioCtx.destination);
     // Capture the existing mixer to channel zero, including original accents,
     // subdivisions, safety guard, source audio and voice attack constants.
     const mix=getAudioMixDestination(audioCtx);
     const safety=audioMixers.get(audioCtx).limiter;
     safety.disconnect();safety.connect(merger,0,0);
     const p=renderExperiment(audioCtx,speech,candidate,{bpm,beatsPerMeasure,subdivisions,bank}, {
      destination:()=>mix,
      click:(bank,number,time,state,first,subIndex,beatDurationSec)=>{currentBank=bank;playClick(state,time,first,{beatNumber:number,subIndex,beatDurationSec});},
     });
     const witness=original();witness.buffer=audioCtx.createBuffer(1,speech.pcm.length,speech.sampleRate);witness.buffer.copyToChannel(speech.pcm,0);witness.connect(merger,0,1);witness.start(p.target-candidate.anchorSeconds);
     const rendered=await audioCtx.startRendering(),mixed=rendered.getChannelData(0),isolated=rendered.getChannelData(1);
     let peak=0,clipped=0;for(const sample of mixed){peak=Math.max(peak,Math.abs(sample));if(Math.abs(sample)>=1)clipped++;}
     worstPeak=Math.max(worstPeak,peak);
     if(['Introduction','Chorus'].includes(text)&&bpm===240&&beatsPerMeasure===4&&bank==='claves'){
       const samples=mixed.slice(0,Math.ceil((p.end+1)*rate));
       const bytes=new Uint8Array(44+samples.length*2),view=new DataView(bytes.buffer);
       const str=(offset,s)=>{for(let i=0;i<s.length;i++)bytes[offset+i]=s.charCodeAt(i);};
       str(0,'RIFF');view.setUint32(4,bytes.length-8,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,samples.length*2,true);
       for(let i=0;i<samples.length;i++)view.setInt16(44+i*2,Math.round(samples[i]*32767),true);
       let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
       listeningSamples.push({name:`candidate-${language}-${text.toLowerCase()}.wav`,base64:btoa(binary)});
     }
     // Locate actual rendered speech, not just a planned timestamp: the first
     // non-zero witness sample is measured against a separate origin render.
     const origin=new OfflineAudioContext(1,Math.ceil(speech.pcm.length/speech.sampleRate*rate)+100,rate);
     const ref=origin.createBufferSource();ref.buffer=witness.buffer;ref.connect(origin.destination);ref.start(0);
     const raw=(await origin.startRendering()).getChannelData(0);
     const find=a=>a.findIndex(v=>Math.abs(v)>1e-5);
     const measuredStart=(find(isolated)-find(raw))/rate;
     const errorMs=Math.abs(measuredStart+candidate.anchorSeconds-p.target)*1000;
     worstTransportErrorMs=Math.max(worstTransportErrorMs,errorMs);
     const announcement=p.events.filter(e=>e.time>=p.target&&e.time<p.blockStart&&e.subIndex===0);
     const resumed=p.events.filter(e=>e.time>=p.blockStart&&e.subIndex===0);
     results.push({text,language,bpm,beatsPerMeasure,bank,subdivisions,peak,clipped,candidate,transportErrorMs:errorMs,
       countInMeasures:p.countInMeasures,oneReplaced:announcement.length===beatsPerMeasure-1,
       maleCounts:announcement.every(e=>e.bank==='voiceMale'),bankResumed:resumed.every(e=>e.bank===bank),
       speechStartObserved:speechStarts.includes(p.announcementStart),syllableOnsetVerified:false});
    }
   }
   return {date:'2026-10-09',cases:results.length,worstPeak,worstTransportErrorMs,results,listeningSamples,
    limitation:'Timing error is measured for transport of a candidate phoneme landmark. It is NOT the real last-syllable alignment error. Acoustic onset not independently annotated.'};
  });
  assert.equal(result.cases,54);
  assert(result.worstTransportErrorMs<.1);
  assert(result.results.every(r=>r.clipped===0&&r.oneReplaced&&r.maleCounts&&r.bankResumed&&r.countInMeasures>=2&&r.speechStartObserved));
  for(const sample of result.listeningSamples)fs.writeFileSync(path.join(__dirname,'../prototypes/amorce',sample.name),Buffer.from(sample.base64,'base64'));
  delete result.listeningSamples;
  fs.writeFileSync(path.join(__dirname,'../prototypes/amorce/render-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({cases:result.cases,worstPeak:result.worstPeak,worstTransportErrorMs:result.worstTransportErrorMs,limitation:result.limitation},null,2));
 }finally{await h.browser.close();h.server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
