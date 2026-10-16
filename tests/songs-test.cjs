const {start,save}=require('./audio-harness.cjs');
(async()=>{
 const r=await start(),p=await r.browser.newPage({viewport:{width:1280,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(r.url);await p.waitForFunction(()=>allVoiceAudioReady&&window.RENAX_SONGS);
 await require('./audio-harness.cjs').openPlaylist(p);
 if(await p.locator('.song-section').count())throw Error('Unexpected initial songs');
 await p.getByRole('button',{name:'Nouveau track',exact:true}).click();
 await p.getByLabel('Titre du track', {exact:true}).fill('Démo RENAX');await p.getByLabel('Titre du track', {exact:true}).press('Tab');
 async function section(i,label,count,num,den,bpm){const c=p.locator('.song-section').nth(i);if(await c.locator('.song-block-header').getAttribute('aria-expanded')!=='true')await c.locator('.song-block-header').click();for(const [name,value]of [['Libellé',label],['Mesures',count],['Tempo (BPM)',bpm]]){const f=c.getByLabel(name,{exact:true});if(name==='Libellé'){await f.fill(String(value));await f.press('Tab');}else await f.evaluate((select,value)=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));},String(value));}await p.evaluate(([n,d])=>{activeNumeratorSel.value=n;activeNumeratorSel.dispatchEvent(new Event('change',{bubbles:true}));activeDenominatorSel.value=d;activeDenominatorSel.dispatchEvent(new Event('change',{bubbles:true}));},[num,den]);}
 await section(0,'Intro',4,4,4,97);await p.getByRole('button',{name:'+ Ajouter une section',exact:true}).click();await section(1,'Couplet 1',8,4,4,97);await p.getByRole('button',{name:'+ Ajouter une section',exact:true}).click();await section(2,'Refrain 1',8,5,4,120);
 await p.locator('.panel-seq').evaluate(e=>e.scrollTop=0);await p.screenshot({path:'outputs/morceau-structure.png'});
 await p.getByRole('button',{name:'Retour à la playlist',exact:true}).click();if(await p.getByLabel('Titre du track',{exact:true}).count())throw Error('Arrangement still visible in playlist');
 await p.reload();await p.waitForFunction(()=>window.RENAX_SONGS);await require('./audio-harness.cjs').openPlaylist(p);await p.locator('.song-playlist-card').filter({hasText:'Démo RENAX'}).first().dblclick();
 const timing=await p.evaluate(()=>{
  RENAX_SONGS.loadSong();const events=[],originalClick=playClick,originalVisual=scheduleVisualUpdate,originalTimer=window.setTimeout,oldCtx=audioCtx;
  const song=RENAX_SONGS.loaded;audioCtx={currentTime:0};currentBank='clic';isPlaying=true;playingMeasureIndex=0;currentStepInMeasure=0;nextNoteTime=0;scheduledMeasureLayouts=new WeakMap();
  playClick=(state,t)=>events.push({time:t,index:playingMeasureIndex,tempo:measures[playingMeasureIndex].tempo});scheduleVisualUpdate=()=>{};window.setTimeout=()=>0;
  for(let i=0;i<200;i++){audioCtx.currentTime=nextNoteTime; scheduler();if(playingMeasureIndex===0&&currentStepInMeasure===0&&events.length>1)break;}
  window.setTimeout=originalTimer;playClick=originalClick;scheduleVisualUpdate=originalVisual;audioCtx=oldCtx;isPlaying=false;
  const expected=[];let t=0;for(const section of song.song.sections)for(let bar=0;bar<section.count;bar++)for(let beat=0;beat<section.measure.numerator;beat++){expected.push(t);t+=60/section.measure.tempo*4/section.measure.denominator;}
  if(events.length!==expected.length)throw Error('Wrong number of song beats: '+events.length);
  const error=Math.max(...events.map((e,i)=>Math.abs(e.time-expected[i])));if(error>1e-9)throw Error('Song grid changed');RENAX_SONGS.unload();return {bars:song.total,beats:events.length,maxTimingErrorSeconds:error,durationSeconds:t};
 });
 const longSong=await p.evaluate(()=>{const s=RENAX_SONGS.library.profiles[0].songs[0];s.sections[0].count=1000000;RENAX_SONGS.loadSong();const n=measures.length,m=measures[999999];RENAX_SONGS.unload();s.sections[0].count=4;return {bars:n,lazyMeasure:m.numerator};});if(longSong.bars!==1000016)throw Error('Long song capped');
 await p.getByRole('button',{name:'Retour à la playlist',exact:true}).click();await require('./audio-harness.cjs').openTracks(p);await p.evaluate(()=>RENAX_SONGS.restoreNavigation({pane:'songs',view:'profile'}));await p.getByRole('button',{name:'Sauvegarde locale',exact:true}).click();const downloadPromise=p.waitForEvent('download');await p.getByRole('button',{name:'Exporter',exact:true}).click();const download=await downloadPromise;await download.saveAs('outputs/renax-morceaux-test.json');
 await p.locator('#profilePane input[type=file]').setInputFiles(await download.path());await p.getByRole('dialog').getByRole('button',{name:'Importer',exact:true}).click();await p.waitForFunction(()=>RENAX_SONGS.library.profiles.length===2);await require('./audio-harness.cjs').openPlaylist(p);await p.locator('.song-playlist-card').filter({hasText:'Démo RENAX'}).first().dblclick();
 await p.setViewportSize({width:390,height:740});if(await p.locator('#workspaceMobileViews [data-pane=seq]').isVisible())await p.locator('#workspaceMobileViews [data-pane=seq]').click();await p.screenshot({path:'outputs/morceau-mobile.png'});
 await p.getByRole('button',{name:'Retour à la playlist',exact:true}).click();await p.screenshot({path:'outputs/morceaux-playlist-mobile.png'});
 if(errors.length)throw Error(errors.join('\n'));
 save('songs-results.json',{timing,longSong,reload:true,playlistFirst:true,exportImport:true,errors});console.log({timing,longSong,reload:true,playlistFirst:true,exportImport:true});await r.browser.close();r.server?.close();
})().catch(e=>{console.error(e);process.exit(1)});
