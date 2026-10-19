const assert=require('node:assert/strict');const {start,save,openTracks}=require('./audio-harness.cjs');
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
 proof.push({appearance:'dark default; all three theme choices reachable on portrait, landscape and desktop; mobile preferences update retained'});
 proof.push({dialogs:'copy, move, mobile rename and user labels retained'});assert.deepEqual(errors,[]);save('numbox-accessibility-results.json',{proof,errors});console.log('PASS accessible/lazy numeric controls, zoom, tap keyboard and fullscreen-compatible dialogs');
}finally{await h.browser.close();h.server?.close()}})().catch(e=>{console.error(e);process.exitCode=1});
