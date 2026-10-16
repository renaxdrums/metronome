const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start}=require('./audio-harness.cjs');
(async()=>{const h=await start();let closeAssets;try{
 const page=await h.browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>console.error('Browser page crashed during neural preparation'));
 page.on('console',m=>{if(m.type()==='error')console.log('Browser:',m.text());});
 page.on('requestfailed',r=>console.log('Request failed:',r.url(),r.failure()?.errorText));
 closeAssets=await require('./amorce-neural-route.cjs').install(page.context(),h.url);
 await page.context().route('**/*.mjs*',route=>{const url=new URL(route.request().url());if(url.origin!==h.url)return route.fallback();let body=fs.readFileSync(path.join(__dirname,'..',url.pathname),'utf8');if(url.pathname.endsWith('/neural-worker.mjs')){const root=require('./amorce-neural-route.cjs').assetURL;body=`const testFetch=globalThis.fetch;globalThis.fetch=(input,options)=>{const url=typeof input==='string'?input:input.url;if(url.startsWith('https://huggingface.co/')){const relative=url.split('/resolve/')[1]?.split('/').slice(1).join('/');return testFetch(${JSON.stringify(root)}+'/'+relative,options);}return testFetch(input,options);};\n`+body;}return route.fulfill({contentType:'text/javascript',body});});
 await page.goto(h.url+'/prototypes/amorce/index.html'+(process.env.TEST_WEBGPU?'?device=webgpu':''));
 await page.waitForSelector('#label-2');
 assert.equal(await page.locator('[data-lang="fr"].active').count(),3);
 await page.locator('[data-index="0"][data-lang="en"]').click();
 assert.equal(await page.locator('[data-lang="en"].active').count(),3);
 await page.locator('[data-index="1"][data-lang="fr"]').click();
 assert.equal(await page.locator('[data-lang="en"].active').count(),2);
 await page.locator('#label-0').fill('Introduction');
 await page.locator('#label-1').fill('Mon couplet personnalisé');
 await page.locator('#label-2').fill('My custom drum breakdown');
 await page.locator('#run').click();
 const progress=setInterval(()=>page.locator('#status').textContent().then(s=>console.log('Progress:',s)).catch(()=>{}),15000);
 try{await page.waitForFunction(()=>window.amorceTest||!document.getElementById('run').disabled,undefined,{timeout:180000});}finally{clearInterval(progress);}
 if(!await page.evaluate(()=>!!window.amorceTest))throw new Error(await page.locator('#status').textContent());
 const r=await page.evaluate(()=>{const {speeches,...r}=window.amorceTest;return r;});
 assert.deepEqual(r.voices.map(v=>v.voice),['bm_george','fr_FR-siwis-medium','bm_george']);
 assert(r.voices.every(v=>v.backend==='wasm'&&v.level.peakAfter<=.801&&v.level.targetLufs===-20&&(v.level.peakLimited?v.level.loudnessAfter<=-20:Math.abs(v.level.loudnessAfter+20)<.001)));
 assert.equal(r.result.layout.length,3);assert.equal(r.result.anchorVerified,false);
 assert(r.result.countInMeasures>=2);
 for(const a of r.result.layout){const e=r.result.events.filter(e=>e.announcing&&e.subIndex===0&&e.time>=a.target-1e-9&&e.time<a.blockStart-1e-9);assert.equal(e.length,3);assert(e.every(x=>x.bank==='voiceMale'&&x.number>=2));}
 await page.locator('#stop').click();
 await page.waitForFunction(()=>!document.getElementById('run').disabled);
 const cacheCheck=await page.evaluate(async()=>{const {synthesize}=await import('/prototypes/amorce/neural-engine.mjs?v=20261009-male-level');const b=amorceTest.blocks[0],a=synthesize(b.text,b.language),c=synthesize(b.text,b.language),start=performance.now();await c;return {samePromise:a===c,elapsedMs:performance.now()-start};});
 assert(cacheCheck.samePromise);assert(cacheCheck.elapsedMs<100);
 assert.match(await page.locator('#status').textContent(),/arrêtée/);
 const mixed=await page.evaluate(async()=>{
  const {renderSequence}=await import('/prototypes/amorce/sequence-render.mjs?v=20261009-neural');
  const {planSequence}=await import('/prototypes/amorce/sequence.mjs');
  const {createAudioAdapter}=await import('/prototypes/amorce/audio-adapter.mjs');
  const {speeches,candidates,blocks:original}=window.amorceTest,results=[];
  for(const bpm of [60,120])for(const [numerator,denominator] of [[3,4],[4,4],[5,4],[7,8]]){
   const blocks=original.map((b,i)=>({...b,numerator,denominator,bank:['claves','cloche','voiceFemale'][i]}));
   const p=planSequence(blocks.map((b,i)=>({...b,anchorSeconds:candidates[i].anchorSeconds,audioDuration:speeches[i].pcm.length/24000,anchorVerified:false})),{bpm,experimentalCandidates:true});
   const ctx=new OfflineAudioContext(1,Math.ceil((p.end+1)*48000),48000);
   renderSequence(ctx,blocks,speeches,candidates,{bpm,subdivisions:4},createAudioAdapter(document.getElementById('audio-app')));
   const pcm=(await ctx.startRendering()).getChannelData(0);let peak=0,clipped=0;
   for(const x of pcm){peak=Math.max(peak,Math.abs(x));if(Math.abs(x)>=1)clipped++;}
   results.push({bpm,numerator,denominator,peak,clipped,blocks:3,subdivisions:4,anchorVerified:false});
  }
  return results;
 });
 assert.equal(mixed.length,8);assert(mixed.every(r=>r.clipped===0));
 const audioState=await page.locator('#audio-app').evaluate(frame=>frame.contentWindow.eval('audioCtx.state'));
 assert.equal(audioState,'closed');
 await page.locator('#run').click();await page.locator('#stop').click();
 await page.waitForFunction(()=>!document.getElementById('run').disabled);
 await page.waitForTimeout(500);
 assert.match(await page.locator('#status').textContent(),/arrêtée/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(__dirname,'../prototypes/amorce/page-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 const report={date:'2026-10-09',model:'Kokoro-82M',requestedBackend:process.env.TEST_WEBGPU?'webgpu':'wasm',cacheCheck,voices:r.voices,mixedRenders:mixed,worstMixedPeak:Math.max(...mixed.map(r=>r.peak)),mobileWidth:390,multiblockScheduled:true,languageScope:true,stopDuringPlayback:true,stopDuringPreparation:true,noHorizontalOverflow:true,errors,anchorVerified:false};
 fs.writeFileSync(path.join(__dirname,'../prototypes/amorce/page-results.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await h.browser.close();h.server?.close();closeAssets?.();}})().catch(e=>{console.error(e);process.exitCode=1;});
