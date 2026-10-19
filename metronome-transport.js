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
        number.style.cssText = 'font-size:11px;font-weight:700;color:#111;transform:rotate(' + (-angle) + 'deg)';
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

    function scheduler() {
      if (appMode === 'polyrhythm') { schedulerPolyrhythm(); return; }
      const voiceLead = SOUND_BANKS[currentBank]?.isVoice || window.RENAX_AMORCE?.active ? Math.max(VOICE_MAX_ATTACK_SECONDS,window.RENAX_AMORCE?.maxAttackSeconds || 0) : 0;
      while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime + voiceLead) {
        if (playingMeasureIndex >= measures.length) { playingMeasureIndex = 0; currentStepInMeasure = 0; }
        const mIdx = playingMeasureIndex;
        const sIdx = currentStepInMeasure;
        const model = measures[mIdx];
        if (!model) { timerID = setTimeout(schedulerSafely, lookahead); return; }
        const m = getSchedulingMeasure(model);

        if (sIdx >= measureTotalSteps(m)) {
          scheduledMeasureLayouts.delete(model);
          currentStepInMeasure = 0;
          playingMeasureIndex = loopedMeasure && measures.includes(loopedMeasure) ? measures.indexOf(loopedMeasure) : (playingMeasureIndex + 1) % measures.length;
          advanceSilentCycle();
          if(!loopedMeasure && typeof songAtEnd==='function' && songAtEnd())return;
          continue;
        }

        const { beat, subIndex } = getBeatAndSub(m, sIdx);
        const state = m.beatStates[beat] ? m.beatStates[beat][subIndex] : 0;
        const isFirst = (sIdx === 0);
        const rampStep = !training.engaged ? window.RENAX_SONG_TEMPO?.liveStep?.(mIdx,beat,subIndex,m.beatSubdivisions[beat]||1) : null;
        const effectiveTempo = rampStep?.tempo ?? getEffectiveTempo(m);
        const beatDurationSec = rampStep?.beatSeconds ?? getStepDurationMs(effectiveTempo, m.denominator, 1) / 1000;
        const voiceGroupSize = getVoiceGroupSize(m);
        if (!window.RENAX_AMORCE?.step(nextNoteTime,state,isFirst,subIndex,beat) && state > 0 && isSilentCycleAudible()) {
          if(model.countIn)playCountIn(nextNoteTime,isFirst);else playClick(state, nextNoteTime, isFirst, {
            mode: 'metronome',
            isMainBeat: subIndex === 0,
            isOtherStrongBeat: isOtherStrongBeat(m, beat, subIndex),
            beatNumber: beat % voiceGroupSize === 0 ? Math.floor(beat / voiceGroupSize) + 1 : 0,
            subIndex,
            beatDurationSec: beatDurationSec * voiceGroupSize
          });
        }
        const subdiv = m.beatSubdivisions[beat] || 1;
        const stepSeconds = rampStep?.seconds ?? getStepDurationMs(effectiveTempo, m.denominator, subdiv) / 1000;
        if(subIndex===0)window.RENAX_PLAYBACK?.recordBeat(audioCtx,nextNoteTime);
        scheduleVisualUpdate(mIdx, sIdx, nextNoteTime, { beat, subIndex, voiceGroupSize, subdivisions: m.beatSubdivisions[beat], durationMs: stepSeconds * 1000 });

        nextNoteTime += stepSeconds;

        currentStepInMeasure++;
        if (currentStepInMeasure >= measureTotalSteps(m)) {
          scheduledMeasureLayouts.delete(model);
          currentStepInMeasure = 0;
          playingMeasureIndex = loopedMeasure && measures.includes(loopedMeasure) ? measures.indexOf(loopedMeasure) : (playingMeasureIndex + 1) % measures.length;
          advanceSilentCycle();
          if(!loopedMeasure && typeof songAtEnd==='function' && songAtEnd())return;
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
        const visibleSubdivisions = m.beatSubdivisions[beat] || 1;
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
        innerStates: Array(d).fill(1)
      };
    }

    function ensurePolyStates(m) {
      if (!Array.isArray(m.outerStates)) m.outerStates = Array(m.numerator).fill(3);
      if (!Array.isArray(m.innerStates)) m.innerStates = Array(m.denominator).fill(1);
      if (m.outerStates.length !== m.numerator) {
        const old = m.outerStates.slice();
        m.outerStates = Array.from({length:m.numerator}, (_,i) => old[i] ?? 3);
      }
      if (m.innerStates.length !== m.denominator) {
        const old = m.innerStates.slice();
        m.innerStates = Array.from({length:m.denominator}, (_,i) => old[i] ?? 1);
      }
    }

    function clampPolyValue(value, fallback) {
      const n = parseInt(value, 10);
      return Math.max(2, Math.min(20, Number.isFinite(n) ? n : fallback));
    }

    function getPolyEvents(m) {
      const map = new Map();
      const add = (u, key) => {
        const k = Math.round(u * 1000000) / 1000000;
        if (!map.has(k)) map.set(k, { u:k, outer:false, inner:false, outerIndex:-1, innerIndex:-1 });
        return map.get(k);
      };
      for (let i=0;i<m.numerator;i++) { const e=add(i/m.numerator); e.outer=true; e.outerIndex=i; }
      for (let i=0;i<m.denominator;i++) { const e=add(i/m.denominator); e.inner=true; e.innerIndex=i; }
      return [...map.values()].sort((a,b)=>a.u-b.u);
    }

    function buildPolyVisualizer(m) {
      ensurePolyStates(m);
      sequencerContainer.querySelectorAll('.step, .subdivision-dot, .beat-divider, .poly-dot, .poly-ring').forEach(el => el.remove());
      totalSteps = 0;
      stepsData = [];
      clearProgressTrail();
      const outerRing=document.createElement('div'); outerRing.className='poly-ring outer'; sequencerContainer.appendChild(outerRing);
      const innerRing=document.createElement('div'); innerRing.className='poly-ring inner'; sequencerContainer.appendChild(innerRing);

      const bindPolyState = (el, states, index) => {
        el.setAttribute('role','button');el.tabIndex=0;el.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();el.click();}});
        const apply = () => {
          const s = states[index] ?? 0;
          el.dataset.state = String(s);
          el.title = s === 0 ? 'Éteint' : `Clic ${s}`;
          el.setAttribute('aria-label', el.title);
        };
        apply();
        el.addEventListener('click', ev => {
          ev.stopPropagation();
          states[index] = ((states[index] ?? 0) + 1) % 4;
          apply();
          renderSequencerList();
        });
      };

      for (let i=0;i<m.numerator;i++) {
        const d=document.createElement('div'); d.className='poly-dot outer'; d.dataset.polyOuter=i;
        d.style.setProperty('--angle', `${(i/m.numerator)*360}deg`);
        bindPolyState(d, m.outerStates, i);
        sequencerContainer.appendChild(d);
      }
      for (let i=0;i<m.denominator;i++) {
        const d=document.createElement('div'); d.className='poly-dot inner'; d.dataset.polyInner=i;
        d.style.setProperty('--angle', `${(i/m.denominator)*360}deg`);
        bindPolyState(d, m.innerStates, i);
        sequencerContainer.appendChild(d);
      }
      beatDisplay.textContent=`${m.numerator}:${m.denominator}`;
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
        const ratio=document.createElement('div'); ratio.className='poly-ratio-row';
        const n=numberMenu(2,20,m.numerator,`Numérateur mesure ${i+1}`);
        const slash=document.createElement('span'); slash.textContent=':'; slash.className='poly-slash';
        const d=numberMenu(2,20,m.denominator,`Dénominateur mesure ${i+1}`);
        const stop=e=>e.stopPropagation(); n.addEventListener('click',stop); d.addEventListener('click',stop); n.addEventListener('keydown',stop); d.addEventListener('keydown',stop);
        const updateRatio=()=>{ m.numerator=clampPolyValue(n.value,m.numerator); m.denominator=clampPolyValue(d.value,m.denominator); ensurePolyStates(m); n.value=m.numerator; d.value=m.denominator; head.querySelector('.measure-sig').textContent=`${m.numerator}:${m.denominator}`; if(i===activeMeasureIndex) renderActiveMeasure(); };
        n.addEventListener('change',updateRatio); d.addEventListener('change',updateRatio);
        ratio.append(n,slash,d);
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
        card.append(head,ratio,tempoRow,preview);
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
      polyNumeratorInput.value=String(m.numerator); polyDenominatorInput.value=String(m.denominator); syncNumbox(polyNumeratorInput); syncNumbox(polyDenominatorInput);
      syncTempoUI(m); buildPolyVisualizer(m);
      playhead.stepIndex=0; playhead.startTime=performance.now();
    };

    function schedulePolyVisualUpdate(mIdx, event, time) {
      const visualEpoch=window.RENAX_PLAYBACK?.generation;
      const drawTime=(time-audioCtx.currentTime)*1000+(window.RENAX_PLAYBACK?.delayMs(audioCtx)||0);
      setTimeout(()=>{
        if(!isPlaying || appMode!=='polyrhythm' || visualEpoch!==window.RENAX_PLAYBACK?.generation) return;
        if(activeMeasureIndex!==mIdx){ activeMeasureIndex=mIdx; renderActiveMeasure(); renderSequencerList(); }
        sequencerContainer.querySelectorAll('.poly-dot').forEach(el=>el.classList.remove('active'));
        if(event.outer){ const el=sequencerContainer.querySelector(`[data-poly-outer="${event.outerIndex}"]`); if(el) el.classList.add('active'); }
        if(event.inner){ const el=sequencerContainer.querySelector(`[data-poly-inner="${event.innerIndex}"]`); if(el) el.classList.add('active'); }
        const m=measures[mIdx]; if(m){ beatDisplay.textContent=`${m.numerator}:${m.denominator}`; beatDisplay.classList.add('pulse'); setTimeout(()=>beatDisplay.classList.remove('pulse'),130); }
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
        if(e.outer) {
          const s = m.outerStates[e.outerIndex] ?? 3;
          if (s > 0) playClick(s,nextNoteTime,e.u===0);
        }
        if(e.inner) {
          const s = m.innerStates[e.innerIndex] ?? 1;
          if (s > 0) playClick(s,nextNoteTime,e.u===0);
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
      syncTempoUI(measures[0]); renderSequencerList(); renderActiveMeasure();
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
      if (isPlaying || startEpoch!==window.RENAX_PLAYBACK?.generation) return;
      isPlaying = true;
      window.RENAX_PLAYBACK?.start();
      playingMeasureIndex = loopedMeasure && measures.includes(loopedMeasure) ? measures.indexOf(loopedMeasure) : 0;
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
      currentBank = e.target.value;
      updateVoiceGroupLabel();

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
