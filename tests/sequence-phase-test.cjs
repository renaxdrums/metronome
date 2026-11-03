'use strict';
const assert = require('node:assert/strict');
const { start, save, showMeasures } = require('./audio-harness.cjs');

(async () => {
  const runtime = await start();
  const results = [];
  try {
    for (const viewport of [{ width: 1280, height: 850 }, { width: 390, height: 740 }]) {
      const page = await runtime.browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(runtime.url);
      await page.getByRole('tab', { name: 'Séquenceur', exact: true }).click();
      await showMeasures(page);
      await page.waitForFunction(() => typeof createMeasure === 'function' && !!window.RENAX_SONGS);
      await page.evaluate(() => {
        if (isPlaying) stopMetronome();
        setAppMode('metronome');
        measures = [createMeasure(4, 4, 120), createMeasure(4, 4, 120)];
        measures[0].repeatCount = '4';
        measures[1].repeatCount = '4';
        metronomeMeasures = measures;
        renderSequencerList();
      });
      const buttons = page.locator('#measureList .sequence-phase-button');
      assert.equal(await buttons.count(), 2);
      assert.equal(await buttons.first().getAttribute('aria-pressed'), 'false');
      assert.deepEqual(await page.evaluate(() => measures.map(m => m.repeatCount)), ['4','4'],
        'Approved measure count remains unchanged');

      await buttons.nth(1).click();
      let dialog = page.locator('.sequence-phase-dialog');
      assert(await dialog.isVisible(), 'Phase settings open on desktop and mobile');
      assert.equal(await dialog.locator('select').inputValue(), '16');
      assert.equal(await dialog.getByRole('textbox', { name: 'Nombre de pas de déphasage' }).inputValue(), '1');
      await dialog.getByRole('textbox', { name: 'Nombre de pas de déphasage' }).fill('2');
      await dialog.getByRole('combobox', { name: 'Valeur rythmique du déphasage' }).selectOption('24');
      await dialog.getByRole('button', { name: 'Appliquer' }).click();
      assert.equal(await buttons.nth(1).getAttribute('aria-pressed'), 'true');
      assert.deepEqual(await page.evaluate(() => [measures[1].phaseSteps, measures[1].phaseDivision]), [2,24]);
      assert.deepEqual(await page.evaluate(() => measures.map(m => m.repeatCount)), ['4','4']);
      await buttons.nth(1).click();
      dialog = page.locator('.sequence-phase-dialog');
      await dialog.getByRole('combobox', { name: 'Valeur rythmique du déphasage' }).selectOption('custom');
      await dialog.getByRole('textbox', { name: 'Dénominateur personnalisé N' }).fill('192');
      await dialog.getByRole('textbox', { name: 'Nombre de pas de déphasage' }).fill('3');
      await dialog.getByRole('button', { name: 'Appliquer' }).click();
      assert.deepEqual(await page.evaluate(() => [measures[1].phaseSteps, measures[1].phaseDivision]), [3,192],
        'Custom rhythmic fractions remain exact');
      const card = page.locator('#measureList .measure-card').nth(1);
      await card.locator('.sequence-more summary').click();
      await card.getByRole('button', { name: 'Dupliquer' }).click();
      assert.deepEqual(await page.evaluate(() => measures.slice(1).map(m => [m.phaseSteps,m.phaseDivision,m.repeatCount])),
        [[3,192,'4'],[3,192,'4']], 'Duplicating a block preserves phase and validated repetitions');
      await buttons.nth(1).click();
      dialog = page.locator('.sequence-phase-dialog');
      await dialog.getByRole('button', { name: 'Désactiver' }).click();
      assert.equal(await buttons.nth(1).getAttribute('aria-pressed'), 'false');
      assert.equal(await buttons.nth(2).getAttribute('aria-pressed'), 'true', 'Other blocks stay independent');

      const audio = await page.evaluate(() => {
        const saved = { audioCtx,playClick,scheduleVisualUpdate,timeout:window.setTimeout,
          measures,metronomeMeasures,appMode,currentBank,isPlaying,playbackStarting,
          loopedMeasure,playingMeasureIndex,currentStepInMeasure,nextNoteTime,
          repeatIndex:sequenceRepeatIndex,trainingActive:training.active,trainingEngaged:training.engaged,
          silentModeEnabled };
        try {
          let clock = 0;
          const events = [];
          window.setTimeout = () => 0;
          scheduleVisualUpdate = () => {};
          audioCtx = { get currentTime() { return clock; } };
          currentBank = 'clic';
          appMode = 'metronome';
          isPlaying = false;
          playbackStarting = false;
          loopedMeasure = null;
          training.active = false;
          training.engaged = false;
          silentModeEnabled = false;
          measures = [createMeasure(4, 4, 120), createMeasure(4, 4, 120)];
          metronomeMeasures = measures;
          for(const m of measures) {
            m.repeatCount = '4';
            m.beatSubdivisions = [4,4,4,4];
            m.beatStates = Array.from({length:4},()=>[1,1,1,1]);
          }
          measures[1].phaseSteps = 1;
          measures[1].phaseDivision = 16;
          playingMeasureIndex = 0;
          currentStepInMeasure = 0;
          sequenceRepeatIndex = 0n;
          nextNoteTime = .1;
          playClick = (state,time,first,context) => {
            events.push({ block:playingMeasureIndex,time,sub:context.subIndex,first });
          };
          for(let tick=0;tick<1000 && events.length<127;tick++){
            scheduler();clock+=.025;
          }
          return events.slice(0,127);
        } finally {
          window.setTimeout=saved.timeout;
          audioCtx=saved.audioCtx;
          playClick=saved.playClick;
          scheduleVisualUpdate=saved.scheduleVisualUpdate;
          measures=saved.measures;
          metronomeMeasures=saved.metronomeMeasures;
          appMode=saved.appMode;
          currentBank=saved.currentBank;
          isPlaying=saved.isPlaying;
          playbackStarting=saved.playbackStarting;
          loopedMeasure=saved.loopedMeasure;
          playingMeasureIndex=saved.playingMeasureIndex;
          currentStepInMeasure=saved.currentStepInMeasure;
          nextNoteTime=saved.nextNoteTime;
          sequenceRepeatIndex=saved.repeatIndex;
          training.active=saved.trainingActive;
          training.engaged=saved.trainingEngaged;
          silentModeEnabled=saved.silentModeEnabled;
        }
      });
      assert.equal(audio.length,127,'Four normal measures (64 events) and four shifted measures (63 events)');
      assert.deepEqual(audio.map(e=>e.block),[...Array(64).fill(0),...Array(63).fill(1)]);
      for (let i=0;i<64;i++) assert(Math.abs(audio[i].time-(.1+i*.125))<1e-8,
        'Complete reference block must not be cut or shifted');
      for (let i=0;i<63;i++) assert(Math.abs(audio[64+i].time-(8.225+i*.125))<1e-8,
        'All subdivisions of the shifted block share a 1/16 offset');
      assert(audio[126].time<16.1,'Last shifted subdivision must be omitted at block boundary');
      const math=await page.evaluate(()=>{
        const m=createMeasure(4,4,120);m.repeatCount='1';m.phaseSteps=1;m.phaseDivision=24;
        const triplet=sequencePhaseEvent(m,m,0,0,4,120,.1);
        m.phaseSteps=2;m.phaseDivision=16;
        const double=sequencePhaseEvent(m,m,0,0,4,120,.1);
        appMode='polyrhythm';
        const untouched=sequencePhaseEvent(m,m,0,0,4,120,.1);
        appMode='metronome';
        const previousWorkspace=document.body.dataset.workspace;
        document.body.dataset.workspace='training';
        const trainingUnchanged=sequencePhaseEvent(m,m,0,0,4,120,.1);
        document.body.dataset.workspace=previousWorkspace;
        return {triplet:triplet.time,double:double.time,untouched:untouched.time,trainingUnchanged:trainingUnchanged.time};
      });
      assert(Math.abs(math.triplet-(.1+1/12))<1e-8);
      assert(Math.abs(math.double-(.1+.25))<1e-8);
      assert.equal(math.untouched,.1,'Polyrhythm is never phase shifted');
      assert.equal(math.trainingUnchanged,.1,'Training workspace is never phase shifted');

      const deferred = await page.evaluate(() => {
        const saved={audioCtx,playClick,scheduleVisualUpdate,timeout:window.setTimeout,
          measures,metronomeMeasures,appMode,currentBank,isPlaying,playbackStarting,loopedMeasure,
          playingMeasureIndex,currentStepInMeasure,nextNoteTime,
          repeatIndex:sequenceRepeatIndex,pending:pendingSequencePhaseEvents};
        try {
          let clock=0, played=0;
          window.setTimeout=()=>0;scheduleVisualUpdate=()=>{};
          audioCtx={get currentTime(){return clock}};
          playClick=()=>{played++;};
          currentBank='clic';appMode='metronome';isPlaying=false;
          playbackStarting=false;loopedMeasure=null;
          measures=[createMeasure(4,4,120)];measures[0].phaseSteps=1;
          measures[0].phaseDivision=4;measures[0].repeatCount='4';
          metronomeMeasures=measures;playingMeasureIndex=0;currentStepInMeasure=0;
          sequenceRepeatIndex=0n;pendingSequencePhaseEvents=[];nextNoteTime=.01;
          scheduler();
          const queued=pendingSequencePhaseEvents.length;
          const premature=played;
          stopMetronome();
          return {queued,premature,afterStop:pendingSequencePhaseEvents.length};
        } finally {
          window.setTimeout=saved.timeout;audioCtx=saved.audioCtx;playClick=saved.playClick;
          scheduleVisualUpdate=saved.scheduleVisualUpdate;measures=saved.measures;
          metronomeMeasures=saved.metronomeMeasures;appMode=saved.appMode;currentBank=saved.currentBank;
          isPlaying=saved.isPlaying;playbackStarting=saved.playbackStarting;loopedMeasure=saved.loopedMeasure;
          playingMeasureIndex=saved.playingMeasureIndex;currentStepInMeasure=saved.currentStepInMeasure;
          nextNoteTime=saved.nextNoteTime;sequenceRepeatIndex=saved.repeatIndex;
          pendingSequencePhaseEvents=saved.pending;
        }
      });
      assert.equal(deferred.queued,1,'Phase ahead of the audio horizon must be deferred');
      assert.equal(deferred.premature,0,'No instrument source is created early for delayed phases');
      assert.equal(deferred.afterStop,0,'Stop cancels deferred phase events');

      const overflow=await page.locator('#measureList').evaluate(el=>el.scrollWidth-el.clientWidth);
      assert(overflow<=1,'No horizontal overflow on desktop/mobile: '+overflow);
      assert.deepEqual(errors,[],'No uncaught browser exceptions');
      results.push({ viewport:viewport.width,buttons:2,triplets:true,custom:true,normalEvents:64,shiftedEvents:63,overflow });
      await page.close();
    }
  } finally {
    await runtime.browser.close();
    runtime.server?.close();
  }
  save('sequence-phase-results.json',results);
  console.log(results);
})().catch(error=>{ console.error(error); process.exit(1); });
