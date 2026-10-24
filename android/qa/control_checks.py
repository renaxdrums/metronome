"""Exercise musical control options in the release WebView on disposable data."""
import json


def run_control_checks(api):
    js, wait, tap, nav, set_value, check, require = api

    def tempos():
        nav('metronome')
        tested=[]
        for bpm in [2,30,60,99,100,120,137,300,998,999]:
            set_value('#bpmSlider',bpm,'input')
            state=js('({tempo,measure:measures[activeMeasureIndex].tempo,display:Number(bpmSlider.value)})')
            require(all(value==bpm for value in state.values()),'Tempo mismatch '+str(state))
            tested.append(state)
        set_value('#bpmSlider',120,'input')
        return tested

    def metrics():
        nav('metronome')
        rows=js('''(()=>{
          const rows=[];
          for(const d of [2,4,8,16,32])for(let n=1;n<=20;n++){
            for(const [id,value] of [['activeNumerator',n],['activeDenominator',d]]){
              const e=document.getElementById(id);e.value=String(value);e.dispatchEvent(new Event('change',{bubbles:true}));
            }
            const m=measures[activeMeasureIndex];
            if(m.numerator!==n||m.denominator!==d||m.beatSubdivisions.length!==n||m.beatStates.length!==n)
              throw Error('Metric option failed '+n+'/'+d);
            rows.push({n,d,steps:measureTotalSteps(m)});
          }
          return rows;
        })()''')
        set_value('#activeNumerator',4);set_value('#activeDenominator',4)
        return {'combinations':rows}

    def subdivisions():
        nav('metronome')
        if js('document.querySelector("#workspaceMobileViews [data-pane=visu]")?.getBoundingClientRect().height>0'):tap('#workspaceMobileViews [data-pane=visu]')
        tap('.step[data-beat="0"]')
        rows=[]
        for division in range(1,9):
            set_value('#beatEditorDivision',division)
            state=js('({subdivision:measures[activeMeasureIndex].beatSubdivisions[0],pads:document.querySelectorAll("#beatEditorPads button").length,states:measures[activeMeasureIndex].beatStates[0]})')
            require(state['subdivision']==division and state['pads']==division,'Subdivision mismatch '+str(state))
            rows.append(state)
        set_value('#beatEditorDivision',1)
        before=js('measures[activeMeasureIndex].beatStates[0][0]');states=[]
        for index in range(4):
            tap('#beatEditorPads button')
            state=js('measures[activeMeasureIndex].beatStates[0][0]')
            require(state==(before+index+1)%4,'Accent cycle mismatch');states.append(state)
        tap('#beatEditor [aria-label="Fermer"]')
        return {'subdivisions':rows,'accent_states':states}

    def volume():
        nav('metronome');rows=[]
        for value in [0,1,25,50,80,100]:
            set_value('#volumeSlider',value,'input')
            actual=js('masterVolume');require(abs(actual-value/100)<1e-8,'Volume mismatch')
            rows.append({'slider':value,'gain':actual})
        set_value('#volumeSlider',80,'input')
        return rows

    def polyrhythms():
        nav('polyrhythm')
        rows=js('''(()=>{
          const rows=[];
          for(let n=2;n<=20;n++)for(let d=2;d<=20;d++){
            for(const [id,value] of [['polyNumerator',n],['polyDenominator',d]]){
              const e=document.getElementById(id);e.value=String(value);e.dispatchEvent(new Event('change',{bubbles:true}));
            }
            const m=measures[activeMeasureIndex],events=getPolyEvents(m);
            if(m.numerator!==n||m.denominator!==d||events.filter(e=>e.outer).length!==n||events.filter(e=>e.inner).length!==d)
              throw Error('Polyrhythm option failed '+n+':'+d);
            rows.push({n,d,events:events.length});
          }return rows;
        })()''')
        set_value('#polyNumerator',5);set_value('#polyDenominator',4)
        tap('#playBtn');wait('isPlaying');tap('#playBtn');wait('!isPlaying')
        return {'ratios':rows,'play_stop':True}

    def training_curves():
        nav('training')
        if js('document.querySelector("#workspaceMobileViews [data-pane=training]")?.getBoundingClientRect().height>0'):tap('#workspaceMobileViews [data-pane=training]')
        curves=js('Array.from(document.querySelectorAll("[data-curve]")).map(e=>e.dataset.curve)')
        set_value('#trainStart',80);set_value('#trainEnd',140);set_value('#trainDuration',2);set_value('#trainDurationUnit','seconds')
        rows=[]
        midpoints={'linear-up':110,'linear-down':110,'linear-up-down':140,'linear-down-up':80,'round-up':125,'round-down':125,'round-up-down':140,'round-down-up':80,'exponential-up':91,'exponential-down':91,'inverse-up':127,'inverse-down':127}
        for curve in curves:
            tap('.training-curve-select > summary');tap('[data-curve='+json.dumps(curve)+']')
            state=js('RENAX_TRAINING.editState')
            require(state['curve']==curve,'Wrong selected curve')
            values=js('(()=>{const run=RENAX_TRAINING.prepare(80,140,2,"up");return [0,1000,2000].map(t=>RENAX_TRAINING.at(run,t))})()')
            require(all(80<=x['bpm']<=140 for x in values) and values[-1]['done'],'Invalid tempo trajectory')
            require(values[1]['bpm']==midpoints[curve],'Curve midpoint mismatch '+curve)
            rows.append({'curve':curve,'trajectory':values})
        tap('.training-curve-select > summary');tap('[data-curve="linear-up"]')
        tap('#trainBtn');wait('isPlaying&&training.active');wait('!isPlaying&&!training.engaged',timeout=8)
        return {'curves':rows,'real_two_second_training_completed':True}

    def training_steps():
        rows=[]
        for direction,target in [('up',84),('down',76)]:
            nav('training')
            if js('document.querySelector("#workspaceMobileViews [data-pane=training]")?.getBoundingClientRect().height>0'):tap('#workspaceMobileViews [data-pane=training]')
            tap('#trainingMode-steps');tap('#dirToggle [data-dir='+json.dumps(direction)+']')
            for selector,value in [('#trainStart',80),('#trainStep',4),('#trainInterval',1),('#trainIntervalUnit','seconds')]:set_value(selector,value)
            tap('#trainBtn');wait('isPlaying&&training.active');wait('tempo',lambda bpm:bpm==target,timeout=8)
            selector=js('(()=>{for(const id of ["trainBtn","trainingVisualBtn"]){const e=document.getElementById(id);if(e&&e.getBoundingClientRect().height>0)return "#"+id}throw Error("Training stop unavailable")})()')
            tap(selector);wait('!isPlaying&&!training.engaged')
            rows.append({'direction':direction,'first_step_bpm':target,'step':4,'interval_seconds':1,'stopped':True})
        nav('training')
        if js('document.querySelector("#workspaceMobileViews [data-pane=training]")?.getBoundingClientRect().height>0'):tap('#workspaceMobileViews [data-pane=training]')
        tap('#trainingMode-progressive')
        return rows

    for name,fn in [
        ('tempo_range_and_boundaries',tempos),
        ('all_100_metric_options',metrics),
        ('all_subdivisions_and_four_accent_states',subdivisions),
        ('volume_controls_zero_to_full',volume),
        ('all_361_polyrhythm_ratios',polyrhythms),
        ('all_twelve_training_curves_and_end_stop',training_curves),
        ('training_steps_up_and_down_real_clock',training_steps),
    ]:
        check(name,fn)
