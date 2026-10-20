const assert=require('node:assert/strict');const {start,save}=require('./audio-harness.cjs');
(async()=>{const h=await start({intro:true}),runs=[];try{await checkMirrorColors(h);for(const [width,height]of [[1440,1000],[390,844],[667,320]]){const p=await h.browser.newPage({viewport:{width,height},hasTouch:width<1100}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(h.url);await p.waitForFunction(()=>document.querySelector('#renaxArrival').dataset.introReady==='true');assert(await p.locator('.console-arrival-replica').evaluate(e=>e.inert&&e.getAttribute('aria-hidden')==='true'));assert(await p.evaluate(()=>[...document.querySelectorAll('.console-arrival-replica [id]')].every(e=>!document.getElementById(e.id).closest('.console-arrival-replica'))));await p.keyboard.press('Space');await p.waitForFunction(()=>isPlaying);await p.evaluate(()=>window.qaIntroAudio=audioCtx);await p.setViewportSize({width:height,height:width});await p.waitForFunction(()=>document.getElementById('renaxArrival').hidden,null,{timeout:12000});assert.equal(await p.locator('.console-arrival-replica').count(),0);assert.equal(await p.locator('#playBtn').count(),1);assert(await p.evaluate(()=>isPlaying&&audioCtx===qaIntroAudio));await p.locator('#playBtn').click();await p.waitForFunction(()=>!isPlaying);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);runs.push({width,height,nativeIdsPreserved:true,inertVisualReplica:true,resize:true,animationReleased:true,playbackPreserved:true,errors});await p.close();console.log('PASS intro, resize and audio '+width+'x'+height);}const p=await h.browser.newPage({reducedMotion:'reduce'});await p.goto(h.url);await p.waitForFunction(()=>document.getElementById('renaxArrival').hidden);assert.equal(await p.locator('.console-arrival-replica').count(),0);await p.close();save('intro-lifecycle-results.json',{runs,reducedMotion:true});}finally{await h.browser.close();h.server?.close()}})().catch(e=>{console.error(e);process.exitCode=1});


async function mirrorColors(page) {
 return page.evaluate(()=>{
  const selectors=['header .brand p span:first-child','header .brand p span:last-child','header .title-orange','#bpmDisplay','#bpmDisplay>span','#workspaceTempoShortcut strong','#trainTimer'];
  return selectors.map(selector=>{
   const original=document.querySelector(selector),copy=document.querySelector('.console-arrival-replica '+selector);
   const paint=node=>{const style=getComputedStyle(node);return {color:style.color,fill:style.webkitTextFillColor,stroke:style.webkitTextStrokeColor};};
   return {selector,original:paint(original),copy:paint(copy)};
  });
 });
}
async function checkMirrorColors(h) {
 const old=require('node:child_process').execFileSync('git',['show','19a02eb8d5e3ac63f9e2ae15dc59c426533352c3:console-intro.js'],{encoding:'utf8'});
 const before=await h.browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 try {
  await before.route('**/console-intro.js*',route=>route.fulfill({contentType:'text/javascript',body:old}));
  await before.goto(h.url);await before.waitForFunction(()=>document.getElementById('renaxArrival').dataset.introReady==='true');
  const colors=await mirrorColors(before);
  assert(colors.some(item=>item.original.fill!==item.copy.fill),'The old replica must reproduce the inherited text-fill mismatch');
  save('sound-menu-intro-colors-negative.json',colors);
 }finally{await before.close();}
 const results=[];
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:834,height:1112},{width:1440,height:900}]){
  for(const theme of ['dark','light','ivory']){
   const page=await h.browser.newPage({viewport,hasTouch:viewport.width<=1100}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   try {
    await page.addInitScript(value=>localStorage.setItem('renax-appearance',value),theme);
    await page.goto(h.url);await page.waitForFunction(()=>document.getElementById('renaxArrival').dataset.introReady==='true');
    const initial=await mirrorColors(page);
    for(const item of initial)assert.deepEqual(item.copy,item.original,JSON.stringify({viewport,theme,stage:'prepared',...item}));
    await page.waitForFunction(()=>document.querySelector('.console-arrival-replica')?.getAnimations().length>0);
    // Inspect the visible lower scene during the camera move, before revealing the real UI.
    await page.evaluate(()=>{for(const node of document.querySelectorAll('#renaxArrival,.console-arrival-replica,.console-arrival-curtain'))for(const animation of node.getAnimations()){animation.pause();animation.currentTime=2300;}});
    const moving=await mirrorColors(page);
    for(const item of moving)assert.deepEqual(item.copy,item.original,JSON.stringify({viewport,theme,stage:'camera',...item}));
    await page.screenshot({path:require('node:path').join(process.env.TEST_OUTPUT_DIR||require('node:path').join(__dirname,'results'),['sound-menu-intro-colors',viewport.width,viewport.height,theme].join('-')+'.png')});
    assert.deepEqual(errors,[]);
    results.push({viewport,theme,colors:moving,preparedAndMoving:true,errors});
   }finally{await page.close();}
  }
 }
 save('sound-menu-intro-colors-results.json',{results,negativeControl:true});
 console.log('PASS 12 intro mirror color/fill/stroke states and old white-fill negative control');
}
