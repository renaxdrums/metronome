const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {start,save}=require('./audio-harness.cjs');

(async()=>{
 const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'metronome-audio.js'),'utf8');
 const reference=JSON.parse(fs.readFileSync(path.join(root,'android/qa/reference-audio.json'),'utf8'));
 for(const [file,sha] of Object.entries(reference))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),sha,file);
 // Reproduce the reported consonant-based timing; only two moves back to its vowel.
 const previous=source.replace('male: [0, 0.116, 0.175,','male: [0, 0.116, 0.05,').replace('female: [0,0.107,0.095,','female: [0,0.107,0.001,');
 const h=await start(),renders=[];
 try{
  for(const version of ['before','after']){
   const p=await h.browser.newPage();
   if(version==='before')await p.route('**/metronome-audio.js*',r=>r.fulfill({contentType:'text/javascript',body:previous}));
   await p.goto(h.url);await p.evaluate(()=>prepareAllVoiceAudio());await p.waitForFunction(()=>allVoiceAudioReady);
   renders.push(await p.evaluate(async()=>{
    const result={};
    for(const gender of ['male','female'])for(let number=1;number<=20;number++){
     const ctx=new OfflineAudioContext(1,96000,48000);audioCtx=ctx;
     playVoiceMetronome(gender,ctx.destination,.65,2,false,{beatNumber:number,subIndex:0,beatDurationSec:.5});
     const pcm=(await ctx.startRendering()).getChannelData(0);
     result[gender+':'+number]=Array.from(pcm);
    }
    return result;
   }));
   await p.close();
  }
  const results=[];
  for(const [key,after] of Object.entries(renders[1])){
   const before=renders[0][key],shift=key==='male:2'?-6000:key==='female:2'?-4512:0;
   let error=0,peak=0;
   for(let i=0;i<after.length;i++){error=Math.max(error,Math.abs(after[i]-(before[i-shift]||0)));peak=Math.max(peak,Math.abs(after[i]));}
   assert(error<1e-6,`${key}: PCM/level changed beyond expected ${shift}-sample shift: ${error}`);
   assert(peak>0 && peak<1);
   results.push({key,delayMs:shift/48,pcmError:error,peak});
  }
  const p=await h.browser.newPage();await p.goto(h.url);await p.evaluate(()=>prepareAllVoiceAudio());await p.waitForFunction(()=>allVoiceAudioReady);
  const alignment=await p.evaluate(async()=>{
   const result=[];
   for(const rate of [44100,48000])for(const gender of ['male','female']){
    const ctx=new OfflineAudioContext(1,rate*2,rate);audioCtx=ctx;
    // Independently measured vowel rises in the unchanged recordings (see analyze-voices.py).
    const onset=gender==='male'?.175:.095;
    let sourceStart,offset;
    const create=ctx.createBufferSource.bind(ctx);ctx.createBufferSource=()=>{const source=create(),start=source.start.bind(source);source.start=(when,skip=0)=>{sourceStart=when;offset=skip;start(when,skip);};return source;};
    playVoiceMetronome(gender,ctx.destination,.65,2,false,{beatNumber:2,subIndex:0,beatDurationSec:.5});
    await ctx.startRendering();
    result.push({gender,rate,onset,errorMs:(sourceStart-offset+onset-.65)*1000});
   }
   return result;
  });
  for(const item of alignment)assert(Math.abs(item.errorMs)<=1.1,JSON.stringify(item));
  await p.close();save('two-consonant-timing-results.json',{audioFilesUnchanged:Object.keys(reference).length,results,alignment});
  console.log({unchangedWords:38,advancedTwoMs:{male:125,female:94},audioFilesUnchanged:55,alignment});
 }finally{await h.browser.close();h.server?.close();}
})().catch(error=>{console.error(error);process.exit(1);});
