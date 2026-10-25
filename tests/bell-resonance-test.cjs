const assert=require('node:assert/strict');
const {start,save}=require('./audio-harness.cjs');

(async()=>{
  const h=await start(),p=await h.browser.newPage(),results=[];
  try{
    await p.goto(h.url);
    const renders=await p.evaluate(async()=>{
      await initAudio();await ensureInstrumentBankReady('cloche');
      const rows=[];
      for(const rate of [44100,48000])for(const bank of ['cloche','proCowbell'])for(const state of [1,2,3]){
        const render=async(times)=>{
          const context=new OfflineAudioContext(1,rate*3,rate),starts=[],stops=[];
          const create=context.createBufferSource.bind(context);
          context.createBufferSource=()=>{
            const source=create(),start=source.start.bind(source),stop=source.stop.bind(source);
            source.start=(...args)=>{starts.push(args);start(...args);};
            source.stop=(...args)=>{stops.push(args);stop(...args);};return source;
          };
          audioCtx=context;
          for(const time of times)SOUND_BANKS[bank].play(context.destination,time,state,false);
          return {pcm:Array.from((await context.startRendering()).getChannelData(0)),starts,stops};
        };
        const single=await render([.1]),second=await render([.15]),overlap=await render([.1,.15]);
        let error=0,lateEnergy=0,lastSound=0,peak=0;
        for(let i=0;i<overlap.pcm.length;i++){
          error=Math.max(error,Math.abs(overlap.pcm[i]-single.pcm[i]-second.pcm[i]));
          peak=Math.max(peak,Math.abs(overlap.pcm[i]));
        }
        for(let i=Math.round(rate*.4);i<single.pcm.length;i++){
          lateEnergy+=single.pcm[i]**2;
          if(Math.abs(single.pcm[i])>1e-6)lastSound=i/rate;
        }
        rows.push({rate,bank,state,error,lateEnergy,lastSound,peak,starts:overlap.starts,stops:overlap.stops,
          durations:bank==='cloche'?instrumentSamples.cloche.map(s=>({duration:s.duration,remaining:s.buffer.duration-s.offset})):null});
      }
      return rows;
    });
    for(const row of renders){
      assert(row.error<1e-6,JSON.stringify(row));
      assert(row.lateEnergy>1e-8,JSON.stringify(row));
      assert(row.lastSound>.5,JSON.stringify(row));
      assert.deepEqual(row.stops,[]);
      if(row.bank==='proCowbell')assert(row.starts.every(args=>args.length===1));
      if(row.durations)for(const sample of row.durations)assert(Math.abs(sample.duration-sample.remaining)<1e-9);
    }
    results.push({offline:renders});
    for(const bank of ['cloche','proCowbell']){
      await p.reload();await p.waitForFunction(()=>window.RENAX_WORKSPACE);
      await p.evaluate(async bank=>{
        RENAX_WORKSPACE.go('polyrhythm');currentBank=bank;
        polyrhythmMeasures=measures=[createPolyMeasure(3,4,240)];activeMeasureIndex=0;
        renderSequencerList();renderActiveMeasure();await initAudio();await ensureInstrumentBankReady(bank);
        window.__bellStarts=[];window.__bellStops=[];
        const create=audioCtx.createBufferSource.bind(audioCtx);
        audioCtx.createBufferSource=()=>{
          const source=create(),start=source.start.bind(source),stop=source.stop.bind(source);
          source.start=(...args)=>{window.__bellStarts.push(args);start(...args);};
          source.stop=(...args)=>{window.__bellStops.push(args);stop(...args);};return source;
        };
      },bank);
      await p.locator('#playBtn').click();await p.waitForFunction(()=>window.__bellStarts.length>=14);
      const playing=await p.evaluate(()=>({starts:window.__bellStarts.length,stops:window.__bellStops.length,playing:isPlaying}));
      assert(playing.playing&&playing.starts>=14);assert.equal(playing.stops,0,bank+' choked between hits');
      await p.locator('#playBtn').click();
      results.push({bank,livePolyrhythm:playing});
    }
    // The isolated export must prepare the selected sample bank on a cold page
    // and allocate enough tail for the lowest-pitched final cowbell hit.
    for(const bank of ['cloche','proCowbell']){
      await p.goto(h.url+'/?mp3-render=1');await p.waitForFunction(()=>window.RENAX_MP3_RENDER);
      const result=await p.evaluate(async bank=>{
        const m=createMeasure(1,32,999);m.beatStates=[[3]];
        const song={id:'bell',name:'Bell tail',sections:[{id:'bell-block',label:'Bell',count:1,measure:m}]};
        const rendered=await RENAX_MP3_RENDER.renderPCM(song,bank,.8);
        let lateEnergy=0,end=0;
        for(let i=Math.round(.35*rendered.rate);i<rendered.pcm.length;i++){
          lateEnergy+=rendered.pcm[i]**2;
          if(Math.abs(rendered.pcm[i])>1e-6)end=i/rendered.rate;
        }
        return {score:rendered.score,seconds:rendered.pcm.length/rendered.rate,lateEnergy,end};
      },bank);
      assert(result.score.tail>1,JSON.stringify(result));assert(result.lateEnergy>1e-8,JSON.stringify(result));
      assert(result.end>.5&&result.end<result.seconds-.01,JSON.stringify(result));
      results.push({bank,export:result});
    }
    save('bell-resonance-results.json',results);
    console.log('PASS full bell decay at 44.1/48 kHz, independent overlapping hits, live 3:4 polyrhythm and cold export tails');
  }finally{await h.browser.close();h.server?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
