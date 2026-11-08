'use strict';
const assert=require('node:assert/strict');
const {start}=require('./audio-harness.cjs');

// A recording with leading silence and three clicks must become one hit.
function recording(){
 const rate=24000,pcm=Buffer.alloc(rate*4*2),wave=Buffer.alloc(44+pcm.length);
 for(const at of [1,2,3])for(let i=0;i<rate*.06;i++)pcm.writeInt16LE(Math.round(18000*Math.exp(-i/(rate*.012))*Math.sin(i*2*Math.PI*900/rate)),(at*rate+i)*2);
 wave.write('RIFF');wave.writeUInt32LE(36+pcm.length,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(rate,24);wave.writeUInt32LE(rate*2,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(pcm.length,40);pcm.copy(wave,44);return wave;
}
(async()=>{
 const h=await start();const errors=[];
 try{
  const page=await h.browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(h.url);await page.waitForFunction(()=>window.RENAX_CUSTOM_SAMPLES&&window.RENAX_WORKSPACE);
  await page.locator('input[aria-label="Choisir des samples audio locaux"]').setInputFiles(process.env.RENAX_SAMPLE_FIXTURE||{name:'repeated-clicks.wav',mimeType:'audio/wav',buffer:recording()});
  await page.waitForFunction(()=>currentBank.startsWith('localSample:'));
  const audio=await page.evaluate(async()=>{
   const ctx=new OfflineAudioContext(1,24000*2,24000),bank=SOUND_BANKS[currentBank];await bank.prepare(ctx);
   const dest=ctx.createGain();dest.connect(ctx.destination);for(const t of [.1,.6,1.1])bank.play(dest,t,3,false);
   const data=(await ctx.startRendering()).getChannelData(0),windows=[];
   for(let t=0;t<1.6;t+=.01){let peak=0;for(let i=Math.round(t*24000);i<Math.min(data.length,Math.round((t+.01)*24000));i++)peak=Math.max(peak,Math.abs(data[i]));if(peak>.001)windows.push(t);}
   return windows;
  });
  assert(audio.some(t=>t>=.1&&t<.15),'first click is aligned without leading silence');
  assert(audio.some(t=>t>=.6&&t<.65),'second click is aligned');
  assert(audio.every(t=>[.1,.6,1.1].some(at=>t>=at-.011&&t<at+.16)),JSON.stringify(audio));
  await page.evaluate(()=>{RENAX_WORKSPACE.go('sequence');const m=measures[0];m.beatSubdivisions=[3,2,1,4];m.beatStates=[[3,2,1],[2,1],[0],[1,3,2,1]];renderActiveMeasure();});
  await page.locator('#panicBtn').click();
  assert.deepEqual(await page.evaluate(()=>({sub:measures[0].beatSubdivisions,states:measures[0].beatStates})),{sub:[1,1,1,1],states:[[3],[2],[0],[1]]});
  for(const [width,height] of [[1440,900],[390,844],[320,740],[844,390]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>RENAX_WORKSPACE.go('polyrhythm'));
   for(const theme of ['dark','light','ivory','avant']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   for(const count of [2,3,4]){
    await page.evaluate(count=>{const m=measures[0];m.polyVoiceCount=count;ensurePolyStates(m);m.polyVoices[0].subdivisions[0]=3;ensurePolyStates(m);renderSequencerList();renderActiveMeasure();},count);
    assert.equal(await page.locator('.poly-ring').count(),count);
    assert.equal(await page.locator('.poly-subdivision').count(),2);
    const circle=await page.locator('#sequencerContainer').boundingBox();
    assert(circle.width>=(height<500?80:100)&&circle.y>=0&&circle.y+circle.height<=height,JSON.stringify({width,height,theme,circle}));
    const fields=await page.locator('#measureList .poly-lane-field').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().top));
    assert.equal(fields.length,count);assert(Math.max(...fields)-Math.min(...fields)<1,'all voice fields share one row');
    await page.evaluate(()=>document.getElementById('scorePartitionBtn').click());
    await page.waitForFunction(count=>document.getElementById('rhythmScore').dataset.voices===String(count),count);
    assert.equal(await page.locator('#rhythmScore .vf-stave').count(),1,'single shared staff');
    const labels=await page.locator('#rhythmScore svg text').allTextContents();
    for(let i=1;i<=count;i++)assert(labels.includes('V'+i));
    await page.evaluate(()=>document.getElementById('scoreMetronomeBtn').click());
   }
   }
   await page.evaluate(()=>window.RENAX_TOOLS.show('tuner'));
   const fit=await page.evaluate(()=>{const root=document.getElementById('tunerRoot'),mic=document.getElementById('tunerListen').getBoundingClientRect();return {scroll:root.scrollHeight,client:root.clientHeight,bottom:mic.bottom,right:mic.right,width:innerWidth,height:innerHeight};});
   assert(fit.scroll<=fit.client+1&&fit.bottom<=fit.height&&fit.right<=fit.width,JSON.stringify(fit));
   assert.equal(await page.getByText('L’analyse reste sur cet appareil. Le microphone se coupe quand vous quittez l’accordeur.',{exact:true}).count(),0);
   await page.evaluate(()=>window.RENAX_TOOLS.show('metronome'));
  }
  assert.deepEqual(errors,[]);console.log('PASS imported one-shot timing, beat-preserving eraser, 2–4 lanes, single staff and tuner viewport fit');
 }finally{await h.browser.close();h.server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
