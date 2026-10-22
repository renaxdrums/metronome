/* exported
  getStepDurationMs, NOTE_NAMES, getSubdivLabel, getPulseDescription, isPlaying,
  playbackStarting, tempo, measures, collapsedSequenceMeasures, metronomeMeasures,
  polyrhythmMeasures, appMode, polyEventIndex, activeMeasureIndex, playingMeasureIndex,
  currentStepInMeasure, scheduledMeasureLayouts, totalSteps, stepsData, nextNoteTime,
  scheduleAheadTime, lookahead, timerID, silentModeEnabled, clickMeasures,
  silentMeasures, silentCycleMeasure, playhead, workElapsed, workStartTime,
  training, allowedSubdivisions, normalizeMeasureSubdivisions, createMeasure, measureTotalSteps,
  getBeatAndSub, getVoiceGroupSize, updateVoiceGroupLabel, getSchedulingMeasure, validatePlayingState,
  bpmDisplay, bpmSlider, mobileTrainingBpm, updateMobileTrainingBpm, volumeSlider,
  volumeValue, soundBankSel, playBtn, tapBtn, panicBtn,
  measureCountSel, silentToggle, silentSettings, clickMeasureCountSel, silentMeasureCountSel,
  measureListEl, activeMeasureLabel, activeNumeratorSel, activeDenominatorSel, sequencerContainer,
  beatDisplay, trainTimerEl, trainDurationInput, trainStartInput, trainEndInput,
  trainBtn, modeSwitch, metroSigGroup, polyControls, polyNumeratorInput,
  polyDenominatorInput, dirToggle, numboxWidgets, closeAllNumboxes, enhanceNumboxSelect,
  syncNumbox, getEffectiveTempo, syncTempoUI, refreshTempoFields, resetSilentCycle,
  isSilentCycleAudible, advanceSilentCycle, setSilentMode, RING_RADIUS, STEP_SIZE,
  updateRingRadius, TRAIL_SEGMENTS, TRAIL_ANGLE, PROGRESS_RADIUS, PROGRESS_CIRC,
  OUTER_PROGRESS_RADIUS, OUTER_PROGRESS_CIRC, trailGroup, trailGroupOuter, markPlayheadStep,
  getCurrentHeadAngle, updateProgressTrail, orbitTrail, clearProgressTrail, canvas,
  pctx, particles, pulses, STEP_RGB, clearParticleCanvas,
  resizeCanvas, getStepXY, emitBurst, drawOrbitPlayhead, animate,
  resetCustomizationTimer, customizationFields, formatTime, getWorkElapsed, startWorkTimer,
  pauseWorkTimer, resetWorkTimer, updateTimerDisplay, loopedMeasure, draggedSequenceMeasure,
  sequenceTransportIcon, finishSequenceEdit, duplicateSequenceMeasure, renameSequenceMeasure, removeSequenceMeasure,
  moveSequenceMeasure, previewSequenceMeasure, suppressSequenceClickUntil, enableSequenceDrag, decorateSequenceCards,
  blockNumberMenu, renderSequencerList, refreshMeasurePreviews, renderActiveMeasure, beatEditorSelection,
  beatEditor, beatEditorDrag, positionBeatEditor, finishBeatEditorDrag, keepBeatEditorInView,
  closeBeatEditor, openBeatEditor, refreshBeatEditor, highlightBeatEditor
*/
    function getStepDurationMs(bpm, denominator, subdiv) {
      return (60000 / bpm) * (4 / denominator) / subdiv;
    }

    const NOTE_NAMES = {
      1: 'Ronde', 2: 'Blanche', 4: 'Noire', 8: 'Croche',
      16: 'Double', 32: 'Triple', 64: 'Quadruple', 128: 'Quintuple', 256: 'Sextuple'
    };

    function getSubdivLabel(_denominator, subdiv) {
      return String(subdiv);
    }

    function getPulseDescription(m) {
      return `Pulsation de base : ${NOTE_NAMES[m.denominator] || m.denominator + 'e'}`;
    }

    let isPlaying = false;
    let playbackStarting = false;
    let tempo = 120;
    let measures = [];
    const collapsedSequenceMeasures = new WeakSet();
    let metronomeMeasures = [];
    let polyrhythmMeasures = [];
    let appMode = 'metronome';
    let polyEventIndex = 0;
    let activeMeasureIndex = 0;
    let playingMeasureIndex = 0;
    let currentStepInMeasure = 0;
    let scheduledMeasureLayouts = new WeakMap();
    let totalSteps = 0;
    let stepsData = [];
    let nextNoteTime = 0.0;
    const scheduleAheadTime = 0.1;
    const lookahead = 25;
    let timerID = null;
    let silentModeEnabled = false;
    let clickMeasures = 3;
    let silentMeasures = 1;
    let silentCycleMeasure = 0;
    const playhead = { stepIndex: 0, startTime: 0, durationMs: 500 };
    let workElapsed = 0;
    let workStartTime = 0;
    let training = {
      engaged: false, active: false, direction: 'up', startTime: 0, duration: 0,
      startBpm: 80, endBpm: 140, intervalId: null
    };

    function allowedSubdivisions(denominator) {
      return [1,2,3,4,5,6,7,8].filter(n => denominator * (n === 3 ? 2 : n >= 5 && n <= 7 ? 4 : n) <= 32);
    }
    function normalizeMeasureSubdivisions(m) {
      const allowed = allowedSubdivisions(m.denominator);
      for (let b = 0; b < m.numerator; b++) {
        if (!allowed.includes(m.beatSubdivisions[b])) {
          const old = m.beatSubdivisions[b];
          const sameFamily = allowed.filter(n => [1,2,4,8].includes(n) === [1,2,4,8].includes(old));
          const n = (sameFamily.length ? sameFamily : allowed).filter(n => n <= old).at(-1) || 1;
          m.beatSubdivisions[b] = n;
          m.beatStates[b] = Array.from({length:n}, (_,i) => m.beatStates[b]?.[i] ?? 0);
        }
      }
    }

    function createMeasure(numerator = 4, denominator = 4, measureTempo = tempo) {
      const defaultSubdivision = allowedSubdivisions(denominator).includes(2) ? 2 : 1;
      const beatSubdivisions = Array(numerator).fill(defaultSubdivision);
      const beatStates = [];
      for (let b = 0; b < numerator; b++) beatStates.push(defaultSubdivision === 2 ? [1, 0] : [1]);
      return { numerator, denominator, tempo: Math.max(2, Math.min(999, Math.round(measureTempo || 120))), beatSubdivisions, beatStates };
    }

    function measureTotalSteps(m) { return m.beatSubdivisions.reduce((a, b) => a + b, 0); }

    function getBeatAndSub(m, stepIdx) {
      let idx = stepIdx;
      for (let b = 0; b < m.numerator; b++) {
        if (idx < m.beatSubdivisions[b]) return { beat: b, subIndex: idx };
        idx -= m.beatSubdivisions[b];
      }
      return { beat: 0, subIndex: 0 };
    }

    // Keep the current audio cycle stable when its visual subdivision layout changes.
    // The edited layout is adopted when this measure is scheduled again.
    function getVoiceGroupSize(m) {
      return appMode === 'metronome' && SOUND_BANKS[currentBank]?.isVoice && m.denominator >= 16 ? m.denominator / 4 : 1;
    }
    function updateVoiceGroupLabel(m = measures[activeMeasureIndex]) {
      const label = document.getElementById('voiceGroupLabel');
      if (!label || !m) return;
      const size = getVoiceGroupSize(m);
      label.hidden = size === 1;
      label.textContent = size > 1 ? 'Voix à la noire · groupes de ' + size : '';
    }

    function getSchedulingMeasure(model) {
      let layout = scheduledMeasureLayouts.get(model);
      if (!layout) {
        layout = { denominator: model.denominator, subdivisions: [...model.beatSubdivisions], states: model.beatStates.map(s => [...s]) };
        scheduledMeasureLayouts.set(model, layout);
      }
      return { ...model, denominator: layout.denominator, beatSubdivisions: layout.subdivisions,
        beatStates: layout.states.map((states, b) => states.map((state, sub) => model.beatStates[b]?.[sub] ?? state)) };
    }

    function validatePlayingState() {
      if (!isPlaying) return;
      if (playingMeasureIndex >= measures.length) playingMeasureIndex = 0;
      if (activeMeasureIndex >= measures.length) activeMeasureIndex = measures.length - 1;
      const model = measures[playingMeasureIndex];
      const m = model ? getSchedulingMeasure(model) : null;
      if (m && currentStepInMeasure >= measureTotalSteps(m)) currentStepInMeasure = 0;
    }

    const bpmDisplay = document.getElementById('bpmDisplay');
    const bpmSlider = document.getElementById('bpmSlider');
    const mobileTrainingBpm = document.getElementById('mobileTrainingBpm');
    if (mobileTrainingBpm) mobileTrainingBpm.addEventListener('click', openMobileTempoSettings);
    function updateMobileTrainingBpm(value){ if(mobileTrainingBpm) mobileTrainingBpm.textContent = value+' BPM'; }
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    const soundBankSel = document.getElementById('soundBank');
    const playBtn = document.getElementById('playBtn');
    const tapBtn = document.getElementById('tapBtn');
    const panicBtn = document.getElementById('panicBtn');
    const measureCountSel = document.getElementById('measureCount');
    const silentToggle = document.getElementById('silentToggle');
    const silentSettings = document.getElementById('silentSettings');
    const clickMeasureCountSel = document.getElementById('clickMeasureCount');
    const silentMeasureCountSel = document.getElementById('silentMeasureCount');
    const measureListEl = document.getElementById('measureList');
    const activeMeasureLabel = document.getElementById('activeMeasureLabel');
    const activeNumeratorSel = document.getElementById('activeNumerator');
    const activeDenominatorSel = document.getElementById('activeDenominator');
    const sequencerContainer = document.getElementById('sequencerContainer');
    const beatDisplay = document.getElementById('beatDisplay');
    const trainTimerEl = document.getElementById('trainTimer');
    const trainDurationInput = document.getElementById('trainDuration');
    const trainStartInput = document.getElementById('trainStart');
    const trainEndInput = document.getElementById('trainEnd');
    const trainBtn = document.getElementById('trainBtn');
    const modeSwitch = document.getElementById('modeSwitch');
    const metroSigGroup = document.getElementById('metroSigGroup');
    const polyControls = document.getElementById('polyControls');
    const polyNumeratorInput = document.getElementById('polyNumerator');
    const polyDenominatorInput = document.getElementById('polyDenominator');
    const dirToggle = document.getElementById('dirToggle');

    for (let n = 1; n <= 20; n++) {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      activeNumeratorSel.appendChild(o);
    }

    for (let n = 1; n <= 32; n++) {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      clickMeasureCountSel.appendChild(o);
    }
    for (let n = 0; n <= 32; n++) {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      silentMeasureCountSel.appendChild(o);
    }
    clickMeasureCountSel.value = String(clickMeasures);
    silentMeasureCountSel.value = String(silentMeasures);



    // Compatibility names for existing feature modules; the widget owns its state.
    const numboxWidgets = RENAX_NUMBOX.widgets;
    const closeAllNumboxes = RENAX_NUMBOX.closeAll;
    const enhanceNumboxSelect = RENAX_NUMBOX.enhance;
    function syncNumbox(select) { numboxWidgets.get(select)?.sync(); }

    [activeNumeratorSel, activeDenominatorSel, polyNumeratorInput, polyDenominatorInput].forEach(enhanceNumboxSelect);

    function getEffectiveTempo(m) {
      if (training.engaged) return tempo;
      return m && Number.isFinite(m.tempo) ? m.tempo : tempo;
    }

    function syncTempoUI(m) {
      if (!m || training.engaged) return;
      tempo = getEffectiveTempo(m);
      bpmSlider.value = tempo;
      bpmDisplay.innerHTML = `${tempo} <span>BPM</span>`; updateMobileTrainingBpm(tempo);
    }

    function refreshTempoFields() {
      measureListEl.querySelectorAll('.measure-card').forEach((card, i) => {
        const input = card.querySelector('.measure-tempo-input');
        if (input && measures[i]) {const value=String(measures[i].tempo);if(![...input.options].some(option=>option.value===value)){const option=document.createElement('option');option.value=value;option.textContent=value;input.append(option);}input.value=value;syncNumbox(input);}
      });
    }

    function resetSilentCycle() { silentCycleMeasure = 0; }
    function isSilentCycleAudible() {
      if (!silentModeEnabled || silentMeasures <= 0) return true;
      const cycleLength = clickMeasures + silentMeasures;
      if (cycleLength <= 0) return true;
      return (silentCycleMeasure % cycleLength) < clickMeasures;
    }
    function advanceSilentCycle() {
      if (!silentModeEnabled) return;
      const cycleLength = clickMeasures + silentMeasures;
      if (cycleLength > 0) silentCycleMeasure = (silentCycleMeasure + 1) % cycleLength;
    }
    function setSilentMode(enabled) {
      silentModeEnabled = !!enabled;
      silentToggle.classList.toggle('active', silentModeEnabled);
      silentToggle.textContent = silentModeEnabled ? 'ON' : 'OFF';
      silentToggle.setAttribute('aria-pressed', silentModeEnabled ? 'true' : 'false');
      silentSettings.classList.toggle('disabled', !silentModeEnabled);
      for(const select of silentSettings.querySelectorAll('select')){select.disabled=!silentModeEnabled;const trigger=select.parentElement.querySelector('.numbox-button');if(trigger)trigger.disabled=!silentModeEnabled;}
      resetSilentCycle();
    }

    let RING_RADIUS = 138;
    let STEP_SIZE = 26;

    function updateRingRadius() {
      const size = sequencerContainer.clientWidth;
      if (size === 0) return;
      RING_RADIUS = size * 0.406;
      STEP_SIZE = Math.max(10, size * 0.076);
      sequencerContainer.style.setProperty('--ring-radius', `${RING_RADIUS}px`);
      sequencerContainer.style.setProperty('--step-size', `${STEP_SIZE}px`);
      sequencerContainer.querySelectorAll('.beat-divider').forEach(el => {
        el.style.height = `${RING_RADIUS}px`;
      });
    }

    const TRAIL_SEGMENTS = 16;
    const TRAIL_ANGLE = 80;
    const PROGRESS_RADIUS = 46;
    const PROGRESS_CIRC = 2 * Math.PI * PROGRESS_RADIUS;
    const OUTER_PROGRESS_RADIUS = 52.5;
    const OUTER_PROGRESS_CIRC = 2 * Math.PI * OUTER_PROGRESS_RADIUS;
    const trailGroup = document.getElementById('trailGroup');
    const trailGroupOuter = document.getElementById('trailGroupOuter');

    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', '50'); c.setAttribute('cy', '50');
      c.setAttribute('r', String(PROGRESS_RADIUS));
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'none');
      c.setAttribute('stroke-width', '6'); c.setAttribute('stroke-linecap', 'butt');
      trailGroup.appendChild(c);
    }

    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', '50'); c.setAttribute('cy', '50');
      c.setAttribute('r', String(OUTER_PROGRESS_RADIUS));
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'none');
      c.setAttribute('stroke-linecap', 'butt');
      c.style.strokeWidth = '5';
      trailGroupOuter.appendChild(c);
    }

    function markPlayheadStep(stepIdx, durationMs = null, span = 1) {
      const m = measures[activeMeasureIndex];
      // Cette fonction appartient au moteur du métronome classique.
      // Une mesure polyrythmique n'a pas de beatSubdivisions.
      if (!m || appMode === 'polyrhythm' || !Array.isArray(m.beatSubdivisions)) return;
      const beat = Math.floor(stepIdx);
      const subdiv = m.beatSubdivisions[beat] || 1;
      playhead.stepIndex = stepIdx;
      playhead.startTime = performance.now();
      playhead.durationMs = durationMs ?? getStepDurationMs(getEffectiveTempo(m), m.denominator, subdiv);
      playhead.span = span;
    }

    function getCurrentHeadAngle() {
      if (totalSteps === 0) return 0;
      const elapsed = performance.now() - playhead.startTime;
      const t = Math.min(1, elapsed / playhead.durationMs);
      const stepAngle = 360 / totalSteps;
      return (playhead.stepIndex + t * (playhead.span ?? 1)) * stepAngle;
    }

    function updateProgressTrail(headAngle) {
      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        const seg = trailGroup.children[i];
        const idealStart = headAngle - TRAIL_ANGLE * (i + 1) / TRAIL_SEGMENTS;
        const idealEnd = headAngle - TRAIL_ANGLE * i / TRAIL_SEGMENTS;
        if (idealEnd <= 0) { seg.setAttribute('stroke', 'none'); continue; }
        const cs = Math.max(0, idealStart);
        const ce = Math.min(360, idealEnd);
        if (ce <= cs) { seg.setAttribute('stroke', 'none'); continue; }
        const length = PROGRESS_CIRC * (ce - cs) / 360;
        const offset = PROGRESS_CIRC * cs / 360;
        const fadeT = i / (TRAIL_SEGMENTS - 1);
        const opacity = Math.pow(1 - fadeT, 1.6) * 0.9;
        seg.setAttribute('stroke-dasharray', `${length.toFixed(3)} ${(PROGRESS_CIRC * 2).toFixed(3)}`);
        seg.setAttribute('stroke-dashoffset', `${(-offset).toFixed(3)}`);
        seg.setAttribute('stroke', `rgba(0, 229, 255, ${opacity.toFixed(3)})`);
      }
      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        const seg = trailGroupOuter.children[i];
        const idealStart = headAngle - TRAIL_ANGLE * (i + 1) / TRAIL_SEGMENTS;
        const idealEnd = headAngle - TRAIL_ANGLE * i / TRAIL_SEGMENTS;
        if (idealEnd <= 0) { seg.setAttribute('stroke', 'none'); continue; }
        const cs = Math.max(0, idealStart);
        const ce = Math.min(360, idealEnd);
        if (ce <= cs) { seg.setAttribute('stroke', 'none'); continue; }
        const length = OUTER_PROGRESS_CIRC * (ce - cs) / 360;
        const offset = OUTER_PROGRESS_CIRC * cs / 360;
        const fadeT = i / (TRAIL_SEGMENTS - 1);
        const opacity = Math.pow(1 - fadeT, 1.6) * 0.45;
        seg.setAttribute('stroke-dasharray', `${length.toFixed(3)} ${(OUTER_PROGRESS_CIRC * 2).toFixed(3)}`);
        seg.setAttribute('stroke-dashoffset', `${(-offset).toFixed(3)}`);
        seg.setAttribute('stroke', `rgba(255, 107, 0, ${opacity.toFixed(3)})`);
      }
    }

    const orbitTrail = { angle:null, time:0, carry:0, distance:0, sparks:[] };
    function clearProgressTrail() {
      orbitTrail.angle=null; orbitTrail.time=0; orbitTrail.carry=0; orbitTrail.distance=0; orbitTrail.sparks.length=0;
      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        trailGroup.children[i].setAttribute('stroke', 'none');
        trailGroupOuter.children[i].setAttribute('stroke', 'none');
      }
    }

    const canvas = document.getElementById('particleCanvas');
    const pctx = canvas.getContext('2d');
    let particles = [];
    let pulses = [];
    const STEP_RGB = { 1: [0, 229, 255], 2: [22, 138, 69], 3: [255, 107, 0], 0: [140, 150, 170] };

    function clearParticleCanvas() {
      pctx.save();
      pctx.setTransform(1,0,0,1,0,0);
      pctx.clearRect(0,0,canvas.width,canvas.height);
      pctx.restore();
    }
    function resizeCanvas() {
      const size = sequencerContainer.clientWidth;
      if (size === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
      particles.length = 0; pulses.length = 0;
      canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    new ResizeObserver(() => {
      resizeCanvas(); updateRingRadius();
      if(appMode!=='polyrhythm' && measures[activeMeasureIndex])renderSubdivisionDots(measures[activeMeasureIndex]);
    }).observe(sequencerContainer);

    function getStepXY(stepIndex) {
      const size = sequencerContainer.clientWidth;
      const cx = size / 2, cy = size / 2;
      const angle = (stepIndex / totalSteps) * Math.PI * 2;
      return { x: cx + RING_RADIUS * Math.sin(angle), y: cy - RING_RADIUS * Math.cos(angle) };
    }

    function emitBurst(stepIndex, state) {
      const { x, y } = getStepXY(stepIndex);
      const rgb = STEP_RGB[state] || STEP_RGB[0];
      const isSilent = (state === 0);
      const count = isSilent ? 5 : 14;
      for (let i = 0; i < count; i++) {
        const baseAngle = Math.atan2(y - sequencerContainer.clientHeight / 2, x - sequencerContainer.clientWidth / 2);
        const spread = (Math.random() - 0.5) * 1.8;
        const angle = baseAngle + spread;
        const speed = (isSilent ? 0.2 : 0.4) + Math.random() * (isSilent ? 0.4 : 1.1);
        particles.push({
          x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 1, decay: 0.012 + Math.random() * 0.018,
          size: (isSilent ? 0.8 : 1.2) + Math.random() * 1.8,
          rgb, gravity: 0.012
        });
      }
      pulses.push({
        x, y, radius: 8, maxRadius: isSilent ? 24 : 42,
        life: 1, decay: 0.045, rgb, width: isSilent ? 1 : 1.8
      });
    }


    function drawOrbitPlayhead(headAngle, now=performance.now()) {
      const size=sequencerContainer.clientWidth,cx=size/2,cy=sequencerContainer.clientHeight/2;
      const radius=RING_RADIUS+STEP_SIZE*.62;
      const headSize=Math.max(2.1,Math.min(4,size*.009));
      const delta=orbitTrail.angle===null?0:((headAngle-orbitTrail.angle+540)%360)-180;
      const dt=orbitTrail.time?Math.min(.05,Math.max(0,(now-orbitTrail.time)/1000)):0;
      orbitTrail.distance+=Math.max(0,delta);
      orbitTrail.carry+=dt*150;
      const count=Math.min(10,Math.floor(orbitTrail.carry));orbitTrail.carry-=count;
      for(let j=0;j<count;j++){
        const fraction=(j+1)/Math.max(1,count);
        const a=((orbitTrail.angle??headAngle)+delta*fraction)*Math.PI/180;
        const jitter=(Math.random()-.5)*3;
        orbitTrail.sparks.push({x:cx+(radius+jitter)*Math.sin(a),y:cy-(radius+jitter)*Math.cos(a),vx:(Math.random()-.5)*14,vy:(Math.random()-.5)*14,born:now,life:300+Math.random()*330,size:.25+Math.random()*.5});
      }
      orbitTrail.angle=headAngle;orbitTrail.time=now;
      pctx.save();
      const tailAngle=Math.min(42,orbitTrail.distance);
      for(let i=23;i>=0;i--){
        const fade=1-i/24;
        const a0=(headAngle-tailAngle*(i+1)/24-90)*Math.PI/180;
        const a1=(headAngle-tailAngle*i/24-90)*Math.PI/180;
        if(tailAngle<=0)break;
        pctx.beginPath();pctx.arc(cx,cy,radius,a0,a1);
        pctx.strokeStyle='rgba(0,229,255,'+(Math.pow(fade,2)*.65)+')';
        pctx.lineWidth=.35+fade*1.3;pctx.lineCap='round';pctx.stroke();
      }
      for(let i=orbitTrail.sparks.length-1;i>=0;i--){
        const p=orbitTrail.sparks[i],age=now-p.born;
        if(age>=p.life){orbitTrail.sparks.splice(i,1);continue;}
        p.x+=p.vx*dt;p.y+=p.vy*dt;
        const fade=1-age/p.life;
        pctx.beginPath();pctx.arc(p.x,p.y,p.size,0,Math.PI*2);pctx.fillStyle='rgba(0,229,255,'+(fade*fade*.6)+')';pctx.fill();
      }
      const rad=headAngle*Math.PI/180,x=cx+radius*Math.sin(rad),y=cy-radius*Math.cos(rad);
      pctx.shadowColor='rgba(0,229,255,.6)';pctx.shadowBlur=8;
      pctx.beginPath();pctx.arc(x,y,headSize,0,Math.PI*2);pctx.fillStyle='#00e5ff';pctx.fill();
      pctx.shadowBlur=0;pctx.beginPath();pctx.arc(x-headSize*.2,y-headSize*.2,headSize*.42,0,Math.PI*2);pctx.fillStyle='#dcfbff';pctx.fill();
      pctx.restore();
    }

    function animate() {
      // The opaque introduction covers these visuals; audio has its own scheduler.
      const arrival = document.getElementById('renaxArrival');
      if (arrival && !arrival.hidden && arrival.dataset.introPhase !== 'fade-in') {
        requestAnimationFrame(animate);
        return;
      }
      updateTimerDisplay();
      const w = sequencerContainer.clientWidth;
      const h = sequencerContainer.clientHeight;
      if (w === 0 || h === 0) { requestAnimationFrame(animate); return; }
      clearParticleCanvas();

      if (appMode === 'polyrhythm') {
        particles.length = 0;
        pulses.length = 0;
        clearProgressTrail();
        requestAnimationFrame(animate);
        return;
      }

      if (isPlaying && totalSteps > 0) drawOrbitPlayhead(getCurrentHeadAngle());
      else clearProgressTrail();

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.radius += 0.9; p.life -= p.decay;
        if (p.life <= 0 || p.radius >= p.maxRadius) { pulses.splice(i, 1); continue; }
        const alpha = p.life * 0.75;
        pctx.beginPath(); pctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        pctx.strokeStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${alpha})`;
        pctx.lineWidth = p.width * p.life; pctx.stroke();
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += p.gravity;
        p.vx *= 0.965; p.vy *= 0.965; p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        const alpha = p.life * 0.9;
        const r = Math.max(0.2, p.size * p.life);
        pctx.beginPath(); pctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        pctx.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${alpha})`; pctx.fill();
        if (p.size > 2 && p.life > 0.4) {
          pctx.beginPath(); pctx.arc(p.x, p.y, r * 2.5, 0, Math.PI * 2);
          pctx.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${alpha * 0.15})`; pctx.fill();
        }
      }

      requestAnimationFrame(animate);
    }

    function resetCustomizationTimer() {
      resetWorkTimer();
      if(isPlaying)startWorkTimer();
      updateTimerDisplay();
    }
    const customizationFields='#bpmSlider,#volumeSlider,#soundBank,#measureCount,#clickMeasureCount,#silentMeasureCount,#activeNumerator,#activeDenominator,#polyNumerator,#polyDenominator,#beatEditorDivision,.measure-tempo-input,.measure-card input[type=number]';
    document.addEventListener('change',e=>{if(e.target.matches(customizationFields))resetCustomizationTimer();},true);
    document.addEventListener('input',e=>{if(e.target.matches('#bpmSlider,#volumeSlider,.measure-tempo-input'))resetCustomizationTimer();},true);
    document.addEventListener('click',e=>{if(e.target.closest('#beatEditorPads button,.poly-dot,#silentToggle,#modeSwitch button'))resetCustomizationTimer();},true);
    function formatTime(s) {
      s = Math.max(0, s);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    function getWorkElapsed() { return workElapsed + (workStartTime > 0 ? performance.now() - workStartTime : 0); }
    function startWorkTimer() { if (workStartTime === 0) workStartTime = performance.now(); }
    function pauseWorkTimer() { if (workStartTime > 0) { workElapsed += performance.now() - workStartTime; workStartTime = 0; } }
    function resetWorkTimer() { workElapsed = 0; workStartTime = 0; }

    function updateTimerDisplay() {
      let text;
      if (training.engaged) {
        const remaining = training.active ? Math.max(0, training.duration - (performance.now() - training.startTime)) : training.duration;
        text = training.run?.mode === 'steps'
          ? formatTime(Math.floor((training.active ? performance.now() - training.startTime : 0) / 1000))
          : formatTime(Math.ceil(remaining / 1000));
        trainTimerEl.classList.add('active', 'training');
      } else if (isPlaying || workElapsed > 0 || workStartTime > 0) {
        text = formatTime(Math.floor(getWorkElapsed() / 1000));
        trainTimerEl.classList.toggle('active', isPlaying);
        trainTimerEl.classList.remove('training');
      } else {
        text = '0:00';
        trainTimerEl.classList.remove('active', 'training');
      }
      // Replacing the same text each frame wakes DOM observers and forces layout.
      if (trainTimerEl.textContent !== text) trainTimerEl.textContent = text;
    }


    let loopedMeasure = null;
    let draggedSequenceMeasure = null;
    function sequenceTransportIcon(playing) {
      return playing ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l12-7Z"/></svg>';
    }
    function finishSequenceEdit(selected) {
      activeMeasureIndex = Math.max(0, measures.indexOf(selected));
      playingMeasureIndex = activeMeasureIndex;
      currentStepInMeasure = 0; polyEventIndex = 0;
      measureCountSel.value = String(measures.length);
      syncNumbox(measureCountSel);
      renderSequencerList(); renderActiveMeasure();
      measureCountSel.dispatchEvent(new Event('change', {bubbles:true}));
    }
    function duplicateSequenceMeasure(m) {
      if(playbackStarting || measures.length>=8)return;
      const index=measures.indexOf(m);if(index<0)return;
      stopMetronome();
      const copy=JSON.parse(JSON.stringify(m));
      if(copy.name)copy.name=(copy.name+' · copie').slice(0,100);
      measures.splice(index+1,0,copy);
      finishSequenceEdit(copy);
    }
    async function renameSequenceMeasure(m) {
      if(playbackStarting || !measures.includes(m))return;
      const collection=measures;
      const value=await window.RENAX_MULTI.requestName('Libellé',m.name||'');
      if(!value?.trim() || measures!==collection || !measures.includes(m))return;
      m.name=value.trim().slice(0,100);
      finishSequenceEdit(measures[activeMeasureIndex]);
    }
    function removeSequenceMeasure(m) {
      if (playbackStarting || measures.length <= 1) return;
      const index=measures.indexOf(m); if(index<0)return;
      const selected=measures[activeMeasureIndex];
      stopMetronome();
      measures.splice(index,1);
      finishSequenceEdit(selected===m ? measures[Math.min(index,measures.length-1)] : selected);
    }
    function moveSequenceMeasure(m, target) {
      if(playbackStarting)return;
      const from=measures.indexOf(m),to=measures.indexOf(target);
      if(from<0||to<0||from===to)return;
      const selected=measures[activeMeasureIndex];
      stopMetronome();
      measures.splice(from,1); measures.splice(to,0,m);
      finishSequenceEdit(selected);
    }
    async function previewSequenceMeasure(m) {
      if(playbackStarting || training.engaged || window.RENAX_SONGS?.preparing)return;
      if(isPlaying&&loopedMeasure===m){stopMetronome();return;}
      stopMetronome();
      loopedMeasure=m;
      try { await startMetronome(); }
      catch(error){loopedMeasure=null; renderSequencerList(); console.warn('Lecture de la mesure indisponible',error);}
    }

    let suppressSequenceClickUntil=0;
    function enableSequenceDrag(card,m) {
      let gesture=null,hold=null,placeholder=null,oldStyle=null;
      const panel=card.closest('.panel');
      const clear=()=>measureListEl.querySelectorAll('.drop-target').forEach(c=>c.classList.remove('drop-target'));
      function mark(){
        if(!gesture?.active)return;
        card.style.top=(gesture.y-gesture.offsetY)+'px';card.style.left=(gesture.x-gesture.offsetX)+'px';
        const others=Array.from(measureListEl.querySelectorAll('.measure-card')).filter(c=>c!==card);
        const before=others.find(c=>gesture.y<c.getBoundingClientRect().top+c.getBoundingClientRect().height/2);
        gesture.target=before?measures[Array.from(measureListEl.querySelectorAll('.measure-card')).indexOf(before)]:null;
        gesture.after=!before;
        clear();(before||others.at(-1))?.classList.add('drop-target');
      }
      function activate(){
        if(!gesture||gesture.scrolling||playbackStarting)return;
        gesture.active=true;
        const rect=card.getBoundingClientRect();gesture.offsetX=gesture.startX-rect.left;gesture.offsetY=gesture.startY-rect.top;
        placeholder=document.createElement('div');placeholder.className='sequence-drag-placeholder';placeholder.style.height=rect.height+'px';card.before(placeholder);
        oldStyle=card.getAttribute('style');
        Object.assign(card.style,{position:'fixed',width:rect.width+'px',height:rect.height+'px',zIndex:'1200',pointerEvents:'none',opacity:'.9',boxShadow:'0 12px 35px #0008'});
        card.classList.add('dragging');mark();
      }
      card.addEventListener('click',e=>{if(performance.now()<suppressSequenceClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
      card.addEventListener('pointerdown',e=>{
        if(e.button!==0||!e.isPrimary||gesture||e.target.closest('button,input,select,summary,details,label,a'))return;
        gesture={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,active:false,scrolling:false,scrollTop:panel.scrollTop};
        card.setPointerCapture(e.pointerId);if(e.pointerType==='mouse')e.preventDefault();hold=setTimeout(activate,250);
      });
      card.addEventListener('pointermove',e=>{
        if(!gesture||gesture.id!==e.pointerId)return;gesture.x=e.clientX;gesture.y=e.clientY;
        if(!gesture.active&&Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>8){if(e.pointerType==='touch'){gesture.scrolling=true;clearTimeout(hold);}else activate();}
        if(gesture.scrolling){panel.scrollTop=gesture.scrollTop+gesture.startY-e.clientY;e.preventDefault();return;}
        if(gesture.active){e.preventDefault();mark();}
      });
      function finish(e,cancelled=false){
        if(!gesture||gesture.id!==e.pointerId)return;
        clearTimeout(hold);const done=gesture;gesture=null;clear();
        if(done.active){placeholder?.remove();placeholder=null;if(oldStyle===null)card.removeAttribute('style');else card.setAttribute('style',oldStyle);card.classList.remove('dragging');}
        if(done.active||done.scrolling)suppressSequenceClickUntil=performance.now()+200;
        if(card.hasPointerCapture(e.pointerId))card.releasePointerCapture(e.pointerId);
        if(done.active&&!cancelled){
          const rect=panel.getBoundingClientRect();if(done.x<rect.left||done.x>rect.right||done.y<rect.top||done.y>rect.bottom)return;
          const target=done.target||measures.at(-1);
          if(target===m)return;
          // Insert before the target, or after the last card.
          const from=measures.indexOf(m),_to=measures.indexOf(target);
          const selected=measures[activeMeasureIndex];stopMetronome();
          measures.splice(from,1);const index=done.after?measures.length:measures.indexOf(target);measures.splice(index,0,m);finishSequenceEdit(selected);
        }
      }
      card.addEventListener('pointerup',e=>finish(e));card.addEventListener('pointercancel',e=>finish(e,true));
      card.addEventListener('keydown',e=>{if(e.target!==card||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const target=measures[measures.indexOf(m)+(e.key==='ArrowUp'?-1:1)];if(target){moveSequenceMeasure(m,target);measureListEl.children[measures.indexOf(m)]?.focus();}});
      card.title='Appuyer et glisser pour déplacer · Alt + flèche pour réordonner';
    }

    function decorateSequenceCards() {
      measureListEl.querySelectorAll('.measure-card').forEach((card,i)=>{
        const m=measures[i]; if(!m)return;
        if(m.name){const title=card.querySelector('.measure-num');title.dataset.noTranslate='';title.textContent=m.name;}
        const tools=document.createElement('div');tools.className='sequence-card-tools';
        enableSequenceDrag(card,m);
        const play=document.createElement('button');play.type='button';play.className='sequence-preview-play';
        const playing=isPlaying&&loopedMeasure===m;
        play.innerHTML=sequenceTransportIcon(playing);play.setAttribute('aria-label',playing?'Arrêter la mesure '+(i+1):'Écouter la mesure '+(i+1)+' en boucle');play.title=play.getAttribute('aria-label');play.setAttribute('aria-pressed',String(playing));play.disabled=playbackStarting||training.engaged;
        play.onclick=e=>{e.stopPropagation();previewSequenceMeasure(m);};
        const menu=document.createElement('details');menu.className='sequence-more';
        const summary=document.createElement('summary');summary.textContent='⋯';summary.setAttribute('aria-label','Options de la mesure '+(i+1));
        menu.addEventListener('click',e=>e.stopPropagation());menu.addEventListener('keydown',e=>e.stopPropagation());
        const actions=document.createElement('div');actions.className='sequence-more-actions';
        const del=document.createElement('button');del.type='button';del.textContent='Supprimer';del.disabled=measures.length<=1||playbackStarting;del.onclick=e=>{e.stopPropagation();removeSequenceMeasure(m);};
        const duplicate=document.createElement('button');duplicate.type='button';duplicate.textContent='Dupliquer';duplicate.disabled=measures.length>=8||playbackStarting;
        duplicate.onclick=e=>{e.stopPropagation();menu.open=false;duplicateSequenceMeasure(m);};
        const rename=document.createElement('button');rename.type='button';rename.textContent='Renommer';rename.disabled=playbackStarting;
        rename.onclick=e=>{e.stopPropagation();menu.open=false;renameSequenceMeasure(m);};
        actions.append(duplicate,rename,del);menu.append(summary,actions);tools.append(play,menu);card.append(tools);
      });
    }

    function blockNumberMenu(values,value,label){
      const select=document.createElement('select');select.setAttribute('aria-label',label);
      const fill=list=>{const fragment=document.createDocumentFragment();for(const v of list){const option=document.createElement('option');option.value=String(v);option.textContent=String(v);fragment.append(option);}select.replaceChildren(fragment);select.value=String(value);};
      fill(values.length>100?[value]:values);
      if(values.length>100)select.addEventListener('renax-options-request',()=>{const current=select.value;fill(values);select.value=current;numboxWidgets.get(select)?.rebuild();},{once:true});
      return select;
    }

    function renderSequencerList() {
      measureListEl.innerHTML = '';
      measures.forEach((m, i) => {
        const card = document.createElement('div');
        card.className = 'measure-card';
        card.setAttribute('role', 'group');
        card.setAttribute('aria-label','Mesure '+(i+1));
        card.tabIndex = 0;
        card.classList.toggle('sequence-collapsed', collapsedSequenceMeasures.has(m));
        card.setAttribute('aria-description',collapsedSequenceMeasures.has(m)?'Repliée, Entrée pour ouvrir':'Ouverte, Entrée pour replier');
        if (i === activeMeasureIndex) card.classList.add('active');
        if (isPlaying && i === playingMeasureIndex) card.classList.add('playing');

        const head = document.createElement('div');
        head.className = 'measure-head';
        head.innerHTML = `<span class="measure-num">MESURE ${i + 1} / ${measures.length}</span><span class="measure-sig">${m.numerator}/${m.denominator}</span>`;

        const ratio=document.createElement('div');ratio.className='poly-ratio-row sequence-signature-row';
        const numerator=blockNumberMenu(Array.from({length:20},(_,v)=>v+1),m.numerator,`Numérateur mesure ${i+1}`);
        const denominator=blockNumberMenu([2,4,8,16,32],m.denominator,`Dénominateur mesure ${i+1}`);
        const slash=document.createElement('span');slash.className='poly-slash';slash.textContent='/';
        for(const field of [numerator,denominator]){field.addEventListener('click',e=>e.stopPropagation());field.addEventListener('keydown',e=>e.stopPropagation());}
        const changeSignature=(target,value)=>{activeMeasureIndex=i;target.value=String(value);target.dispatchEvent(new Event('change',{bubbles:true}));renderSequencerList();};
        numerator.addEventListener('change',e=>{e.stopPropagation();changeSignature(activeNumeratorSel,numerator.value);});
        denominator.addEventListener('change',e=>{e.stopPropagation();changeSignature(activeDenominatorSel,denominator.value);});
        ratio.append(numerator,slash,denominator);

        const tempoRow = document.createElement('div');
        tempoRow.className = 'measure-tempo-row';
        const tempoLabel = document.createElement('span');
        tempoLabel.className = 'measure-tempo-label';
        tempoLabel.textContent = 'TEMPO';
        const tempoInput = blockNumberMenu(Array.from({length:998},(_,v)=>v+2),m.tempo,`Tempo mesure ${i+1}`);
        tempoInput.className = 'measure-tempo-input';
        tempoInput.setAttribute('aria-label', `Tempo mesure ${i + 1}`);
        const tempoUnit = document.createElement('span');
        tempoUnit.className = 'measure-tempo-unit';
        tempoUnit.textContent = 'BPM';
        tempoInput.addEventListener('click', e => e.stopPropagation());
        tempoInput.addEventListener('keydown', e => e.stopPropagation());
        const commitMeasureTempo = (rawValue, normalizeField = false) => {
          const parsed = parseInt(rawValue, 10);
          if (!Number.isFinite(parsed)) return;
          const v = Math.max(2, Math.min(999, parsed));
          m.tempo = v;
          if (normalizeField) tempoInput.value = String(v);
          if (i === activeMeasureIndex && !training.engaged) syncTempoUI(m);
        };
        tempoInput.addEventListener('input', e => {
          e.stopPropagation();
          commitMeasureTempo(e.target.value, false);
        });
        tempoInput.addEventListener('change', e => {
          e.stopPropagation();
          const fallback = Number.isFinite(m.tempo) ? m.tempo : 120;
          if (e.target.value === '') e.target.value = String(fallback);
          commitMeasureTempo(e.target.value, true);
        });
        tempoRow.appendChild(tempoLabel);
        tempoRow.appendChild(tempoInput);
        tempoRow.appendChild(tempoUnit);

        const preview = document.createElement('div');
        preview.className = 'measure-preview';
        for (let b = 0; b < m.numerator; b++) {
          const group = document.createElement('div');
          group.className = 'preview-beat';
          for (let s = 0; s < m.beatSubdivisions[b]; s++) {
            const dot = document.createElement('span');
            dot.className = 'preview-dot';
            dot.dataset.state = m.beatStates[b][s];
            group.appendChild(dot);
          }
          preview.appendChild(group);
        }

        card.appendChild(head);
        card.appendChild(ratio);
        card.appendChild(tempoRow);
        card.appendChild(preview);
        const selectMeasure = () => {
          if(collapsedSequenceMeasures.has(m))collapsedSequenceMeasures.delete(m);else collapsedSequenceMeasures.add(m);
          activeMeasureIndex = i;
          syncTempoUI(m);
          renderSequencerList();
          renderActiveMeasure();
        };
        card.addEventListener('click', e => {if(!e.target.closest('button,input,select,details,label'))selectMeasure();});
        card.addEventListener('keydown', e => {
          if (e.target !== card) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMeasure(); }
        });
        measureListEl.appendChild(card);
      });
    }

    function refreshMeasurePreviews() {
      measureListEl.querySelectorAll('.measure-card').forEach((card, i) => {
        const m = measures[i];
        if (!m) return;
        const sig = card.querySelector('.measure-sig');
        if (sig) sig.textContent = `${m.numerator}/${m.denominator}`;
        const preview = card.querySelector('.measure-preview');
        if (!preview) return;
        preview.innerHTML = '';
        for (let b = 0; b < m.numerator; b++) {
          const group = document.createElement('div');
          group.className = 'preview-beat';
          for (let s = 0; s < m.beatSubdivisions[b]; s++) {
            const dot = document.createElement('span');
            dot.className = 'preview-dot';
            dot.dataset.state = m.beatStates[b][s];
            group.appendChild(dot);
          }
          preview.appendChild(group);
        }
      });
    }

    function renderActiveMeasure() {
      const m = measures[activeMeasureIndex];
      if (!m) return;
      activeMeasureLabel.toggleAttribute('data-no-translate',!!m.name);
      activeMeasureLabel.textContent = m.name || `MESURE ${activeMeasureIndex + 1} / ${measures.length}`;
      updateVoiceGroupLabel(m);
      activeNumeratorSel.value = String(m.numerator);
      activeDenominatorSel.value = String(m.denominator);
      syncNumbox(activeNumeratorSel);
      syncNumbox(activeDenominatorSel);
      syncTempoUI(m);
      normalizeMeasureSubdivisions(m);
      buildCircularSequencer(m);
      if (!isPlaying) { playhead.stepIndex = 0; playhead.startTime = performance.now(); }
      refreshBeatEditor();
    }

    let beatEditorSelection = null;
    const beatEditor = document.createElement('div');
    beatEditor.id = 'beatEditor';
    beatEditor.hidden = true;
    beatEditor.setAttribute('role','dialog');
    beatEditor.setAttribute('aria-labelledby','beatEditorTitle');
    beatEditor.style.cssText = 'position:fixed;right:16px;top:130px;width:min(340px,calc(100vw - 32px));max-height:calc(100dvh - 160px);overflow:auto;z-index:1000;background:#20212a;border:1px solid var(--cyan);border-radius:10px;padding:16px;box-shadow:0 12px 50px #0009;box-sizing:border-box';
    document.body.appendChild(beatEditor);
    let beatEditorDrag = null;
    function positionBeatEditor(x,y) {
      const rect=beatEditor.getBoundingClientRect();
      beatEditor.style.right='auto';
      beatEditor.style.left=Math.max(8,Math.min(x,window.innerWidth-rect.width-8))+'px';
      beatEditor.style.top=Math.max(8,Math.min(y,window.innerHeight-rect.height-8))+'px';
    }
    beatEditor.addEventListener('pointerdown',e=>{
      if(e.button!==0 || !e.target.closest('.beat-editor-handle') || e.target.closest('button'))return;
      const rect=beatEditor.getBoundingClientRect();
      beatEditorDrag={pointerId:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left,top:rect.top};
      beatEditor.setPointerCapture(e.pointerId);e.preventDefault();
    });
    beatEditor.addEventListener('pointermove',e=>{
      if(!beatEditorDrag || beatEditorDrag.pointerId!==e.pointerId)return;
      positionBeatEditor(beatEditorDrag.left+e.clientX-beatEditorDrag.x,beatEditorDrag.top+e.clientY-beatEditorDrag.y);
    });
    function finishBeatEditorDrag(e) {
      if(beatEditorDrag?.pointerId===e.pointerId)beatEditorDrag=null;
    }
    beatEditor.addEventListener('pointerup',finishBeatEditorDrag);
    beatEditor.addEventListener('pointercancel',finishBeatEditorDrag);
    beatEditor.addEventListener('lostpointercapture',finishBeatEditorDrag);
    function keepBeatEditorInView() {
      if(beatEditor.hidden)return;
      const rect=beatEditor.getBoundingClientRect();positionBeatEditor(rect.left,rect.top);
    }
    window.addEventListener('resize',keepBeatEditorInView);
    new ResizeObserver(keepBeatEditorInView).observe(beatEditor);
    function closeBeatEditor() { beatEditor.hidden = true; beatEditorSelection = null; sequencerContainer.querySelectorAll('.step.editing').forEach(el=>el.classList.remove('editing')); }
    function openBeatEditor(m, beat) {
      beatEditorSelection = { m, beat };
      beatEditor.hidden = false;
      refreshBeatEditor();
    }
    function refreshBeatEditor() {
      if (!beatEditorSelection) return;
      const { m, beat } = beatEditorSelection;
      const measureIndex = measures.indexOf(m);
      if (appMode !== 'metronome' || measureIndex < 0 || beat >= m.numerator) { closeBeatEditor(); return; }
      sequencerContainer.querySelectorAll('.step').forEach(el=>el.classList.toggle('editing',measures[activeMeasureIndex]===m&&Number(el.dataset.beat)===beat));
      beatEditor.replaceChildren();
      const header = document.createElement('div');
      header.className='beat-editor-handle';
      header.title='Glisser pour déplacer';
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;cursor:move;touch-action:none;user-select:none';
      const title = document.createElement('strong');
      title.id = 'beatEditorTitle';
      title.textContent = 'Temps ' + (beat+1) + ' · mesure ' + (measureIndex+1);
      const close = document.createElement('button');
      close.textContent = '×'; close.setAttribute('aria-label','Fermer');
      close.style.cssText='width:32px;height:32px;padding:0;background:transparent;border:1px solid var(--orange);border-radius:4px;color:var(--orange);font-size:22px;cursor:pointer';
      close.addEventListener('click',closeBeatEditor);
      header.append(title,close); beatEditor.appendChild(header);
      const label = document.createElement('label');
      label.className='beat-editor-division-label';
      label.textContent = 'Divisé en';
      const select = document.createElement('select');
      select.id = 'beatEditorDivision';
      for (const n of allowedSubdivisions(m.denominator)) {
        const option = document.createElement('option');option.value=n;option.textContent=n;select.appendChild(option);
      }
      select.value = m.beatSubdivisions[beat];
      select.addEventListener('change',() => {
        resizeBeat(m,beat,Number(select.value));validatePlayingState();
        if (measures[activeMeasureIndex] === m) renderActiveMeasure();
        refreshMeasurePreviews();refreshBeatEditor();
      });
      label.appendChild(select);beatEditor.appendChild(label);
      const pads = document.createElement('div');
      pads.id = 'beatEditorPads';
      pads.style.cssText = 'display:flex;flex-wrap:nowrap;gap:6px;margin:16px 0;overflow-x:auto';
      for (let i=0;i<m.beatSubdivisions[beat];i++) {
        const button = document.createElement('button');
        button.dataset.subIndex=i;button.dataset.state=m.beatStates[beat][i];
        button.textContent=i+1;
        const state=m.beatStates[beat][i];
        button.style.cssText='flex:1 0 28px;min-width:28px;height:48px;padding:0;border:2px solid transparent;border-radius:7px;font-weight:700;background:'+['var(--grey)','var(--cyan)','var(--yellow)','var(--orange)'][state]+';color:'+(state?'#111':'#ddd');
        button.setAttribute('aria-label','Subdivision '+(i+1)+', '+['éteint','clic 1','clic 2','clic 3'][state]);
        button.addEventListener('click',()=>{
          m.beatStates[beat][i]=(m.beatStates[beat][i]+1)%4;
          if(measures[activeMeasureIndex]===m){
            const block=sequencerContainer.querySelector('.step[data-beat="'+beat+'"]');
            if(block){block.dataset.state=m.beatStates[beat][0];block.firstChild.style.color=m.beatStates[beat][0]?'#111':'#ddd';}
          }
          renderSubdivisionDots(m);refreshMeasurePreviews();refreshBeatEditor();
        });pads.appendChild(button);
      }
      beatEditor.appendChild(pads);
      const legend=document.createElement('p');legend.className='beat-editor-legend';legend.style.cssText='display:flex;justify-content:center;flex-wrap:wrap;gap:8px 12px;margin:0;font-size:11px;color:var(--text-muted)';
      ['Éteint','Clic 1','Clic 2','Clic 3'].forEach((text,state)=>{const item=document.createElement('span'),dot=document.createElement('span');item.style.cssText='display:inline-flex;align-items:center;gap:5px';dot.setAttribute('aria-hidden','true');dot.style.cssText='width:9px;height:9px;border-radius:2px;background:'+['var(--grey)','var(--cyan)','var(--yellow)','var(--orange)'][state];item.append(dot,document.createTextNode(text));legend.append(item);});beatEditor.appendChild(legend);
      if(isPlaying){const note=document.createElement('p');note.textContent='Les divisions prennent effet au prochain passage de la mesure.';note.style.cssText='font-size:11px;color:var(--text-muted)';beatEditor.appendChild(note);}
    }
    function highlightBeatEditor(m,beat,subIndex,scheduledSubdivisions) {
      if(!beatEditorSelection || beatEditorSelection.m!==m || beatEditorSelection.beat!==beat)return;
      const current=Math.min(m.beatSubdivisions[beat]-1,Math.floor(subIndex*m.beatSubdivisions[beat]/scheduledSubdivisions));
      beatEditor.querySelectorAll('#beatEditorPads button').forEach((button,i)=>{button.style.borderColor=i===current?'#fff':'transparent';});
    }
    document.addEventListener('pointerdown',e=>{if(!beatEditor.hidden&&!beatEditor.contains(e.target)&&!e.target.closest('.step'))closeBeatEditor();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!beatEditor.hidden){closeBeatEditor();e.preventDefault();e.stopPropagation();}},true);
    beatEditor.addEventListener('keydown',e=>e.stopPropagation());
