'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {start,save}=require('./audio-harness.cjs');
(async()=>{
  const runner=await start(),results={};
  const screenshots=path.resolve(process.env.TEST_OUTPUT_DIR||'outputs');
  fs.mkdirSync(screenshots,{recursive:true});
  try{
    for(const theme of ['dark','light','ivory']){
      const page=await runner.browser.newPage({viewport:{width:1280,height:850}});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(value=>localStorage.setItem('renax-appearance',value),theme);
      await page.goto(runner.url);
      await page.waitForFunction(()=>window.RENAX_SONGS&&typeof createMeasure==='function');
      await page.evaluate(()=>{
        const make=id=>({id,name:id,sections:[{id:'section-'+id,label:'Intro',count:1,measure:createMeasure(4,4,120)}]});
        RENAX_SONGS.replaceLibrary({version:1,activeProfile:'empty',profiles:[
          {id:'empty',name:'Empty',songs:[]},
          {id:'set1',name:'Set 1',songs:[make('Track A'),make('Track B')]},
          {id:'set2',name:'Set 2',songs:[make('Track C')]}
        ]});
      });
      await page.getByRole('tab',{name:'Track',exact:true}).click();
      assert.equal(await page.locator('#playBtn').getAttribute('data-song-transport'),'true');
      await page.locator('#playBtn').click();
      await page.waitForFunction(()=>isPlaying&&RENAX_SONGS.navigation.view==='playlist',{timeout:12000});
      let state=await page.evaluate(()=>RENAX_SONGS.navigation);
      assert.equal(state.profile,'set1','Start with first nonempty playlist');
      assert.equal(state.song,'Track A','Start with first available track');
      const toggle=page.locator('#songPane .song-chain-toggle');
      assert.equal(await toggle.getAttribute('aria-pressed'),'false','Chain off by default');
      assert.equal(await page.locator('.song-playlist-card.playing').count(),1);
      await page.waitForFunction(()=>!isPlaying,{timeout:9000});
      state=await page.evaluate(()=>RENAX_SONGS.navigation);
      assert.equal(state.song,'Track A','Single-song playback must stop');
      await page.locator('.song-playlist-card').nth(1).locator('.song-open').click();
      await page.locator('#playBtn').click();
      await page.waitForFunction(()=>isPlaying&&RENAX_SONGS.navigation.song==='Track B',{timeout:12000});
      await page.waitForFunction(()=>!isPlaying,{timeout:9000});
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-pressed'),'true');
      const active=await toggle.evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopColor,width:el.getBoundingClientRect().width}));
      assert(active.width>=35);
      await page.locator('.song-playlist-card').first().locator('.song-open').click();
      await page.screenshot({path:path.join(screenshots,'track-chain-'+theme+'-desktop.png')});
      await page.locator('#playBtn').click();
      await page.waitForFunction(()=>RENAX_SONGS.navigation.song==='Track B'&&isPlaying,{timeout:12000});
      await page.waitForFunction(()=>!isPlaying,{timeout:9000});
      assert.equal((await page.evaluate(()=>RENAX_SONGS.navigation)).profile,'set1','Never chain to a different playlist');
      await page.getByRole('button',{name:'Retour aux playlists',exact:true}).click();
      await page.getByRole('button',{name:'Ouvrir la playlist Set 1',exact:true}).click();
      assert.equal(await toggle.getAttribute('aria-pressed'),'true','Remember toggle only during this page session');
      await page.evaluate(()=>RENAX_SONGS.flushPending());
      await page.reload();
      await page.waitForFunction(()=>window.RENAX_SONGS);
      await page.getByRole('tab',{name:'Track',exact:true}).click();
      if((await page.evaluate(()=>RENAX_SONGS.navigation)).view==='home')
        await page.getByRole('button',{name:'Playlist',exact:true}).click();
      if((await page.evaluate(()=>RENAX_SONGS.navigation)).view==='playlists')
        await page.getByRole('button',{name:'Ouvrir la playlist Set 1',exact:true}).click();
      assert.equal(await toggle.getAttribute('aria-pressed'),'false','Reset chain toggle after reloading');
      await page.setViewportSize({width:390,height:740});
      const mobileTab=page.locator('#workspaceMobileViews [data-pane=seq]');
      if(await mobileTab.isVisible())await mobileTab.click();
      assert(await toggle.isVisible(),'Toggle must be accessible on mobile');
      const overflow=await page.locator('.panel-seq').evaluate(el=>el.scrollWidth-el.clientWidth);
      assert(overflow<=1,'Mobile Track panel overflows: '+overflow);
      await page.screenshot({path:path.join(screenshots,'track-chain-'+theme+'-mobile.png')});
      assert.equal(errors.length,0,errors.join('; '));
      results[theme]={firstAvailable:true,isolatedPlayback:true,manualSelection:true,playlistOnlyChain:true,sessionReset:true,active,phoneOverflow:overflow};
      await page.close();
    }
  }finally{await runner.browser.close();runner.server?.close();}
  save('track-playlist-chain-results.json',results);console.log(results);
})().catch(error=>{console.error(error);process.exit(1)});
