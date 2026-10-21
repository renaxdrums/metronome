const assert=require('node:assert/strict');const {start,save,openTracks,openControls}=require('./audio-harness.cjs');
(async()=>{const h=await start(),p=await h.browser.newPage(),errors=[],proof=[];p.on('pageerror',e=>errors.push(e.message));try{
 await p.goto(h.url);await p.evaluate(()=>prepareAllVoiceAudio());await p.waitForFunction(()=>window.RENAX_SONGS&&allVoiceAudioReady);
 assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark','Fresh browser defaults to dark');
 const viewport=await p.locator('meta[name=viewport]').getAttribute('content');assert(!/user-scalable=no|maximum-scale=1/.test(viewport));
 await p.getByRole('tab',{name:'Séquenceur',exact:true}).click();
 await p.evaluate(()=>{measures=Array.from({length:8},(_,i)=>createMeasure(4,4,120+i));metronomeMeasures=measures;activeMeasureIndex=0;renderSequencerList()});
 assert.equal(await p.locator('select.measure-tempo-input option').count(),8,'No 998-option lists should be built before opening');
 const select=p.locator('select.measure-tempo-input').first(),trigger=select.locator('..').locator('.numbox-button');
 await trigger.focus();await p.keyboard.press('ArrowDown');await p.waitForFunction(()=>document.activeElement?.getAttribute('role')==='option');
 assert.equal(await select.locator('option').count(),998);assert.equal(await p.locator('select.measure-tempo-input').nth(1).locator('option').count(),1);
 await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>measures[0].tempo),121);assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await p.evaluate(()=>isPlaying),false);
 await trigger.focus();await p.keyboard.press('End');assert.equal(await p.evaluate(()=>document.activeElement.dataset.value),'999');await p.keyboard.press('Home');assert.equal(await p.evaluate(()=>document.activeElement.dataset.value),'2');
 const taps=await p.evaluate(()=>tapTimes.length);await p.keyboard.press('t');assert.equal(await p.evaluate(()=>tapTimes.length),taps,'Menu typeahead must not tap tempo');
 await p.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await p.evaluate(()=>document.activeElement.id),await trigger.getAttribute('id'));
 await p.keyboard.press('t');await p.waitForTimeout(100);await p.keyboard.press('t');assert.equal(await p.evaluate(()=>tapTimes.length),taps+2);
 proof.push({zoom:'unrestricted',lazyTempo:'8 options instead of 7,984 before opening',keyboard:'arrows, Home, End, Enter, Escape, focus restoration and isolated typeahead',tap:'T without numeric keypad'});
 await p.getByRole('tab',{name:'Polyrythmie',exact:true}).click();const dot=p.locator('.poly-dot').first(),before=Number(await dot.getAttribute('data-state'));await dot.focus();await p.keyboard.press('Space');assert.equal(Number(await dot.getAttribute('data-state')),(before+1)%4);assert.equal(await p.evaluate(()=>isPlaying),false);
 await p.getByRole('tab',{name:'Séquenceur',exact:true}).click();const silent=p.locator('#clickMeasureCount');assert(await silent.isDisabled());await p.locator('#silentToggle').click();assert(await silent.isEnabled());await p.locator('#silentToggle').click();assert(await silent.isDisabled());
 proof.push({polyKeyboard:'Space changes the focused pulse without starting audio',disabledFields:'silent controls disabled semantically until mode enabled'});
 // New dialogs use the same accessible modal on desktop and mobile.
 const value={version:1,activeProfile:'a',profiles:[{id:'a',name:'Tracks',songs:[{id:'s',name:'Morceau complet',sections:[{id:'b',label:'Intro',count:1,measure:{numerator:4,denominator:4,tempo:120,beatSubdivisions:[1,1,1,1],beatStates:[[3],[1],[1],[1]]}}]}]},{id:'b',name:'Morceau complet',songs:[]}]};
 await p.evaluate(x=>{RENAX_SONGS.replaceLibrary(x);RENAX_STORAGE.write(x)},value);await openTracks(p);await p.evaluate(()=>RENAX_SONGS.restoreNavigation({pane:'songs',view:'playlist',profile:'a'}));
 for(const [action,label]of [['Copier vers…','Copier'],['Déplacer vers…','Déplacer']]){
  await p.getByRole('button',{name:'Actions pour Morceau complet',exact:true}).click();await p.getByRole('menuitem',{name:action,exact:true}).click();
  const dialog=p.getByRole('dialog');assert(await dialog.isVisible());assert.equal(await dialog.locator('select option').last().textContent(),'Morceau complet');
  if(action.startsWith('Copier'))await dialog.locator('select').selectOption('b');
  await dialog.getByRole('button',{name:label,exact:true}).click();
 }
 assert.deepEqual(await p.evaluate(()=>RENAX_SONGS.library.profiles.map(x=>x.songs.length)),[0,2]);
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>RENAX_SONGS.restoreNavigation({pane:'songs',view:'playlist',profile:'b'}));
 await p.getByRole('button',{name:'Actions pour Morceau complet',exact:true}).first().click();await p.getByRole('menuitem',{name:'Renommer',exact:true}).click();
 await p.getByRole('dialog').locator('input').fill('Mobile rename');await p.getByRole('dialog').getByRole('button',{name:'Renommer',exact:true}).click();
 assert.equal(await p.evaluate(()=>RENAX_SONGS.library.profiles[1].songs[0].name),'Mobile rename');
 for(const [width,height]of [[390,844],[667,320],[1440,1000]]){
  await p.setViewportSize({width,height});await p.locator('#index2SettingsBtn').click();
  const settings=p.locator('#index2SettingsPanel');assert(await settings.isVisible());assert.equal(await settings.getAttribute('aria-modal'),'true');assert.equal(await p.locator('#index2SettingsBtn').evaluate(e=>e.closest('[inert]')!==null),false);assert(await p.locator('#directAccountBtn').evaluate(e=>e.closest('[inert]')!==null));
  for(const theme of ['ivory','light','dark']){const choice=settings.locator('[data-appearance='+theme+']');await choice.click();assert.equal(await choice.getAttribute('aria-pressed'),'true');assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),theme);await choice.scrollIntoViewIfNeeded();const fits=await choice.evaluate(e=>{const a=e.getBoundingClientRect(),b=document.getElementById('index2SettingsPanel').getBoundingClientRect();return {fits:a.top>=b.top&&a.bottom<=b.bottom,choice:a.toJSON(),panel:b.toJSON()}});assert(fits.fits,JSON.stringify({width,height,theme,...fits}));}
  await p.locator('#index2SettingsClose').focus();await p.keyboard.press('Shift+Tab');assert(await p.evaluate(()=>document.activeElement.id==='index2SettingsBtn'));await p.keyboard.press('Escape');assert.equal(await p.locator('header').evaluate(e=>e.inert),false);
 }
 await p.locator('#index2SettingsBtn').click();const names=await p.locator('.song-open .measure-num').allTextContents();await p.locator('[data-language=en]').click();assert.equal(await p.locator('html').getAttribute('lang'),'en');assert.deepEqual(await p.locator('.song-open .measure-num').allTextContents(),names);await p.locator('[data-language=fr]').click();assert.equal(await p.locator('html').getAttribute('lang'),'fr');await p.keyboard.press('Escape');
 await checkSoundMenuForeground(h,proof,errors);
 await checkMultiSoundMenus(h,proof,errors);
 await checkPhoneDropdownDirection(h,proof,errors);
 await checkMetricMenuForeground(h,proof,errors);
 proof.push({appearance:'dark default; all three theme choices reachable on portrait, landscape and desktop; mobile preferences update retained'});
 proof.push({dialogs:'copy, move, mobile rename and user labels retained'});assert.deepEqual(errors,[]);save('numbox-accessibility-results.json',{proof,errors});console.log('PASS accessible/lazy numeric controls, zoom, tap keyboard and fullscreen-compatible dialogs');
}finally{await h.browser.close();h.server?.close()}})().catch(e=>{console.error(e);process.exitCode=1});

