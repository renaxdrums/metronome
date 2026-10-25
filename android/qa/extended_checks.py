"""Native WebView checks for editing, transport rules and every exposed preference."""
import json, time


def run_extended_checks(api, api_request):
    js, wait, tap, nav, set_value, check, require = api

    def text_button(root, text):
        selector=js('''(()=>{const root=document.querySelector('''+json.dumps(root)+''');if(!root)throw Error('Missing action container');const rows=[...root.querySelectorAll('button,[role=menuitem]')].filter(e=>e.textContent.trim()==='''+json.dumps(text)+'''&&!e.hidden&&getComputedStyle(e).visibility!=='hidden');if(rows.length!==1)throw Error('Expected one action '+'''+json.dumps(text)+'''+', found '+rows.length);rows[0].dataset.qaAction='active';return '[data-qa-action=active]'})()''')
        try:tap(selector)
        finally:js('(()=>{document.querySelectorAll("[data-qa-action]").forEach(e=>e.removeAttribute("data-qa-action"));return true})()')

    def modal(value=None):
        wait('!!document.querySelector("dialog[open] .song-confirm-accept")')
        if value is not None:set_value('dialog[open] input',value,'input')
        tap('dialog[open] .song-confirm-accept')
        wait('!document.querySelector("dialog[open]")')

    def seed_tracks():
        return js('''(()=>{const original=JSON.parse(JSON.stringify(RENAX_SONGS.library));const make=(id)=>({id,name:id,sections:[{id:'block-'+id,label:'Intro',count:1,measure:createMeasure(4,4,240)}]});RENAX_SONGS.replaceLibrary({version:1,activeProfile:'qa-empty',profiles:[{id:'qa-empty',name:'Vide QA',songs:[]},{id:'qa-first',name:'Playlist QA',songs:[make('Track QA A'),make('Track QA B')]},{id:'qa-next',name:'Autre QA',songs:[make('Track QA C')]}]},true);RENAX_SONGS.restoreNavigation({pane:'songs',view:'playlists',profile:'qa-empty',song:null});return original})()''')

    def restore_tracks(original):
        js('(()=>{stopMetronome();RENAX_SONGS.replaceLibrary('+json.dumps(original)+''',true);RENAX_SONGS.restoreNavigation({pane:'songs',view:'playlist',profile:RENAX_SONGS.library.activeProfile,song:null});return true})()''')

    def tap_tempo():
        nav('metronome')
        if not js('document.querySelector("#workspaceControls").open'):tap('#workspaceControls summary')
        js('(()=>{window.__qaTapTimes=[];window.__qaTapListener=()=>__qaTapTimes.push(performance.now());tapBtn.addEventListener("click",__qaTapListener,true);return true})()')
        try:
            for _ in range(4):tap('#tapBtn');time.sleep(.25)
            wait('__qaTapTimes.length',lambda x:x==4)
            state=js('({times:__qaTapTimes,bpm:tempo,measure:measures[activeMeasureIndex].tempo,retained:tapTimes.slice()})')
            # Native gestures can exceed the app's two-second reset on a busy emulator.
            # Derive the last uninterrupted series from captured event times, not its BPM.
            retained=[]
            for instant in state['times']:
                if retained and instant-retained[-1]>=2000:retained=[]
                retained.append(instant)
            require(len(retained)>=2,'Emulator too slow to retain two Tap events: '+str(state))
            require(len(state['retained'])==len(retained) and all(abs(a-b)<5 for a,b in zip(state['retained'],retained)),'Tap history does not match captured events and the two-second reset: '+str(state))
            expected=round(60000/((retained[-1]-retained[0])/(len(retained)-1)))
            require(len(state['times'])==4 and abs(state['bpm']-expected)<=1 and state['measure']==state['bpm'],'Tap tempo differs from the real tap intervals: '+str(state)+'; expected='+str(expected))
            return {'four_native_taps':True,'measured_bpm':expected,'applied_bpm':state['bpm']}
        finally:
            js('(()=>{tapBtn.removeEventListener("click",__qaTapListener,true);return true})()');set_value('#bpmSlider',120,'input')

    def step_limits():
        nav('metronome');rows=[]
        if not js('document.querySelector("#workspaceControls").open'):tap('#workspaceControls summary')
        for bpm,button,expected in [(2,'tempoDecrease',2),(2,'tempoIncrease',3),(999,'tempoIncrease',999),(999,'tempoDecrease',998)]:
            set_value('#bpmSlider',bpm,'input')
            disabled=js('document.querySelector('+json.dumps('#'+button)+').disabled')
            if disabled:require(expected==bpm,'Valid stepper action is disabled')
            else:tap('#'+button)
            value=wait('tempo',lambda x:x==expected);require(value==expected,'Tempo boundary button failed: '+str({'from':bpm,'button':button,'actual':value,'expected':expected}));rows.append({'from':bpm,'button':button,'result':value})
        set_value('#bpmSlider',120,'input');return rows

    def volume_output():
        nav('metronome');set_value('#soundBank','clic');set_value('#bpmSlider',240,'input');tap('#playBtn');wait('isPlaying')
        js('(()=>{window.__qaVolumeAnalyser=audioCtx.createAnalyser();__qaVolumeAnalyser.fftSize=4096;window.__qaVolumeSink=audioCtx.createMediaStreamDestination();__qaVolumeAnalyser.connect(__qaVolumeSink);getAudioMixDestination(audioCtx).connect(__qaVolumeAnalyser);window.__qaVolumeEvents=[];window.__qaVolumeClick=playClick;playClick=function(...args){__qaVolumeEvents.push({volume:masterVolume,bank:currentBank,time:args[1]});return __qaVolumeClick(...args)};return true})()')
        peaks=[]
        try:
            for value in [0,80]:
                set_value('#volumeSlider',value,'input')
                js('(()=>{window.__qaVolumePeak=null;const data=new Float32Array(__qaVolumeAnalyser.fftSize),start=performance.now();let peak=0;const timer=setInterval(()=>{__qaVolumeAnalyser.getFloatTimeDomainData(data);if(performance.now()-start>300)for(const x of data)peak=Math.max(peak,Math.abs(x));if(performance.now()-start>900){clearInterval(timer);__qaVolumePeak=peak}},20);return true})()')
                peak=wait('window.__qaVolumePeak',lambda x:x is not None);peaks.append({'volume':value,'peak':peak})
            require(peaks[0]['peak']<1e-7 and peaks[1]['peak']>1e-5,'Volume control did not mute/unmute the audio output: '+str(peaks)+'; events='+str(js('__qaVolumeEvents')))
            return peaks
        finally:
            js('(()=>{getAudioMixDestination(audioCtx).disconnect(__qaVolumeAnalyser);__qaVolumeAnalyser.disconnect();__qaVolumeSink.stream.getTracks().forEach(t=>t.stop());playClick=__qaVolumeClick;return true})()');tap('#playBtn');wait('!isPlaying');set_value('#bpmSlider',120,'input');set_value('#volumeSlider',80,'input')

    def reset_undo():
        nav('metronome');set_value('#volumeSlider',25,'input');time.sleep(.35);set_value('#volumeSlider',50,'input');time.sleep(.35)
        tap('#undoBtn');wait('masterVolume',lambda x:abs(x-.25)<1e-8)
        set_value('#activeNumerator',7);set_value('#activeDenominator',8);set_value('#measureCount',2)
        tap('#panicBtn');state=js('({playing:isPlaying,count:measures.length,n:measures[0].numerator,d:measures[0].denominator})')
        require(state=={'playing':False,'count':1,'n':4,'d':4},'Reset did not restore one 4/4 measure')
        set_value('#volumeSlider',80,'input');return {'undo_restored_volume':.25,'reset':state}

    def silent_options():
        nav('training')
        if js('document.body.dataset.mobilePane!=="training"'):tap('#workspaceMobileViews [data-pane=training]')
        if not js('document.querySelector(".silent-section").classList.contains("is-expanded")'):tap('.silent-collapse')
        if not js('silentModeEnabled'):tap('#silentToggle')
        rows=[]
        for selector,field,start in [('#clickMeasureCount','clickMeasures',1),('#silentMeasureCount','silentMeasures',0)]:
            for value in range(start,33):
                set_value(selector,value);require(js(field)==value,'Silent cycle option failed');rows.append({'field':field,'value':value})
        set_value('#clickMeasureCount',1);set_value('#silentMeasureCount',1);tap('#silentToggle');require(not js('silentModeEnabled'),'Silent mode did not turn off')
        return {'enabled_and_disabled':True,'all_click_and_silent_counts':rows}

    def score_editor():
        nav('metronome');tap('#scorePartitionBtn')
        wait('RENAX_SCORE.enabled&&!!document.querySelector("#rhythmScore svg")',timeout=30)
        before=js('RENAX_SCORE.snapshot');require(before['font']=='Bravura' and before['notes']>0,'Missing notation')
        tap('#scoreEditBtn');wait('!document.querySelector("#rhythmEditor").hidden')
        set_value('#activeNumerator',7);set_value('#activeDenominator',8)
        wait('document.querySelectorAll("#rhythmEditor .score-group-tools select").length',lambda x:x==3)
        groups=js('Array.from(document.querySelectorAll("#rhythmEditor .score-group-tools select")).map(e=>Number(e.value))');require(groups==[2,2,3],'Wrong default 7/8 grouping')
        tap('#scoreGroupingToggle');require(js('document.querySelector("#scoreGroupingToggle").getAttribute("aria-pressed")')=='true','Free grouping did not enable')
        tap('#scoreGroupingToggle');tap('#scoreEditBtn');tap('#scoreMetronomeBtn');require(not js('RENAX_SCORE.enabled'),'Circular view did not restore')
        set_value('#activeNumerator',4);set_value('#activeDenominator',4)
        return {'notation':before,'grouping_7_8':groups,'free_grouping_toggle':True,'circular_view_restored':True}

    def preferences_and_bluetooth():
        nav('metronome');tap('#index2SettingsBtn');wait('document.querySelector("#index2SettingsBtn").getAttribute("aria-expanded")',lambda x:x=='true')
        for state in [True,False]:
            if js('document.querySelector("#bluetoothHeadphones").checked')!=state:tap('#bluetoothHeadphones')
            require(js('RENAX_PLAYBACK.delayMs({outputLatency:0,baseLatency:0})')==(200 if state else 0),'Bluetooth visual correction mismatch')
            require(js('localStorage.getItem("renax.bluetoothHeadphones.v1")')==str(state).lower(),'Bluetooth preference not persisted')
        tap('#index2SettingsBtn');wait('document.querySelector("#index2SettingsBtn").getAttribute("aria-expanded")',lambda x:x=='false')
        return {'bluetooth_manual_ms':[200,0],'setting_persisted':True,'gear_opens_and_closes':True}

    def playlist_transport():
        nav('tracks');original=seed_tracks()
        try:
            tap('#playBtn');wait('isPlaying&&RENAX_SONGS.navigation.song==="Track QA A"');wait('!isPlaying',timeout=8)
            require(js('RENAX_SONGS.navigation.profile')=='qa-first','Playback chose wrong first nonempty playlist')
            require(js('document.querySelector(".song-chain-toggle").getAttribute("aria-pressed")')=='false','Chaining should be off initially')
            tap('.song-playlist-card[data-song-id="Track QA B"] .song-open');tap('#playBtn');wait('isPlaying&&RENAX_SONGS.navigation.song==="Track QA B"');wait('!isPlaying',timeout=8)
            tap('.song-chain-toggle');tap('.song-playlist-card .song-open');tap('#playBtn')
            wait('isPlaying&&RENAX_SONGS.navigation.song==="Track QA B"',timeout=10);wait('!isPlaying',timeout=8)
            require(js('RENAX_SONGS.navigation.profile')=='qa-first','Playback crossed into a different playlist')
            return {'first_nonempty_playlist':True,'selected_track':True,'default_end_stop':True,'optional_chain_within_playlist_only':True}
        finally:restore_tracks(original)

    def empty_track():
        nav('tracks');original=seed_tracks()
        try:
            js('RENAX_SONGS.replaceLibrary({version:1,activeProfile:"only-empty",profiles:[{id:"only-empty",name:"Vide",songs:[]}]},true)')
            require(js('document.querySelector("#playBtn").hidden&&getComputedStyle(document.querySelector("#playBtn")).display==="none"'),'Empty Track still shows a play button')
            js('startMetronome()');require(not js('isPlaying'),'Empty track workspace started another mode')
            return {'empty_playlist_keeps_transport_stopped':True,'empty_track_play_button_hidden':True}
        finally:restore_tracks(original)

    def track_actions():
        nav('tracks');original=seed_tracks()
        try:
            js('RENAX_SONGS.restoreNavigation({pane:"songs",view:"playlist",profile:"qa-first",song:null})')
            tap('.song-playlist-card .song-more[aria-haspopup=menu]');text_button('.song-playlist-card .song-more-menu','Renommer');modal('Renommé QA')
            require(js('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-first").songs[0].name')=='Renommé QA','Rename failed')
            tap('.song-playlist-card .song-more[aria-haspopup=menu]');text_button('.song-playlist-card .song-more-menu','Dupliquer')
            require(js('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-first").songs.length')==3,'Duplicate failed')
            tap('.song-playlist-card .song-more[aria-haspopup=menu]');text_button('.song-playlist-card .song-more-menu','Supprimer');modal()
            require(js('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-first").songs.length')==2,'Delete failed')
            return {'rename':True,'duplicate':True,'delete_confirmation':True}
        finally:restore_tracks(original)

    def section_actions():
        nav('tracks');original=seed_tracks()
        try:
            js('RENAX_SONGS.restoreNavigation({pane:"songs",view:"detail",profile:"qa-first",song:"Track QA A"})')
            tap('.song-section .song-block-header')
            fields=js('Array.from(document.querySelectorAll(".song-section .song-block-controls select")).map(e=>({label:e.getAttribute("aria-label"),value:e.value}))')
            require(len(fields)>=2,'Section controls absent')
            set_value('.song-section .song-block-controls select',2)
            set_value('.song-section .song-block-controls label:nth-child(2) select','custom');modal('120')
            tap('.song-ramp-toggle input')
            set_value('.song-ramp-target select','custom');modal('180')
            s=js('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-first").songs[0].sections[0]')
            require(s['count']==2 and s['measure']['tempo']==120 and s['tempoRamp']['enabled'] and s['tempoRamp']['endTempo']==180,'Section count/tempo/ramp failed')
            tap('.song-section .song-more[aria-haspopup=menu]');text_button('.song-section .song-more-menu','Dupliquer')
            require(js('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-first").songs[0].sections.length')==2,'Block duplication failed')
            tap('.song-section .song-more[aria-haspopup=menu]');text_button('.song-section .song-more-menu','Supprimer')
            require(js('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-first").songs[0].sections.length')==1,'Block removal failed')
            tap('[aria-label="Ajouter un décompte"]')
            count_in=js('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-first").songs[0].countIn');require(count_in['count']==1,'Count-in missing')
            tap('[aria-label="Actions du décompte"]');text_button('.song-count-in .song-more-menu','Supprimer')
            require(not js('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-first").songs[0].countIn'),'Count-in removal failed')
            return {'measure_count':2,'tempo':120,'ramp_end':180,'duplicate_delete_block':True,'add_delete_count_in':True}
        finally:restore_tracks(original)

    def multi_confirm(value=None):
        wait('!!document.querySelector(".multi-modal")')
        if value is not None:set_value('.multi-modal input',value,'input')
        text_button('.multi-modal-actions','Valider');wait('!document.querySelector(".multi-modal")')

    def sequence_actions():
        nav('sequence');rows=[]
        for value in range(1,9):
            set_value('#measureCount',value);require(js('measures.length')==value,'Sequence measure count failed');rows.append(value)
        require(js('document.querySelector("#sequenceAddMeasure").disabled'),'Ninth measure was not prevented')
        set_value('#measureCount',1)
        tap('#measureList .sequence-more summary');text_button('#measureList .sequence-more-actions','Dupliquer');wait('measures.length',lambda x:x==2)
        tap('#measureList .sequence-more summary');text_button('#measureList .sequence-more-actions','Renommer');multi_confirm('Mesure QA')
        require(js('measures[0].name')=='Mesure QA','Sequence rename failed')
        tap('#measureList .sequence-more summary');text_button('#measureList .sequence-more-actions','Supprimer');wait('measures.length',lambda x:x==1)
        tap('#measureList .sequence-preview-play');wait('isPlaying&&loopedMeasure===measures[0]')
        tap('#measureList .sequence-preview-play');wait('!isPlaying')
        return {'all_measure_counts':rows,'limit_eight':True,'duplicate_rename_delete':True,'isolated_measure_play_stop':True}

    def multi_actions():
        nav('multi')
        if js('!document.querySelector("#multiPresetLibrary").hidden'):tap('#multiPresetLibrary > button')
        set_value('#multiControls .multi-preset-name','Ensemble QA','input')
        set_value('#multiControls .multi-preset-name','Ensemble QA','change')
        tap('#multiControls .multi-add')
        count=js('document.querySelectorAll("#multiTracks .multi-track").length')
        tap('#multiTracks .multi-mute');require(js('document.querySelector("#multiTracks .multi-mute").getAttribute("aria-pressed")')=='true','Track mute failed')
        tap('#multiTracks .multi-mute');tap('#multiTracks .multi-solo');wait('isPlaying&&!!RENAX_MULTI.solo');tap('#playBtn');wait('!isPlaying&&!RENAX_MULTI.solo')
        tap('#multiTracks .multi-more summary');text_button('#multiTracks .multi-actions','Dupliquer');wait('document.querySelectorAll("#multiTracks .multi-track").length',lambda x:x==count+1)
        tap('#multiTracks .multi-more summary');text_button('#multiTracks .multi-actions','Renommer');multi_confirm('Piste QA')
        require(js('document.querySelector("#multiTracks .multi-track-name").textContent')=='Piste QA','Track rename failed')
        set_value('#multiTracks .multi-bank-row select','voiceFemale')
        wait('JSON.parse(localStorage.getItem("renax.multimetro.v1")).tracks[0].bank',lambda x:x=='voiceFemale')
        tap('#multiTracks .multi-more summary');text_button('#multiTracks .multi-actions','Supprimer');wait('document.querySelectorAll("#multiTracks .multi-track").length',lambda x:x==count)
        selected=js('JSON.parse(localStorage.getItem("renax.multimetro.v1")).selectedPreset')
        tap('#multiControls .song-back')
        selector='#multiPresetLibrary [data-preset-id='+json.dumps(selected)+']'
        tap(selector+' .multi-more summary');text_button(selector+' .multi-actions','Renommer');multi_confirm('Ensemble QA renommé')
        require(js('JSON.parse(localStorage.getItem("renax.multimetro.v1")).presets.find(p=>p.id==='+json.dumps(selected)+').name')=='Ensemble QA renommé','Preset rename did not persist')
        before=js('JSON.parse(localStorage.getItem("renax.multimetro.v1")).presets.length')
        tap(selector+' .multi-more summary');text_button(selector+' .multi-actions','Dupliquer')
        require(js('JSON.parse(localStorage.getItem("renax.multimetro.v1")).presets.length')==before+1,'Preset duplicate failed')
        tap(selector+' .multi-more summary');text_button(selector+' .multi-actions','Supprimer');multi_confirm()
        require(js('JSON.parse(localStorage.getItem("renax.multimetro.v1")).presets.length')==before,'Preset delete failed')
        tap('#multiPresetLibrary > button')
        return {'mute_and_unmute':True,'solo_transport':True,'track_duplicate_rename_delete':True,'per_track_bank_persisted':True,'preset_rename_duplicate_delete':True}

    def playlist_actions():
        nav('tracks');original=seed_tracks()
        try:
            tap('.playlist-create');modal('Nouvelle QA')
            require(js('RENAX_SONGS.library.profiles.length')==4,'Playlist creation failed')
            js('RENAX_SONGS.restoreNavigation({pane:"songs",view:"playlists",profile:RENAX_SONGS.library.activeProfile,song:null})')
            root='.playlist-list > div:last-child'
            tap(root+' .song-more[aria-haspopup=menu]');text_button(root+' .song-more-menu','Renommer');modal('Playlist renommée QA')
            require(js('RENAX_SONGS.library.profiles.at(-1).name')=='Playlist renommée QA','Playlist rename failed')
            tap(root+' .song-more[aria-haspopup=menu]');text_button(root+' .song-more-menu','Supprimer');modal()
            require(js('RENAX_SONGS.library.profiles.length')==3,'Playlist deletion failed')
            return {'create':True,'rename':True,'delete_with_confirmation':True}
        finally:restore_tracks(original)

    def copy_move_track():
        nav('tracks');original=seed_tracks()
        try:
            js('RENAX_SONGS.restoreNavigation({pane:"songs",view:"playlist",profile:"qa-first",song:null})')
            tap('.song-playlist-card .song-more[aria-haspopup=menu]');text_button('.song-playlist-card .song-more-menu','Copier vers…')
            wait('!!document.querySelector("dialog[open] select")');set_value('dialog[open] select','qa-next');modal()
            require(js('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-next").songs.length')==2,'Track copy failed')
            require(js('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-first").songs.length')==2,'Copy removed source track')
            tap('.song-playlist-card .song-more[aria-haspopup=menu]');text_button('.song-playlist-card .song-more-menu','Déplacer vers…')
            wait('!!document.querySelector("dialog[open] select")');set_value('dialog[open] select','qa-next');modal()
            require(js('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-next").songs.length')==3,'Track move did not add destination')
            require(js('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-first").songs.length')==1,'Track move retained source')
            return {'copy_preserves_source':True,'move_removes_source_and_adds_destination':True}
        finally:restore_tracks(original)

    def native_reorder():
        nav('tracks');original=seed_tracks()
        try:
            js('RENAX_SONGS.restoreNavigation({pane:"songs",view:"playlist",profile:"qa-first",song:null})')
            api_request('dragCss',source='.song-playlist-card[data-song-id="Track QA A"] .song-open',target='.song-playlist-card[data-song-id="Track QA B"] .song-open')
            order=wait('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-first").songs.map(s=>s.id)',lambda x:x==['Track QA B','Track QA A'])
            return {'native_long_press_and_drag':True,'result_order':order}
        finally:restore_tracks(original)

    def score_duration_options():
        nav('metronome');tap('#panicBtn');set_value('#activeNumerator',8);set_value('#activeDenominator',4)
        tap('#scorePartitionBtn');wait('!!document.querySelector("#rhythmScore svg")',timeout=30)
        tap('#scoreEditBtn');tap('#scoreFreeMeasureBtn');wait('measures[0].rhythmEditor?.free')
        tap('#rhythmScore [data-event="0"]')
        rows=[]
        try:
            for duration in [1,2,4,8,16,32]:
                for dotted in [False,True]:
                    selector='#rhythmEditor [data-duration="'+str(duration)+'"][data-dotted="'+str(dotted).lower()+'"]'
                    disabled=js('document.querySelector('+json.dumps(selector)+').disabled')
                    expected=4/duration*(1.5 if dotted else 1)
                    if disabled:
                        require(duration==32 and dotted,'Unexpected disabled note duration')
                        rows.append({'duration':duration,'dotted':dotted,'disabled_by_32nd_note_resolution':True})
                    else:
                        tap(selector);actual=wait('measures[0].rhythmEditor.events[0].end-measures[0].rhythmEditor.events[0].start',lambda x:abs(x-expected)<1e-8)
                        rows.append({'duration':duration,'dotted':dotted,'beat_units':actual})
            return {'free_measure_enabled':True,'all_twelve_duration_controls':rows}
        finally:
            if js('document.querySelector("#scoreEditBtn").getAttribute("aria-pressed")==="true"'):tap('#scoreEditBtn')
            tap('#scoreMetronomeBtn');tap('#panicBtn')

    def silent_audio():
        nav('training')
        if js('document.body.dataset.mobilePane!=="training"'):tap('#workspaceMobileViews [data-pane=training]')
        if not js('document.querySelector(".silent-section").classList.contains("is-expanded")'):tap('.silent-collapse')
        set_value('#activeNumerator',2);set_value('#activeDenominator',4)
        for selector,value in [('#trainStart',300),('#trainEnd',301),('#trainDuration',3),('#trainDurationUnit','seconds')]:set_value(selector,value)
        if not js('silentModeEnabled'):tap('#silentToggle')
        set_value('#clickMeasureCount',1);set_value('#silentMeasureCount',1);set_value('#soundBank','clic')
        js('(()=>{window.__qaSilentCalls=[];window.__qaSilentClick=playClick;playClick=function(...args){__qaSilentCalls.push(args[1]);return __qaSilentClick(...args)};return true})()')
        try:
            tap('#trainBtn');wait('isPlaying');wait('!isPlaying&&!training.engaged',timeout=8)
            calls=js('__qaSilentCalls');gaps=[b-a for a,b in zip(calls,calls[1:])]
            require(len(calls)>=4 and min(gaps)<.22 and max(gaps)>.5,'Silent measures did not create the expected missing beats: '+str(gaps))
            return {'recorded_note_times':calls,'note_intervals':gaps,'one_audible_one_silent_bar':True}
        finally:
            js('(()=>{playClick=__qaSilentClick;stopMetronome();endTraining();return true})()')
            nav('training')
            if js('silentModeEnabled'):tap('#silentToggle')
            set_value('#activeNumerator',4);set_value('#activeDenominator',4);set_value('#trainStart',80);set_value('#trainEnd',140);set_value('#trainDuration',2)

    def native_block_reorder():
        nav('tracks');original=seed_tracks()
        try:
            js('(()=>{const l=JSON.parse(JSON.stringify(RENAX_SONGS.library)),s=l.profiles.find(p=>p.id==="qa-first").songs[0];s.sections=[{id:"qa-block-A",label:"Intro",count:1,measure:createMeasure(4,4,120)},{id:"qa-block-B",label:"Refrain",count:1,measure:createMeasure(4,4,120)}];RENAX_SONGS.replaceLibrary(l,true);RENAX_SONGS.restoreNavigation({pane:"songs",view:"detail",profile:"qa-first",song:s.id});return true})()')
            api_request('dragCss',source='.song-section[data-section-id="qa-block-A"] .song-block-header',target='.song-section[data-section-id="qa-block-B"] .song-block-header')
            order=wait('RENAX_SONGS.library.profiles.find(p=>p.id==="qa-first").songs[0].sections.map(s=>s.id)',lambda x:x==['qa-block-B','qa-block-A'])
            return {'native_block_long_press_and_drag':True,'result_order':order}
        finally:restore_tracks(original)

    for name,fn in [
        ('sequence_all_counts_and_edit_actions',sequence_actions),
        ('multipiste_track_and_preset_edit_actions',multi_actions),
        ('playlist_create_rename_delete',playlist_actions),
        ('track_copy_and_move_between_playlists',copy_move_track),
        ('native_long_press_track_reorder',native_reorder),
        ('partition_all_note_duration_controls',score_duration_options),
        ('silent_cycle_creates_actual_missing_beats',silent_audio),
        ('native_long_press_block_reorder',native_block_reorder),
        ('native_tap_tempo_measured_intervals',tap_tempo),
        ('native_tempo_stepper_boundaries',step_limits),
        ('volume_zero_mutes_actual_signal',volume_output),
        ('reset_and_undo_controls',reset_undo),
        ('all_silent_cycle_count_options',silent_options),
        ('bravura_partition_editor_and_grouping',score_editor),
        ('preferences_gear_and_bluetooth_storage',preferences_and_bluetooth),
        ('track_first_selected_chain_and_playlist_boundaries',playlist_transport),
        ('empty_track_workspace_does_not_start_metronome',empty_track),
        ('track_rename_duplicate_delete_native_actions',track_actions),
        ('section_count_tempo_ramp_copy_delete_and_count_in',section_actions),
    ]:check(name,fn)
