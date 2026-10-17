const {start,save}=require('./audio-harness.cjs');
const fs=require('fs');
(async()=>{
const runtime=await start();const browser=runtime.browser;
async function render(original){const p=await browser.newPage();if(original)await p.route('**/index.html',r=>r.fulfill({contentType:'text/html',body:require('child_process').execFileSync('git',['-C',require('path').join(__dirname,'..'),'show','c7d2d3103ed6c530fb9edaadcabe4883da19f595:index.html'],{encoding:'utf8',maxBuffer:2000000})}));await p.goto(runtime.url+'/index.html');await p.evaluate(()=>prepareAllVoiceAudio());await p.waitForFunction(()=>allVoiceAudioReady);await p.evaluate(async()=>{for(const bank of ['clic','cloche','claves','clic808','beep'])await ensureInstrumentBankReady(bank);});const r=await p.evaluate(async()=>{let results={};for(const bank of ['clic','cloche','claves','clic808','beep']){audioCtx=new OfflineAudioContext(1,48000*4,48000);for(let first of [false,true])for(let state of [1,2,3])SOUND_BANKS[bank].play(audioCtx.destination,.1+(state-1)*.5+(first?1.5:0),state,first);const x=(await audioCtx.startRendering()).getChannelData(0);let hash=2166136261;const bytes=new Uint8Array(x.buffer);for(const b of bytes)hash=Math.imul(hash^b,16777619);results[bank]={hash:hash>>>0,pcm:Array.from(x)};}return results;});await p.close();return r;}
const before=await render(true),after=await render(false);const comparison={};for(const bank of Object.keys(before)){let max=0;for(let i=0;i<before[bank].pcm.length;i++)max=Math.max(max,Math.abs(before[bank].pcm[i]-after[bank].pcm[i]));comparison[bank]={maxPCMError:max,identical:before[bank].hash===after[bank].hash};if(max>1e-6)throw Error('Non-voice audio changed');}
const p=await browser.newPage();await p.goto(runtime.url);await p.evaluate(()=>prepareAllVoiceAudio());await p.waitForFunction(()=>allVoiceAudioReady);
const drift=await p.evaluate(()=>{let clock=0;audioCtx={get currentTime(){return clock}};playClick=()=>{};scheduleVisualUpdate=()=>{};window.setTimeout=()=>0;appMode='metronome';currentBank='voiceMale';training.active=false;silentModeEnabled=false;measures=[createMeasure(4,4)];measures[0].tempo=60;playingMeasureIndex=0;currentStepInMeasure=0;nextNoteTime=.4;let n=0,err=0;playClick=(s,t,f,c)=>{err=Math.max(err,Math.abs(t-(.4+n)));if(c.beatNumber!==n%4+1)throw Error('Count');n++;};while(n<10000){scheduler();clock+=.073;}return {beats:n,seconds:10000,maxGridErrorSeconds:err};});
if(drift.maxGridErrorSeconds>1e-9)throw Error('Drift');
await p.reload();await p.evaluate(()=>prepareAllVoiceAudio());await p.waitForFunction(()=>allVoiceAudioReady);const stop=await p.evaluate(async()=>{audioCtx=null;await initAudio();currentBank='voiceMale';isPlaying=false;await startMetronome();const count=scheduledVoiceSources.size;stopMetronome();return {scheduledBeforeStop:count,scheduledAfterStop:scheduledVoiceSources.size};});
if(stop.scheduledAfterStop||!stop.scheduledBeforeStop)throw Error('Stop cancellation failed');
const r={nonVoiceWithinFloatRounding:true,comparison,drift,stop};save('regression-results.json',r);console.log(r);await browser.close();runtime.server?.close();
})().catch(e=>{console.error(e);process.exit(1)});



