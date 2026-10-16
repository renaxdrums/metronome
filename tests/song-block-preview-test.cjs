const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start,save}=require('./audio-harness.cjs');
(async()=>{const h=await start();try{
 const p=await h.browser.newPage({viewport:{width:1280,height:850}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(h.url);await p.waitForFunction(()=>allVoiceAudioReady&&window.RENAX_SONGS);
 await require('./audio-harness.cjs').openPlaylist(p);await p.getByRole('button',{name:'Nouveau track',exact:true}).click();
 assert.equal(await p.locator('#songPane > .song-actions > button').filter({hasText:'Dupliquer'}).count(),0);
 await p.evaluate(()=>{
  const lib=JSON.parse(JSON.stringify(RENAX_SONGS.library)),s=lib.profiles[0].songs[0];
  const middle=createMeasure(3,8,300);middle.beatSubdivisions=[2,1,3];middle.beatStates=[[3,0],[2],[1,1,1]];
  s.sections=[{id:'a',label:'Intro',count:1,measure:createMeasure(2,4,300)},{id:'b',label:'Couplet 2',count:2,measure:middle},{id:'c',label:'Final',count:1,measure:createMeasure(4,4,300)}];
  s.countIn={count:1,numerator:2,denominator:4};RENAX_SONGS.replaceLibrary(lib,true);
  window.beforePreview=JSON.stringify(RENAX_SONGS.library);window.previewClicks=[];window.previewCounts=[];
  const click=playClick,count=playCountIn;
  playClick=(state,time,first,context)=>{previewClicks.push({state,time,bar:playingMeasureIndex,beat:context.beatNumber,sub:context.subIndex,section:RENAX_SONGS.locate(playingMeasureIndex)?.section.id});click(state,time,first,context);};
  playCountIn=(time,first)=>{previewCounts.push({time,first});count(time,first);};
 });
 const button=p.getByRole('button',{name:'Écouter uniquement le bloc Couplet 2',exact:true});
 await button.click();await p.waitForFunction(()=>isPlaying);await p.waitForFunction(()=>!isPlaying,{timeout:5000});
 const preview=await p.evaluate(()=>({clicks:previewClicks,counts:previewCounts,preserved:beforePreview===JSON.stringify(RENAX_SONGS.library)}));
 assert.equal(preview.clicks.length,10);assert.equal(preview.counts.length,0);assert(preview.clicks.every(c=>c.section==='b'));assert(preview.preserved);
 const times=[0,.1,.2,.2+1/30,.2+2/30,.3,.4,.5,.5+1/30,.5+2/30];
 preview.clicks.forEach((c,i)=>assert(Math.abs(c.time-preview.clicks[0].time-times[i])<1e-8));
 await p.evaluate(()=>{previewClicks=[];previewCounts=[];});
 await p.getByRole('button',{name:'Lire le track',exact:true}).click();await p.waitForFunction(()=>isPlaying);await p.waitForFunction(()=>!isPlaying,{timeout:5000});
 const whole=await p.evaluate(()=>({sections:[...new Set(previewClicks.map(c=>c.section))],countIn:previewCounts.length,clicks:previewClicks.length,preserved:beforePreview===JSON.stringify(RENAX_SONGS.library)}));
 assert.deepEqual(whole.sections,['a','b','c']);assert.equal(whole.countIn,2);assert(whole.preserved);
 await button.click();await p.waitForFunction(()=>isPlaying);await p.locator('#playBtn').click();await p.waitForFunction(()=>!isPlaying);
 await p.getByRole('button',{name:'Écouter uniquement le bloc Intro',exact:true}).click();await p.waitForFunction(()=>isPlaying);
 await button.click();await p.waitForFunction(()=>isPlaying&&RENAX_SONGS.loaded.preview&&RENAX_SONGS.loaded.song.sections[0].id==='b');await p.waitForFunction(()=>!isPlaying,{timeout:5000});
 await p.setViewportSize({width:390,height:844});if(await p.locator('#workspaceMobileViews [data-pane=seq]').isVisible())await p.locator('#workspaceMobileViews [data-pane=seq]').click();
 await p.locator('[data-section-id="b"] .song-block-header').click();
 // If preview left this block open, the first click folds it; ensure expanded.
 if(await p.locator('[data-section-id="b"] .song-block-header').getAttribute('aria-expanded')==='false')await p.locator('[data-section-id="b"] .song-block-header').click();
 const alignment=await p.locator('[data-section-id="b"]').evaluate(card=>{
  const boxes=[...card.querySelectorAll('.song-inline-field .numbox-button')].map(e=>e.getBoundingClientRect());
  return {rightDifference:Math.abs(boxes[0].right-boxes[1].right),tempoUnits:card.querySelectorAll('.song-inline-field .measure-tempo-unit').length,playButtons:card.querySelectorAll('.song-block-play').length};
 });
 assert(alignment.rightDifference<1);assert.equal(alignment.tempoUnits,0);assert.equal(alignment.playButtons,1);
 await p.locator('[data-section-id="b"]').screenshot({path:path.join(__dirname,'../outputs/block-preview-mobile.png')});
 await p.locator('[data-section-id="b"] .song-more:not(.song-block-play)').click();assert(await p.locator('[data-section-id="b"] .song-more-menu').isVisible());
 await p.keyboard.press('Escape');assert.deepEqual(errors,[]);
 await p.getByRole('button',{name:'Retour à la playlist',exact:true}).click();
 await p.locator('.song-playlist-card .song-more[aria-haspopup=menu]').first().click();
 await p.getByRole('menuitem',{name:'Dupliquer',exact:true}).click();
 assert.equal(await p.locator('.song-open').count(),2);
 const report={preview,whole,manualStop:true,switchBlock:true,alignment,duplicateButtonRemoved:true,duplicateMenuWorks:true,errors};save('song-block-preview-results.json',report);console.log(report);
}finally{await h.browser.close();h.server?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