// An opaque menu can still be occluded by a navigation stacking context.
async function soundMenuProbe(page,selector='.sound-bank-cards.open .numbox-menu') {
 return page.locator(selector).evaluate(menu=>{
  const bounds=menu.getBoundingClientRect(),blocked=[];
  for(const fraction of [.15,.5,.85]){
   const x=bounds.left+bounds.width*fraction;
   for(let y=bounds.top+8;y<bounds.bottom-8;y+=12){
    const hit=document.elementFromPoint(x,y);
    if(!hit||!menu.contains(hit))blocked.push({x,y,hit:hit?.id||hit?.className||null});
   }
  }
  const color=getComputedStyle(menu).backgroundColor;
  const channels=color.match(/[\d.]+/g)?.map(Number)||[];
  return {bounds:bounds.toJSON(),blocked,color,opaque:channels.length===3||(channels.length===4&&channels[3]===1)};
 });
}
async function checkSoundMenuForeground(h,proof,errors) {
 const beforeCSS=require('node:child_process').execFileSync('git',['show','b7f4f131e94bef652730e8c0b072590c7e43ca6f:entry-opaque-navigation26.css'],{encoding:'utf8'});
 const before=await h.browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
 try {
  await before.route('**/entry-opaque-navigation26.css*',route=>route.fulfill({contentType:'text/css',body:beforeCSS}));
  await before.goto(h.url);
  await before.waitForFunction(()=>document.documentElement.dataset.workspaceReady&&document.querySelector('.sound-bank-cards'));
  await openControls(before);
  await before.locator('.sound-bank-cards .numbox-button').click();
  await before.waitForFunction(()=>document.querySelector('.sound-bank-cards.open .numbox-menu')?.style.top);
  const old=await soundMenuProbe(before);
  assert(old.blocked.length>0,'The unmodified stylesheet must reproduce navigation covering the sounds');
  save('sound-menu-negative-control.json',old);
 } finally {await before.close();}
 const results=[];
 for(const viewport of [{width:390,height:844},{width:834,height:1112},{width:1440,height:900},{width:844,height:390}]){
  for(const theme of ['dark','light','ivory']){
   const page=await h.browser.newPage({viewport,hasTouch:viewport.width<=1100,reducedMotion:'reduce'});
   page.on('pageerror',e=>errors.push(e.message));
   try {
    await page.goto(h.url);
    await page.waitForFunction(()=>document.documentElement.dataset.workspaceReady&&document.querySelector('.sound-bank-cards'));
    // Consume the existing first-gesture fullscreen transition before opening a menu.
    await page.locator('#workspaceNav [data-workspace=metronome]').click();
    await page.waitForFunction(()=>!document.fullscreenEnabled||!!document.fullscreenElement);
    await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    for(const workspace of ['metronome','polyrhythm','training']){
     await page.evaluate(value=>RENAX_WORKSPACE.go(value),workspace);
     await openControls(page);
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     console.log('SOUND_MENU scenario',JSON.stringify({viewport,theme,workspace}));
     const trigger=page.locator('.sound-bank-cards .numbox-button');
     await trigger.click();
     await page.waitForFunction(()=>document.querySelector('.sound-bank-cards.open .numbox-menu')?.style.top);
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     const probe=await soundMenuProbe(page),context=JSON.stringify({viewport,theme,workspace,...probe});
     assert.deepEqual(probe.blocked,[],context);
     assert(probe.opaque,context);
     assert(probe.bounds.top>=0&&probe.bounds.left>=0&&probe.bounds.bottom<=viewport.height&&probe.bounds.right<=viewport.width,context);
     const name=['sound-menu',viewport.width,viewport.height,theme,workspace].join('-');
     const output=require('node:path').join(process.env.TEST_OUTPUT_DIR||require('node:path').join(__dirname,'results'),name+'.png');
     require('node:fs').mkdirSync(require('node:path').dirname(output),{recursive:true});
     await page.screenshot({path:output});
     await trigger.focus();
     await page.keyboard.press('ArrowDown');
     await page.keyboard.press('Escape');
     assert.equal(await trigger.getAttribute('aria-expanded'),'false');
     assert.equal(await trigger.evaluate(element=>element===document.activeElement),true);
     await trigger.click();
     const last=page.locator('.sound-bank-cards .numbox-option').last();
     const value=await last.getAttribute('data-value');
     await last.scrollIntoViewIfNeeded();
     const scrolled=await soundMenuProbe(page);
     assert.deepEqual(scrolled.blocked,[],JSON.stringify({viewport,theme,workspace,...scrolled}));
     await last.click();
     assert.equal(await page.locator('#soundBank').inputValue(),value);
     assert.equal(await trigger.getAttribute('aria-expanded'),'false');
     assert.equal(await page.locator('.main-grid>.panel:has(.sound-bank-cards)').evaluate(panel=>getComputedStyle(panel).zIndex),'auto');
     results.push({viewport,theme,workspace,opaque:probe.opaque,unobstructed:true,lastSoundSelectable:true,keyboardClose:true});
    }
   } finally {await page.close();}
  }
 }
 save('sound-menu-foreground-results.json',{baseline:'b7f4f131e94bef652730e8c0b072590c7e43ca6f',negativeControl:'Navigation overlaps the old menu',results,errors});
 proof.push({soundMenu:'36 desktop, tablet and phone states: three themes, three workspaces, phone rotation, opaque foreground, final sound selectable and Escape restores focus'});
 console.log('PASS sound menu: old navigation overlap reproduced; 36 foreground/opacity/selection/keyboard states');
}

