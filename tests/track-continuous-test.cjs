'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {start,save,showMeasures}=require('./audio-harness.cjs');
(async()=>{
 const h=await start(),results=[];
 try{
  for(const width of [1440,390]){
   const p=await h.browser.newPage({viewport:{width,height:900},hasTouch:width<1100,reducedMotion:'reduce'}),errors=[];
   p.on('pageerror',e=>errors.push(e.message));
   await p.addInitScript(()=>{Element.prototype.requestFullscreen=undefined;});
   await p.route('**/neural-engine.mjs*',route=>route.fulfill({contentType:'text/javascript',body:`export async function synthesize(text){if(text==='Clic continu')throw Error('Continuous speech requested');return {pcm:new Float32Array(6000),sampleRate:24000,events:[{type:'phoneme',id:'t',audio_position:200,text_position:1},{type:'phoneme',id:'a',audio_position:220,text_position:1}]};}`}));
   await p.goto(h.url);await p.waitForFunction(()=>window.RENAX_WORKSPACE&&window.RENAX_MP3_EXPORT);
   await p.evaluate(()=>{
    const section=(id,continuous,n=4,d=4,bpm=240)=>({id,label:continuous?'Clic continu':id,count:1,continuous,measure:createMeasure(n,d,bpm)});
    RENAX_SONGS.replaceLibrary({version:1,activeProfile:'p',profiles:[{id:'p',name:'Test',songs:[{id:'s',name:'Continu',sections:[section('c',true),{...section('normal',false,3,8,180),count:2},section('normal2',false,3,8,180),section('last',true,7,8,210)]},{id:'finite',name:'Fini',sections:[section('f',false)]}]}]});
    RENAX_WORKSPACE.go('tracks');RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',profile:'p',song:'s',section:'c'});
    window.__events=[];const original=scheduleVisualUpdate;
    scheduleVisualUpdate=function(i,step,time,pos){window.__events.push({id:RENAX_SONGS.locate(i)?.section.id,step,time,beat:pos.beat});return original.apply(this,arguments);};
   });
   await showMeasures(p);
   assert.equal(await p.locator('.song-section.song-continuous').count(),2);
   await p.evaluate(()=>RENAX_SONGS.flushPending());await p.reload();await p.waitForFunction(()=>window.RENAX_SONGS);
   assert.equal(await p.evaluate(()=>RENAX_SONGS.library.profiles[0].songs[0].sections[0].continuous),true,'Persist continuous flag');
   await p.evaluate(()=>{
    RENAX_WORKSPACE.go('tracks');RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',profile:'p',song:'s',section:'c'});
    window.__events=[];const original=scheduleVisualUpdate;
    scheduleVisualUpdate=function(i,step,time,pos){window.__events.push({id:RENAX_SONGS.locate(i)?.section.id,step,time,beat:pos.beat});return original.apply(this,arguments);};
   });
   await showMeasures(p);
   // Start by user gesture, then inspect the exact times submitted to the real scheduler.
   await p.locator('#playBtn').click();await p.waitForFunction(()=>window.__events.length>=12);
   assert.equal(await p.evaluate(()=>isPlaying),true,'Never auto-stop continuous');
   assert(await p.evaluate(()=>window.__events.every(e=>e.id==='c')),'Never advance without request');
   await p.evaluate(()=>RENAX_SONGS.requestNextSection());
   await p.waitForFunction(()=>window.__events.some(e=>e.id==='last'));
   let events=await p.evaluate(()=>window.__events);
   const transition=events.findIndex(e=>e.id==='normal');assert(transition>0);
   assert.equal(events[transition].step,0);assert.equal(events[transition-1].beat,3);
   assert(Math.abs(events[transition].time-events[transition-1].time-.25)<1e-8);
   const last=events.findIndex(e=>e.id==='last');assert.equal(events[last].step,0);
   assert(Math.abs(events[last].time-events[last-1].time-1/6)<1e-8,'3/8 at 180 BPM interval');
   await p.waitForFunction(()=>window.__events.filter(e=>e.id==='last').length>=14);
   assert.equal(await p.evaluate(()=>isPlaying),true,'Final continuous holds');
   await p.evaluate(()=>RENAX_SONGS.requestNextSection());await p.waitForFunction(()=>!isPlaying);
   // Playlist Play toggles Stop, and a different song starts from its own beginning.
   await p.evaluate(()=>RENAX_SONGS.restoreNavigation({pane:'songs',view:'playlist',profile:'p',song:'s'}));await showMeasures(p);
   const play=p.locator('[data-play-song-id=s]');await play.click();await p.waitForFunction(()=>isPlaying);
   assert.equal(await play.getAttribute('aria-pressed'),'true');assert.match(await play.getAttribute('aria-label'),/Arrêter/);
   await play.click();assert.equal(await p.evaluate(()=>isPlaying),false);
   await p.locator('[data-play-song-id=finite]').click();await p.waitForFunction(()=>isPlaying&&RENAX_SONGS.loaded.song.id==='finite');await p.evaluate(()=>stopMetronome());
   const policies=await p.evaluate(async()=>{
    const song=RENAX_SONGS.library.profiles[0].songs[0],before=JSON.stringify(song),out={};
    for(const count of [0,-1,NaN,Infinity,1.5,1000001]){try{RENAX_SONGS.finiteExport(song,'duration',count);throw Error('Accepted invalid duration');}catch(e){if(e.message==='Accepted invalid duration')throw e;}}
    try{RENAX_MIDI_EXPORT.exportSong(song);throw Error('Accepted infinite MIDI');}catch(e){out.midiRejected=e.message;}
    try{RENAX_SONGS.finiteExport(song);throw Error('Accepted missing policy');}catch(e){out.policyRejected=e.message;}
    const ignored=RENAX_SONGS.finiteExport(song,'ignore'),finite=RENAX_SONGS.finiteExport(song,'duration',2);
    out.ignored=ignored.sections.length;out.counts=finite.sections.map(s=>s.count);
    out.midi=(await RENAX_MIDI_EXPORT.exportSong(finite)).report;
    out.originalUnchanged=JSON.stringify(song)===before;
    const rendered=await RENAX_MP3_EXPORT.isolatedRender(finite,'beep',.5);out.duration=rendered.score.duration;
    const mp3=await RENAX_MP3_EXPORT.exportSong(finite,'beep',.5);out.mp3Bytes=mp3.blob.size;out.mp3Duration=mp3.report.score.duration;
    return out;
   });
   assert.equal(policies.ignored,2);assert.deepEqual(policies.counts,[2,2,1,2]);assert(policies.originalUnchanged);assert(policies.mp3Bytes>1000);assert.equal(policies.mp3Duration,policies.duration);
   // Both export formats require an explicit finite policy through the actual dialog.
   await p.locator('#mp3ExportOpen').click();await p.locator('#mp3ExportSong').selectOption('s');
   assert.equal(await p.locator('#songExportContinuous').isVisible(),true);
   await p.locator('#mp3ExportSave').click();assert.match(await p.locator('#mp3ExportStatus').textContent(),/Choisissez/);
   await p.locator('#songExportFormat').selectOption('midi');await p.locator('#songExportContinuousPolicy').selectOption('ignore');
   await p.locator('#mp3ExportSave').click();await p.waitForFunction(()=>!document.getElementById('mp3ExportDownload').hidden);
   await p.locator('#mp3ExportDialog').getByRole('button',{name:'Fermer',exact:true}).click();
   // Guide plans never synthesize continuous labels and retain explicit count-in.
   const guide=await p.evaluate(async()=>{
    const song=JSON.parse(JSON.stringify(RENAX_SONGS.library.profiles[0].songs[0]));song.amorce=true;
    song.countIn={count:1,numerator:4,denominator:4};const plan=await RENAX_AMORCE.prepare(song);
    delete song.countIn;const without=await RENAX_AMORCE.prepare(song);
    return {count:plan.sections[0].count,first:plan.sections[0].measure.countIn,initial:plan.announcements.length,following:plan.segmentPlans.normal.announcements.length,without:without.sections[0].id};
   });
   assert.equal(guide.count,1);assert.equal(guide.first,true);assert.equal(guide.initial,0);assert.equal(guide.following,1);assert.equal(guide.without,'c');
   for(const theme of ['avant','dark','light','ivory']){
    await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await p.locator('#index2SettingsBtn').click();await p.waitForFunction(()=>document.getElementById('index2SettingsBtn').getAttribute('aria-expanded')==='true');
    if(theme==='avant'){
     assert.equal(await p.locator('#index2SettingsPanel').getAttribute('aria-modal'),'false');
     await p.getByRole('tab',{name:'Polyrythmie',exact:true}).click();
     await p.waitForFunction(()=>document.body.dataset.workspace==='polyrhythm'&&document.getElementById('index2SettingsBtn').getAttribute('aria-expanded')==='false');
    }else{
     assert.equal(await p.locator('#index2SettingsPanel').getAttribute('aria-modal'),'true');
     await p.locator('#index2SettingsClose').click();
    }
   }
   await p.evaluate(()=>{document.documentElement.dataset.theme='avant';RENAX_WORKSPACE.go('tracks');RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',profile:'p',song:'s',section:'c'});});await showMeasures(p);
   const shot=path.resolve('tests/results/continuous-'+width+'.png');fs.mkdirSync(path.dirname(shot),{recursive:true});await p.screenshot({path:shot});
   assert.deepEqual(errors,[]);results.push({width,transitions:true,playlistStop:true,policies,guide,settings:true});await p.close();
  }
 }finally{await h.browser.close();h.server?.close();}
 save('track-continuous-results.json',results);console.log('PASS continuous Track desktop/mobile',JSON.stringify(results));
})().catch(e=>{console.error(e);process.exit(1);});
