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
      await showMeasures(page);
      await page.waitForFunction(() => typeof createMeasure === 'function' && !!window.RENAX_SONGS);
      await page.evaluate(() => {
        if (isPlaying) stopMetronome();
        setAppMode('metronome');
        measures = [createMeasure(4, 4, 120), createMeasure(3, 4, 90)];
        metronomeMeasures = measures;
        activeMeasureIndex = 0;
        renderSequencerList();
      });
      const inputs = page.locator('#measureList .measure-repeat-input');
      assert.equal(await inputs.count(), 2, 'Each sequencer block has its own repeat setting');
      assert.deepEqual(await inputs.evaluateAll(nodes => nodes.map(el => el.value)), ['1', '1']);
      assert(await inputs.first().isVisible(), 'Repeat count is visible on desktop and mobile');
      await inputs.first().fill('3');
      await inputs.first().press('Tab');
      assert.equal(await page.evaluate(() => measures[0].repeatCount), '3');
      assert.equal(await inputs.nth(1).inputValue(), '1', 'Other blocks stay independent');

      await inputs.first().fill('0');
      await inputs.first().press('Tab');
      assert.equal(await inputs.first().inputValue(), '3', 'Zero is rejected');
      await inputs.first().fill('1.5');
      await inputs.first().press('Tab');
      assert.equal(await inputs.first().inputValue(), '3', 'Fractions are rejected');
      const huge = '999999999999999999999999999999999999999999';
      await inputs.first().fill(huge);
      await inputs.first().press('Tab');
      assert.equal(await inputs.first().inputValue(), huge, 'No artificial maximum');
      assert.equal(await page.evaluate(() => JSON.parse(JSON.stringify(measures[0])).repeatCount), huge, 'Large count survives JSON roundtrip');
      await inputs.first().fill('3');
      await inputs.first().press('Tab');

      const firstCard = page.locator('#measureList .measure-card').first();
      await firstCard.locator('.sequence-more summary').click();
      await firstCard.getByRole('button', { name: 'Dupliquer' }).click();
      assert.equal(await inputs.count(), 3);
      assert.deepEqual(await page.evaluate(() => measures.map(m => m.repeatCount ?? '1')), ['3', '3', '1'], 'Duplication preserves count');

      const playback = await page.evaluate(() => {
        const previous = {
          audioCtx, playClick, scheduleVisualUpdate, timeout: window.setTimeout,
          measures, metronomeMeasures, appMode, currentBank, isPlaying, playbackStarting,
          loopedMeasure, playingMeasureIndex, currentStepInMeasure, nextNoteTime
        };
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
          silentModeEnabled = false;
          measures = [createMeasure(4, 4, 120), createMeasure(3, 4, 90)];
          measures[0].repeatCount = '3';
          metronomeMeasures = measures;
          playingMeasureIndex = 0;
          currentStepInMeasure = 0;
          nextNoteTime = .1;
          playClick = (state, time, first, context) => {
            if (context.subIndex === 0) events.push({ index: playingMeasureIndex, time, state, first });
          };
          for (let tick = 0; tick < 450 && events.length < 15; tick++) {
            scheduler();
            clock += .12;
          }
          return events.slice(0, 15);
        } finally {
          Object.assign(window, { setTimeout: previous.timeout });
          audioCtx = previous.audioCtx;
          playClick = previous.playClick;
          scheduleVisualUpdate = previous.scheduleVisualUpdate;
          measures = previous.measures;
          metronomeMeasures = previous.metronomeMeasures;
          appMode = previous.appMode;
          currentBank = previous.currentBank;
          isPlaying = previous.isPlaying;
          playbackStarting = previous.playbackStarting;
          loopedMeasure = previous.loopedMeasure;
          playingMeasureIndex = previous.playingMeasureIndex;
          currentStepInMeasure = previous.currentStepInMeasure;
          nextNoteTime = previous.nextNoteTime;
        }
      });
      assert.equal(playback.length, 15, 'Expected twelve beats from the three repeats, then three beats');
      assert.deepEqual(playback.map(x => x.index), [...Array(12).fill(0), ...Array(3).fill(1)]);
      for (let i = 1; i <= 12; i++)
        assert(Math.abs((playback[i].time - playback[i - 1].time) - .5) < 1e-9, 'No gap across repeats or next block');
      for (let i = 13; i < 15; i++)
        assert(Math.abs((playback[i].time - playback[i - 1].time) - 2 / 3) < 1e-9, 'Second tempo remains unchanged');

      const overflow = await page.locator('#measureList').evaluate(el => el.scrollWidth - el.clientWidth);
      assert(overflow <= 1, 'Repeat count row must not overflow: ' + overflow);
      assert.deepEqual(errors, [], 'No browser errors');
      results.push({ viewport: viewport.width, defaultCount: 1, independent: true, arbitraryLarge: true, repeats: 3, beats: 15, overflow });
      await page.close();
    }
  } finally {
    await runtime.browser.close();
    runtime.server?.close();
  }
  save('sequence-measure-repeats-results.json', results);
  console.log(results);
})().catch(error => { console.error(error); process.exit(1); });
