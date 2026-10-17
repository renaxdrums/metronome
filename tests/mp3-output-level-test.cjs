const {start,save,openPlaylist}=require('./audio-harness.cjs');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const out=process.env.TEST_OUTPUT_DIR||path.join(__dirname,'results');fs.mkdirSync(out,{recursive:true});
function metrics(file){
 const r=cp.spawnSync('ffmpeg',['-hide_banner','-nostats','-i',file,'-af','ebur128=peak=true','-f','null','-'],{encoding:'utf8'});assert.equal(r.status,0);
 const summary=r.stderr.split('Summary:').at(-1),lufs=Number(summary.match(/I:\s*([-\d.]+) LUFS/)[1]);
 const bytes=cp.execFileSync('ffmpeg',['-v','error','-i',file,'-ar','48000','-ac','1','-f','f32le','pipe:1'],{maxBuffer:64e6});
 const pcm=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
 const hi=cp.execFileSync('ffmpeg',['-v','error','-i',file,'-af','aresample=384000:filter_size=96:phase_shift=10','-ac','1','-f','f32le','pipe:1'],{maxBuffer:128e6});
 let peak=0;for(let i=0;i<hi.length;i+=4)peak=Math.max(peak,Math.abs(hi.readFloatLE(i)));
 assert(pcm.every(Number.isFinite));const clipped=pcm.filter(v=>Math.abs(v)>=1).length;
 const eventLevels=[0,.5,1].map(t=>{const a=pcm.slice(Math.round((t+.024)*48000),Math.round((t+.124)*48000));return 10*Math.log10(a.reduce((s,x)=>s+x*x,0)/a.length)});
 return {lufs,truePeakDb:20*Math.log10(peak),clipped,samples:pcm.length,eventLevels};
}
(async()=>{
 const h=await start(),p=await h.browser.newPage({viewport:{width:1280,height:850},hasTouch:true}),rows=[],errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(h.url);await p.waitForFunction(()=>allVoiceAudioReady&&window.RENAX_MP3_EXPORT);
  const song=await p.evaluate(()=>({id:'level',name:'Niveau',sections:[{id:'s',label:'Test',count:3,measure:{...createMeasure(4,4,120),beatSubdivisions:[1,1,1,1],beatStates:[[2],[1],[3],[0]]}}]}));
  for(const bank of ['clic','userMetroclic','claves','voiceMale','voiceFemale','beep']){
   const row={bank};
   for(const level of ['original','boost']){
    const data=await p.evaluate(async({song,bank,level})=>{const r=await RENAX_MP3_EXPORT.exportSong(song,bank,.8,()=>{},level);return {bytes:Array.from(new Uint8Array(await r.blob.arrayBuffer())),report:r.report}},{song,bank,level});
    const file=path.join(out,bank+'-'+level+'.mp3');fs.writeFileSync(file,Buffer.from(data.bytes));const m=metrics(file);
    assert(m.truePeakDb<=-1,JSON.stringify({bank,level,peak:m.truePeakDb}));assert.equal(m.clipped,0);assert.equal(data.report.score.duration,6);
    assert.equal(data.report.level,level);assert.equal(data.report.boostDb,level==='boost'?2:0);
    if(level==='original')assert.equal(data.report.limiterMinGain,1);
    else assert(data.report.limiterMinGain>=Math.pow(10,-2.01/20));
    row[level]={...m,report:data.report};
   }
   row.improvementLU=row.boost.lufs-row.original.lufs;
   assert(row.improvementLU>=.5&&row.improvementLU<=2.1,JSON.stringify(row));
   assert.equal(row.boost.samples,row.original.samples);assert.deepEqual(row.boost.report.score,row.original.report.score);
   // The strengthened mode moderates peaks, but must not invert distinct click levels.
   if(['clic','userMetroclic','claves'].includes(bank))for(let a=0;a<3;a++)for(let b=a+1;b<3;b++){
    const before=row.original.eventLevels[a]-row.original.eventLevels[b],after=row.boost.eventLevels[a]-row.boost.eventLevels[b];
    if(Math.abs(before)>.8)assert(Math.sign(before)===Math.sign(after),JSON.stringify({bank,a,b,before,after}));
    assert(Math.abs(after-before)<=2.05,JSON.stringify({bank,a,b,before,after}));
   }
   rows.push(row);console.log('AUDIT',bank,row.improvementLU.toFixed(2),'LU',row.boost.truePeakDb.toFixed(2),'dBTP');
  }
  const silent=await p.evaluate(async song=>(await RENAX_MP3_EXPORT.exportSong(song,'clic',0,()=>{},'boost')).report,song);
  assert.equal(silent.decodedTruePeak,0);assert.equal(silent.limiterMinGain,1);
  await p.evaluate(song=>{RENAX_SONGS.replaceLibrary({version:1,activeProfile:'qa',profiles:[{id:'qa',name:'Niveau',songs:[song]}]});currentBank='userMetroclic';masterVolume=.8},song);
  const libraryBefore=await p.evaluate(()=>JSON.stringify(RENAX_SONGS.library));
  await openPlaylist(p);await p.locator('#mp3ExportOpen').click();assert.equal(await p.locator('#mp3ExportLevel').inputValue(),'boost');
  await p.selectOption('#songExportFormat','midi');assert.equal(await p.locator('#mp3ExportLevel').isVisible(),false);
  await p.selectOption('#songExportFormat','mp3');assert(await p.locator('#mp3ExportLevel').isVisible());
  for(const [width,height]of [[1280,850],[390,844],[667,320]]){
   await p.setViewportSize({width,height});await p.waitForFunction(()=>{const d=document.querySelector('#mp3ExportDialog').getBoundingClientRect();return [...document.querySelectorAll('#mp3ExportDialog .numbox-button')].every(e=>{const b=e.getBoundingClientRect();return b.left>=d.left+19&&b.right<=d.right-19})});const box=await p.locator('#mp3ExportDialog').boundingBox();
   assert(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
   await p.locator('#mp3ExportLevel').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'level-dialog-'+width+'.png')});
  }
  await p.setViewportSize({width:1280,height:850});const writes=[];
  await p.exposeFunction('levelTestWrite',data=>{const file=path.join(out,'ui-'+writes.length+'.mp3');fs.writeFileSync(file,Buffer.from(data));writes.push(file)});
  await p.evaluate(()=>{window.showSaveFilePicker=async o=>({name:o.suggestedName,createWritable:async()=>({write:async b=>levelTestWrite(Array.from(new Uint8Array(await b.arrayBuffer()))),close:async()=>{},abort:async()=>{}})})});
  for(const level of ['boost','original']){
   const wrapper=p.locator('#mp3ExportLevel').locator('..');await wrapper.locator('.numbox-button').click();await wrapper.locator('.numbox-menu').getByRole('option',{name:level==='boost'?'Renforcé':'Dynamique d’origine',exact:true}).click();assert.equal(await p.locator('#mp3ExportLevel').inputValue(),level);await p.locator('#mp3ExportSave').click();
   await p.waitForFunction(()=>document.querySelector('#mp3ExportStatus').textContent.startsWith('MP3 enregistré'));
   assert(fs.readFileSync(writes.at(-1)).equals(fs.readFileSync(path.join(out,'userMetroclic-'+level+'.mp3'))),'UI must export the selected level');
  }
  assert.equal(await p.evaluate(()=>JSON.stringify(RENAX_SONGS.library)),libraryBefore);assert.deepEqual(errors,[]);
  save('output-level-results.json',{rows,silent,ui:{default:'boost',midiHidesLevel:true,viewports:3,selectedLevelBytesMatch:true,libraryUnchanged:true},errors});
 }finally{await h.browser.close();h.server?.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
