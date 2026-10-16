const {start,save}=require('./audio-harness.cjs');
const fs=require('fs');
(async()=>{
 const runtime=await start();const browser=runtime.browser;
 const page=await browser.newPage();
 if(process.env.BASELINE_INDEX)await page.route('**/*',r=>new URL(r.request().url()).pathname==='/'?r.fulfill({contentType:'text/html',body:fs.readFileSync(process.env.BASELINE_INDEX,'utf8')}):r.continue());
 await page.goto(runtime.url);await page.waitForFunction(()=>allVoiceAudioReady);
 const result=await page.evaluate(async anchors=>{
  const realCtx=audioCtx, originalClick=playClick, originalVisual=scheduleVisualUpdate;
  const nativeTimeout=window.setTimeout;window.setTimeout=()=>0;scheduleVisualUpdate=()=>{};
  const results=[];let maxAttackError=0,maxIntervalError=0,lateStarts=0;
  const cases=[{name:'Groupes 20/16 a 120 BPM',ms:[[20,120,[2],16]]},{name:'Groupes 20/32 a 120 BPM',ms:[[20,120,[1],32]]},{name:'Tous les nombres 1-20 a 60 BPM',ms:[[20,60,[1]]]},{name:'Tous les nombres 1-20',ms:[[20,120,[1]]]},{name:'60 BPM 4/4',ms:[[4,60,[1]]]},{name:'120 BPM 4/4',ms:[[4,120,[1]]]},{name:'60 BPM 3/4',ms:[[3,60,[1]]]},{name:'120 BPM 5/4',ms:[[5,120,[1]]]},{name:'subdivisions 2/3/4/5/6/7/8',ms:[[4,120,[2,3,4,5]],[3,60,[6,7,8]]]},{name:'mesures et tempos 60->120->90',ms:[[4,60,[1]],[3,120,[2,3,4]],[5,90,[1]]]}];
  for(const bank of ['voiceMale','voiceFemale']){
   for(const test of cases){
    currentBank=bank;appMode='metronome';training.active=false;silentModeEnabled=false;
    measures=test.ms.map(([n,bpm,subs,denominator=4])=>{const m=createMeasure(n,denominator);m.tempo=bpm;m.beatSubdivisions=Array.from({length:n},(_,i)=>subs[i%subs.length]);m.beatStates=m.beatSubdivisions.map(n=>Array(n).fill(1));return m;});
    playingMeasureIndex=0;currentStepInMeasure=0;nextNoteTime=.4;
    let expected=[],t=.4;
    while(expected.length<20){for(const m of measures){for(let beat=0;beat<m.numerator;beat++){const group=m.denominator>=16?m.denominator/4:1;if(beat%group===0)expected.push({time:t,number:Math.floor(beat/group)+1});t+=60/m.tempo*4/m.denominator;if(expected.length===20)break;}if(expected.length===20)break;}}
    const offline=new OfflineAudioContext(20,Math.ceil((t+2)*48000),48000);const merger=offline.createChannelMerger(20);merger.connect(offline.destination);
    let clock=0,events=[],starts=[];
    audioCtx={get currentTime(){return clock;},createGain:()=>offline.createGain(),createOscillator:()=>offline.createOscillator(),createBufferSource:()=>{const s=offline.createBufferSource();const start=s.start.bind(s);s.start=(when,offset=0)=>{starts.push({when,offset,clock});start(when,offset);};return s;}};
    playClick=(state,time,first,context)=>{if(context.subIndex===0&&context.beatNumber>0&&events.length<20){const dest=offline.createGain();dest.connect(merger,0,events.length);events.push({...context,time});SOUND_BANKS[currentBank].play(dest,time,state,first,context);}};
    // Uneven callbacks exercise the actual scheduler; Web Audio owns the grid.
    for(let i=0;clock<t+.5;i++){scheduler();clock += [0.025,.017,.040,.028][i%4];}
    const rendered=await offline.startRendering();let errors=[];
    for(let i=0;i<20;i++){
     if(events[i].beatNumber!==expected[i].number)throw Error('Wrong count '+test.name);
     const gridError=Math.abs(events[i].time-expected[i].time);if(gridError>1e-9)throw Error('Grid changed');
     const x=rendered.getChannelData(i),start=starts[i];if(start.offset>0)lateStarts++;
     // Locate the actual rendered vowel landmark by matching an independently
     // annotated region of the original word, not by repeating the scheduling math.
     const gender={voiceMale:'male',voiceFemale:'female'}[bank];
     const annotation=anchors.find(a=>a.gender===gender&&a.number===expected[i].number);
     const raw=VOICE_METRONOME_BUFFERS[gender][String(expected[i].number)].getChannelData(0);
     const ref=Math.round(annotation.anchor_ms*48),center=Math.round(expected[i].time*48000);
     const volume=.72*(i===0||expected[i].number===1?1.08:1);
     let bestError=Infinity,bestDelta=0,energy=0;
     for(let j=-240;j<240;j+=4)energy+=(raw[ref+j]||0)**2;
     if(energy<1e-7)throw Error('Missing vowel nucleus in '+bank+' '+expected[i].number);
     for(let ms=-250;ms<=250;ms++){
      // Correlate shape independently of the approved loudness normalization.
      let xy=0,yy=0;for(let j=-240;j<240;j+=4){const target=raw[ref+j]||0,actual=x[center+ms*48+j]||0;xy+=target*actual;yy+=actual*actual;}
      const error=yy>1e-12&&xy>0?Math.max(0,1-xy*xy/(energy*yy)):Infinity;
      if(error<bestError){bestError=error;bestDelta=ms;}
     }
     if(bestError>1e-3)throw Error('Rendered word/landmark differs from reference');
     const err=bestDelta;errors.push(err);maxAttackError=Math.max(maxAttackError,Math.abs(err));
     if(i)maxIntervalError=Math.max(maxIntervalError,Math.abs(err-errors[i-1]));
    }
    results.push({bank,case:test.name,beats:20,maxAttackErrorMs:Math.max(...errors.map(Math.abs)),maxIntervalErrorMs:Math.max(...errors.slice(1).map((e,i)=>Math.abs(e-errors[i]))),lateStarts:starts.filter(s=>s.offset>0).length});
   }
  }
  audioCtx=realCtx;playClick=originalClick;scheduleVisualUpdate=originalVisual;window.setTimeout=nativeTimeout;
  if(maxAttackError>1.1||maxIntervalError>1.1||lateStarts)throw Error(JSON.stringify({maxAttackError,maxIntervalError,lateStarts}));
  return {sampleRate:48000,criterion:'Waveform-matched independently annotated vowel-nucleus landmarks, 1 ms search step',maxAttackErrorMs:maxAttackError,maxIntervalErrorMs:maxIntervalError,lateStarts,results};
 },JSON.parse(fs.readFileSync(require('path').join(__dirname,'voice-anchors.json'),'utf8')));
 save('timing-results.json',result);console.log(JSON.stringify(result,null,2));await browser.close();runtime.server?.close();
})().catch(e=>{console.error(e);process.exit(1)});





