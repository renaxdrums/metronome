const {start,save}=require('./audio-harness.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert'),cp=require('child_process');
const out=process.env.TEST_OUTPUT_DIR||path.join(__dirname,'results');fs.mkdirSync(out,{recursive:true});
function wav(pcm,rate,file){const b=Buffer.alloc(44+pcm.length*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(pcm.length*4,40);for(let i=0;i<pcm.length;i++)b.writeFloatLE(pcm[i],44+i*4);fs.writeFileSync(file,b);}
function probe(file){return JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels,bit_rate','-of','json',file],{encoding:'utf8'}));}
function decoded(file){const b=cp.execFileSync('ffmpeg',['-v','error','-i',file,'-f','f32le','-ac','1','-ar','48000','pipe:1'],{maxBuffer:128*1024*1024});return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));}
function peak8(file){const b=cp.execFileSync('ffmpeg',['-v','error','-i',file,'-af','aresample=384000:filter_size=96:phase_shift=10','-f','f32le','-ac','1','pipe:1'],{maxBuffer:512*1024*1024});let peak=0;for(let i=0;i<b.length;i+=4)peak=Math.max(peak,Math.abs(b.readFloatLE(i)));return 20*Math.log10(peak);}
function rms(a,start,end){let sum=0,n=0;for(let i=Math.floor(start*48000);i<Math.min(a.length,Math.floor(end*48000));i++){sum+=a[i]*a[i];n++;}return Math.sqrt(sum/n);}
(async()=>{
 const r=await start(),p=await r.browser.newPage({viewport:{width:1280,height:850}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(r.url);await p.waitForFunction(()=>allVoiceAudioReady&&window.RENAX_MP3_EXPORT);
  const fixtures=await p.evaluate(()=>{
    const section=(label,count,n,d,t,subs)=>{const m=createMeasure(n,d,t);if(subs)for(let b=0;b<n;b++){m.beatSubdivisions[b]=subs;m.beatStates[b]=Array.from({length:subs},(_,s)=>s===0?(b===0?2:1):3);}return {id:crypto.randomUUID(),label,count,measure:m};};
    const a={id:'a',name:'Essai A',sections:[section('Intro',2,4,4,120,2),section('Refrain',2,3,4,97,3),section('Bridge',1,5,4,150)]};
    const b={id:'b',name:'Essai B',sections:[section('Dense 16',2,7,16,120,3),section('Dense 32',2,20,32,97)]};
    const c={id:'c',name:'Accents',sections:[section('Niveaux',1,5,4,60,1)]};c.sections[0].measure.beatStates=[[1],[1],[2],[3],[0]];
    const d={id:'d',name:'Morceau complet',sections:[section('Intro',4,4,4,97),section('Couplet 1',8,4,4,97),section('Refrain 1',8,5,4,120)]};
    const lib=RENAX_SONGS.library;lib.profiles.find(x=>x.id===lib.activeProfile).songs=[a,b,c,d];RENAX_SONGS.validateLibrary(lib);localStorage.setItem('renax-drums-songs-v1',JSON.stringify(lib));return [a,b,c,d];
  });
  await p.reload();await p.waitForFunction(()=>allVoiceAudioReady&&window.RENAX_MP3_EXPORT);
  await p.getByRole('tab',{name:'Morceaux',exact:true}).click();await p.getByRole('button',{name:'Playlist',exact:true}).click();
  await p.locator('#mp3ExportOpen').click();
  await p.locator('#mp3ExportDialog').waitFor({state:'visible'});
  assert.deepStrictEqual(await p.locator('#mp3ExportSong option').allTextContents(),fixtures.map(s=>s.name));
  await p.screenshot({path:path.join(out,'mp3-export-dialog.png')});
  const destination=path.join(out,'chosen-destination');fs.mkdirSync(destination,{recursive:true});
  let pickerOptions=[],writes=[];
  await p.exposeFunction('mp3TestWrite',({name,bytes})=>{const target=path.join(destination,name);fs.writeFileSync(target,Buffer.from(bytes));writes.push(target);});
  await p.exposeFunction('mp3TestPicker',options=>{pickerOptions.push(options);});
  await p.evaluate(()=>{window.showSaveFilePicker=async options=>{await mp3TestPicker(options);return {name:options.suggestedName,createWritable:async()=>({write:async blob=>mp3TestWrite({name:options.suggestedName,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))}),close:async()=>{},abort:async()=>{}})};};});
  const before=await p.evaluate(()=>({storage:localStorage.getItem('renax-drums-songs-v1'),bank:currentBank,volume:masterVolume,measures:JSON.stringify(measures),ctx:audioCtx.state,playing:isPlaying,chrono:document.querySelector('#workTimer')?.textContent}));
  for(const song of fixtures.slice(0,2)){
    await p.selectOption('#mp3ExportSong',song.id);await p.locator('#mp3ExportSave').click();await p.waitForFunction(()=>document.getElementById('mp3ExportStatus').textContent.startsWith('MP3 enregistré'),{timeout:120000});
    const file=path.join(destination,song.name+'.mp3');assert(fs.existsSync(file));
    const info=probe(file),expected=song.sections.reduce((n,s)=>n+s.count*s.measure.numerator*60/s.measure.tempo*4/s.measure.denominator,0);
    assert.strictEqual(info.streams[0].codec_name,'mp3');assert(Math.abs(Number(info.format.duration)-expected-.055)<.06,'Wrong song selected');
  }
  const after=await p.evaluate(()=>({storage:localStorage.getItem('renax-drums-songs-v1'),bank:currentBank,volume:masterVolume,measures:JSON.stringify(measures),ctx:audioCtx.state,playing:isPlaying,chrono:document.querySelector('#workTimer')?.textContent}));assert.deepStrictEqual(after,before);
  assert.strictEqual(writes.length,2);assert.deepStrictEqual(pickerOptions.map(x=>x.suggestedName),['Essai A.mp3','Essai B.mp3']);
  for(const options of pickerOptions){assert.strictEqual(options.startIn,'music');assert.deepStrictEqual(options.types[0].accept,{'audio/mpeg':['.mp3']});}
  await p.evaluate(()=>{window.showSaveFilePicker=async()=>{throw new DOMException('Cancel','AbortError');};});await p.locator('#mp3ExportSave').click();await p.waitForFunction(()=>document.getElementById('mp3ExportStatus').textContent==='Export annulé.');assert.strictEqual(writes.length,2);
  await p.getByRole('button',{name:'Fermer',exact:true}).click();
  const exports=[];
  for(const [song,bank,volume] of [[fixtures[2],'clic',.05],[fixtures[2],'cloche',.8],[fixtures[1],'voiceMale',.8],[fixtures[1],'voiceFemale',.8],[fixtures[0],'clic808',.8],[fixtures[0],'claves',.8],[fixtures[0],'beep',.8],[fixtures[3],'clic',.8]]){
    const data=await p.evaluate(async({song,bank,volume})=>{const result=await RENAX_MP3_EXPORT.exportSong(song,bank,volume);return {bytes:Array.from(new Uint8Array(await result.blob.arrayBuffer())),report:result.report};},{song,bank,volume});
    const file=path.join(out,`mp3-${song.id}-${bank}.mp3`);fs.writeFileSync(file,Buffer.from(data.bytes));
    const info=probe(file),truePeakDb=peak8(file),pcm=decoded(file);
    assert.strictEqual(info.streams[0].codec_name,'mp3');assert.strictEqual(info.streams[0].sample_rate,'48000');assert.strictEqual(info.streams[0].channels,1);
    assert(truePeakDb<=-1.0,`${bank} true peak ${truePeakDb}`);assert(truePeakDb>=-2,`${bank} unnecessarily weak ${truePeakDb}`);
    assert(data.report.preEncodingTruePeak<=Math.pow(10,-1/20));assert.strictEqual(data.report.limiterMinGain,1);
    assert.deepStrictEqual(data.report.score.sections.map(s=>[s.label,s.count]),song.sections.map(s=>[s.label,s.count]));
    const expected=song.sections.reduce((n,s)=>n+s.count*s.measure.numerator*60/s.measure.tempo*4/s.measure.denominator,0);
    assert(Math.abs(data.report.score.duration-expected)<1e-10);assert(Math.abs(data.report.decodedDuration-(expected+data.report.score.lead+data.report.score.tail))<.06);
    const clipping=Array.from(pcm).filter(v=>Math.abs(v)>=1).length;assert.strictEqual(clipping,0);
    let accentRatios;
    if(song.id==='c'){
      const raw=await p.evaluate(async({song,bank,volume})=>{const r=await RENAX_MP3_EXPORT.isolatedRender(song,bank,volume);return Array.from(r.pcm);},{song,bank,volume});
      const ref=Float32Array.from(raw);accentRatios=[];
      for(const t of [0,2,3]){const sourceRatio=rms(ref,t,t+.1)/rms(ref,1,1.1),mp3Ratio=rms(pcm,t+.024,t+.124)/rms(pcm,1.024,1.124);accentRatios.push({sourceRatio,mp3Ratio,errorDb:20*Math.log10(mp3Ratio/sourceRatio)});assert(Math.abs(accentRatios.at(-1).errorDb)<.3);}
    }
    exports.push({file:path.basename(file),...data.report,ffprobe:info,truePeakDb,clippedSamples:clipping,accentRatios});console.log(bank,song.name,truePeakDb.toFixed(3),'dBTP');
  }
  const limiter=await p.evaluate(async()=>{const client=RENAX_MP3_EXPORT.workerClient();try{const pcm=new Float32Array(48000).fill(.2);pcm[24000]=2;const r=await client.call({op:'limiterTest',pcm,rate:48000,ceiling:.89},[pcm.buffer]);let peak=0;for(const v of r.pcm)peak=Math.max(peak,Math.abs(v));return {peak,minGain:r.minGain};}finally{client.close();}});assert(limiter.peak<=.890001&&limiter.minGain<1);
  const silent=await p.evaluate(async song=>{const r=await RENAX_MP3_EXPORT.exportSong(song,'clic',0);return r.report;},fixtures[2]);assert.strictEqual(silent.decodedTruePeak,0);
  assert.strictEqual(await p.evaluate(()=>JSON.stringify(RENAX_SONGS.library)),JSON.stringify(JSON.parse(before.storage)));
  const running=await p.evaluate(async song=>{
    window.exportLiveEvents=[];const original=playClick;playClick=(s,t,f,c)=>{exportLiveEvents.push({time:t,beat:c.beatNumber});return original(s,t,f,c);};
    const originalCtx=audioCtx,originalMeasures=measures;await startMetronome();
    await Promise.all([RENAX_MP3_EXPORT.exportSong(song,'clic',.8),new Promise(resolve=>setTimeout(resolve,3000))]);
    const stillRunning=isPlaying,sameContext=audioCtx===originalCtx,sameMeasures=measures===originalMeasures;stopMetronome();playClick=original;
    return {stillRunning,sameContext,sameMeasures,events:exportLiveEvents};
  },fixtures[2]);assert(running.stillRunning&&running.sameContext&&running.sameMeasures);assert(running.events.length>4);for(let i=1;i<running.events.length;i++)assert(Math.abs(running.events[i].time-running.events[i-1].time-.5)<1e-9);
  await p.setViewportSize({width:390,height:844});await p.locator('#mobileTabs button[data-tab=seq]').click();await p.locator('#mp3ExportOpen').click();const bounds=await p.locator('#mp3ExportDialog').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=390);await p.screenshot({path:path.join(out,'mp3-export-mobile.png')});await p.getByRole('button',{name:'Fermer',exact:true}).click();
  assert.deepStrictEqual(errors,[]);
  const report={playlistButton:true,allSongsInSelect:true,multipleSelections:true,destination:{method:'File System Access API contract stub, writes to actual chosen-destination directory; native OS dialog not automated',pickerOptions,writes:writes.map(f=>path.basename(f)),cancel:true},defaultFilenames:true,liveStateUnchanged:true,running,noPerBlockVolume:true,limiter,silent,errors,exports};save('mp3-export-results.json',report);console.log('MP3 export tests passed');
 }finally{await r.browser.close();r.server?.close();}
})().catch(e=>{console.error(e);process.exit(1)});
