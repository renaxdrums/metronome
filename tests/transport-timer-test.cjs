const {start,save}=require('./audio-harness.cjs');const assert=require('assert');
(async()=>{const r=await start(),p=await r.browser.newPage({viewport:{width:1280,height:850}}),errors=[];p.on('pageerror',e=>errors.push(e.message));try{
 await p.goto(r.url);await p.evaluate(()=>prepareAllVoiceAudio());await p.waitForFunction(()=>allVoiceAudioReady&&window.RENAX_SONGS);
 const states=[];
 async function checkStart(label){const x=await p.evaluate(()=>({playing:isPlaying,elapsed:getWorkElapsed(),stored:workElapsed,text:trainTimerEl.textContent}));assert(x.playing&&x.elapsed<500&&x.stored===0&&x.text==='0:00');states.push({label,...x});}
 async function checkStop(label){const x=await p.evaluate(()=>({playing:isPlaying,elapsed:getWorkElapsed(),stored:workElapsed,start:workStartTime,text:trainTimerEl.textContent}));assert(!x.playing&&x.elapsed===0&&x.stored===0&&x.start===0&&x.text==='0:00');states.push({label,...x});}
 for(let n=0;n<2;n++){
  await p.evaluate(()=>{workElapsed=65000;updateTimerDisplay();});await p.getByRole('button',{name:'Lire',exact:true}).click();await checkStart('metronome start '+n);
  await p.waitForFunction(()=>getWorkElapsed()>1000);await p.waitForFunction(()=>trainTimerEl.textContent!=='0:00',null,{timeout:1000});assert.notStrictEqual(await p.evaluate(()=>trainTimerEl.textContent),'0:00');
  await p.locator('#playBtn').click();await checkStop('metronome stop '+n);
 }
 await p.evaluate(()=>{workElapsed=65000;updateTimerDisplay();document.activeElement.blur();});await p.keyboard.press('Space');await p.waitForFunction(()=>isPlaying);await checkStart('keyboard start');await p.keyboard.press('Space');await checkStop('keyboard stop');
 await require('./audio-harness.cjs').openPlaylist(p);await p.getByRole('button',{name:'Nouveau track',exact:true}).click();
 await p.evaluate(()=>{RENAX_SONGS.unload();const s=RENAX_SONGS.library.profiles.find(x=>x.id===RENAX_SONGS.library.activeProfile).songs[0];s.sections[0].count=2;s.sections[0].measure=createMeasure(4,4,120);});
 for(let n=0;n<2;n++){
  await p.evaluate(()=>{workElapsed=65000;updateTimerDisplay();});await p.getByRole('button',{name:'Lire le track',exact:true}).click();await checkStart('song start '+n);
  await p.waitForFunction(()=>getWorkElapsed()>1000);await p.locator('#playBtn').click();await checkStop('song stop '+n);
 }
 await p.getByRole('button',{name:'Lire le track',exact:true}).click();await checkStart('song final start');await p.waitForFunction(()=>!isPlaying,null,{timeout:7000});await checkStop('song natural end');
 assert.deepStrictEqual(errors,[]);const result={startReset:true,stopReset:true,metronome:true,songs:true,keyboard:true,naturalSongEnd:true,countingContinues:true,displayFormatUnchanged:'0:00',states,errors};save('transport-timer-results.json',result);console.log(result);
}finally{await r.browser.close();r.server?.close();}})().catch(e=>{console.error(e);process.exit(1)});
