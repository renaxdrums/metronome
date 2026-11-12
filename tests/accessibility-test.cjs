const assert=require('node:assert/strict');
const {default:AxeBuilder}=require('@axe-core/playwright');
const {start,save,newTrack}=require('./audio-harness.cjs');
(async()=>{const h=await start(),runs=[];let engine;try{
 async function scan(page,meta){
  // Transition bookkeeping must not prevent the full Axe audit from running.
  // A transition's finished promise can remain pending after navigation; give
  // finite animations time to settle, then audit the actual rendered interface.
  const settled=await page.evaluate(()=>Promise.race([
   Promise.all(document.getAnimations().filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{}))).then(()=>true),
   new Promise(resolve=>setTimeout(()=>resolve(false),2000))
  ]));
  if(!settled)console.log('Animation settling bounded',JSON.stringify(meta));
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();engine=result.testEngine;
  runs.push({...meta,violations:result.violations,incomplete:result.incomplete});
  if(result.violations.length)console.warn('A11Y DETAILS '+JSON.stringify({meta,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,html:n.html?.slice(0,180),reason:n.failureSummary?.slice(0,240)})).slice(0,8)}))}));
  console.log('AUDIT accessibility '+meta.width+' '+meta.theme+' '+meta.module+' '+result.violations.map(v=>v.id+':'+v.nodes.length).join(', '));
 }
 for(const [width,height]of [[1440,1000],[390,844]]){
  const context=await h.browser.newContext({viewport:{width,height},hasTouch:width<1100}),p=await context.newPage();await p.goto(h.url);await p.waitForFunction(()=>window.RENAX_SONGS&&window.RENAX_TRAINING);
  for(const theme of ['dark','light','ivory']){
   const meta={width,height,theme};
   await p.locator('#index2SettingsBtn').click();await p.locator('[data-appearance='+theme+']').click();await scan(p,{...meta,module:'Préférences'});await p.locator('#index2SettingsClose').click();
   for(const module of ['Métronome','Polyrythmie','Entraînement','Séquenceur','Multipiste','Track']){
    await p.getByRole('tab',{name:module,exact:true}).click();await scan(p,{...meta,module});
   }
   await newTrack(p);const block=p.locator('#songPane .song-block-header').first();if(await block.getAttribute('aria-expanded')==='false')await block.click();await scan(p,{...meta,module:'Track détaillé'});
   await p.locator('#mp3ExportOpen').click();await scan(p,{...meta,module:'Export MP3/MIDI'});await p.locator('#mp3ExportDialog').getByRole('button',{name:'Fermer',exact:true}).click();
   await p.getByRole('button',{name:'Retour à la playlist',exact:true}).click();await p.getByRole('button',{name:/^Actions pour /}).first().click();await p.getByRole('menuitem',{name:'Renommer',exact:true}).click();await scan(p,{...meta,module:'Renommer un track'});await p.getByRole('dialog').getByRole('button',{name:'Annuler',exact:true}).click();
  }
  await context.close();
 }
 save('accessibility-results.json',{engine,runs});
 assert.equal(runs.reduce((n,r)=>n+r.violations.length,0),0,'See accessibility-results.json for every rule, selector and failure summary');
 console.log('PASS '+runs.length+' WCAG automated scans; incomplete checks require manual review');
 }finally{await h.browser.close();h.server?.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
