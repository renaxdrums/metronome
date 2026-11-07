/* exported
  resizeBeat, renderSubdivisionDots, buildCircularSequencer, schedulerSafely, scheduler,
  scheduleVisualUpdate, createPolyMeasure, ensurePolyStates, clampPolyValue, getPolyEvents,
  buildPolyVisualizer, renderPolyrhythmList, renderSequencerListMetronome, renderActiveMeasureMetronome, schedulePolyVisualUpdate,
  schedulerPolyrhythm, setAppMode, updateActivePolyRatio, startMetronome, stopMetronome,
  setDirection, startTraining, resetTrainingToStart, restartTraining, trainingTick,
  endTraining, updateTrainButton, tapTimes, tapFlashTimeout, doTapTempo,
  isEditingField, voicePreparationSection, voicePreparationHeading, voicePreparationButton, voicePreparationStatus
*/
    function resizeBeat(m, beatIdx, newSubdiv) {
      if (!allowedSubdivisions(m.denominator).includes(newSubdiv)) return;
      const oldSubdiv = m.beatSubdivisions[beatIdx];
      m.beatSubdivisions[beatIdx] = newSubdiv;
      const states = m.beatStates[beatIdx];
      while (states.length > newSubdiv) states.pop();
      while (states.length < newSubdiv) states.push(0);
      if (states.length > 0 && oldSubdiv === 0) states[0] = 1;

    }

    function renderSubdivisionDots(m) {
      sequencerContainer.querySelectorAll('.subdivision-dot').forEach(el=>el.remove());
      const maxDivision=Math.max(...m.beatSubdivisions);
      sequencerContainer.style.setProperty('--dot-size',Math.max(2,Math.min(6,2*Math.PI*(RING_RADIUS-STEP_SIZE)/m.numerator/maxDivision*.45))+'px');
      for(let beat=0;beat<m.numerator;beat++) {
        const count=m.beatSubdivisions[beat];if(count===1)continue;
        for(let sub=0;sub<count;sub++) {
          const dot=document.createElement('span');dot.className='subdivision-dot';dot.dataset.beat=beat;dot.dataset.subIndex=sub;dot.dataset.state=m.beatStates[beat][sub];
          dot.style.setProperty('--angle',((beat+sub/count)/m.numerator*360)+'deg');sequencerContainer.appendChild(dot);
        }
      }
    }
    function buildCircularSequencer(m) {
      sequencerContainer.querySelectorAll('.step, .subdivision-dot, .beat-divider, .poly-dot, .poly-ring').forEach(el => el.remove());
      totalSteps = m.numerator;
      stepsData = [];
      for (let b = 0; b < m.numerator; b++) {
        stepsData.push({ beat: b, subIndex: 0, globalIndex: b });
        const step = document.createElement('div');
        step.className = 'step';
        // Regroupement graphique uniquement des signatures composées validées en /8.
        if (m.denominator === 8 && [6, 9, 12, 15, 18].includes(m.numerator)) {
          step.classList.add(b % 3 === 0 ? 'compound-strong' : 'compound-weak');
        }
        if (m.numerator === 3 && m.denominator === 8 && b === 0) step.classList.add('measure-start');
        step.dataset.state = m.beatStates[b][0];
        step.dataset.index = b;
        step.dataset.beat = b;
        step.setAttribute('role','button');
        step.tabIndex = 0;
        step.setAttribute('aria-label','Régler le temps ' + (b+1));
        step.title='Subdiviser ce temps';
        const angle = b / m.numerator * 360;
        step.style.setProperty('--angle', angle + 'deg');
        const number = document.createElement('span');
        number.textContent = b + 1;
        number.style.cssText = 'font-size:11px;font-weight:700;color:var(--step-number-color,#111);transform:rotate(' + (-angle) + 'deg)';
        if (!m.beatStates[b][0]) number.style.color = '#ddd';
        step.appendChild(number);
        step.addEventListener('click', () => openBeatEditor(m,b));
        step.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();openBeatEditor(m,b);} });
        sequencerContainer.appendChild(step);
        const divider = document.createElement('div');
        divider.className = 'beat-divider';
        divider.style.setProperty('--divider-angle',angle+'deg');
        sequencerContainer.appendChild(divider);
      }
      updateRingRadius();
      renderSubdivisionDots(m);
    }

    function schedulerSafely() {
      try { scheduler(); } catch(error) { reportAudioFailure(error); }
    }

    // Count actual completed measures, rather than expanding patterns in memory.
    // Strings allow arbitrarily large positive counts without numeric rounding.
    let sequenceRepeatIndex = 0n;
    let parallelBlock = null;
    function advanceScheduledMeasure(skipRepeatCount = false) {
      const model = measures[playingMeasureIndex];
      currentStepInMeasure = 0;
      if (appMode === 'metronome' && !loopedMeasure && !window.RENAX_SONGS?.loaded && !skipRepeatCount) {
        const raw = model?.repeatCount;
        const repetitions = typeof raw === 'string' && /^[0-9]+$/.test(raw) && /[1-9]/.test(raw)
          ? BigInt(raw)
          : Number.isSafeInteger(raw) && raw >= 1 ? BigInt(raw) : 1n;
        if (sequenceRepeatIndex + 1n < repetitions) {
          sequenceRepeatIndex++;
          advanceSilentCycle();
          return false;
        }
      }
      sequenceRepeatIndex = 0n;
      playingMeasureIndex = loopedMeasure && measures.includes(loopedMeasure)
        ? measures.indexOf(loopedMeasure)
        : (playingMeasureIndex + 1) % measures.length;
      advanceSilentCycle();
      return !loopedMeasure && typeof songAtEnd === 'function' && songAtEnd();
    }

    // The block duration stays fixed. Only scheduled events move to the right.
    // Exact rational comparison drops tail events that would cross the block boundary,
    // including when the block has an arbitrarily large repetition count.
    function sequencePhaseEvent(model, m, beat, subIndex, subdiv, bpm, referenceTime) {
      const steps = model?.phaseSteps, division = model?.phaseDivision;
      if (appMode !== 'metronome' || document.body.dataset.workspace !== 'sequence' ||
          training.engaged || window.RENAX_SONGS?.loaded ||
          !Number.isSafeInteger(steps) || steps <= 0 ||
          !Number.isSafeInteger(division) || division <= 0) {
        return { time:referenceTime, audible:true };
      }
      if (!loopedMeasure) {
        const raw = model?.repeatCount;
        const repetitions = typeof raw === 'string' && /^[0-9]+$/.test(raw) && /[1-9]/.test(raw)
          ? BigInt(raw) : Number.isSafeInteger(raw) && raw >= 1 ? BigInt(raw) : 1n;
        const remaining = repetitions - sequenceRepeatIndex;
        if (remaining <= 0n) return { time:referenceTime, audible:false };
        const unit = BigInt(division), subdivisions = BigInt(subdiv);
        const room = (BigInt(m.numerator) * remaining - BigInt(beat)) * unit * subdivisions -
          BigInt(subIndex) * unit;
        const shift = BigInt(steps) * BigInt(m.denominator) * subdivisions;
        if (shift >= room) return { time:referenceTime, audible:false };
      }
      const seconds = (60 / bpm) * 4 * (steps / division);
      return { time:referenceTime + seconds, audible:Number.isFinite(seconds) };
    }

    // Do not create Web Audio nodes far in advance when a phase spans many beats:
    // queue the event and only commit it within the normal scheduling horizon.
    let pendingSequencePhaseEvents = [];
    function flushSequencePhaseEvents(horizon) {
      if (!pendingSequencePhaseEvents.length) return;
      pendingSequencePhaseEvents.sort((a,b)=>a.time-b.time);
      let count = 0;
      while (count < pendingSequencePhaseEvents.length && pendingSequencePhaseEvents[count].time < horizon) {
        pendingSequencePhaseEvents[count++].play();
      }
      if (count) pendingSequencePhaseEvents.splice(0,count);
    }
    function scheduler() {
      if (appMode === 'polyrhythm') { schedulerPolyrhythm(); return; }
      const voiceLead = SOUND_BANKS[currentBank]?.isVoice || window.RENAX_AMORCE?.active ? Math.max(VOICE_MAX_ATTACK_SECONDS,window.RENAX_AMORCE?.maxAttackSeconds || 0) : 0;
      const horizon = audioCtx.currentTime + scheduleAheadTime + voiceLead;
      flushSequencePhaseEvents(horizon);
      while (nextNoteTime < horizon) {
        if (playingMeasureIndex >= measures.length) { playingMeasureIndex = 0; currentStepInMeasure = 0; sequenceRepeatIndex = 0n; }
        const mIdx = playingMeasureIndex;
        const sIdx = currentStepInMeasure;
        const model = measures[mIdx];
        if (!model) { timerID = setTimeout(schedulerSafely, lookahead); return; }
        const m = getSchedulingMeasure(model);
        const parallel = appMode === 'metronome' && document.body.dataset.workspace === 'sequence' &&
          !training.engaged && !window.RENAX_SONGS?.loaded
          ? window.RENAX_SEQUENCE_PARALLEL.config(model) : null;
        if (parallel && (!parallelBlock || parallelBlock.model !== model)) {
          const repeats = loopedMeasure ? 1n : window.RENAX_SEQUENCE_PARALLEL.repetitions(model);
          const seconds = m.numerator * getStepDurationMs(getEffectiveTempo(m), m.denominator, 1) / 1000;
          parallelBlock = { model, endTime: nextNoteTime + seconds * Number(repeats) };
        } else if (!parallel) parallelBlock = null;

        if (sIdx >= measureTotalSteps(m)) {
          if (parallel) { currentStepInMeasure = 0; continue; }
          scheduledMeasureLayouts.delete(model);
          if (advanceScheduledMeasure()) return;
          continue;
        }

        const { beat, subIndex } = getBeatAndSub(m, sIdx);
        const state = m.beatStates[beat] ? m.beatStates[beat][subIndex] : 0;
        const isFirst = (sIdx === 0);
        const rampStep = !training.engaged ? window.RENAX_SONG_TEMPO?.liveStep?.(mIdx,beat,subIndex,m.beatSubdivisions[beat]||1) : null;
        const effectiveTempo = parallel ? getEffectiveTempo(m) * parallel.numerator / parallel.denominator :
          (rampStep?.tempo ?? getEffectiveTempo(m));
        const beatDurationSec = parallel ? getStepDurationMs(effectiveTempo, m.denominator, 1) / 1000 :
          (rampStep?.beatSeconds ?? getStepDurationMs(effectiveTempo, m.denominator, 1) / 1000);
        const voiceGroupSize = getVoiceGroupSize(m);
        const subdiv = m.beatSubdivisions[beat] || 1;
        const stepSeconds = parallel ? getStepDurationMs(effectiveTempo, m.denominator, subdiv) / 1000 :
          (rampStep?.seconds ?? getStepDurationMs(effectiveTempo, m.denominator, subdiv) / 1000);
        const phaseShift = parallel && Number.isSafeInteger(model.phaseSteps) && model.phaseSteps > 0 &&
          Number.isSafeInteger(model.phaseDivision) && model.phaseDivision > 0
          ? (60 / effectiveTempo) * 4 * model.phaseSteps / model.phaseDivision : 0;
        const phase = parallel ? {
          time: nextNoteTime + phaseShift,
          audible: nextNoteTime + phaseShift < parallelBlock.endTime - 1e-9
        } : sequencePhaseEvent(model,m,beat,subIndex,subdiv,effectiveTempo,nextNoteTime);
        if (phase.audible) {
          const soundAllowed = isSilentCycleAudible();
          const dispatch = () => {
            if (!window.RENAX_AMORCE?.step(phase.time,state,isFirst,subIndex,beat) && state > 0 && soundAllowed) {
              if(model.countIn)playCountIn(phase.time,isFirst);else playClick(state, phase.time, isFirst, {
                mode: 'metronome',
                isMainBeat: subIndex === 0,
                isOtherStrongBeat: isOtherStrongBeat(m, beat, subIndex),
                beatNumber: beat % voiceGroupSize === 0 ? Math.floor(beat / voiceGroupSize) + 1 : 0,
                subIndex,
                beatDurationSec: beatDurationSec * voiceGroupSize
              });
            }
            if(subIndex===0)window.RENAX_PLAYBACK?.recordBeat(audioCtx,phase.time);
            scheduleVisualUpdate(mIdx, sIdx, phase.time, { beat, subIndex, voiceGroupSize, subdivisions: m.beatSubdivisions[beat], durationMs: stepSeconds * 1000 });
          };
          if (phase.time > horizon) pendingSequencePhaseEvents.push({time:phase.time,play:dispatch});
          else dispatch();
        }

        nextNoteTime = parallel ? Math.min(parallelBlock.endTime, nextNoteTime + stepSeconds) :
          nextNoteTime + stepSeconds;

        currentStepInMeasure++;
        if (parallel) {
          if (nextNoteTime >= parallelBlock.endTime - 1e-9) {
            nextNoteTime = parallelBlock.endTime;
            parallelBlock = null;
            scheduledMeasureLayouts.delete(model);
            if (advanceScheduledMeasure(true)) return;
          } else if (currentStepInMeasure >= measureTotalSteps(m)) {
            currentStepInMeasure = 0;
          }
        } else if (currentStepInMeasure >= measureTotalSteps(m)) {
          scheduledMeasureLayouts.delete(model);
          if (advanceScheduledMeasure()) return;
        }
      }
      timerID = setTimeout(schedulerSafely, lookahead);
    }

    function scheduleVisualUpdate(mIdx, sIdx, time, musicalPosition = null) {
      const visualModel=measures[mIdx],multiGeneration=window.RENAX_MULTI?.active?window.RENAX_MULTI.generation:null;
      const visualEpoch=window.RENAX_PLAYBACK?.generation;
      const drawTime = (time - audioCtx.currentTime) * 1000 + (window.RENAX_PLAYBACK?.delayMs(audioCtx)||0);
      setTimeout(() => {
        if (!isPlaying || visualEpoch!==window.RENAX_PLAYBACK?.generation) return;
         if (window.RENAX_SONGS?.loaded && measures[mIdx]!==visualModel) return;
        if(multiGeneration!==null&&(!window.RENAX_MULTI?.active||window.RENAX_MULTI.generation!==multiGeneration||measures[activeMeasureIndex]!==visualModel))return;
        if (activeMeasureIndex !== mIdx) {
          activeMeasureIndex = mIdx;
          renderActiveMeasure();
          measureListEl.querySelectorAll('.measure-card').forEach((c, i) => {
            c.classList.toggle('playing', i === playingMeasureIndex);
            c.classList.toggle('active', i === activeMeasureIndex);
          });
        }
        const m = measures[mIdx];
        const position = musicalPosition ?? { ...getBeatAndSub(m, sIdx), subdivisions: 1 };
        const beat = position.beat;
        const _visibleSubdivisions = m.beatSubdivisions[beat] || 1;
        const visibleIndex = beat + position.subIndex / position.subdivisions;
        const stepEls = sequencerContainer.querySelectorAll('.step');
        stepEls.forEach(el => el.classList.remove('active'));
        const stepEl = stepEls[Math.floor(visibleIndex)];
        if (stepEl) {
          stepEl.classList.add('active');
          emitBurst(Math.floor(visibleIndex), parseInt(stepEl.dataset.state));
        }
        beatDisplay.textContent = Math.floor(beat / (position.voiceGroupSize || 1)) + 1;
        beatDisplay.classList.add('pulse');
        setTimeout(() => beatDisplay.classList.remove('pulse'), 130);
        markPlayheadStep(visibleIndex, position.durationMs, 1 / position.subdivisions);
        highlightBeatEditor(m, beat, position.subIndex, position.subdivisions);
      }, Math.max(0, drawTime));
    }


    function createPolyMeasure(numerator = 5, denominator = 4, measureTempo = tempo) {
      const n = Math.max(2, Math.min(20, Math.round(numerator || 5)));
      const d = Math.max(2, Math.min(20, Math.round(denominator || 4)));
      return {
        numerator: n,
        denominator: d,
        tempo: Math.max(2, Math.min(999, Math.round(measureTempo || 120))),
        isPolyrhythm: true,
        outerStates: Array(n).fill(3),
        innerStates: Array(d).fill(1),
        polyVoiceCount: 2
      };
    }

    function ensurePolyStates(m) {
      const n=clampPolyValue(m.numerator,5),d=clampPolyValue(m.denominator,4);
      m.numerator=n;m.denominator=d;
      const oldOuter=Array.isArray(m.outerStates)?m.outerStates:[];
      const oldInner=Array.isArray(m.innerStates)?m.innerStates:[];
      m.outerStates=Array.from({length:n},(_,i)=>Number.isInteger(oldOuter[i])?oldOuter[i]:3);
      m.innerStates=Array.from({length:d},(_,i)=>Number.isInteger(oldInner[i])?oldInner[i]:1);
      const count=Math.max(2,Math.min(4,Number(m.polyVoiceCount)||2));
      m.polyVoiceCount=count;
      if(!Array.isArray(m.polyVoices))m.polyVoices=[];
      while(m.polyVoices.length<count)m.polyVoices.push({
        count:2,bank:null,subdivisions:[],states:[]
      });
      m.polyVoices.length=count;
      m.polyVoices.forEach((voice,vi)=>{
        const beats=vi===0?n:vi===1?d:clampPolyValue(voice.count,2);
        voice.count=beats;
        if(!Array.isArray(voice.subdivisions))voice.subdivisions=[];
        if(!Array.isArray(voice.states))voice.states=[];
        voice.subdivisions=Array.from({length:beats},(_,b)=>{
          const value=Number(voice.subdivisions[b]);
          return allowedSubdivisions(4).includes(value)?value:1;
        });
        voice.states=Array.from({length:beats},(_,b)=>{
          const previous=Array.isArray(voice.states[b])?voice.states[b]:[];
          const initial=vi===0?m.outerStates[b]:vi===1?m.innerStates[b]:vi===2?2:3;
          return Array.from({length:voice.subdivisions[b]},(_,s)=>{
            const state=s===0&&vi<2?initial:previous[s];
            return Number.isInteger(state)&&state>=0&&state<=3?state:(s===0?initial:0);
          });
        });
        if(!SOUND_BANKS[voice.bank])voice.bank=null;
      });
    }

    function clampPolyValue(value, fallback) {
      const n = parseInt(value, 10);
      return Math.max(2, Math.min(20, Number.isFinite(n) ? n : fallback));
    }

    function getPolyEvents(m) {
      ensurePolyStates(m);
      const map=new Map();
      const add=(u)=>{
        const k=Math.round(u*100000000)/100000000;
        if(!map.has(k))map.set(k,{u:k,outer:false,inner:false,outerIndex:-1,innerIndex:-1,hits:[]});
        return map.get(k);
      };
      m.polyVoices.forEach((voice,vi)=>{
        for(let beat=0;beat<voice.count;beat++){
          for(let sub=0;sub<voice.subdivisions[beat];sub++){
            const e=add((beat+sub/voice.subdivisions[beat])/voice.count);
            e.hits.push({voice:vi,beat,sub});
            if(vi===0&&sub===0){e.outer=true;e.outerIndex=beat;}
            if(vi===1&&sub===0){e.inner=true;e.innerIndex=beat;}
          }
        }
      });
      return [...map.values()].sort((a,b)=>a.u-b.u);
    }

    const polyVoiceCountLabel=document.createElement('label');
    polyVoiceCountLabel.className='poly-voice-count';
    polyVoiceCountLabel.textContent='Voies';
    const polyVoiceCountInput=document.createElement('select');
    polyVoiceCountInput.id='polyVoiceCount';
    polyVoiceCountInput.setAttribute('aria-label','Nombre de voies en polyrythmie');
    for(let i=2;i<=4;i++){const option=document.createElement('option');option.value=String(i);option.textContent=String(i);polyVoiceCountInput.append(option);}
    polyVoiceCountLabel.append(polyVoiceCountInput);polyControls.append(polyVoiceCountLabel);
    enhanceNumboxSelect(polyVoiceCountInput);
    polyVoiceCountInput.addEventListener('change',()=>{
      if(appMode!=='polyrhythm')return;
      const m=measures[activeMeasureIndex];if(!m)return;
      if(isPlaying)stopMetronome();
      m.polyVoiceCount=Math.max(2,Math.min(4,Number(polyVoiceCountInput.value)||2));
      ensurePolyStates(m);
      closePolyBeatEditor();renderSequencerList();renderActiveMeasure();
    });

    const polyBeatEditor=document.createElement('div');
    polyBeatEditor.id='polyBeatEditor';polyBeatEditor.className='poly-beat-editor';
    polyBeatEditor.hidden=true;polyBeatEditor.setAttribute('role','dialog');
    polyBeatEditor.setAttribute('aria-label','Édition des subdivisions de polyrythmie');
    document.body.append(polyBeatEditor);
    let polyBeatSelection=null;
    function closePolyBeatEditor(){polyBeatEditor.hidden=true;polyBeatSelection=null;}
    function syncPolySoundLabel(){
      const active=appMode==='polyrhythm'&&measures[activeMeasureIndex];
      const m=active?measures[activeMeasureIndex]:null;
      if(m)ensurePolyStates(m);
      const personalized=!!m&&m.polyVoices.some(voice=>voice.bank);
      soundBankSel.dataset.polyCustom=String(personalized);
      const label=soundBankSel.closest('.numbox-custom')?.querySelector('.numbox-button span');
      if(label&&personalized)label.textContent='Personnalisé';
      else if(label)label.textContent=soundBankSel.selectedOptions[0]?.textContent||currentBank;
    }
    soundBankSel.addEventListener('change',()=>queueMicrotask(syncPolySoundLabel));
    function polyBankForVoice(m,vi){
      const voice=m.polyVoices[vi];
      if(voice?.bank&&SOUND_BANKS[voice.bank])return voice.bank;
      if(m.polyVoices.length<4)return currentBank;
      // Four clearly distinct recorded accent timbres when the general bank is used.
      return [currentBank,...['clic','cloche','claves','clic808','beep'].filter(key=>key!==currentBank)][vi]||'clic';
    }
    function refreshPolyBeatEditor(){
      if(!polyBeatSelection)return;
      const {m,voiceIndex,beat}=polyBeatSelection;
      if(appMode!=='polyrhythm'||!measures.includes(m)){closePolyBeatEditor();return;}
      ensurePolyStates(m);
      const voice=m.polyVoices[voiceIndex];if(!voice||beat>=voice.count){closePolyBeatEditor();return;}
      polyBeatEditor.replaceChildren();
      const header=document.createElement('div');header.className='poly-beat-header';
      const title=document.createElement('strong');title.textContent='Voie '+(voiceIndex+1)+' · temps '+(beat+1);
      const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Fermer');close.onclick=closePolyBeatEditor;header.append(title,close);
      const divisionLabel=document.createElement('label');divisionLabel.textContent='Diviser le temps en';
      const division=document.createElement('select');division.setAttribute('aria-label','Subdivisions du temps');
      for(const n of allowedSubdivisions(4)){const option=document.createElement('option');option.value=String(n);option.textContent=String(n);division.append(option);}
      division.value=String(voice.subdivisions[beat]);
      division.onchange=()=>{
        if(isPlaying)stopMetronome();
        const length=Number(division.value),old=voice.states[beat];
        voice.subdivisions[beat]=length;voice.states[beat]=Array.from({length},(_,i)=>old[i]??0);
        refreshPolyBeatEditor();renderSequencerList();renderActiveMeasure();
      };
      divisionLabel.append(division);
      const pads=document.createElement('div');pads.className='poly-beat-pads';
      for(let sub=0;sub<voice.subdivisions[beat];sub++){
        const pad=document.createElement('button');pad.type='button';pad.className='poly-beat-pad';
        const state=voice.states[beat][sub];pad.dataset.state=String(state);pad.textContent=String(sub+1);
        pad.setAttribute('aria-label','Subdivision '+(sub+1)+' · '+(['Silence','Clic 1','Clic 2','Accent'][state]));
        pad.onclick=()=>{
          if(isPlaying)stopMetronome();
          voice.states[beat][sub]=(voice.states[beat][sub]+1)%4;
          if(sub===0&&voiceIndex===0)m.outerStates[beat]=voice.states[beat][sub];
          if(sub===0&&voiceIndex===1)m.innerStates[beat]=voice.states[beat][sub];
          refreshPolyBeatEditor();renderSequencerList();renderActiveMeasure();
        };
        pads.append(pad);
      }
      const soundLabel=document.createElement('label');soundLabel.textContent='Son de la voie';
      const sound=document.createElement('select');sound.setAttribute('aria-label','Son de la voie '+(voiceIndex+1));
      const general=document.createElement('option');general.value='';general.textContent='Banque générale';sound.append(general);
      for(const option of soundBankSel.options){if(!SOUND_BANKS[option.value])continue;const copy=document.createElement('option');copy.value=option.value;copy.textContent=option.textContent;sound.append(copy);}
      sound.value=voice.bank||'';
      sound.onchange=()=>{
        if(isPlaying)stopMetronome();
        voice.bank=sound.value||null;
        syncPolySoundLabel();
        if(voice.bank){ensureInstrumentBankReady(voice.bank).catch(()=>{});}
      };
      soundLabel.append(sound);
      polyBeatEditor.append(header,divisionLabel,pads,soundLabel);
    }
    function openPolyBeatEditor(m,voiceIndex,beat){
      closeBeatEditor();
      polyBeatSelection={m,voiceIndex,beat};polyBeatEditor.hidden=false;refreshPolyBeatEditor();
    }
    function buildPolyVisualizer(m) {
      ensurePolyStates(m);
      sequencerContainer.querySelectorAll('.step, .subdivision-dot, .beat-divider, .poly-dot, .poly-ring').forEach(el=>el.remove());
      totalSteps=0;stepsData=[];clearProgressTrail();
      const radii=['min(19.5dvh,152px)','min(12.5dvh,98px)','min(8.5dvh,65px)','min(5dvh,40px)'];
      m.polyVoices.forEach((voice,vi)=>{
        const klass=vi===0?'outer':vi===1?'inner':'voice-'+(vi+1);
        const ring=document.createElement('div');ring.className='poly-ring '+klass;
        sequencerContainer.append(ring);
        for(let beat=0;beat<voice.count;beat++){
          const dot=document.createElement('div');dot.className='poly-dot '+klass;
          dot.dataset.polyVoice=String(vi);dot.dataset.polyBeat=String(beat);
          if(vi===0)dot.dataset.polyOuter=String(beat);
          if(vi===1)dot.dataset.polyInner=String(beat);
          dot.style.setProperty('--angle',((beat/voice.count)*360)+'deg');
          if(vi>=2)dot.style.setProperty('--poly-radius',radii[vi]);
          const state=voice.states[beat][0];dot.dataset.state=String(state);
          dot.tabIndex=0;dot.setAttribute('role','button');
          dot.title='Éditer les subdivisions · voie '+(vi+1)+', temps '+(beat+1);
          dot.setAttribute('aria-label',dot.title);
          dot.onclick=ev=>{ev.stopPropagation();openPolyBeatEditor(m,vi,beat);};
          dot.onkeydown=ev=>{if(ev.key===' '){ev.preventDefault();if(isPlaying)stopMetronome();voice.states[beat][0]=(voice.states[beat][0]+1)%4;if(vi===0)m.outerStates[beat]=voice.states[beat][0];if(vi===1)m.innerStates[beat]=voice.states[beat][0];dot.dataset.state=String(voice.states[beat][0]);renderSequencerList();}else if(ev.key==='Enter'){ev.preventDefault();dot.click();}};
          sequencerContainer.append(dot);
        }
      });
      beatDisplay.textContent=m.polyVoices.map(v=>v.count).join(':');
    }

    function renderPolyrhythmList() {
      measureListEl.innerHTML='';
      const numberMenu=(min,max,value,label)=>{const select=document.createElement('select');select.setAttribute('aria-label',label);for(let v=min;v<=max;v++){const option=document.createElement('option');option.value=String(v);option.textContent=String(v);select.append(option);}select.value=String(value);return select;};
      measures.forEach((m,i)=>{
        const card=document.createElement('div');
        card.className='measure-card'; card.setAttribute('role','group');card.setAttribute('aria-label','Mesure '+(i+1)); card.tabIndex=0;
        if(i===activeMeasureIndex) card.classList.add('active');
        if(isPlaying && i===playingMeasureIndex) card.classList.add('playing');
        const head=document.createElement('div'); head.className='measure-head';
        head.innerHTML=`<span class="measure-num">MESURE ${i+1} / ${measures.length}</span><span class="measure-sig">${m.numerator}:${m.denominator}</span>`;
        ensurePolyStates(m);
        const ratio=document.createElement('div'); ratio.className='poly-ratio-row';
        const n=numberMenu(2,20,m.numerator,`Numérateur mesure ${i+1}`);
        const slash=document.createElement('span'); slash.textContent=':'; slash.className='poly-slash';
        const d=numberMenu(2,20,m.denominator,`Dénominateur mesure ${i+1}`);
        const stop=e=>e.stopPropagation(); n.addEventListener('click',stop); d.addEventListener('click',stop); n.addEventListener('keydown',stop); d.addEventListener('keydown',stop);
        const updateRatio=()=>{ m.numerator=clampPolyValue(n.value,m.numerator); m.denominator=clampPolyValue(d.value,m.denominator); ensurePolyStates(m); n.value=m.numerator; d.value=m.denominator; head.querySelector('.measure-sig').textContent=`${m.numerator}:${m.denominator}`; if(i===activeMeasureIndex) renderActiveMeasure(); };
        n.addEventListener('change',updateRatio); d.addEventListener('change',updateRatio);
        ratio.append(n,slash,d);
        const extra=document.createElement('div');extra.className='poly-extra-voices';
        for(let vi=2;vi<m.polyVoices.length;vi++){
          const voice=m.polyVoices[vi],field=numberMenu(2,20,voice.count,'Pulsations voie '+(vi+1)+' · mesure '+(i+1));
          const label=document.createElement('label');label.textContent='Voie '+(vi+1);
          label.append(field);extra.append(label);
          field.addEventListener('click',stop);field.addEventListener('keydown',stop);
          field.addEventListener('change',()=>{
            if(isPlaying)stopMetronome();
            voice.count=clampPolyValue(field.value,voice.count);ensurePolyStates(m);
            if(i===activeMeasureIndex)renderActiveMeasure();renderSequencerList();
          });
        }
        const tempoRow=document.createElement('div'); tempoRow.className='measure-tempo-row';
        const tempoLabel=document.createElement('span'); tempoLabel.className='measure-tempo-label'; tempoLabel.textContent='TEMPO';
        const tempoInput=numberMenu(2,999,m.tempo,`Tempo mesure ${i+1} (BPM)`);tempoInput.className='measure-tempo-input';
        const unit=document.createElement('span'); unit.className='measure-tempo-unit'; unit.textContent='BPM';
        tempoInput.addEventListener('click',stop); tempoInput.addEventListener('keydown',stop);
        tempoInput.addEventListener('change',()=>{ const v=Math.max(2, Math.min(999,parseInt(tempoInput.value)||m.tempo)); m.tempo=v; tempoInput.value=v; if(i===activeMeasureIndex&&!training.engaged) syncTempoUI(m); });
        tempoRow.append(tempoLabel,tempoInput,unit);
        const preview=document.createElement('div'); preview.className='poly-card-preview';
        const ob=document.createElement('div'); ob.className='outer-mini'; ob.style.width=`${Math.min(100,m.numerator*8)}px`;
        const ib=document.createElement('div'); ib.className='inner-mini'; ib.style.width=`${Math.min(100,m.denominator*8)}px`;
        preview.append(ob,ib);
        card.append(head,ratio,extra,tempoRow,preview);
        const select=()=>{ activeMeasureIndex=i; syncTempoUI(m); renderSequencerList(); renderActiveMeasure(); };
        card.addEventListener('click',select); card.addEventListener('keydown',e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select();}});
        measureListEl.appendChild(card);
      });
    }

    const renderSequencerListMetronome = renderSequencerList;
    renderSequencerList = function() {
      if (appMode === 'polyrhythm') renderPolyrhythmList();
      else renderSequencerListMetronome();
      decorateSequenceCards();
    };

    const renderActiveMeasureMetronome = renderActiveMeasure;
    renderActiveMeasure = function() {
      if (appMode !== 'polyrhythm') return renderActiveMeasureMetronome();
      const m=measures[activeMeasureIndex]; if(!m) return;
      activeMeasureLabel.toggleAttribute('data-no-translate',!!m.name);
      activeMeasureLabel.textContent=m.name||`MESURE ${activeMeasureIndex+1} / ${measures.length}`;
      updateVoiceGroupLabel();
      refreshBeatEditor();
      ensurePolyStates(m);
      polyNumeratorInput.value=String(m.numerator);polyDenominatorInput.value=String(m.denominator);polyVoiceCountInput.value=String(m.polyVoiceCount);
      syncNumbox(polyNumeratorInput);syncNumbox(polyDenominatorInput);syncNumbox(polyVoiceCountInput);
      syncTempoUI(m);buildPolyVisualizer(m);syncPolySoundLabel();
      playhead.stepIndex=0; playhead.startTime=performance.now();
    };

    function schedulePolyVisualUpdate(mIdx, event, time) {
      const visualEpoch=window.RENAX_PLAYBACK?.generation;
      const drawTime=(time-audioCtx.currentTime)*1000+(window.RENAX_PLAYBACK?.delayMs(audioCtx)||0);
      setTimeout(()=>{
        if(!isPlaying || appMode!=='polyrhythm' || visualEpoch!==window.RENAX_PLAYBACK?.generation) return;
        if(activeMeasureIndex!==mIdx){ activeMeasureIndex=mIdx; renderActiveMeasure(); renderSequencerList(); }
        sequencerContainer.querySelectorAll('.poly-dot').forEach(el=>el.classList.remove('active'));
        for(const hit of event.hits||[]){
          const el=sequencerContainer.querySelector(`[data-poly-voice="${hit.voice}"][data-poly-beat="${hit.beat}"]`);
          if(el)el.classList.add('active');
        }
        const m=measures[mIdx]; if(m){ beatDisplay.textContent=m.polyVoices.map(v=>v.count).join(':'); beatDisplay.classList.add('pulse'); setTimeout(()=>beatDisplay.classList.remove('pulse'),130); }
      },Math.max(0,drawTime));
    }

    function schedulerPolyrhythm() {
      while(nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
        if(playingMeasureIndex>=measures.length){playingMeasureIndex=0; polyEventIndex=0;}
        const mIdx=playingMeasureIndex, m=measures[mIdx];
        if(!m){timerID=setTimeout(schedulerSafely,lookahead);return;}
        const events=getPolyEvents(m);
        if(polyEventIndex>=events.length) polyEventIndex=0;
        const e=events[polyEventIndex];
        ensurePolyStates(m);
        for(const hit of e.hits){
          const voice=m.polyVoices[hit.voice];
          const state=voice.states[hit.beat]?.[hit.sub]??0;
          if(!state)continue;
          const bankId=polyBankForVoice(m,hit.voice),bank=SOUND_BANKS[bankId]||SOUND_BANKS.clic;
          const output=audioCtx.createGain();
          const safety=m.polyVoices.length<=2?1:1/Math.sqrt(m.polyVoices.length/2);
          output.gain.value=masterVolume*(BANK_GAINS[bankId]??1)*safety;
          output.connect(bank.isVoice?getVoiceMixDestination(audioCtx):getAudioMixDestination(audioCtx));
          bank.play(output,nextNoteTime,state,hit.beat===0&&hit.sub===0,{mode:'polyrhythm',isMainBeat:hit.sub===0,beatNumber:hit.beat+1,subIndex:hit.sub});
        }
        if(e.outer)window.RENAX_PLAYBACK?.recordBeat(audioCtx,nextNoteTime);
        schedulePolyVisualUpdate(mIdx,e,nextNoteTime);
        // Le numérateur est la pulsation de référence : sa vitesse reste fixée par le BPM.
        // Le dénominateur se répartit dans la même durée sans accélérer/ralentir le numérateur.
        const cycleSec=(m.numerator*60)/getEffectiveTempo(m);
        const nextU=(polyEventIndex+1<events.length)?events[polyEventIndex+1].u:1;
        nextNoteTime += Math.max(.001,(nextU-e.u)*cycleSec);
        polyEventIndex++;
        if(polyEventIndex>=events.length){ polyEventIndex=0; playingMeasureIndex=loopedMeasure&&measures.includes(loopedMeasure)?measures.indexOf(loopedMeasure):(playingMeasureIndex+1)%measures.length; }
      }
      timerID=setTimeout(schedulerSafely,lookahead);
    }

    function setAppMode(mode) {
      if(mode!== 'metronome' && mode!=='polyrhythm') return;
      if(isPlaying) stopMetronome();
      if(appMode==='metronome') metronomeMeasures=measures; else polyrhythmMeasures=measures;
      appMode=mode;
      particles.length = 0;
      pulses.length = 0;
      clearProgressTrail();
      if (pctx && canvas) {
        clearParticleCanvas();
      }
      if(mode==='metronome') {
        beatDisplay.textContent='1';
        beatDisplay.classList.remove('pulse');
      }
      measures=(mode==='metronome')?metronomeMeasures:polyrhythmMeasures;
      if(!measures.length) measures=[mode==='metronome'?createMeasure(4,4):createPolyMeasure(5,4,tempo)];
      if(mode==='metronome') metronomeMeasures=measures; else polyrhythmMeasures=measures;
      activeMeasureIndex=0; playingMeasureIndex=0; currentStepInMeasure=0; polyEventIndex=0;
      measureCountSel.value=String(measures.length);
      document.body.classList.toggle('poly-mode',mode==='polyrhythm');
      metroSigGroup.style.display=mode==='metronome'?'flex':'none';
      polyControls.classList.toggle('active',mode==='polyrhythm');
      modeSwitch.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
      closePolyBeatEditor();
      syncTempoUI(measures[0]); renderSequencerList(); renderActiveMeasure();syncPolySoundLabel();
    }

    modeSwitch.addEventListener('click',e=>{ const b=e.target.closest('button[data-mode]'); if(b) setAppMode(b.dataset.mode); });
    function updateActivePolyRatio(){ if(appMode!=='polyrhythm') return; const m=measures[activeMeasureIndex]; if(!m)return; m.numerator=clampPolyValue(polyNumeratorInput.value,m.numerator); m.denominator=clampPolyValue(polyDenominatorInput.value,m.denominator); ensurePolyStates(m); renderSequencerList(); renderActiveMeasure(); }
    polyNumeratorInput.addEventListener('change',updateActivePolyRatio);
    polyDenominatorInput.addEventListener('change',updateActivePolyRatio);

    async function startMetronome() {
      if(window.RENAX_MULTI?.active)return window.RENAX_MULTI.start();
      if (isPlaying || playbackStarting) return;
      const startEpoch=window.RENAX_PLAYBACK?.generation;
      playbackStarting = true;
      updateTrainButton();
      try {
      await initAudio();
      try {
        await ensureInstrumentBankReady(currentBank);
      } catch (err) {
        console.warn('Instrument samples unavailable; using original fallback:', err);
      }
      try {
        await ensureVoiceMetronomeReady(currentBank);
      } catch (err) {
        console.warn('Voice metronome preload unavailable:', err);
        return;
      }
      if(appMode==='polyrhythm'){
        const banks=new Set();
        for(const m of measures){ensurePolyStates(m);for(let vi=0;vi<m.polyVoices.length;vi++)banks.add(polyBankForVoice(m,vi));}
        for(const id of banks){if(id===currentBank)continue;try{await ensureInstrumentBankReady(id);await ensureVoiceMetronomeReady(id);}catch(err){console.warn('Polyrythmie: son indisponible, repli possible',id,err);}}
      }
      if (isPlaying || startEpoch!==window.RENAX_PLAYBACK?.generation) return;
      isPlaying = true;
      window.RENAX_PLAYBACK?.start();
      playingMeasureIndex = loopedMeasure && measures.includes(loopedMeasure) ? measures.indexOf(loopedMeasure) : 0;
      sequenceRepeatIndex = 0n;
      parallelBlock = null;
      pendingSequencePhaseEvents = [];
      currentStepInMeasure = 0;
      polyEventIndex = 0;
      activeMeasureIndex = playingMeasureIndex;
      resetSilentCycle();
      scheduledMeasureLayouts = new WeakMap();
      renderSequencerList();
      renderActiveMeasure();
      const voiceLead = appMode === 'metronome' && (SOUND_BANKS[currentBank]?.isVoice || window.RENAX_AMORCE?.active) ? Math.max(VOICE_MAX_ATTACK_SECONDS,window.RENAX_AMORCE?.maxAttackSeconds || 0) : 0;
      nextNoteTime = audioCtx.currentTime + 0.05 + voiceLead;
      window.RENAX_AMORCE?.begin(audioCtx,nextNoteTime);
      playBtn.textContent = 'STOP';
      playBtn.classList.remove('btn-primary');
      playBtn.classList.add('btn-cyan');
      resetWorkTimer();
      if (!training.active) startWorkTimer();
      updateTimerDisplay();
      // Le playhead visuel démarre sur le premier événement planifié, pas avant.
      // Cela garde le tout premier passage 1 → 2 parfaitement synchronisé avec l'audio.
      playhead.stepIndex = 0;
      playhead.span = 0;
      playhead.startTime = performance.now();
      clearProgressTrail();
      scheduler();
      } catch(error) { stopMetronome({startupFailure:true}); throw error; } finally { playbackStarting = false; updateTrainButton(); renderSequencerList(); }
    }

    function stopMetronome({ keepTrainingMode = false } = {}) {
      window.RENAX_PLAYBACK?.stop();
      if(window.RENAX_MULTI?.active)return window.RENAX_MULTI.stop();
      loopedMeasure = null;
      sequenceRepeatIndex = 0n;
      parallelBlock = null;
      pendingSequencePhaseEvents = [];
      if (!isPlaying) return;
      isPlaying = false;
      updateTrainButton();
      clearTimeout(timerID);
      timerID = null;
      for (const src of scheduledVoiceSources) src.stop();
      scheduledVoiceSources.clear();
      scheduledMeasureLayouts = new WeakMap();
      playBtn.textContent = 'Start';
      playBtn.classList.remove('btn-cyan');
      playBtn.classList.add('btn-primary');
      sequencerContainer.querySelectorAll('.step, .poly-dot').forEach(s => s.classList.remove('active'));
      beatDisplay.textContent = '1';
      beatDisplay.classList.remove('pulse');
      particles.length = 0;
      pulses.length = 0;
      clearProgressTrail();
      if (pctx && canvas) {
        clearParticleCanvas();
      }
      resetWorkTimer();
      if (training.active) {
        if (keepTrainingMode) resetTrainingToStart();
        else endTraining();
      }
      updateTimerDisplay();
      renderSequencerList();
      renderActiveMeasure();
    }

    function setDirection(dir) {
      training.direction = dir;
      dirToggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.dir === dir));
      if (window.RENAX_TRAINING?.mode === 'steps') return;
      const a = parseInt(trainStartInput.value) || 80;
      const b = parseInt(trainEndInput.value) || 140;
      if (dir === 'up' && a > b) { trainStartInput.value = b; trainEndInput.value = a; }
      else if (dir === 'down' && a < b) { trainStartInput.value = b; trainEndInput.value = a; }
    }
    dirToggle.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => setDirection(btn.dataset.dir));
    });

    function startTraining() {
      if (!training.engaged && (isPlaying || playbackStarting || window.RENAX_SONGS?.preparing)) return;
      let dur = parseFloat(trainDurationInput.value);
      if (!Number.isFinite(dur) || dur <= 0) dur = 3;
      dur = Math.max(1, Math.min(Number(trainDurationInput.max) || 60, dur));
      trainDurationInput.value = dur;

      let a = Math.max(2, Math.min(999, parseInt(trainStartInput.value) || 80));
      let b = Math.max(2, Math.min(999, parseInt(trainEndInput.value) || 140));
      trainStartInput.value = a; trainEndInput.value = b;

      let sBpm, eBpm;
      if (training.direction === 'up') { sBpm = Math.min(a, b); eBpm = Math.max(a, b); }
      else { sBpm = Math.max(a, b); eBpm = Math.min(a, b); }

      training.run = window.RENAX_TRAINING?.prepare(a, b, dur, training.direction);
      training.engaged = true;
      training.duration = training.run?.duration ?? dur * 60 * 1000;
      training.startBpm = training.run?.startBpm ?? sBpm;
      training.endBpm = training.run?.endBpm ?? eBpm;
      restartTraining();
    }

    function resetTrainingToStart() {
      training.active = false;
      training.startTime = 0;
      if (training.intervalId) { clearInterval(training.intervalId); training.intervalId = null; }
      tempo = training.startBpm;
      bpmSlider.value = tempo;
      bpmDisplay.innerHTML = `${tempo} <span>BPM</span>`; updateMobileTrainingBpm(tempo);
      bpmSlider.disabled = training.engaged;
      updateTrainButton();
    }

    function restartTraining() {
      if (!training.engaged) return;
      training.active = true;
      window.RENAX_TRAINING?.begin();
      training.startTime = performance.now();
      tempo = training.startBpm;
      bpmSlider.value = tempo;
      bpmDisplay.innerHTML = `${tempo} <span>BPM</span>`; updateMobileTrainingBpm(tempo);
      bpmSlider.disabled = true;
      pauseWorkTimer();
      updateTrainButton();
      clearInterval(training.intervalId);
      training.intervalId = setInterval(trainingTick, 100);
      if (!isPlaying) startMetronome().catch(reportAudioFailure);
    }

    function trainingTick() {
      if (!training.active) return;
      const elapsed = performance.now() - training.startTime;
      const progress = Math.min(elapsed / training.duration, 1);
      const result = training.run && window.RENAX_TRAINING
        ? RENAX_TRAINING.at(training.run, elapsed)
        : { bpm: Math.round(training.startBpm + (training.endBpm - training.startBpm) * progress), done: progress >= 1 };
      const bpm = result.bpm;
      if (bpm !== tempo) {
        tempo = bpm;
        bpmSlider.value = bpm;
        bpmDisplay.innerHTML = `${bpm} <span>BPM</span>`; updateMobileTrainingBpm(bpm);
      }
      if (result.done) {
        if (isPlaying) stopMetronome({ keepTrainingMode: true });
        else resetTrainingToStart();
        endTraining();
        updateTimerDisplay();
        if (training.run?.mode === 'steps') {
          tempo = bpm; bpmSlider.value = bpm;
          bpmDisplay.innerHTML = `${bpm} <span>BPM</span>`; updateMobileTrainingBpm(bpm);
        }
        window.RENAX_TRAINING?.finish(bpm);
      }
    }

    function endTraining() {
      const wasEngaged = training.engaged;
      training.active = false;
      training.engaged = false;
      training.startTime = 0;
      if (training.intervalId) { clearInterval(training.intervalId); training.intervalId = null; }
      bpmSlider.disabled = false;
      if (wasEngaged) syncTempoUI(measures[activeMeasureIndex]);
      updateTrainButton();
      if (isPlaying) startWorkTimer();
    }

    function updateTrainButton() {
      trainBtn.setAttribute('aria-pressed',String(training.engaged));
      const blocked = !training.engaged && (isPlaying || playbackStarting || window.RENAX_SONGS?.preparing);
      trainBtn.disabled = !!blocked;
      trainBtn.title = blocked ? 'Arrête la lecture avant de démarrer l’entraînement' : '';
      window.RENAX_TRAINING?.update();
      if (training.engaged) {
        trainBtn.textContent = "Arrêter l'entraînement";
        trainBtn.classList.add('active');
        panicBtn.textContent = "Arrêter";
        panicBtn.setAttribute("aria-label", "Arrêter l'entraînement");
        panicBtn.title = "Arrêter l'entraînement";
      } else {
        trainBtn.textContent = "Démarrer l'entraînement";
        trainBtn.classList.remove('active');
        panicBtn.textContent = "Reset";
        panicBtn.setAttribute("aria-label", "Reset");
        panicBtn.title = "Reset";
      }
    }

    trainBtn.addEventListener('click', () => {
      if (trainBtn.disabled) return;
      if (training.engaged) {
        if (isPlaying) stopMetronome({ keepTrainingMode: true });
        endTraining();
        updateTimerDisplay();
      } else {
        startTraining();
        if(window.innerWidth<=1100) switchTab('visu');
      }
    });

    let tapTimes = [];
    let tapFlashTimeout = null;

    function doTapTempo() {
      const now = performance.now();
      tapTimes.push(now);
      if (tapTimes.length > 5) tapTimes.shift();
      tapBtn.classList.add('hit');
      clearTimeout(tapFlashTimeout);
      tapFlashTimeout = setTimeout(() => tapBtn.classList.remove('hit'), 90);
      if (tapTimes.length >= 2) {
        const intervals = [];
        for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const newBpm = Math.round(60000 / avg);
        if (newBpm >= 2 && newBpm <= 999) {
          if(tempo!==newBpm)resetCustomizationTimer();
          tempo = newBpm;
          const m = measures[activeMeasureIndex];
          if (m && !training.engaged) m.tempo = newBpm;
          bpmSlider.value = tempo;
          bpmDisplay.innerHTML = `${tempo} <span>BPM</span>`; updateMobileTrainingBpm(tempo);
          refreshTempoFields();
        }
      }
      clearTimeout(doTapTempo._reset);
      doTapTempo._reset = setTimeout(() => { tapTimes = []; }, 2000);
    }
    tapBtn.addEventListener('click', doTapTempo);

    function isEditingField() {
      const el = document.activeElement;
      if (!el) return false;
      if(el.closest('dialog,[role=dialog][aria-modal=true]'))return true;
      const tag = el.tagName;
      if (tag === 'INPUT') {
        const t = (el.type || '').toLowerCase();
        return ['text','number','tel','email','password','search','url','date','time','datetime-local','month','week'].includes(t);
      }
      return tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    bpmSlider.addEventListener('input', (e) => {
      if (training.engaged) return;
      tempo = parseInt(e.target.value);
      const m = measures[activeMeasureIndex];
      if (m) m.tempo = tempo;
      bpmDisplay.innerHTML = `${tempo} <span>BPM</span>`; updateMobileTrainingBpm(tempo);
      refreshTempoFields();
    });

    volumeSlider.addEventListener('input', (e) => {
      const v = parseInt(e.target.value);
      masterVolume = Math.max(0, Math.min(1, v / 100));
      volumeValue.textContent = `${v}%`;
    });

    soundBankSel.addEventListener('change', async (e) => {
      const requestedBank = e.target.value;
      const wasPlaying = isPlaying;
      // A live switch is an explicit vocal action too. Keep the current bank
      // until recordings are decoded, rather than substituting subdivision ticks.
      if (wasPlaying && SOUND_BANKS[requestedBank]?.isVoice) {
        try {
          await ensureVoiceMetronomeReady(requestedBank);
        } catch (error) {
          if (soundBankSel.value === requestedBank) {
            soundBankSel.value = currentBank;
            window.RENAX_FEEDBACK?.error('Voix indisponibles. Réessayez le chargement.', error);
          }
          return;
        }
        if (soundBankSel.value !== requestedBank) return;
      }
      currentBank = requestedBank;
      updateVoiceGroupLabel();
      document.dispatchEvent(new CustomEvent('renax:sound-bank-ready', { detail: { bank: requestedBank } }));

      // Stop pressed while decoding must not trigger the stopped-state preview.
      if (wasPlaying && !isPlaying) return;

      // En lecture : changer la banque uniquement, sans jouer l'aperçu.
      if (isPlaying) {
        ensureInstrumentBankReady(currentBank).catch(err => console.warn('Instrument bank fallback:', err));
        return;
      }

      // À l'arrêt : le geste utilisateur autorise l'initialisation Web Audio,
      // donc l'aperçu fonctionne même si Play n'a encore jamais été lancé.
      try {
        await initAudio();
      } catch (err) {
        console.warn('Audio preview unavailable:', err);
        return;
      }
      if (isPlaying || !audioCtx || audioCtx.state !== 'running') return;

      try {
        await ensureInstrumentBankReady(currentBank);
      } catch (err) {
        console.warn('Instrument preview fallback:', err);
      }
      try {
        await ensureVoiceMetronomeReady(currentBank);
      } catch (err) {
        console.warn('Voice metronome preview preload unavailable:', err);
      }

      const out = audioCtx.createGain();
      out.gain.value = masterVolume * (BANK_GAINS[currentBank] ?? 1);
      const bank = SOUND_BANKS[currentBank];
      out.connect(bank?.isVoice ? getVoiceMixDestination(audioCtx) : getAudioMixDestination(audioCtx));
      const t = audioCtx.currentTime + 0.02 + (bank?.isVoice ? VOICE_MAX_ATTACK_SECONDS : 0);

      if (bank && bank.isVoice) {
        bank.play(out, t, 1, false, { mode: 'metronome', beatNumber: 1, subIndex: 0, beatDurationSec: 0.42 });
        bank.play(out, t + 0.42, 2, false, { mode: 'metronome', beatNumber: 2, subIndex: 0, beatDurationSec: 0.42 });
        bank.play(out, t + 0.84, 3, false, { mode: 'metronome', beatNumber: 3, subIndex: 0, beatDurationSec: 0.42 });
      } else {
        bank.play(out, t, 1, false);
        bank.play(out, t + 0.18, 2, false);
        bank.play(out, t + 0.36, 3, false);
      }
    });

    silentToggle.addEventListener('click', () => setSilentMode(!silentModeEnabled));
    clickMeasureCountSel.addEventListener('change', () => {
      clickMeasures = Math.max(1, Math.min(32, parseInt(clickMeasureCountSel.value) || 1));
      clickMeasureCountSel.value = String(clickMeasures);
      resetSilentCycle();
    });
    silentMeasureCountSel.addEventListener('change', () => {
      silentMeasures = Math.max(0, Math.min(32, parseInt(silentMeasureCountSel.value) || 0));
      silentMeasureCountSel.value = String(silentMeasures);
      resetSilentCycle();
    });

    measureCountSel.addEventListener('change', () => {
      if (loopedMeasure) stopMetronome();
      const n = Math.max(1, Math.min(8, parseInt(measureCountSel.value)));
      if (appMode === 'polyrhythm') {
        while (measures.length < n) measures.push(createPolyMeasure(5, 4, tempo));
      } else {
        while (measures.length < n) measures.push(createMeasure(4, 4));
      }
      if (measures.length > n) measures.length = n;
      activeMeasureIndex = Math.min(activeMeasureIndex, measures.length - 1);
      validatePlayingState();
      renderSequencerList();
      renderActiveMeasure();
    });

    activeNumeratorSel.addEventListener('change', () => {
      const m = measures[activeMeasureIndex];
      if (!m) return;
      const newNum = parseInt(activeNumeratorSel.value);
      const oldNum = m.numerator;
      m.numerator = newNum;
      if (newNum > oldNum) {
        while (m.beatSubdivisions.length < newNum) m.beatSubdivisions.push(1);
        while (m.beatStates.length < newNum) m.beatStates.push([1]);
      } else if (newNum < oldNum) {
        m.beatSubdivisions.length = newNum;
        m.beatStates.length = newNum;
      }
      validatePlayingState();
      renderActiveMeasure();
      refreshMeasurePreviews();
    });

    activeDenominatorSel.addEventListener('change', () => {
      const m = measures[activeMeasureIndex];
      if (!m) return;
      m.denominator = parseInt(activeDenominatorSel.value);
      normalizeMeasureSubdivisions(m);
      // Appliquer la nouvelle unité aux événements encore à programmer.
      scheduledMeasureLayouts.delete(m);
      validatePlayingState();
      refreshBeatEditor();
      renderActiveMeasure();
      refreshMeasurePreviews();
    });

    playBtn.addEventListener('click', () => {
      if (playBtn.disabled) return;
      if (isPlaying) {
        if (training.active) stopMetronome({ keepTrainingMode: true });
        else stopMetronome();
      } else if (training.engaged) {
        restartTraining();
      } else {
        startMetronome().catch(reportAudioFailure);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (isEditingField()) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (playBtn.disabled) return;
        if (isPlaying) {
          if (training.active) stopMetronome({ keepTrainingMode: true });
          else stopMetronome();
        } else if (training.engaged) {
          restartTraining();
        } else {
          startMetronome().catch(reportAudioFailure);
        }
      }
      if (e.code === 'Numpad0' || e.code === 'KeyT'&&!e.ctrlKey&&!e.altKey&&!e.metaKey) {
        e.preventDefault();
        doTapTempo();
      }
    });

    panicBtn.addEventListener('click', () => {
      if (training.engaged) {
        if (isPlaying) stopMetronome({ keepTrainingMode: true });
        endTraining();
        updateTimerDisplay();
        return;
      }
      // The circular editor's eraser clears only the selected block's rhythm.
      // It must never replace the sequence with a single default measure.
      if (document.body.dataset.workspace === 'sequence' && appMode === 'metronome' && !window.RENAX_MULTI?.active) {
        const block = measures[activeMeasureIndex];
        if (!block) return;
        if (isPlaying) stopMetronome();
        block.beatStates = block.beatSubdivisions.map(count => Array(count).fill(0));
        validatePlayingState();
        renderSequencerList();
        renderActiveMeasure();
        refreshMeasurePreviews();
        return;
      }
      stopMetronome();
      endTraining();
      resetWorkTimer();
      if (appMode === 'polyrhythm') {
        polyrhythmMeasures = [createPolyMeasure(5, 4, tempo)];
        measures = polyrhythmMeasures;
      } else {
        // RESET ne relance pas le chargement audio : conserver son état réel.
        metronomeMeasures = [createMeasure(4, 4)];
        measures = metronomeMeasures;
      }
      activeMeasureIndex = 0;
      playingMeasureIndex = 0;
      currentStepInMeasure = 0;
      resetSilentCycle();
      measureCountSel.value = '1';
      particles.length = 0;
      pulses.length = 0;
      clearProgressTrail();
      renderSequencerList();
      renderActiveMeasure();
      updateTimerDisplay();
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => { resizeCanvas(); updateRingRadius(); }, 200);
    });

    metronomeMeasures = [createMeasure(4, 4)];
    metronomeMeasures[0].beatSubdivisions = [1, 1, 1, 1];
    metronomeMeasures[0].beatStates = [[1], [1], [1], [1]];
    polyrhythmMeasures = [createPolyMeasure(5, 4, 120)];
    measures = metronomeMeasures;
    renderSequencerList();
    renderActiveMeasure();
    bpmDisplay.innerHTML = `${tempo} <span>BPM</span>`; updateMobileTrainingBpm(tempo);
    volumeValue.textContent = '80%';
    soundBankSel.value = currentBank;
    setSilentMode(false);
    syncTempoUI(measures[0]);

    requestAnimationFrame(() => {
      resizeCanvas();
      updateRingRadius();
      animate();
    });
    // Warm voices only after the initial interface; explicit voice selection still loads immediately.
    // Voice recordings are loaded only by an explicit vocal action or offline preparation.
    if(audioReadyWrap)audioReadyWrap.hidden=true;

