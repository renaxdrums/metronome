'use strict';
const assert=require('node:assert/strict');
const {start}=require('./audio-harness.cjs');
(async()=>{
 const h=await start(),errors=[];
 try{
  for(const width of [390,1440]){
   const page=await h.browser.newPage({viewport:{width,height:844}});
   page.on('pageerror',error=>errors.push(error.message));
   const requests=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/audio-lab/'))requests.push(request.url());});
   await page.goto(h.url);await page.waitForFunction(()=>window.RENAX_WORKSPACE?.current==='metronome');
   assert.equal(await page.locator('#workspaceNav [data-workspace]').count(),6);
   assert.equal(await page.locator('#workspaceNav [data-workspace="audio-lab"]').count(),0);
   assert.equal(await page.locator('#audioLabRoot').count(),0);
   assert.equal(await page.locator('link[href*="audio-lab/"],script[src*="audio-lab/"]').count(),0);
   await page.evaluate(()=>window.RENAX_WORKSPACE.go('audio-lab'));
   assert.equal(await page.evaluate(()=>window.RENAX_WORKSPACE.current),'metronome');
   await page.locator('#workspaceNav [data-workspace="polyrhythm"]').click();
   await page.waitForFunction(()=>window.RENAX_WORKSPACE.current==='polyrhythm');
   await page.locator('#workspaceNav [data-workspace="metronome"]').click();
   await page.waitForFunction(()=>window.RENAX_WORKSPACE.current==='metronome');
   assert.deepEqual(requests,[],'Audio Lab assets must not load in the metronome');
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS Audio Lab detached from metronome, six navigable workspaces, zero Audio Lab requests');
 }finally{await h.browser.close();h.server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
