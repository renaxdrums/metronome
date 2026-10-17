const assert=require('assert');
const {start,save}=require('./audio-harness.cjs');
(async()=>{
 const r=await start(),p=await r.browser.newPage();p.on("console",m=>{if(m.text().startsWith("AUDIT "))console.log(m.text());});
 try {
  await p.goto(r.url);await p.evaluate(()=>prepareAllVoiceAudio());await p.waitForFunction(()=>allVoiceAudioReady);
  const report=await p.evaluate(async()=>{
   // Audit the incoming signal, before the safety ceiling. No protection can hide an excess.
   const originalMix=getAudioMixDestination;
   getAudioMixDestination=ctx=>ctx.destination;
   const rows=[];let scenarios=0;
   const render=async(bank,schedule)=>{
    audioCtx=new OfflineAudioContext(1,Math.ceil(schedule.end)*48000,48000);currentBank=bank;masterVolume=1;
    for(const event of schedule.events)playClick(event.state,event.time,event.first,event.context);
    const x=(await audioCtx.startRendering()).getChannelData(0);let peak=0,clips=0;
    for(const v of x){peak=Math.max(peak,Math.abs(v));if(Math.abs(v)>=1)clips++;}
    return {peak,clips};
   };
   for(const bank of Object.keys(SOUND_BANKS)){
    let worst={peak:0};let clips=0,count=0;
    for(const bpm of [20,60,300])for(const denominator of [2,4,8,16,32])for(const n of [...new Set([1,...allowedSubdivisions(denominator)])])for(const state of [1,2,3]){
     const dt=60/bpm*4/denominator,beats=bpm===300?20:2,group=SOUND_BANKS[bank].isVoice&&denominator>=16?denominator/4:1,events=[];
     for(let beat=0;beat<beats;beat++)for(let sub=0;sub<n;sub++)events.push({state,time:.4+(beat+sub/n)*dt,first:sub===0,context:{beatNumber:beat%group===0?Math.floor(beat/group)+1:0,subIndex:sub,beatDurationSec:dt*group}});
     const measured=await render(bank,{end:.4+beats*dt+2,events});clips+=measured.clips;count++;
     if(measured.peak>worst.peak)worst={...measured,bpm,denominator,n,state,mode:'metronome'};
    }
    // Fastest inner stream, coincident streams and long overlapping oscillator tails.
    for(const [outer,inner] of [[2,20],[3,20],[20,20],[20,2],[2,2]])for(const outerState of [1,2,3])for(const innerState of [1,2,3]){
     const cycle=outer*.2,events=[];
     for(let bar=0;bar<4;bar++){for(let beat=0;beat<outer;beat++)events.push({state:outerState,time:.4+bar*cycle+beat*.2,first:beat===0});for(let beat=0;beat<inner;beat++)events.push({state:innerState,time:.4+bar*cycle+beat*cycle/inner,first:beat===0});}
     const measured=await render(bank,{end:.4+4*cycle+2,events});clips+=measured.clips;count++;
     if(measured.peak>worst.peak)worst={...measured,outer,inner,outerState,innerState,bpm:300,mode:'polyrhythm'};
    }
    rows.push({bank,scenarios:count,clips,worst,peakDbFS:20*Math.log10(worst.peak)});scenarios+=count;console.log('AUDIT '+bank+' '+rows.at(-1).peakDbFS.toFixed(2)+' dBFS');
   }
   audioCtx=new OfflineAudioContext(1,48000*3,48000);masterVolume=1;
   for(let i=0;i<80;i++)playCountIn(.4+i*.025,true);
   let countInPeak=0;for(const v of (await audioCtx.startRendering()).getChannelData(0))countInPeak=Math.max(countInPeak,Math.abs(v));
   // Isolated subdivision accents: the approved +4.5 dB level is retained exactly.
   const ticks=[];for(const state of [1,2,3]){const measured=await render('voiceMale',{end:1,events:[{state,time:.4,first:false,context:{subIndex:1}}]});ticks.push({state,...measured});}
   getAudioMixDestination=originalMix;
   // An impulse below the audited ceiling verifies transparency, unchanged timing and no gain reduction.
   audioCtx=new OfflineAudioContext(1,4800,48000);const src=audioCtx.createBufferSource();src.buffer=audioCtx.createBuffer(1,4800,48000);src.buffer.getChannelData(0)[480]=.9;src.connect(getAudioMixDestination(audioCtx));src.start();const limited=(await audioCtx.startRendering()).getChannelData(0);let max=0,index=0;for(let i=0;i<limited.length;i++)if(Math.abs(limited[i])>max){max=Math.abs(limited[i]);index=i;}
   return {rows,scenarios,ticks,countInPeak,safety:{inputPeak:.9,outputPeak:max,delaySamples:index-480,reduction:20*Math.log10(max/.9)},ceiling:Math.pow(10,-.5/20)};
  });
  save('audio-headroom-results.json',report);console.log(JSON.stringify(report,null,2));
  for(const row of report.rows){assert.equal(row.clips,0,row.bank+' clipped');assert(row.worst.peak<=report.ceiling,row.bank+' exceeds -0.5 dBFS: '+row.peakDbFS);}
  assert(report.countInPeak<=report.ceiling,"Count-in exceeds ceiling");
  assert(report.ticks[0].peak<report.ticks[1].peak&&report.ticks[1].peak<report.ticks[2].peak,'Subdivision accents lost');
  assert(Math.abs(report.safety.reduction)<1e-5);assert(Math.abs(report.safety.outputPeak-report.safety.inputPeak)<1e-5,'Limiter changes signal below threshold');assert.equal(report.safety.delaySamples,0,'Safety must not delay attacks');
 } finally {await r.browser.close();r.server?.close();}
})().catch(e=>{console.error(e);process.exit(1)});
