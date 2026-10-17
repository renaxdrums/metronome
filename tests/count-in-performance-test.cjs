const assert=require('assert');
const {start,save}=require('./audio-harness.cjs');
(async()=>{
 const r=await start(),p=await r.browser.newPage({viewport:{width:390,height:844}});
 try {
  await p.goto(r.url);await p.evaluate(()=>prepareAllVoiceAudio());await p.waitForFunction(()=>allVoiceAudioReady&&window.RENAX_SONGS);
  await p.evaluate(()=>{
   const s={id:'count-test',name:'Décompte test',sections:[{id:'a',label:'Intro',count:2,measure:createMeasure(4,4,120)},{id:'b',label:'Refrain',count:2,measure:createMeasure(4,4,180)}]};
   RENAX_SONGS.library.profiles[0].songs.push(s);RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',song:s.id,profile:RENAX_SONGS.library.profiles[0].id});
   switchTab('seq');window.countMetrics={rebuilds:0,longTasks:[],ms:0};
   // Count menu rebuild mutations, including duplicate option work in the observer.
   new MutationObserver(rs=>{countMetrics.rebuilds+=rs.filter(r=>r.target.nodeType===1&&r.target.matches('.numbox-menu')).length;}).observe(document.getElementById('songPane'),{childList:true,subtree:true});
   new PerformanceObserver(es=>countMetrics.longTasks.push(...es.getEntries().map(e=>e.duration))).observe({type:'longtask'});
  });
  await require('./audio-harness.cjs').openTracks(p);await p.waitForTimeout(150);await p.evaluate(()=>{countMetrics.rebuilds=0;countMetrics.longTasks=[];const t=performance.now();document.querySelector('.song-count-in-button').click();countMetrics.ms=performance.now()-t;});
  await p.waitForTimeout(200);const metrics=await p.evaluate(()=>countMetrics);
  assert(metrics.rebuilds<3000,'Repeated menu rebuilds: '+metrics.rebuilds);assert(metrics.ms<200,'Count-in handler too slow: '+metrics.ms);
  assert(metrics.longTasks.every(ms=>ms<200),'UI blocked: '+metrics.longTasks);
  await p.locator('[data-section-id="a"] .song-block-header').click();await p.locator('[data-section-id="a"] .numbox-button[aria-label^="Tempo"]').click();await p.keyboard.press('Escape');await p.locator('[data-section-id="a"] select[aria-label="Tempo (BPM)"]').selectOption('135',{force:true});
  assert((await p.locator('.song-count-in-tempo').textContent()).startsWith('135 BPM'));
  await require('./audio-harness.cjs').showMeasures(p);
  // Reorder through the actual drag handler, rather than changing the test data.
  await p.locator('[data-section-id="a"] .song-block-header').click();
  const a=await p.locator('[data-section-id="a"]').boundingBox(),b=await p.locator('[data-section-id="b"]').boundingBox();
  await p.mouse.move(a.x+40,a.y+18);await p.mouse.down();await p.waitForTimeout(280);
  await p.mouse.move(b.x+40,b.y+b.height-4,{steps:8});await p.mouse.up();await p.waitForTimeout(180);
  assert.equal(await p.evaluate(()=>RENAX_SONGS.library.profiles[0].songs.find(s=>s.id==='count-test').sections[0].id),'b');
  assert((await p.locator('.song-count-in-tempo').textContent()).startsWith('180 BPM'));
  assert.equal(await p.evaluate(()=>{RENAX_SONGS.loadSong();return RENAX_SONGS.loaded.song.sections[0].measure.tempo;}),180);
  await p.locator('[data-section-id="a"] .song-block-header').click();
  await p.locator('[data-section-id="a"] .numbox-button[aria-label^="Tempo"]').click();await p.locator('.numbox-custom.open .numbox-option[data-value="150"]').click();
  assert((await p.locator('.song-count-in-tempo').textContent()).startsWith('180 BPM'));
  await p.waitForTimeout(100);const settled=await p.evaluate(()=>countMetrics.rebuilds);await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>countMetrics.rebuilds),settled,'Menus rebuilt while idle');
  await p.evaluate(()=>{
   window.countEvents=[];const click=playClick,count=playCountIn;
   playClick=(state,time,first,c)=>{countEvents.push({type:'beat',time});return click(state,time,first,c);};
   playCountIn=(time,first)=>{countEvents.push({type:'count',time});return count(time,first);};
  });
  await p.getByRole('button',{name:'Lire le track',exact:true}).click();await p.waitForFunction(()=>isPlaying);
  await p.waitForFunction(()=>!isPlaying,null,{timeout:15000});
  const events=await p.evaluate(()=>countEvents);assert.equal(events.filter(e=>e.type==='count').length,4);assert.equal(events.filter(e=>e.type==='beat').length,16);
  assert(events.slice(0,4).every(e=>e.type==='count'));for(let i=1;i<5;i++)assert(Math.abs(events[i].time-events[i-1].time-60/180)<1e-8,'Count-in timing changed');
  save('count-in-performance-results.json' ,{...metrics,tempoFollowsFirst:true,reorderFollowsFirst:true,nextBlockEditable:true,idleRebuilds:0,playbackStopsAtEnd:true,countInEvents:4,songEvents:16});console.log({ ...metrics,tempoFollowsFirst:true,reorderFollowsFirst:true,idleRebuilds:0 });
 } finally {await r.browser.close();r.server?.close();}
})().catch(e=>{console.error(e);process.exit(1)});