// Explicit bridge for the isolated guide preview; no string evaluation.
window.RENAX_AUDIO_ADAPTER=Object.freeze({prepare:()=>prepareAllVoiceAudio(),ready:()=>typeof allVoiceAudioReady!=='undefined'&&allVoiceAudioReady,configure:context=>{audioCtx=context;masterVolume=1;},destination:context=>getAudioMixDestination(context),click:(bank,number,time,state,first,subIndex,beatDurationSec)=>{currentBank=bank;playClick(state,time,first,{beatNumber:number,subIndex,beatDurationSec});},count:(number,time,state,first,beatDurationSec)=>{const buffer=VOICE_METRONOME_BUFFERS.male[String(number)];if(!buffer)throw new Error('Sample de comptage anglais indisponible. Réessayez après le chargement.');let onset=buffer.length;for(let channel=0;channel<buffer.numberOfChannels;channel++){const samples=buffer.getChannelData(channel);const index=samples.findIndex(v=>Math.abs(v)>1e-5);if(index>=0)onset=Math.min(onset,index);}if(onset===buffer.length)throw new Error('Sample de comptage silencieux.');currentBank='voiceMale';playClick(state,time,first,{beatNumber:number,subIndex:0,beatDurationSec});}});

const voicePreparationSection=document.createElement('section');voicePreparationSection.className='index2-settings-section';
const voicePreparationHeading=document.createElement('h3');voicePreparationHeading.textContent='Voix de comptage';voicePreparationHeading.dataset.i18nKey='voices.heading';
const voicePreparationButton=document.createElement('button');voicePreparationButton.type='button';voicePreparationButton.className='btn';voicePreparationButton.textContent='Préparer les voix hors connexion';voicePreparationButton.dataset.i18nKey='voices.prepareOffline';
const voicePreparationStatus=document.createElement('p');voicePreparationStatus.className='index2-settings-note';voicePreparationStatus.setAttribute('role','status');voicePreparationStatus.textContent='Les voix se chargent à la première utilisation.';
voicePreparationButton.addEventListener('click',async()=>{
  voicePreparationButton.disabled=true;voicePreparationStatus.textContent='Préparation des voix…';
  try{await prepareAllVoiceAudio();voicePreparationStatus.textContent='Voix chargées. Le statut hors connexion confirme leur conservation.';}
  catch{voicePreparationStatus.textContent='Préparation impossible. Réessayez lorsque la connexion est disponible.';}
  finally{voicePreparationButton.disabled=false;}
});
voicePreparationSection.append(voicePreparationHeading,voicePreparationButton,voicePreparationStatus);document.getElementById('index2SettingsPanel').append(voicePreparationSection);