async function menuAppearance(menu) {
 return menu.evaluate(element=>{
  const pick=(node,keys)=>{const style=getComputedStyle(node);return Object.fromEntries(keys.map(key=>[key,style[key]]));};
  const itemKeys=['backgroundColor','borderColor','borderWidth','borderRadius','color','fontFamily','fontSize','fontWeight','lineHeight','padding','marginBottom','minHeight','display','alignItems','gap','textAlign'];
  return {
   menu:pick(element,['backgroundColor','borderColor','borderWidth','borderRadius','padding','boxShadow','scrollbarColor']),
   options:[...element.querySelectorAll('.numbox-option')].slice(0,8).map(item=>({
    value:item.dataset.value,selected:item.getAttribute('aria-selected'),style:pick(item,itemKeys),
    icon:item.querySelector('svg')?.innerHTML,
    iconStyle:item.querySelector('svg')?pick(item.querySelector('svg'),['width','height','stroke','strokeWidth']):null
   }))
  };
 });
}
async function checkMultiSoundMenus(h,proof,errors) {
 const results=[];
 for(const viewport of [{width:390,height:844},{width:834,height:1112},{width:1440,height:900},{width:844,height:390}]){
  for(const theme of ['dark','light','ivory']){
   const page=await h.browser.newPage({viewport,hasTouch:viewport.width<=1100,reducedMotion:'reduce'});
   page.on('pageerror',error=>errors.push(error.message));
   try{
    await page.goto(h.url);
    await page.waitForFunction(()=>document.documentElement.dataset.workspaceReady&&document.querySelector('#soundBank.numbox-native'));
    await page.locator('#workspaceNav [data-workspace=metronome]').click();
    await page.waitForFunction(()=>!document.fullscreenEnabled||!!document.fullscreenElement);
    await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    await openControls(page);
    const referenceTrigger=page.locator('#soundBank').locator('..').locator('.numbox-button');
    await referenceTrigger.click();
    await page.mouse.move(0,0);
    const reference=await menuAppearance(page.locator('#soundBank').locator('..').locator('.numbox-menu'));
    await referenceTrigger.click();
    await page.evaluate(()=>RENAX_WORKSPACE.go('multi'));
    await page.locator('#multiPresetLibrary').getByRole('button',{name:'Nouveau preset',exact:true}).click();
    await page.locator('.multi-add').filter({hasText:'Nouvelle piste'}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#multiTracks .multi-sound-bank').length===2);
    const triggerWidths=await page.locator('#multiTracks .numbox-button').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().width));
    for(let index=0;index<2;index++){
     const track=page.locator('#multiTracks .multi-track').nth(index),trigger=track.locator('.numbox-button');
     await trigger.click();
     const selector='#multiTracks .multi-sound-bank.open .numbox-menu';
     const menu=page.locator(selector);
     await page.waitForFunction(selector=>document.querySelector(selector)?.classList.contains('compact-floating'),selector);
     await page.mouse.move(0,0);
     const context=JSON.stringify({viewport,theme,index});
     assert.deepEqual(await menuAppearance(menu),reference,'Same sound cards as the metronome: '+context);
     const probe=await soundMenuProbe(page,selector);
     assert.deepEqual(probe.blocked,[],JSON.stringify({viewport,theme,index,...probe}));
     assert(probe.opaque,context);
     assert(probe.bounds.top>=0&&probe.bounds.left>=0&&probe.bounds.bottom<=viewport.height&&probe.bounds.right<=viewport.width,context);
     assert.equal(Math.round(probe.bounds.width),Math.round(Math.min(viewport.width-16,Math.max(triggerWidths[index],140)))) ;
     assert(probe.bounds.height<=220.1,context);
     if(viewport.width<=600||viewport.height<=600){const anchor=await trigger.boundingBox();assert(probe.bounds.bottom<=anchor.y+1,'Phone sound list opens above its trigger: '+context);}
     const output=require('node:path').join(process.env.TEST_OUTPUT_DIR||require('node:path').join(__dirname,'results'),['sound-menu-multi',viewport.width,viewport.height,theme,index+1].join('-')+'.png');
     await page.screenshot({path:output});
     await trigger.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');
     assert.equal(await trigger.getAttribute('aria-expanded'),'false');
     assert.equal(await trigger.evaluate(element=>element===document.activeElement),true);
     await trigger.click();
     const before=await page.locator('#multiTracks .multi-bank-row select').evaluateAll(elements=>elements.map(element=>element.value));
     const last=page.locator(selector).locator('.numbox-option').last(),value=await last.getAttribute('data-value');
     await last.scrollIntoViewIfNeeded();
     assert.deepEqual((await soundMenuProbe(page,selector)).blocked,[],context);
     await last.click();
     await page.waitForFunction(({index,value})=>document.querySelectorAll('#multiTracks .multi-bank-row select')[index]?.value===value,{index,value});
     const after=await page.locator('#multiTracks .multi-bank-row select').evaluateAll(elements=>elements.map(element=>element.value));
     assert.equal(after[1-index],before[1-index],'Changing one track preserves the other sound');
     assert.equal(await page.locator('#multiTracks .numbox-custom.open').count(),0);
     // Restore the original sound through the UI, so both tracks compare the same selected card.
     const restored=page.locator('#multiTracks .multi-track').nth(index).locator('.numbox-button');
     await restored.click();
     await page.locator(selector).locator('[data-value="userMetroclic"]').click();
     results.push({viewport,theme,track:index+1,identicalStylesAndIcons:true,compactDimensions:true,foreground:true,independentSelection:true,keyboard:true});
    }
   }finally{await page.close();}
  }
 }
 save('sound-menu-multi-results.json',{results,errors});
 proof.push({multiSoundMenus:'24 menus: same colors, borders, typography and icons as metronome; compact dimensions, foreground, final sound selection and keyboard'});
 console.log('PASS two multitrack sound menus across desktop, tablet, phone portrait/landscape and all themes');
}


