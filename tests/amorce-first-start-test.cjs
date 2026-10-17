const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start}=require('./audio-harness.cjs');
(async()=>{const h=await start();let closeAssets;
 try{
  const p=await h.browser.newPage({viewport:{width:1280,height:850}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  if(process.env.REAL_AMORCE)closeAssets=await require('./amorce-neural-route.cjs').install(p.context(),h.url);
  await p.route('**/*.mjs*',route=>{
   const u=new URL(route.request().url());if(u.origin!==h.url)return route.fallback();
   if(!process.env.REAL_AMORCE&&u.pathname.endsWith('/neural-engine.mjs'))return route.fulfill({contentType:'text/javascript',body:`export async function synthesize(){await new Promise(r=>setTimeout(r,300));return {pcm:new Float32Array(24000).fill(.1),sampleRate:24000,events:[{type:'phoneme',id:'œ̃',audio_position:300,text_position:1}]};}`});
   let body=fs.readFileSync(path.join(__dirname,'..',u.pathname),'utf8');
   if(u.pathname.endsWith('/neural-worker.mjs')){const root=require('./amorce-neural-route.cjs').assetURL;body=`const originalFetch=globalThis.fetch;globalThis.fetch=(input,options)=>{const url=typeof input==='string'?input:input.url;if(url.startsWith('https://huggingface.co/'))return originalFetch(${JSON.stringify(root)}+'/'+url.split('/resolve/')[1].split('/').slice(1).join('/'),options);return originalFetch(input,options);};\n`+body;}
   return route.fulfill({contentType:'text/javascript',body});
  });
  await p.goto(h.url,{waitUntil:'domcontentloaded'});await p.evaluate(()=>prepareAllVoiceAudio());await p.waitForFunction(()=>allVoiceAudioReady&&window.RENAX_SONGS);
  await p.evaluate(()=>{
   const measure={numerator:4,denominator:4,tempo:120,beatSubdivisions:[1,1,1,1],beatStates:[[3],[1],[1],[1]]};
   const s={id:'cold',name:'Cold start',amorce:true,sections:[{id:'one',label:'1',count:2,measure},{id:'un',label:'un',count:2,measure:JSON.parse(JSON.stringify(measure))}]};
   RENAX_SONGS.replaceLibrary({version:1,activeProfile:'p',profiles:[{id:'p',name:'Test',songs:[s]}]});RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',song:'cold',profile:'p'});
   const prepare=RENAX_AMORCE.prepare;window.prepareAudioStates=[];RENAX_AMORCE.prepare=song=>{prepareAudioStates.push(audioCtx.state);return prepare(song);};
   window.firstStartTrace=[];const begin=RENAX_AMORCE.begin;RENAX_AMORCE.begin=(ctx,origin,plan)=>{firstStartTrace.push({state:ctx.state,origin});return begin(ctx,origin,plan);};
   return audioCtx.suspend();
  });
  assert.equal(await p.evaluate(()=>audioCtx.state),'suspended');
  await p.locator('#playBtn').click();
  await p.waitForFunction(()=>isPlaying&&audioCtx.state==='running',{timeout:120000});
  const result=await p.evaluate(()=>({prepareAudioStates,starts:firstStartTrace.length,state:audioCtx.state,button:playBtn.textContent,loaded:RENAX_SONGS.loaded.song.sections.map(x=>x.label)}));
  assert.deepEqual(result.prepareAudioStates,['running']);assert.equal(result.starts,1);assert.equal(result.button,'Arrêter');
  await p.locator('#playBtn').click();await p.waitForFunction(()=>!isPlaying);
  await p.locator('#playBtn').click();await p.waitForFunction(()=>isPlaying);assert.equal(await p.evaluate(()=>firstStartTrace.length),2);
  await p.locator('#playBtn').click();assert.deepEqual(errors,[]);
  if(process.env.REAL_AMORCE){const r=await p.evaluate(async()=>{
   const song=RENAX_SONGS.library.profiles[0].songs[0],plan=await RENAX_AMORCE.prepare(song);
   return plan.speeches.map(s=>{let peak=0;for(const x of s.pcm)peak=Math.max(peak,Math.abs(x));const first=s.pcm.findIndex(x=>Math.abs(x)>=peak*.01);return {voice:s.voice,peak,samples:s.pcm.length,onset:first/s.sampleRate,event:s.events.find(e=>e.type==='phoneme'&&e.id.trim()).audio_position/1000,timingSource:s.timingSource};});
  });for(const s of r){assert.equal(s.voice,'fr_FR-siwis-medium');assert.ok(s.peak>0&&s.peak<.801);assert.ok(s.samples>2400);}assert.equal(r[0].voice,r[1].voice);result.voices=r;}
  console.log(JSON.stringify({...result,realNeural:!!process.env.REAL_AMORCE,stopRestart:true,errors},null,2));
 }finally{await h.browser.close();h.server.close();closeAssets?.();}
})().catch(e=>{console.error(e);process.exit(1)});
