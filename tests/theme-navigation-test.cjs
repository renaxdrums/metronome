'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {start,save,showMeasures}=require('./audio-harness.cjs');

(async()=>{
 const h=await start(),results=[],out=path.join(process.env.TEST_OUTPUT_DIR||'tests/results','theme-audit');
 fs.mkdirSync(out,{recursive:true});
 try{
  for(const [width,height] of [[320,844],[390,844],[390,600],[834,1112],[1440,1000]]){
   const p=await h.browser.newPage({viewport:{width,height},hasTouch:width<=1100,reducedMotion:'reduce'}),errors=[];
   p.on('pageerror',e=>errors.push(e.message));
   await p.goto(h.url);await p.waitForFunction(()=>window.RENAX_WORKSPACE&&window.RENAX_SONGS&&window.RENAX_DIALOGS);
   for(const theme of ['dark','light','ivory','avant']){
    await p.locator('#index2SettingsBtn').click();
    await p.locator('[data-appearance='+theme+']').click();
    assert.equal(await p.locator('#index2SettingsPanel').getAttribute('aria-modal'),'false');
    assert.equal(await p.locator('[data-appearance=avant]').textContent(),'Citron');
    // A single physical click both closes preferences and opens the requested workspace.
    for(const workspace of ['metronome','polyrhythm','training','sequence','multi','tracks']){
     if(await p.locator('#index2SettingsBtn').getAttribute('aria-expanded')==='false')await p.locator('#index2SettingsBtn').click();
     const button=p.locator('#workspaceNav [data-workspace='+workspace+']');
     assert.equal(await button.evaluate(e=>!!e.closest('[inert]')),false);
     await button.click();
     await p.waitForFunction(workspace=>RENAX_WORKSPACE.current===workspace&&document.getElementById('index2SettingsBtn').getAttribute('aria-expanded')==='false',workspace);
     assert.equal(await p.locator('#index2SettingsPanel').evaluate(e=>e.classList.contains('open')||e.classList.contains('mobile-active')),false);
     assert.equal(await button.getAttribute('aria-selected'),'true');
     await p.mouse.move(0,0);
     await p.evaluate(()=>document.fonts.ready);
     const layout=await p.evaluate(()=>{
      const nav=document.getElementById('workspaceNav'),style=getComputedStyle(nav),brand=document.querySelector('body>header .brand h1');
      return {gap:style.gap,navBackground:style.backgroundColor,header:brand.innerText,waveOpacity:getComputedStyle(document.getElementById('renaxHeaderWave')).opacity,overflow:document.documentElement.scrollWidth>innerWidth,
       tabs:[...nav.children].map(e=>{const b=e.getBoundingClientRect();return {name:e.textContent,x:b.x,y:b.y,width:b.width,height:b.height};})};
     });
     if(width<=1100)assert.equal(layout.gap,'5px',theme+' mobile spacing');
     assert.equal(layout.overflow,false,theme+' '+workspace+' horizontal overflow');
     assert.equal(layout.header.replace(/\s/g,'').toLowerCase(),width<=1100?'métronome':'renaxdrums');
     if(theme==='avant'&&width<=1100)assert.equal(layout.navBackground,'rgb(234, 233, 224)');
     if(theme==='avant')assert.equal(layout.waveOpacity,'0.85');
     results.push({width,height,theme,workspace,...layout});
     if(height!==600)await p.screenshot({path:path.join(out,[theme,width,workspace].join('-')+'.png'),animations:'disabled'});
    }
    // Native confirmation dialogs remain modal and clicks inside them do not close settings.
    await p.locator('#index2SettingsBtn').click();
    await p.evaluate(()=>{window.__themeConfirm=RENAX_DIALOGS.confirm({messageKey:'cloud.cancel'});});
    assert.equal(await p.locator('#renaxCloudConfirm').evaluate(e=>e.matches(':modal')),true);
    await p.locator('#renaxCloudConfirm button').first().click();
    assert.equal(await p.locator('#index2SettingsBtn').getAttribute('aria-expanded'),'true');
    await p.locator('#index2SettingsClose').press('Escape');
    await p.waitForFunction(()=>document.getElementById('index2SettingsBtn').getAttribute('aria-expanded')==='false');
    // Keyboard activation follows exactly the same navigation path.
    await p.locator('#index2SettingsBtn').click();
    await p.locator('#workspaceNav [data-workspace=metronome]').focus();
    await p.keyboard.press('Enter');
    assert.equal(await p.locator('#index2SettingsBtn').getAttribute('aria-expanded'),'false');
    assert.equal(await p.evaluate(()=>RENAX_WORKSPACE.current),'metronome');
   }
   assert.deepEqual(errors,[]);await p.close();
  }
  const p=await h.browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'no-preference'});
  await p.goto(h.url);await p.waitForFunction(()=>window.RENAX_WORKSPACE&&window.RENAX_SONGS);
  await p.evaluate(()=>{
   document.documentElement.dataset.theme='avant';
   const measure=createMeasure(4,4,120);measure.beatStates=[[1,0],[2,0],[3,0],[0,0]];
   RENAX_SONGS.replaceLibrary({version:1,activeProfile:'p',profiles:[{id:'p',name:'Test',songs:[{id:'s',name:'Tempos',sections:[{id:'a',label:'Bloc',count:5,measure,tempoRamp:{enabled:true,endTempo:180,curve:'linear-up'}}]}]}]});
   RENAX_WORKSPACE.go('tracks');RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',profile:'p',song:'s',section:'a'});
  });await showMeasures(p);
  async function target(value){
   await p.locator('.song-ramp-target .numbox-button').click();
   await p.locator('.song-ramp-target .numbox-option[data-value="'+value+'"]').click();
  }
  await target(84);
  assert.equal(await p.locator('.song-curve-select>summary').textContent(),'Descente linéaire');
  assert.deepEqual(await p.evaluate(()=>{const s=RENAX_SONGS.library.profiles[0].songs[0].sections[0];return [s.measure.tempo,s.tempoRamp.endTempo,s.tempoRamp.curve];}),[120,84,'linear-down']);
  const flash=await p.locator('.song-curve-select>summary').evaluate(e=>{const s=getComputedStyle(e);return {name:s.animationName,count:s.animationIterationCount,duration:s.animationDuration};});
  assert.deepEqual(flash,{name:'song-curve-change',count:'3',duration:'0.4s'});
  await target(150);
  assert.equal(await p.locator('.song-curve-select>summary').textContent(),'Montée linéaire');
  // Choosing a non-linear shape remains explicit; no automatic substitution is allowed.
  await p.locator('.song-curve-select>summary').click();await p.locator('[data-song-curve=round-up]').click();
  await target(84);
  assert.equal(await p.locator('.song-curve-select>summary').textContent(),'Montée arrondie');
  assert.equal(await p.evaluate(()=>RENAX_SONGS.library.profiles[0].songs[0].sections[0].tempoRamp.endTempo),150);
  await p.reload();await p.waitForFunction(()=>window.RENAX_WORKSPACE&&window.RENAX_SONGS);
  assert.equal(await p.evaluate(()=>RENAX_SONGS.library.profiles[0].songs[0].sections[0].tempoRamp.curve),'round-up');
  await p.locator('#workspaceNav [data-workspace=metronome]').click();
  await p.evaluate(()=>{document.documentElement.dataset.theme='avant';const m=measures[activeMeasureIndex];m.beatStates=[[1,0],[2,0],[3,0],[0,0]];renderActiveMeasure();});
  const colours=await p.locator('#sequencerContainer .step').evaluateAll(es=>es.map(e=>({bg:getComputedStyle(e).backgroundColor,text:getComputedStyle(e.firstChild).color})));
  assert.deepEqual(colours.slice(0,3),[{bg:'rgb(215, 242, 24)',text:'rgb(22, 26, 21)'},{bg:'rgb(168, 232, 72)',text:'rgb(22, 26, 21)'},{bg:'rgb(250, 118, 35)',text:'rgb(22, 26, 21)'}]);
  const circleRadii=await p.locator('#sequencerContainer .step,.visu-bottom .legend-color').evaluateAll(es=>es.map(e=>getComputedStyle(e).borderRadius));
  assert(circleRadii.length>=4&&circleRadii.every(radius=>radius==='50%'),'Citron click and legend markers must be circular');
  const particles=await p.evaluate(()=>{particles.length=0;emitBurst(0,1);return particles.map(p=>p.rgb);});
  assert(particles.length>0);for(const rgb of particles)assert.deepEqual(rgb,[215,242,24]);
  await p.locator('#sequencerContainer .step').first().evaluate(e=>e.classList.add('active'));
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('#sequencerContainer .step.active')).borderTopColor==='rgb(244, 242, 233)');
  const active=await p.locator('#sequencerContainer .step').first().evaluate(e=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,border:s.borderTopColor,filter:s.filter};});
  assert.deepEqual(active,{bg:'rgb(215, 242, 24)',border:'rgb(244, 242, 233)',filter:'none'});
  await p.screenshot({path:path.join(out,'citron-clicks.png')});
  await p.close();
  save('theme-navigation-results.json',{scenarios:results.length,settingsOneClick:true,keyboardNavigation:true,nativeDialogsModal:true,linearAutoDirection:true,manualCurvesPreserved:true,flash,clickColours:colours,results});
  console.log('PASS four themes: settings navigation, mobile gaps, headers, linear auto-direction, three highlights and Citron clicks/particles');
 }finally{await h.browser.close();h.server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