async function checkPhoneDropdownDirection(h,proof,errors) {
 const results=[];
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const page=await h.browser.newPage({viewport,hasTouch:true,reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));
  try {
   await page.goto(h.url);await page.waitForFunction(()=>document.documentElement.dataset.workspaceReady);
   await page.locator('#workspaceNav [data-workspace=metronome]').click();
   await page.waitForFunction(()=>!document.fullscreenEnabled||!!document.fullscreenElement);
   for(const workspace of ['metronome','polyrhythm','training','sequence','multi','tracks']){
    await page.evaluate(value=>RENAX_WORKSPACE.go(value),workspace);
    if(workspace==='multi')await page.locator('#multiPresetLibrary').getByRole('button',{name:'Nouveau preset',exact:true}).click();
    if(workspace==='tracks'){
     await require('./audio-harness.cjs').openPlaylist(page);
     await page.getByRole('button',{name:'Nouveau track',exact:true}).click();
     await page.locator('[data-section-id] .song-block-header').first().click();
    }
    await openControls(page);
    // Capture the currently rendered controls; later menus can contain virtual options.
    const candidates=await page.locator('.numbox-custom:not(.console-arrival-replica *) > .numbox-button').all();
    let checked=0;
    for(const trigger of candidates){
     if(!await trigger.isVisible()||!await trigger.isEnabled())continue;
     await trigger.click();
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     const placement=await trigger.evaluate(button=>{
      const menu=button.parentElement.querySelector('.numbox-menu'),a=button.getBoundingClientRect(),b=menu.getBoundingClientRect();
      return {label:button.getAttribute('aria-label'),anchor:a.toJSON(),menu:b.toJSON(),open:button.parentElement.classList.contains('open')};
     });
     assert(placement.open&&placement.menu.height>0,JSON.stringify({viewport,workspace,...placement}));
     assert(placement.menu.bottom<=placement.anchor.top+1,JSON.stringify({viewport,workspace,...placement}));
     assert(placement.menu.top>=0&&placement.menu.left>=0&&placement.menu.right<=viewport.width,JSON.stringify({viewport,workspace,...placement}));
     await trigger.click();checked++;
    }
    if(workspace==='training'){
     const curve=page.locator('.training-curve-select');
     await curve.locator('summary').click();
     const placement=await curve.evaluate(element=>({anchor:element.querySelector('summary').getBoundingClientRect().toJSON(),menu:element.querySelector('.training-curve-menu').getBoundingClientRect().toJSON()}));
     assert(placement.menu.bottom<=placement.anchor.top+1,JSON.stringify({viewport,workspace,curve:placement}));
     await curve.locator('summary').click();checked++;
    }
    assert(checked>0,JSON.stringify({viewport,workspace,checked}));
    results.push({viewport,workspace,checked,opensUp:true});
   }
  }finally{await page.close();}
 }
 save('sound-menu-phone-direction-results.json',{results,errors});
 proof.push({phoneDropdowns:'Upward selection lists in all six workspaces, including numeric training and curves, portrait and landscape'});
 console.log('PASS upward dropdowns in all six phone workspaces and both orientations');
}


