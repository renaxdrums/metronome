const assert=require('node:assert/strict');
const {start,save}=require('./audio-harness.cjs');
function validate(result){
 if(result.maxErrorMs>1e-6||result.lateStarts||result.beats<5)throw Error('Live scheduler failed: '+JSON.stringify(result));
}
(async()=>{
 const runtime=await start(),browser=runtime.browser,p=await browser.newPage();
 try{
  await p.goto(runtime.url);
  await p.evaluate(()=>prepareAllVoiceAudio());
  await p.waitForFunction(()=>allVoiceAudioReady);
  await p.evaluate(()=>{
   window.liveStarts=[];
   const create=audioCtx.createBufferSource.bind(audioCtx);
   audioCtx.createBufferSource=()=>{
    const source=create(),start=source.start.bind(source);
    source.start=(time,offset=0)=>{liveStarts.push({start:time,offset,scheduledAt:audioCtx.currentTime});start(time,offset);};
    return source;
   };
  });
  async function observe(bpm,interrupt=false){
   const clock=await p.evaluate(async({bpm,interrupt})=>{
    currentBank='voiceMale';measures=[createMeasure(4,4)];measures[0].tempo=bpm;liveStarts=[];
    await startMetronome();
    if(interrupt)clearTimeout(timerID);
    return {audio:audioCtx.currentTime,wall:performance.now()};
   },{bpm,interrupt});
   const seconds=bpm===60?5.4:2.9;
   // The scheduler uses the audio clock; a busy headless audio device can
   // advance more slowly than wall time. Keep the original observation length.
   await p.waitForFunction(({audio,seconds})=>audioCtx.currentTime-audio>=seconds,{audio:clock.audio,seconds},{timeout:20000});
   return p.evaluate(({bpm,clock})=>{
    const elapsedAudioSeconds=audioCtx.currentTime-clock.audio,elapsedWallMs=performance.now()-clock.wall,playing=isPlaying;
    stopMetronome();
    const attacks=VOICE_ATTACK_SECONDS.male,times=liveStarts.map((source,index)=>source.start-source.offset+attacks[index%4+1]);
    const intervals=times.slice(1).map((time,index)=>time-times[index]);
    return {bpm,beats:times.length,intervalsSeconds:intervals,maxErrorMs:Math.max(...intervals.map(interval=>Math.abs(interval-60/bpm)))*1000,lateStarts:liveStarts.filter(source=>source.offset>0).length,elapsedAudioSeconds,elapsedWallMs,playing};
   },{bpm,clock});
  }
  const results=[];
  for(const bpm of [60,120]){
   const result=await observe(bpm);validate(result);results.push(result);
  }
  // Waiting on the audio clock must still reject a scheduler that stops.
  const interrupted=await observe(120,true);
  assert(interrupted.beats<5);
  assert.throws(()=>validate(interrupted),/Live scheduler failed/);
  save('live-results.json',{results,interrupted});
  console.log('PASS live timing at 60/120 BPM on the audio clock; interrupted scheduler rejected',results);
 }finally{await browser.close();runtime.server?.close();}
})().catch(error=>{console.error(error);process.exit(1);});
