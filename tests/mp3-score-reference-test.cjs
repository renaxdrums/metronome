// Compare export PCM to events produced by the untouched live scheduler.
const {start,save}=require('./audio-harness.cjs');const assert=require('assert');
(async()=>{const r=await start(),p=await r.browser.newPage();try{
 await p.goto(r.url);await p.waitForFunction(()=>allVoiceAudioReady&&window.RENAX_MP3_EXPORT);
 const results=await p.evaluate(async()=>{
  const song={id:'reference',name:'Grid reference',sections:[]};
  for(const [n,d,t,sub,count] of [[4,4,60,3,2],[3,4,120,2,2],[5,8,97,7,2],[7,16,123,3,2],[20,32,120,1,2]]){
   const m=createMeasure(n,d,t);m.beatSubdivisions.fill(sub);m.beatStates=m.beatSubdivisions.map((s,b)=>Array.from({length:s},(_,j)=>(b+j)%4));song.sections.push({id:String(d)+n,label:n+'/'+d,count,measure:m});
  }
  const result=[];
  for(const bank of ['clic','cloche','claves','clic808','beep','voiceMale','voiceFemale']){if(!SOUND_BANKS[bank].isVoice)await ensureInstrumentBankReady(bank);
   const frame=document.createElement('iframe');frame.hidden=true;frame.src=new URL('?mp3-render=1',location.href);await new Promise(resolve=>{frame.onload=resolve;document.body.append(frame);});
   const originalChildPlay=frame.contentWindow.playClick;const exportEvents=[];frame.contentWindow.playClick=(s,t,f,c)=>{exportEvents.push({state:s,time:t,first:f,context:c});originalChildPlay(s,t,f,c);};
   const raw=await frame.contentWindow.RENAX_MP3_RENDER.renderPCM(song,bank,.8);frame.remove();
   const ctx=audioCtx, originalPlay=playClick,originalVisual=scheduleVisualUpdate,originalEnd=window.songAtEnd;
   const originalMeasures=measures,originalBank=currentBank,originalVolume=masterVolume;
   const events=[];let clock=0,finished=false;
   audioCtx={get currentTime(){return clock;}};currentBank=bank;masterVolume=.8;appMode='metronome';silentModeEnabled=false;training.active=false;
   measures=song.sections.flatMap(s=>Array.from({length:s.count},()=>JSON.parse(JSON.stringify(s.measure))));
   playingMeasureIndex=0;currentStepInMeasure=0;nextNoteTime=raw.score.lead;
   playClick=(state,time,first,context)=>events.push({state,time,first,context});scheduleVisualUpdate=()=>{};
   window.songAtEnd=()=>{finished=playingMeasureIndex===0&&currentStepInMeasure===0;return finished;};
   while(!finished){clock=nextNoteTime;scheduler();clearTimeout(timerID);}
   audioCtx=new OfflineAudioContext(1,raw.pcm.length,48000);playClick=originalPlay;scheduleVisualUpdate=originalVisual;window.songAtEnd=originalEnd;
   for(const e of events)playClick(e.state,e.time,e.first,e.context);
   if(SOUND_BANKS[bank].isVoice)for(const src of scheduledVoiceSources)src.stop(raw.score.lead+raw.score.duration);
   const reference=(await audioCtx.startRendering()).getChannelData(0);
   let maxPCMError=0,squared=0,energy=0,maxAt=0,firstAt=-1;
   for(let i=0;i<reference.length;i++){const error=reference[i]-raw.pcm[i];if(Math.abs(error)>maxPCMError){maxPCMError=Math.abs(error);maxAt=i;}if(firstAt===-1&&Math.abs(error)>1e-5)firstAt=i;squared+=error*error;energy+=reference[i]*reference[i];}
   const mismatches=events.flatMap((e,i)=>{const x=exportEvents[i];return e.state!==x.state||e.first!==x.first||JSON.stringify(e.context)!==JSON.stringify(x.context)?[{index:i,live:e,export:x}]:[];});
   result.push({bank,events:events.length,expectedEvents:raw.score.events,score:raw.score,maxPCMError,relativeRMSError:Math.sqrt(squared/energy),maxAtSeconds:maxAt/48000,firstAtSeconds:firstAt/48000,bufferRate:VOICE_METRONOME_BUFFERS.male['1'].sampleRate,mismatches:mismatches.slice(0,3),gridDifference:Math.max(...events.map((e,i)=>Math.abs(e.time-exportEvents[i].time)))});
   audioCtx=ctx;measures=originalMeasures;currentBank=originalBank;masterVolume=originalVolume;
  }
  return result;
 });
 for(const x of results){assert.strictEqual(x.events,x.expectedEvents);assert(x.maxPCMError<1e-5&&x.relativeRMSError<1e-6,JSON.stringify(x));}
 save('mp3-score-reference-results.json',results);console.log(results.map(x=>({bank:x.bank,events:x.events,maxPCMError:x.maxPCMError})));
}finally{await r.browser.close();r.server?.close();}})().catch(e=>{console.error(e);process.exit(1)});
