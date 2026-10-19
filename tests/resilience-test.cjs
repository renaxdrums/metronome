const assert=require('node:assert/strict');
const {start,save,openTracks}=require('./audio-harness.cjs');
const measure={numerator:4,denominator:4,tempo:120,beatSubdivisions:[1,1,1,1],beatStates:[[3],[1],[1],[1]]};
const fixture=()=>({version:1,activeProfile:'p',profiles:[{id:'p',name:'Test',songs:[{id:'s',name:'Initial',sections:[{id:'b',label:'Intro',count:2,measure}]}]}]});
async function seed(page){await page.evaluate(async value=>{await RENAX_STORAGE.ready;RENAX_SONGS.replaceLibrary(value);RENAX_STORAGE.write(value)},fixture());await openTracks(page);await page.evaluate(()=>RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',song:'s',profile:'p'}));}
(async()=>{
 const h=await start(),proof=[],errors=[];
 const fresh=async()=>{const p=await h.browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(h.url);await p.waitForFunction(()=>window.RENAX_SONGS);return p;};
 try{
  // A missing vocal recording cannot disable an instrumental click.
  const voice=await h.browser.newPage();voice.on('pageerror',e=>errors.push(e.message));let blocked=true,attempts=0;
  await voice.route('**/assets/voices/voice-men-en/01.wav*',r=>{attempts++;return blocked?r.abort('failed'):r.continue()});
  await voice.goto(h.url);await voice.evaluate(()=>prepareAllVoiceAudio().catch(()=>{}));await voice.waitForFunction(()=>Object.keys(VOICE_METRONOME_BUFFERS.male).length===19&&Object.keys(VOICE_METRONOME_BUFFERS.female).length===20&&allVoiceAudioPromise===null);
  assert.equal(await voice.locator('#playBtn').isEnabled(),true);
  assert((await voice.locator('#audioReadyLabel').textContent()).includes('Voix indisponibles'));
  await voice.locator('#playBtn').click();await voice.waitForFunction(()=>isPlaying&&scheduledVoiceSources.size>0);await voice.locator('#playBtn').click();
  await voice.evaluate(()=>{currentBank='voiceMale'});await voice.locator('#playBtn').click();await voice.waitForFunction(()=>!playbackStarting);
  assert.equal(await voice.evaluate(()=>isPlaying),false);assert(await voice.locator('#playBtn').isEnabled());
  blocked=false;await voice.evaluate(()=>ensureVoiceMetronomeReady('voiceMale'));assert(await voice.evaluate(()=>allVoiceAudioReady));
  assert.equal(attempts,3);proof.push({missingVoice:'instrument still plays; unavailable voice fails clearly; retry loads missing recording',attempts});await voice.close();

  // Typing changes the model immediately, then commits once after the idle delay.
  const p=await fresh();await seed(p);
  await p.evaluate(()=>{window._writes=0;window._edits=0;const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('renax-index2-store-v1:'))_writes++;return set.call(this,key,value)};window.addEventListener('renax-library-edited',()=>_edits++)});
  const title=p.getByLabel('Titre du track',{exact:true});await title.fill('');await title.pressSequentially('abcdefgh',{delay:15});
  assert.equal(await p.evaluate(()=>RENAX_SONGS.library.profiles[0].songs[0].name),'abcdefgh');assert.equal(await p.evaluate(()=>_writes),0);
  await p.waitForFunction(()=>_writes===1);assert.equal(await p.evaluate(()=>_edits),1);
  // Deterministically exercise synchronous re-entry while a focused subtree is being removed.
  await p.evaluate(()=>{
    const pane=document.querySelector('#songPane'),original=pane.replaceChildren;
    let entered=false,calls=0;
    pane.replaceChildren=function(...nodes){
      calls++;
      if(!entered){entered=true;RENAX_SONGS.replaceLibrary(RENAX_SONGS.library,true);}
      return original.apply(this,nodes);
    };
    try{RENAX_SONGS.replaceLibrary(RENAX_SONGS.library,true);}finally{delete pane.replaceChildren;}
    if(!entered||calls!==1)throw Error('Re-entrant DOM rebuild was not prevented');
  });
  await p.getByLabel('Titre du track',{exact:true}).waitFor({state:'visible'});
  assert.equal(await p.getByLabel('Titre du track',{exact:true}).count(),1);
  // Flush a just-typed edit before changing account scope; the delayed task must not leak.
  await title.fill('Before scope');await p.evaluate(()=>RENAX_STORAGE.switchScope('user:qa-maintenance',{version:1,activeProfile:'empty',profiles:[{id:'empty',name:'Empty',songs:[]}]}));
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('renax-index2-store-v1:guest')).library.profiles[0].songs[0].name),'Before scope');
  await p.waitForTimeout(500);assert.equal(await p.evaluate(()=>RENAX_SONGS.library.profiles[0].songs.length),0);
  proof.push({typing:'one write and one sync notification for eight keystrokes',scopeSwitch:'latest pending edit saved in guest scope only'});await p.close();

  // A failed delayed save stays pending and blocks a scope switch until retry succeeds.
  const quota=await fresh();await seed(quota);
  await quota.evaluate(()=>{window._setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('renax-index2-store-v1:'))throw new DOMException('Injected quota','QuotaExceededError');return _setItem.call(this,key,value)}});
  await quota.getByLabel('Titre du track',{exact:true}).fill('Retain unsaved title');await quota.waitForTimeout(500);
  assert.equal(await quota.evaluate(()=>RENAX_SONGS.flushPending()),false);
  const blockedScope=await quota.evaluate(async()=>{try{await RENAX_STORAGE.switchScope('user:blocked',{});return false}catch{return RENAX_STORAGE.scope==='guest'}});assert(blockedScope);
  await quota.evaluate(()=>Storage.prototype.setItem=_setItem);assert.equal(await quota.evaluate(()=>RENAX_SONGS.flushPending()),true);
  assert.equal(await quota.evaluate(()=>JSON.parse(localStorage.getItem('renax-index2-store-v1:guest')).library.profiles[0].songs[0].name),'Retain unsaved title');
  proof.push({quotaFailure:'unsaved edit retained, scope switch blocked, successful retry persisted title'});await quota.close();

  // A stale tab cannot overwrite the newer tab, even when it closes.
  const context=await h.browser.newContext(),a=await context.newPage();await a.goto(h.url);await a.waitForFunction(()=>window.RENAX_SONGS);await seed(a);
  const b=await context.newPage();await b.goto(h.url);await b.waitForFunction(()=>window.RENAX_SONGS);
  await b.evaluate(()=>{RENAX_SONGS.library.profiles[0].songs[0].name='Other tab';RENAX_STORAGE.write(RENAX_SONGS.library)});
  const raw=await b.evaluate(()=>localStorage.getItem('renax-index2-store-v1:guest'));
  await a.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await a.evaluate(()=>localStorage.getItem('renax-index2-store-v1:guest')),raw);
  await a.evaluate(()=>{RENAX_SONGS.library.profiles[0].songs[0].name='Stale edit';window.dispatchEvent(new Event('pagehide'))});assert.equal(await a.evaluate(()=>localStorage.getItem('renax-index2-store-v1:guest')),raw);
  proof.push({staleTab:'newer raw snapshot preserved after unchanged and dirty pagehide'});await context.close();

  // Failure after internal track reload must release the preparation state and fall back.
  const guide=await fresh();await guide.evaluate(()=>prepareAllVoiceAudio());await guide.waitForFunction(()=>allVoiceAudioReady);
  await guide.evaluate(value=>{window._plan={sections:value.profiles[0].songs[0].sections,announcements:[],speeches:[],countInMeasures:2,duration:4};RENAX_AMORCE.prepare=async()=>_plan;value.profiles[0].songs[0].amorce=true;RENAX_SONGS.replaceLibrary(value);RENAX_STORAGE.write(value)},fixture());
  await openTracks(guide);await guide.evaluate(()=>RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',song:'s',profile:'p'}));
  const fallback=await guide.evaluate(async()=>{const begin=RENAX_AMORCE.begin;let once=true;RENAX_AMORCE.begin=(...args)=>{if(once){once=false;throw Error('Injected late guide failure')}return begin(...args)};await startMetronome();const result={playing:isPlaying,preparing:RENAX_SONGS.preparing,caption:playBtn.textContent};stopMetronome();RENAX_AMORCE.begin=begin;return result});
  assert(fallback.playing);assert.equal(fallback.preparing,false);assert(!fallback.caption.includes('Préparation'));
  await guide.evaluate(()=>{RENAX_AMORCE.prepare=()=>new Promise(resolve=>window._resolveGuide=resolve);window._startPromise=startMetronome()});await guide.waitForFunction(()=>!!window._resolveGuide);
  const cancelled=await guide.evaluate(async()=>{stopMetronome();_resolveGuide(_plan);await _startPromise;return {playing:isPlaying,preparing:RENAX_SONGS.preparing}});
  assert.deepEqual(cancelled,{playing:false,preparing:false});proof.push({guideFallback:fallback,cancelled});
  const grouping=await guide.evaluate(()=>{const saved=renderVoiceCount,rows=[];try{for(const [n,d]of [[4,4],[16,16],[16,32]]){const trace=[];renderVoiceCount=(_gender,_out,_time,_state,_first,context)=>trace.push({number:context.beatNumber,seconds:context.beatDurationSec});audioCtx=new OfflineAudioContext(1,48000*5,48000);const measure={numerator:n,denominator:d,tempo:60},duration=n*4/d,plan={announcements:[{index:0,start:0,target:0,blockStart:duration,measure}],speeches:[{pcm:new Float32Array(2400),sampleRate:24000}]};RENAX_AMORCE.begin(audioCtx,.1,plan);for(let beat=0;beat<n;beat++)RENAX_AMORCE.step(.1+beat*4/d,1,beat===0,0,beat);RENAX_AMORCE.stop();rows.push({n,d,trace});}}finally{renderVoiceCount=saved;}return rows});
  assert.deepEqual(grouping.map(row=>row.trace.map(item=>item.number)),[[2,3,4],[2,3,4],[2]]);assert(grouping.every(row=>row.trace.every(item=>item.seconds===1)));proof.push({guideQuarterGrouping:grouping});await guide.close();
  assert.deepEqual(errors,[]);save('resilience-results.json',{proof,errors});console.log('PASS missing voice, retry, debounced writes, account flush, stale tabs and guide cancellation/fallback');
 }finally{await h.browser.close();h.server?.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
