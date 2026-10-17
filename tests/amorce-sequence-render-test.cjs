const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start}=require('./audio-harness.cjs');
(async()=>{const h=await start();try{
 const page=await h.browser.newPage();await require('./amorce-runtime-route.cjs').install(page);
 await page.route('**/*.mjs',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'..',new URL(r.request().url()).pathname),'utf8')}));
 await page.goto(h.url);await page.evaluate(()=>prepareAllVoiceAudio());await page.waitForFunction(()=>allVoiceAudioReady);
 const results=await page.evaluate(async()=>{
  const {synthesize}=await import('/prototypes/amorce/engine.mjs');
  const {lastSyllableCandidate}=await import('/prototypes/amorce/syllables.mjs');
  const {planSequence}=await import('/prototypes/amorce/sequence.mjs');
  const {renderSequence}=await import('/prototypes/amorce/sequence-render.mjs');
  const labels=[['Introduction','fr'],['Couplet personnalisé','fr'],['Chorus','en']],speeches=[],candidates=[];
  for(const [label,language] of labels){const s=await synthesize(label,language);speeches.push(s);candidates.push(lastSyllableCandidate(s.events,language));}
  const results=[];
  for(const bpm of [60,240])for(const [numerator,denominator] of [[3,4],[4,4],[5,4],[7,8]]){
   const blocks=labels.map((_,i)=>({numerator,denominator,measures:2,bank:['claves','cloche','voiceFemale'][i]}));
   const p=planSequence(blocks.map((b,i)=>({...b,anchorSeconds:candidates[i].anchorSeconds,audioDuration:speeches[i].pcm.length/speeches[i].sampleRate,anchorVerified:false})),{bpm,experimentalCandidates:true});
   const ctx=new OfflineAudioContext(1,Math.ceil((p.end+1)*48000),48000);
   const r=renderSequence(ctx,blocks,speeches,candidates,{bpm,subdivisions:4},{configure:c=>{audioCtx=c;masterVolume=1;},destination:getAudioMixDestination,click:(bank,number,time,state,first,subIndex,beatDurationSec)=>{currentBank=bank;playClick(state,time,first,{beatNumber:number,subIndex,beatDurationSec});}});
   const samples=(await ctx.startRendering()).getChannelData(0);let peak=0,clipped=0;
   for(const x of samples){peak=Math.max(peak,Math.abs(x));if(Math.abs(x)>=1)clipped++;}
   const counting=r.layout.every(a=>{const events=r.events.filter(e=>e.subIndex===0&&e.time>=a.target-1e-9&&e.time<a.blockStart-1e-9);return events.length===numerator-1&&events.every(e=>e.bank==='voiceMale'&&e.number>=2);});
   const bankResume=r.layout.every((a,i)=>r.events.some(e=>Math.abs(e.time-a.blockStart)<1e-9&&e.bank===blocks[i].bank&&e.number===1));
   results.push({bpm,numerator,denominator,peak,clipped,counting,bankResume,blocks:3,subdivisions:4,anchorVerified:false});
  }
  return results;
 });
 assert.equal(results.length,8);assert(results.every(r=>r.clipped===0&&r.counting&&r.bankResume));
 const report={date:'2026-10-09',cases:results.length,worstPeak:Math.max(...results.map(r=>r.peak)),results,limitation:'Complete multiblock offline audio rendered. Real last-syllable acoustic onset is not independently verified.'};
 fs.writeFileSync(path.join(__dirname,'../prototypes/amorce/sequence-render-results.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await h.browser.close();h.server?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