async function metricOpeningProbe(page,id) {
 return page.evaluate(async id=>{
  const select=document.getElementById(id),wrap=select.parentElement,button=wrap.querySelector('.numbox-button');
  button.click();
  // Inspect the opening microtask before the next timer or animation frame.
  await Promise.resolve();
  const menu=wrap.querySelector('.numbox-menu');
  return {anchor:button.getBoundingClientRect().toJSON(),menu:menu.getBoundingClientRect().toJSON(),position:getComputedStyle(menu).position};
 },id);
}
async function checkMetricMenuForeground(h,proof,errors) {
 const baseline='558207096e1ae3b6d9f005452588eed925eca7e0';
 const before=await h.browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
 try {
  for(const file of ['compact-controls.js','entry-opaque-navigation26.css']){
   const body=require('node:child_process').execFileSync('git',['show',baseline+':'+file],{encoding:'utf8'});
   await before.route('**/'+file+'*',route=>route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body}));
  }
  await before.goto(h.url);await before.waitForFunction(()=>document.documentElement.dataset.workspaceReady);
  await before.locator('#workspaceNav [data-workspace=metronome]').click();
  await before.waitForFunction(()=>!document.fullscreenEnabled||!!document.fullscreenElement);
  const initial=await metricOpeningProbe(before,'activeNumerator');
  assert(initial.menu.top>=initial.anchor.bottom,'The old metric menu must initially open below its trigger');
  const selector='.numbox-custom.open:has(>#activeNumerator) .numbox-menu';
  await before.waitForFunction(selector=>document.querySelector(selector)?.classList.contains('compact-floating'),selector);
  const foreground=await soundMenuProbe(before,selector);
  assert(foreground.blocked.length>0,'The old metric menu must be covered by navigation');
  save('sound-menu-metric-negative-control.json',{baseline,initial,foreground});
 }finally{await before.close();}
 const results=[];
 for(const viewport of [{width:390,height:844},{width:709,height:1024},{width:834,height:1112},{width:844,height:390},{width:1440,height:900}]){
  for(const theme of ['dark','light','ivory']){
   const page=await h.browser.newPage({viewport,hasTouch:viewport.width<=1100,reducedMotion:'reduce'});
   page.on('pageerror',error=>errors.push(error.message));
   try {
    await page.addInitScript(value=>localStorage.setItem('renax-appearance',value),theme);
    await page.goto(h.url);await page.waitForFunction(()=>document.documentElement.dataset.workspaceReady);
    await page.locator('#workspaceNav [data-workspace=metronome]').click();
    await page.waitForFunction(()=>!document.fullscreenEnabled||!!document.fullscreenElement);
    await page.evaluate(()=>document.fonts.ready);
    for(const settingsOpen of viewport.width<=1100?[false,true]:[true]){
     await page.evaluate(open=>{document.getElementById('workspaceControls').open=open;},settingsOpen);
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     for(const id of ['activeNumerator','activeDenominator']){
      const select=page.locator('#'+id),trigger=select.locator('..').locator('.numbox-button');
      const early=await metricOpeningProbe(page,id),context=JSON.stringify({viewport,theme,settingsOpen,id});
      assert.equal(early.position,'fixed','Metric placement precedes the first paint: '+context);
      if(viewport.width<=1100)assert(early.menu.bottom<=early.anchor.top+1,'Metric opens upward immediately: '+JSON.stringify({context,early}));
      const selector='.numbox-custom.open:has(>#'+id+') .numbox-menu';
      const probe=await soundMenuProbe(page,selector);
      assert.deepEqual(probe.blocked,[],JSON.stringify({context,...probe}));assert(probe.opaque,context);
      assert(probe.bounds.top>=0&&probe.bounds.left>=0&&probe.bounds.bottom<=viewport.height&&probe.bounds.right<=viewport.width,context);
      const path=require('node:path').join(process.env.TEST_OUTPUT_DIR||require('node:path').join(__dirname,'results'),['sound-menu-metric',viewport.width,viewport.height,theme,settingsOpen?'expanded':'folded',id].join('-')+'.png');
      await page.screenshot({path});
      const value=id==='activeNumerator'?'7':'8';
      await page.locator(selector).locator('[data-value="'+value+'"]').scrollIntoViewIfNeeded();
      assert.deepEqual((await soundMenuProbe(page,selector)).blocked,[],context);
      await page.locator(selector).locator('[data-value="'+value+'"]').click();
      assert.equal(await select.inputValue(),value);assert.equal(await trigger.getAttribute('aria-expanded'),'false');
      await trigger.press('ArrowDown');await page.keyboard.press('Escape');
      assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert(await trigger.evaluate(element=>element===document.activeElement));
      await trigger.click();await page.locator(selector).locator('[data-value="4"]').click();
      assert.equal(await page.locator('.main-grid>.panel:has(#'+id+')').evaluate(panel=>getComputedStyle(panel).zIndex),'auto');
      results.push({viewport,theme,settingsOpen,id,immediatePlacement:true,upward:viewport.width<=1100,foreground:true,selection:true,keyboard:true});
     }
    }
   }finally{await page.close();}
  }
 }
 save('sound-menu-metric-foreground-results.json',{baseline,results,errors});
 proof.push({metricMenus:'Both metric lists: first opening, foreground, compact and wide mobile viewports, all themes, folded/expanded settings, selection and Escape'});
 console.log('PASS 54 metric foreground/placement/selection states and old downward/occluded negative control');
}
