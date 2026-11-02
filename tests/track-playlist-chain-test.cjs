'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {start,save}=require('./audio-harness.cjs');
(async()=>{
  const runner=await start(),results={};
  const screenshots=path.resolve(process.env.TEST_OUTPUT_DIR||'outputs');
  fs.mkdirSync(screenshots,{recursive:true});
  try{
    for(const theme of ['dark','light','ivory','avant']){
      const page=await runner.browser.newPage({viewport:{width:1280,height:850}});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(value=>localStorage.setItem('renax-appearance',value),theme);
      await page.goto(runner.url);
      await page.waitForFunction(()=>window.RENAX_SONGS&&typeof createMeasure==='function');
      await page.evaluate(()=>{
        const make=id=>({id,name:id,sections:[{id:'section-'+id,label:'Intro',count:1,measure:createMeasure(4,4,id==='Track B'?180:120)}]});
        RENAX_SONGS.replaceLibrary({version:1,activeProfile:'empty',profiles:[
          {id:'empty',name:'Empty',songs:[]},
          {id:'set1',name:'Set 1',songs:[make('Track A'),make('Track B')]},
          {id:'set2',name:'Set 2',songs:[make('Track C')]}
        ]});
      });
      await page.getByRole('tab',{name:'Track',exact:true}).click();
      await page.locator('#playBtn').click();
      await page.waitForFunction(()=>isPlaying&&RENAX_SONGS.navigation.view==='playlist',{timeout:12000});
      assert.equal((await page.evaluate(()=>RENAX_SONGS.navigation)).song,'Track A');
      assert.equal(await page.locator('#songPane .playlist-heading .song-chain-toggle').count(),0,'Global toggle removed');
      await page.waitForFunction(()=>!isPlaying,{timeout:9000});
      assert.equal((await page.evaluate(()=>RENAX_SONGS.navigation)).song,'Track A','Chaining off by default');
      await page.locator('.song-playlist-card').first().dblclick();
      await page.waitForFunction(()=>RENAX_SONGS.navigation.view==='detail');
      let toggle=page.locator('#songPane .song-next-toggle');
      assert.equal(await toggle.getAttribute('aria-pressed'),'false');
      assert.equal(await page.locator('#songPane .song-detail-toolbar > button').count()>=4,true);
      await toggle.click();
      toggle=page.locator('#songPane .song-next-toggle');
      assert.equal(await toggle.getAttribute('aria-pressed'),'true');
      let saved=await page.evaluate(()=>RENAX_SONGS.library.profiles.find(p=>p.id==='set1').songs.map(s=>s.chainNext===true));
      assert.deepEqual(saved,[true,false],'Only Track A chains');
      await page.evaluate(()=>{
         window.__chainEvents=[];
         const original=playClick;
         playClick=function(state,time,_first,_context){
           window.__chainEvents.push({song:RENAX_SONGS.loaded?.song.id,time,state});
           return original.apply(this,arguments);
         };
       });
       await page.locator('#playBtn').click();
       await page.waitForFunction(()=>RENAX_SONGS.navigation.view==='playlist'&&RENAX_SONGS.navigation.song==='Track B'&&isPlaying,{timeout:12000});
       // Navigation changes in scheduler look-ahead; the cards render at the audible boundary.
       // Wait for that DOM update rather than asserting immediately after the model switches.
       await page.locator('#songPane .song-playlist-card').first().locator('.song-chain-indicator').waitFor({state:'attached',timeout:5000});
       assert.equal(await page.locator('.song-playlist-card').first().locator('.song-chain-indicator').count(),1,'Enabled song shows a passive arrow');
       assert.equal(await page.locator('.song-playlist-card').nth(1).locator('.song-chain-indicator').count(),0,'Disabled song stays unmarked');
       await page.waitForFunction(()=>!isPlaying,{timeout:9000});
       const events=await page.evaluate(()=>window.__chainEvents);
       assert.equal(events.length,8,'Two 4/4 songs should schedule eight beats without stopping between songs');
       assert.deepEqual(events.map(x=>x.song),[...Array(4).fill('Track A'),...Array(4).fill('Track B')]);
       const intervals=events.slice(1).map((e,i)=>e.time-events[i].time);
       for(let i=0;i<4;i++)assert(Math.abs(intervals[i]-.5)<1e-6,'First tempo and transition must remain at 120 BPM');
       for(let i=4;i<7;i++)assert(Math.abs(intervals[i]-1/3)<1e-6,'Second song must begin at 180 BPM with no gap');
      assert.equal((await page.evaluate(()=>RENAX_SONGS.navigation)).profile,'set1','No cross-playlist jump');
      await page.locator('.song-playlist-card').nth(1).dblclick();
      await page.waitForFunction(()=>RENAX_SONGS.navigation.view==='detail');
      toggle=page.locator('#songPane .song-next-toggle');
      assert.equal(await toggle.getAttribute('aria-pressed'),'false','Track B independent of Track A');
      await toggle.click();
      assert.equal(await page.locator('#songPane .song-next-toggle').getAttribute('aria-pressed'),'true');
      await page.locator('#playBtn').click();
      await page.waitForFunction(()=>isPlaying,{timeout:12000});
      await page.waitForFunction(()=>!isPlaying,{timeout:12000});
      assert.equal((await page.evaluate(()=>RENAX_SONGS.navigation)).profile,'set1','Final track never chains into next playlist');
      await page.evaluate(()=>RENAX_SONGS.flushPending());
      await page.reload();
      await page.waitForFunction(()=>window.RENAX_SONGS);
      saved=await page.evaluate(()=>RENAX_SONGS.library.profiles.find(p=>p.id==='set1').songs.map(s=>s.chainNext===true));
      assert.deepEqual(saved,[true,true],'Per-track chaining persists after reload');
      const invalid=await page.evaluate(()=>{const model=JSON.parse(JSON.stringify(RENAX_SONGS.library));model.profiles.find(p=>p.id==='set1').songs[0].chainNext='yes';try{RENAX_SONGS.validateLibrary(model);return false}catch{return true}});
      assert(invalid,'Invalid chaining flag rejected');
      await page.evaluate(()=>RENAX_SONGS.restoreNavigation({pane:'songs',view:'playlist',profile:'set1',song:'Track A',section:null}));
      await page.locator('#songPane .song-playlist-card').first().dblclick();
      await page.waitForFunction(()=>RENAX_SONGS.navigation.view==='detail');
      await page.setViewportSize({width:390,height:740});
      const mobileTab=page.locator('#workspaceMobileViews [data-pane=seq]');
      if(await mobileTab.isVisible())await mobileTab.click();
      assert(await page.locator('#songPane .song-next-toggle').isVisible(),'Track toggle accessible on mobile');
      const overflow=await page.locator('.panel-seq').evaluate(el=>el.scrollWidth-el.clientWidth);
      assert(overflow<=1,'Mobile Track panel overflows: '+overflow);
      await page.screenshot({path:path.join(screenshots,'track-chain-'+theme+'-mobile.png')});
      await page.evaluate(()=>RENAX_SONGS.replaceLibrary({version:1,activeProfile:'empty',profiles:[{id:'empty',name:'Empty',songs:[]}]}));
      await page.locator('#playBtn').waitFor({state:'hidden',timeout:5000});
      assert.equal(errors.length,0,errors.join('; '));
      results[theme]={defaultOff:true,independentPerSong:true,chainToNext:true,lastStops:true,persists:true,mobileOverflow:overflow};
      await page.close();
    }
  }finally{await runner.browser.close();runner.server?.close();}
  save('track-playlist-chain-results.json',results);console.log(results);
})().catch(error=>{console.error(error);process.exit(1)});
