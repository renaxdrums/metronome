"""Real WebView voice regressions; no synthetic speech or model substitutes."""
import json


def run_voice_checks(api):
    js, wait, tap, nav, set_value, check, require = api

    def live_switch(bank):
        nav('metronome')
        set_value('#soundBank', 'clic')
        tap('#playBtn')
        wait('isPlaying')
        js('''(()=>{
          window.__qaVoiceStarts=[];
          window.__qaOriginalBufferSource=audioCtx.createBufferSource;
          audioCtx.createBufferSource=function(){
            const source=__qaOriginalBufferSource.call(this),start=source.start;
            source.start=function(...args){
              for(const [gender,buffers] of Object.entries(VOICE_METRONOME_BUFFERS))
                for(const [number,buffer] of Object.entries(buffers))
                  if(source.buffer===buffer)__qaVoiceStarts.push({gender,number});
              return start.apply(this,args);
            };return source;
          };return true;
        })()''')
        try:
            set_value('#soundBank', bank)
            gender = 'male' if bank == 'voiceMale' else 'female'
            trace = wait('window.__qaVoiceStarts', lambda x: any(s['gender'] == gender for s in x), timeout=25)
            require(js('isPlaying'), 'Bank switch stopped playback')
            return {'bank': bank, 'recorded_samples_scheduled': trace}
        finally:
            js('(()=>{audioCtx.createBufferSource=__qaOriginalBufferSource;return true})()')
            if js('isPlaying'):
                tap('#playBtn')

    def every_sample():
        js('(()=>{window.__qaSamples={pending:true};prepareAllVoiceAudio().then(async()=>{const original=audioCtx,bank=currentBank;const rows=[];try{for(const [gender,key] of [["male","voiceMale"],["female","voiceFemale"]])for(let n=1;n<=20;n++){const buffer=VOICE_METRONOME_BUFFERS[gender][String(n)];if(!buffer)throw Error("Missing "+gender+" "+n);const ctx=new OfflineAudioContext(1,Math.ceil((buffer.duration+1)*48000),48000);audioCtx=ctx;currentBank=key;const out=ctx.createGain();out.connect(ctx.destination);let oscillators=0;const create=ctx.createOscillator.bind(ctx);ctx.createOscillator=(...args)=>{oscillators++;return create(...args)};playClick(1,.4,false,{beatNumber:n,subIndex:0,beatDurationSec:.5});const rendered=await ctx.startRendering();let energy=0,peak=0;for(const x of rendered.getChannelData(0)){energy+=x*x;peak=Math.max(peak,Math.abs(x))}if(!(energy>0&&peak>0)||oscillators)throw Error("Silent or substituted voice "+gender+" "+n);rows.push({gender,number:n,samples:buffer.length,peak,energy,oscillators})}window.__qaSamples={rows}}finally{audioCtx=original;currentBank=bank}}).catch(e=>window.__qaSamples={error:String(e.stack)});return true})()')
        state = wait('window.__qaSamples', lambda x: not x.get('pending'), timeout=75)
        require(not state.get('error'), state.get('error'))
        require(len(state['rows']) == 40, 'Expected 40 rendered original samples')
        return state

    check('cold_switch_to_male_voice_during_playback', lambda: live_switch('voiceMale'))
    check('switch_to_female_voice_during_playback', lambda: live_switch('voiceFemale'))
    check('forty_original_voice_samples_decoded_and_rendered', every_sample)


def check_guide(language, api):
    js, wait, tap, nav, set_value, check, require = api
    nav('tracks')
    # Only the emulator's disposable QA library is changed.
    js('''(()=>{
      window.__qaGuideErrors=[];
      window.addEventListener('securitypolicyviolation',e=>__qaGuideErrors.push({directive:e.violatedDirective,url:e.blockedURI}));
      window.addEventListener('unhandledrejection',e=>__qaGuideErrors.push({error:String(e.reason)}));
      const l=JSON.parse(JSON.stringify(RENAX_SONGS.library));
      const s=l.profiles.find(p=>p.id===l.activeProfile).songs.at(-1);
      s.amorce=false;s.sections=s.sections.slice(0,1);s.sections[0].label='Intro';
      s.sections[0].amorceLanguage=''' + json.dumps(language) + ''';
      window.__qaGuideSong=s.id;
      RENAX_SONGS.replaceLibrary(l,true);
      RENAX_SONGS.restoreNavigation({pane:'songs',view:'detail',profile:l.activeProfile,song:s.id});
      return true;
    })()''')
    tap('#songAmorceBtn')
    js('''(()=>{
      window.__qaGuide={pending:true};
      const song=RENAX_SONGS.library.profiles.find(p=>p.id===RENAX_SONGS.library.activeProfile).songs.find(s=>s.id===__qaGuideSong);
      RENAX_AMORCE.prepare(song).then(plan=>{
        const speech=plan.speeches[0];let peak=0;
        for(const x of speech.pcm)peak=Math.max(peak,Math.abs(x));
        window.__qaGuide={samples:speech.pcm.length,sampleRate:speech.sampleRate,peak,model:speech.model,countInMeasures:plan.countInMeasures};
      },e=>window.__qaGuide={error:String(e.stack)});return true;
    })()''')
    try:
        result = wait('window.__qaGuide', lambda x: not x.get('pending'), timeout=240)
        require(not result.get('error'), result.get('error'))
        require(result['samples'] > 1000 and result['peak'] > .001, 'Empty guide vocal audio')
        tap('#playBtn')
        wait('isPlaying', timeout=25)
        tap('#playBtn')
        wait('!isPlaying')
        return dict(result, language=language, actual_neural_model=True, play_stop=True)
    except Exception as error:
        details=js('({state:window.__qaGuide,errors:window.__qaGuideErrors,resources:performance.getEntriesByType("resource").map(r=>({url:r.name,duration:r.duration})).filter(r=>/espeak|onnx|piper|neural|huggingface/.test(r.url)),text:document.body.innerText.slice(-2500)})')
        raise AssertionError(str(error)+'; diagnostic='+json.dumps(details,ensure_ascii=False)) from error
    finally:
        js('(()=>{const l=JSON.parse(JSON.stringify(RENAX_SONGS.library));const s=l.profiles.find(p=>p.id===l.activeProfile).songs.find(s=>s.id===__qaGuideSong);s.amorce=false;RENAX_SONGS.replaceLibrary(l,true);return true})()')
