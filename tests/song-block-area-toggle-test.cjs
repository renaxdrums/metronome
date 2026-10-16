const {start,save}=require('./audio-harness.cjs');const assert=require('assert');
(async()=>{const r=await start(),p=await r.browser.newPage({viewport:{width:1280,height:850}}),errors=[];p.on('pageerror',e=>errors.push(e.message));try{
 await p.goto(r.url);await p.waitForFunction(()=>allVoiceAudioReady&&window.RENAX_SONGS);await require('./audio-harness.cjs').openPlaylist(p);await p.getByRole('button',{name:'Nouveau track',exact:true}).click();await p.getByRole('button',{name:'+ Ajouter une section',exact:true}).click();
 const cards=p.locator('#songPane [data-section-id]'),card=cards.nth(1);const opened=()=>card.locator('.song-block-header').getAttribute('aria-expanded');
 for(const selector of ['.song-block-summary','.measure-preview','.song-block-controls']){
  assert.strictEqual(await opened(),'true');
  const target=card.locator(selector);await target.scrollIntoViewIfNeeded();const bounds=await target.boundingBox();await p.mouse.click(bounds.x+bounds.width-2,bounds.y+bounds.height/2);
  assert.strictEqual(await opened(),'false',selector+' did not collapse');assert(!await card.getByLabel('Libellé',{exact:true}).isVisible());
  await card.locator('.song-block-header').click();assert.strictEqual(await opened(),'true');
 }
 await card.getByLabel('Libellé',{exact:true}).click();assert.strictEqual(await opened(),'true');
 const row=card.getByLabel('Tempo (BPM)',{exact:true});await row.locator('..').locator('.numbox-button').click();assert.strictEqual(await opened(),'true');await p.keyboard.press('Escape');
 await card.locator('.song-block-header').click();assert.strictEqual(await opened(),'false');await card.locator('.song-block-header').click();assert.strictEqual(await opened(),'true');
 const before=await p.evaluate(()=>JSON.stringify(RENAX_SONGS.library));await p.getByRole('button',{name:'Lire le track',exact:true}).click();await p.waitForFunction(()=>isPlaying);
 const ctx=await p.evaluate(()=>{window.blockToggleCtx=audioCtx;return true;});await card.locator('.song-block-header').click();assert.strictEqual(await opened(),'false');assert(await p.evaluate(()=>isPlaying&&audioCtx===blockToggleCtx));assert.strictEqual(await p.evaluate(()=>JSON.stringify(RENAX_SONGS.library)),before);await p.locator('#playBtn').click();
 await p.setViewportSize({width:390,height:844});if(await p.locator('#workspaceMobileViews [data-pane=seq]').isVisible())await p.locator('#workspaceMobileViews [data-pane=seq]').click();await card.locator('.song-block-header').click();assert.strictEqual(await opened(),'true');await card.locator('.measure-preview').click({position:{x:2,y:2}});assert.strictEqual(await opened(),'false');assert.deepStrictEqual(errors,[]);
 const result={summary:true,preview:true,actionsFreeSpace:true,parameterSideSpace:true,fieldsAndNumboxPreserved:true,titleTogglePreserved:true,playbackNotStopped:true,libraryUnchanged:true,mobile:true,errors};save('song-block-area-toggle-results.json',result);console.log(result);
}finally{await r.browser.close();r.server?.close();}})().catch(e=>{console.error(e);process.exit(1)});
