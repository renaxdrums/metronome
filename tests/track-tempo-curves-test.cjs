'use strict';
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const {start,save,showMeasures}=require('./audio-harness.cjs');

// Decode the actual MIDI tempo map, including silent intervals and the final tick.
function midiTimes(bytes){
 const b=Buffer.from(bytes);let offset=22,tick=0,last=0,micro=500000,seconds=0;
 const ppq=b.readUInt16BE(12),notes=[];
 const variable=()=>{let value=0,n;do{n=b[offset++];value=value*128+(n&127);}while(n&128);return value;};
 while(offset<b.length){
  tick+=variable();seconds+=(tick-last)*micro/ppq/1000000;last=tick;
  const status=b[offset++];
  if(status===255){const type=b[offset++],length=variable();if(type===81)micro=b.readUIntBE(offset,3);offset+=length;if(type===47)break;}
  else{if(status===153&&b[offset+1])notes.push(seconds);offset+=2;}
 }
 return {seconds,notes};
}

(async()=>{
 const h=await start(),results=[],output=path.resolve(process.env.TEST_OUTPUT_DIR||'tests/results/tempo-curves');
 fs.mkdirSync(output,{recursive:true});
 try{
  for(const width of [1440,390,320]){
   const p=await h.browser.newPage({viewport:{width,height:900},hasTouch:width<1100,reducedMotion:'reduce'}),errors=[];
   p.on('pageerror',e=>errors.push(e.message));
   await p.addInitScript(()=>{Element.prototype.requestFullscreen=undefined;localStorage.setItem('renax-appearance','avant');});
   await p.goto(h.url);await p.waitForFunction(()=>window.RENAX_SONGS&&window.RENAX_WORKSPACE&&window.RENAX_TRAINING);
   await p.evaluate(()=>{
    const measure=createMeasure(4,4,120);
    RENAX_SONGS.replaceLibrary({version:1,activeProfile:'p',profiles:[{id:'p',name:'Courbes',songs:[{id:'s',name:'Courbes du bloc',sections:[{id:'a',label:'Courbe',count:5,measure,tempoRamp:{enabled:true,endTempo:180}}]}]}]});
    RENAX_WORKSPACE.go('tracks');RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',profile:'p',song:'s',section:'a'});
   });
   await showMeasures(p);
   assert.equal(await p.locator('.song-curve-select>summary').textContent(),'Montée linéaire');
   const profiles=await p.evaluate(()=>RENAX_SONG_TEMPO.profiles);
   for(const [key,label,svg] of profiles){
    await p.locator('.song-curve-select>summary').click();
    assert.equal(await p.locator('.song-curve-menu button').count(),12);
    // Exact same icon geometry as the already-approved Training selector.
    assert.equal(await p.locator('[data-song-curve="'+key+'"] svg path').nth(1).getAttribute('d'),svg);
    assert.equal(await p.locator('[data-curve="'+key+'"] svg path').nth(1).getAttribute('d'),svg);
    await p.locator('[data-song-curve="'+key+'"]').click();
    assert.equal(await p.locator('.song-curve-select>summary').textContent(),label);
    assert.equal(await p.locator('[data-section-id=a] .song-block-header').getAttribute('aria-expanded'),'true');
    const state=await p.evaluate(()=>{const s=RENAX_SONGS.library.profiles[0].songs[0].sections[0];return {active:RENAX_SONG_TEMPO.active(s),curve:s.tempoRamp.curve,start:RENAX_SONG_TEMPO.tempoAt(s,0),middle:RENAX_SONG_TEMPO.tempoAt(s,10),end:RENAX_SONG_TEMPO.tempoAt(s,20),low:Math.min(s.measure.tempo,s.tempoRamp.endTempo),high:Math.max(s.measure.tempo,s.tempoRamp.endTempo)};});
    assert(state.active);assert.equal(state.curve,key);assert.equal(state.low,120);assert.equal(state.high,180);
    if(key.endsWith('up-down')){assert.equal(state.middle,180);assert.equal(state.start,120);assert.equal(state.end,120);assert.match(await p.locator('.song-ramp-target').textContent(),/Sommet/);}
    if(key.endsWith('down-up')){assert.equal(state.middle,120);assert.equal(state.start,180);assert.equal(state.end,180);assert.match(await p.locator('.song-ramp-target').textContent(),/Minimum/);}
   }
   await p.locator('.song-curve-select>summary').click();await p.locator('[data-song-curve=round-up-down]').click();
   const fader=await p.evaluate(()=>{
    const s=RENAX_SONGS.library.profiles[0].songs[0].sections[0],before=s.measure.tempo;
    bpmSlider.value='200';bpmSlider.dispatchEvent(new Event('input',{bubbles:true}));
    const rejected=s.measure.tempo===before&&Number(bpmSlider.value)===before&&RENAX_SONG_TEMPO.active(s);
    bpmSlider.value='130';bpmSlider.dispatchEvent(new Event('input',{bubbles:true}));const accepted=s.measure.tempo===130;
    bpmSlider.value=String(before);bpmSlider.dispatchEvent(new Event('input',{bubbles:true}));
    RENAX_SONGS.validateLibrary(RENAX_SONGS.library);return {rejected,accepted};
   });assert(fader.rejected&&fader.accepted,'Global fader preserves valid curve direction');

   await p.locator('.song-curve-select>summary').click();
   const colours=await p.locator('.song-curve-menu').evaluate(menu=>[menu.querySelector('[aria-pressed=true]'),menu.querySelector('[aria-pressed=false]')].map(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,text:s.color,stroke:getComputedStyle(el.querySelector('svg')).stroke};}));
   assert.equal(await p.locator('.song-ramp-toggle input').evaluate(el=>getComputedStyle(el).accentColor),'rgb(215, 242, 24)');
   assert.deepEqual(colours,[{background:'rgb(215, 242, 24)',text:'rgb(22, 26, 21)',stroke:'rgb(22, 26, 21)'},{background:'rgb(52, 59, 69)',text:'rgb(215, 242, 24)',stroke:'rgb(215, 242, 24)'}]);
   for(const theme of ['avant','dark','light','ivory']){
    await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await p.locator('.song-curve-select').scrollIntoViewIfNeeded();
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const bounds=await p.locator('.song-curve-menu').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);assert(bounds.y>=0&&bounds.y+bounds.height<=900);
    await p.screenshot({path:path.join(output,'curves-'+theme+'-'+width+'.png')});
   }
   await p.keyboard.press('Escape');assert.equal(await p.locator('.song-curve-select').evaluate(e=>e.open),false);
   await p.reload();await p.waitForFunction(()=>window.RENAX_SONGS);
   assert.equal(await p.evaluate(()=>RENAX_SONGS.library.profiles[0].songs[0].sections[0].tempoRamp.curve),'round-up-down');
   await p.evaluate(()=>{
    const original=JSON.stringify(RENAX_SONGS.library);
    for(const ramp of [{enabled:true,endTempo:180,curve:'unknown'},{enabled:true,endTempo:180,curve:'linear-down'},{enabled:true,endTempo:120,curve:'linear-up'}]){
     const copy=JSON.parse(original);copy.profiles[0].songs[0].sections[0].tempoRamp=ramp;
     let rejected=false;try{RENAX_SONGS.replaceLibrary(copy);}catch{rejected=true;}if(!rejected)throw Error('Invalid curve accepted');
     if(JSON.stringify(RENAX_SONGS.library)!==original)throw Error('Invalid curve mutated the library');
    }
    RENAX_WORKSPACE.go('tracks');RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',profile:'p',song:'s',section:'a'});
   });await showMeasures(p);
   await p.locator('.song-ramp-toggle input').uncheck();assert.equal(await p.locator('.song-curve-select').count(),0);
   await p.locator('.song-ramp-toggle input').check();assert.equal(await p.locator('.song-curve-select>summary').textContent(),'Montée puis descente arrondie');
   await p.locator('.song-continuous-toggle input').check();assert(await p.locator('.song-ramp-toggle input').isDisabled());assert.equal(await p.locator('.song-curve-select').count(),0);
   await p.locator('.song-continuous-toggle input').uncheck();assert.equal(await p.locator('.song-curve-select>summary').textContent(),'Montée puis descente arrondie');
   await p.locator('.song-ramp-toggle input').uncheck();
   await p.evaluate(()=>{const select=document.querySelector('[data-section-id=a] select[aria-label="Tempo (BPM)"]');select.dispatchEvent(new Event('renax-options-request'));select.value='999';select.dispatchEvent(new Event('change',{bubbles:true}));});
   await p.locator('.song-ramp-toggle input').check();
   assert.equal(await p.locator('.song-curve-select>summary').textContent(),'Descente linéaire');
   assert.equal(await p.evaluate(()=>RENAX_SONGS.library.profiles[0].songs[0].sections[0].measure.tempo),999);
   results.push({width,profiles:12,iconsIdentical:true,halfBarPeak:true,persistence:true,continuousUnchanged:true,themes:4});

   if(width===1440){
    for(const [key] of profiles){
     await p.evaluate(key=>{
      stopMetronome();const down=RENAX_SONG_TEMPO.startsHigh(key),measure=createMeasure(3,8,down?900:600);
      measure.beatSubdivisions=[2,3,1];measure.beatStates=[[1,1],[1,1,1],[1]];
      RENAX_SONGS.replaceLibrary({version:1,activeProfile:'p',profiles:[{id:'p',name:'Test',songs:[{id:'s',name:'Courbe',sections:[{id:'a',label:'Courbe',count:5,measure,tempoRamp:{enabled:true,endTempo:down?600:900,curve:key}}]}]}]});
      RENAX_WORKSPACE.go('tracks');RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',profile:'p',song:'s',section:'a'});currentBank='beep';
      window.__curveEvents=[];if(!window.__curveSchedule){window.__curveSchedule=scheduleVisualUpdate;scheduleVisualUpdate=function(index,step,time,_position){window.__curveEvents.push({index,step,time});return window.__curveSchedule.apply(this,arguments);};}
     },key);
     await p.locator('#playBtn').click();await p.waitForFunction(()=>!isPlaying&&window.__curveEvents.length>0);
     const live=await p.evaluate(()=>window.__curveEvents);assert.equal(live.length,30,key+' live events');
     const exported=await p.evaluate(async()=>{
      const s=RENAX_SONGS.library.profiles[0].songs[0],before=JSON.stringify(s);
      const expected=[],section=s.sections[0];let time=0;
      for(let bar=0;bar<5;bar++)for(let beat=0;beat<3;beat++)for(let sub=0;sub<section.measure.beatSubdivisions[beat];sub++){expected.push(time);time+=RENAX_SONG_TEMPO.stepDuration(section,bar,beat,sub,section.measure.beatSubdivisions[beat]);}
      const frame=document.createElement('iframe');frame.hidden=true;frame.src=location.href+'?mp3-render=1';
      await new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=reject;document.body.append(frame);});
      try{
       const w=frame.contentWindow,click=w.playClick,events=[];w.playClick=function(state,time){events.push(time);return click.apply(this,arguments);};
       const audio=await w.RENAX_MP3_RENDER.renderPCM(s,'beep',.5),midi=RENAX_MIDI_EXPORT.exportSong(s);
       if(JSON.stringify(s)!==before)throw Error('Export mutated the song');
       return {expected,seconds:time,mp3Events:events,audioSeconds:audio.score.duration,audible:audio.pcm.some(v=>Math.abs(v)>.0001),midi:Array.from(new Uint8Array(await midi.blob.arrayBuffer()))};
      }finally{frame.remove();}
     });
     assert(exported.audible,key+' audible PCM');assert.equal(exported.mp3Events.length,30,key+' offline events');
     const midi=midiTimes(exported.midi);assert.equal(midi.notes.length,30);
     assert(Math.abs(midi.seconds-exported.seconds)<2e-5,key+' MIDI duration');assert(Math.abs(exported.audioSeconds-exported.seconds)<1e-9,key+' PCM duration');
     for(let i=0;i<30;i++){
      assert(Math.abs(live[i].time-live[0].time-exported.expected[i])<1e-8,key+' live '+i);
      assert(Math.abs(exported.mp3Events[i]-exported.expected[i])<1e-8,key+' offline '+i);
      assert(Math.abs(midi.notes[i]-exported.expected[i])<2e-5,key+' MIDI '+i);
     }
    }
    const mixed=await p.evaluate(async()=>{
     const block=(id,count,start,end,curve)=>({id,label:id,count,measure:createMeasure(4,4,start),...(curve?{tempoRamp:{enabled:true,endTempo:end,curve}}:{})});
     const song={id:'mixed',name:'Montée palier descente',countIn:{count:1,numerator:4,denominator:4},sections:[block('Montée',2,600,900,'linear-up'),block('Palier',1,900),block('Descente',2,900,600,'linear-down')]};
     const before=JSON.stringify(song),expected=RENAX_SONGS.playbackSections(song).reduce((sum,s)=>sum+RENAX_SONG_TEMPO.duration(s),0);
     const mp3=await RENAX_MP3_EXPORT.exportSong(song,'beep',.5),midi=RENAX_MIDI_EXPORT.exportSong(song);
     const starts=[];let cursor=0;for(const section of RENAX_SONGS.playbackSections(song))for(let bar=0;bar<section.count;bar++)for(let beat=0;beat<section.measure.numerator;beat++)for(let sub=0;sub<section.measure.beatSubdivisions[beat];sub++){starts.push(cursor);cursor+=RENAX_SONG_TEMPO.stepDuration(section,bar,beat,sub,section.measure.beatSubdivisions[beat]);}
     RENAX_SONGS.replaceLibrary({version:1,activeProfile:'p',profiles:[{id:'p',name:'Test',songs:[song]}]});RENAX_WORKSPACE.go('tracks');RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',profile:'p',song:song.id,section:song.sections[0].id});window.__curveEvents=[];currentBank='beep';
     return {unchanged:JSON.stringify(song)===before,expected,starts,seconds:mp3.report.score.duration,bytes:mp3.blob.size,midi:Array.from(new Uint8Array(await midi.blob.arrayBuffer()))};
    });
    assert(mixed.unchanged);assert(mixed.bytes>1000);assert(Math.abs(mixed.seconds-mixed.expected)<1e-8);assert(Math.abs(midiTimes(mixed.midi).seconds-mixed.expected)<3e-5);
    await p.locator('#playBtn').click();await p.waitForFunction(()=>!isPlaying&&window.__curveEvents.length>0);
    const mixedLive=await p.evaluate(()=>window.__curveEvents);assert.equal(mixedLive.length,mixed.starts.length);
    for(let i=0;i<mixedLive.length;i++)assert(Math.abs(mixedLive[i].time-mixedLive[0].time-mixed.starts[i])<1e-8,'Three-block live boundary '+i);
    results.push({liveProfiles:12,pcmProfiles:12,midiProfiles:12,oddMeterHalfBeat:true,mixedThreeBlocksMP3:true,countIn:true});
   }
   assert.deepEqual(errors,[]);await p.close();
  }
  save('track-tempo-curves-results.json',results);console.log('PASS Track: 12 exact curves, 3 widths, 4 themes, half-bar peaks, persistence, real live/PCM/MIDI timelines and three-block MP3 export');
 }finally{await h.browser.close();h.server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
