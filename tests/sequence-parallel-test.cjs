const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'sequence-parallel.js'), 'utf8'), sandbox);
const api = sandbox.window.RENAX_SEQUENCE_PARALLEL;
const base = { numerator: 4, denominator: 4, tempo: 120, repeatCount: '2' };
const model = (unit, count = '2') => ({ ...base, repeatCount: count, parallelTempo: { unit, mode: 'free' } });
for (const [note, num, den, bpm] of [
  ['dottedEighth', 4, 3, 160], ['quarterTriplet', 3, 2, 180],
  ['dottedQuarter', 2, 3, 80], ['inverseFourThree', 3, 4, 90], ['eighthTriplet', 3, 1, 360]
]) {
  const ratio = api.config(model(note));
  assert.equal(ratio.numerator, num);
  assert.equal(ratio.denominator, den);
  assert.equal(ratio.bpm, bpm);
  assert.equal(api.suggested(ratio), den);
  assert.equal(api.isComplete(ratio, BigInt(den)), true);
  if (den > 1) assert.equal(api.isComplete(ratio, 1n), false);
}
assert.equal(api.repetitions(model('dottedEighth','9007199254740993')).toString(), '9007199254740993');
for (const [num, den] of [[2,1],[1,2],[4,2]]) {
  assert.equal(api.config({ ...base, parallelTempo: {unit:'custom',numerator:String(num),denominator:String(den)} }), null);
}
for (const [num,den,bpm] of [[3,2,180],[2,3,80],[4,3,160]]) {
  assert.equal(api.config({ ...base, parallelTempo: {unit:'custom',numerator:String(num),denominator:String(den)} }).bpm,bpm);
}
assert.equal(api.config({ ...base, parallelTempo:{unit:'custom',numerator:'bad',denominator:'3'} }),null);
assert.equal(api.config({ ...base, denominator:8,parallelTempo:{unit:'quarter'} }),null);
assert.equal(api.config(base),null);
const transport = fs.readFileSync(path.join(root,'metronome-transport.js'),'utf8');
assert.match(transport,/nextNoteTime\s*=\s*parallel\s*\?\s*Math\.min\(parallelBlock\.endTime,/);
assert.match(transport,/advanceScheduledMeasure\(true\)/);
assert.match(transport,/nextNoteTime\s*\+\s*phaseShift\s*<\s*parallelBlock\.endTime/);
const core = fs.readFileSync(path.join(root,'metronome-core.js'),'utf8');
assert.match(core,/RENAX_SEQUENCE_PARALLEL\.button/);
assert.match(core,/M8 3v10M17 7v10M23 10h10/,'Déphasage icon must use unified rhythm glyph');
assert.match(fs.readFileSync(path.join(root,'sequence-parallel.js'),'utf8'),/M7 3v14M31 3v14/,'Parallel tempo icon must use matching rhythm glyph');
console.log('PASS Tempo parallèle ratios, modes de durée, coupures, exclusions et intégration.');


/* Browser contract: UI on desktop and smartphone; exact click grid and block transitions. */
const { start, showMeasures } = require('./audio-harness.cjs');
(async () => {
  const runtime = await start();
  try {
    for (const viewport of [{ width: 1280, height: 850 }, { width: 390, height: 740 }]) {
      const page = await runtime.browser.newPage({ viewport, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(runtime.url);
        await page.getByRole('tab', { name: 'Séquenceur', exact: true }).click();
        await showMeasures(page);
        await page.waitForFunction(() => typeof createMeasure === 'function' && !!window.RENAX_SEQUENCE_PARALLEL);
        await page.evaluate(() => {
          if (isPlaying) stopMetronome();
          setAppMode('metronome');
          measures = [createMeasure(4, 4, 120), createMeasure(4, 4, 120), createMeasure(4, 4, 90)];
          metronomeMeasures = measures;
          activeMeasureIndex = 0;
          renderSequencerList();
        });
        const buttons = page.locator('#measureList .sequence-parallel-button');
        assert.equal(await buttons.count(), 3, 'One Tempo parallèle button per block');
        // Independent geometry, not normalized in this test: verify both
        // controls are genuinely adjacent, visible and inside every card.
        const geometry = await page.evaluate(() =>
          [...document.querySelectorAll('#measureList .measure-card')].map(card => {
            const phase = card.querySelector('.sequence-phase-button');
            const parallel = card.querySelector('.sequence-parallel-button');
            const row = card.querySelector('.measure-tempo-row:not(.measure-repeat-row)');
            if (!phase || !parallel || !row) return { present: false };
            const a = phase.getBoundingClientRect(), b = parallel.getBoundingClientRect();
            const c = card.getBoundingClientRect();
            return {
              present: true,
              adjacent: phase.nextElementSibling === parallel,
              sameRow: phase.parentElement === row && parallel.parentElement === row,
              leftToRight: b.left >= a.right - 1,
              vertical: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)),
              width: b.width,
              withinCard: b.left >= c.left - 1 && b.right <= c.right + 1,
            };
          }),
        );
        for (const g of geometry) {
          assert(g.present && g.adjacent && g.sameRow && g.leftToRight && g.vertical <= 2 &&
            g.width >= (viewport.width <= 1100 ? 43 : 35) && g.withinCard,
          'Tempo parallèle must remain adjacent to Déphasage without overlap or overflow: ' + JSON.stringify(g));
        }
        assert.equal(await buttons.nth(1).getAttribute('aria-pressed'), 'false');
        await buttons.nth(1).click();
        const dialog = page.locator('.sequence-parallel-dialog');
        assert(await dialog.isVisible(), 'Configuration visible on desktop and smartphone');
        const rhythm = dialog.getByRole('combobox', { name: 'Valeur rythmique de la pulsation parallèle' });
        const mode = dialog.getByRole('combobox', { name: 'Mode de durée parallèle' });
        const count = dialog.getByRole('textbox', { name: 'Nombre de mesures de référence' });
        await rhythm.selectOption('quarterTriplet');
        assert.match(await dialog.locator('.sequence-parallel-result').innerText(), /180 BPM/);
        await rhythm.selectOption('dottedQuarter');
        assert.match(await dialog.locator('.sequence-parallel-result').innerText(), /80 BPM/);
        await rhythm.selectOption('inverseFourThree');
        assert.match(await dialog.locator('.sequence-parallel-result').innerText(), /90 BPM/);
        await rhythm.selectOption('dottedEighth');
        await mode.selectOption('cycle');
        assert.equal(await count.inputValue(), '3', 'Complete cycle is suggested, not enforced');
        await mode.selectOption('free');
        await count.fill('2');
        assert.match(await dialog.locator('.sequence-parallel-result').innerText(), /160 BPM/);
        assert.match(await dialog.locator('.sequence-parallel-result').innerText(), /Coupure/);
        await dialog.getByRole('button', { name: 'Appliquer' }).click();
        assert.equal(await buttons.nth(1).getAttribute('aria-pressed'), 'true');
        const cards = page.locator('#measureList .measure-card');
        assert.equal(await cards.nth(0).locator('.sequence-parallel-summary').count(), 0,
          'No extra BPM indicator for an ordinary block');
        assert.equal(await cards.nth(2).locator('.sequence-parallel-summary').count(), 0);
        assert.match(await cards.nth(1).locator('.sequence-parallel-summary').innerText(),
          /Tempo parallèle\s+Croche pointée · 160 BPM/i);
        assert.equal(await page.evaluate(() => measures[1].tempo), 120,
          'Parallel illusion must never overwrite reference BPM');
        await page.evaluate(() => {
          // Use the actual block's tempo field rather than modifying the audio engine.
          const blockInput = document.querySelectorAll('#measureList .measure-card')[1]
            .querySelector('.measure-tempo-row:not(.measure-repeat-row) select.measure-tempo-input');
          if (!blockInput) throw Error('Missing reference BPM field');
          // This field loads its 998 options lazily; include the chosen option.
          if (![...blockInput.options].some(option => option.value === '90')) {
            const option = document.createElement('option');
            option.value = '90';
            option.textContent = '90';
            blockInput.append(option);
          }
          blockInput.value = '90';
          blockInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
        assert.match(await cards.nth(1).locator('.sequence-parallel-summary').innerText(), /120 BPM/);
        assert.equal(await page.evaluate(() => measures[1].tempo), 90);
        await page.evaluate(() => {
          const field = document.querySelectorAll('#measureList .measure-card')[1]
            .querySelector('.measure-tempo-row:not(.measure-repeat-row) select.measure-tempo-input');
          field.value = '120';
          field.dispatchEvent(new Event('change', { bubbles: true }));
        });
        assert.match(await cards.nth(1).locator('.sequence-parallel-summary').innerText(), /160 BPM/);
        for (const theme of ['dark', 'light', 'ivory', 'avant']) {
          await page.locator('#index2SettingsBtn').click();
          await page.locator('[data-appearance=' + theme + ']').click();
          await page.locator('#index2SettingsClose').click();
          const appearance = await cards.nth(1).evaluate(card => {
            const phase = card.querySelector('.sequence-phase-button');
            const parallel = card.querySelector('.sequence-parallel-button');
            const snap = btn => {
              const s = getComputedStyle(btn), r = btn.getBoundingClientRect();
              return [s.width, s.height, s.borderRadius, s.backgroundColor, s.color, r.top + r.height / 2];
            };
            const original = [phase, parallel].map(btn => ({
              active: btn.classList.contains('active'),
              pressed: btn.getAttribute('aria-pressed')
            }));
            const setState = (btn, enabled) => {
              btn.classList.toggle('active', enabled);
              btn.setAttribute('aria-pressed', String(enabled));
            };
            setState(phase, false);
            setState(parallel, false);
            const off = [snap(phase), snap(parallel)];
            setState(phase, true);
            setState(parallel, true);
            const on = [snap(phase), snap(parallel)];
            [phase, parallel].forEach((btn, index) => {
              btn.classList.toggle('active', original[index].active);
              btn.setAttribute('aria-pressed', original[index].pressed);
            });
            return { off, on, overflow: card.scrollWidth - card.clientWidth };
          });
          for (const state of [appearance.off, appearance.on]) {
            assert.deepEqual(state[0].slice(0, 5), state[1].slice(0, 5),
              theme + ': block actions must share dimensions, radius and state palette');
            assert(Math.abs(state[0][5] - state[1][5]) <= 2,
              theme + ': adjacent icons must stay vertically aligned');
          }
          assert(appearance.overflow <= 1, theme + ': card must not overflow');
          assert(await cards.nth(1).locator('.sequence-parallel-summary').isVisible());
        }
        const stored = await page.evaluate(() => [measures[1].parallelTempo.unit, measures[1].parallelTempo.mode, measures[1].repeatCount]);
        assert.deepEqual(stored, ['dottedEighth', 'free', '2']);
        const actual = await page.evaluate(() => {
          const previous = {
            audioCtx, playClick, scheduleVisualUpdate, timeout:window.setTimeout,
            measures, metronomeMeasures, appMode, currentBank, isPlaying, playbackStarting,
            loopedMeasure, playingMeasureIndex, currentStepInMeasure, nextNoteTime,
            sequenceRepeatIndex, parallelBlock, pendingSequencePhaseEvents,
            silentModeEnabled, engaged:training.engaged, active:training.active, timerID
          };
          try {
            let clock = 0;
            const events = [];
            window.setTimeout = () => 0;
            scheduleVisualUpdate = () => {};
            audioCtx = { get currentTime() { return clock; } };
            currentBank = 'clic'; appMode = 'metronome'; isPlaying = false;
            playbackStarting = false; loopedMeasure = null; training.engaged = false;
            training.active = false; silentModeEnabled = false;
            measures = [createMeasure(4,4,120), createMeasure(4,4,120), createMeasure(4,4,90)];
            metronomeMeasures = measures;
            for(const m of measures) {
              m.beatSubdivisions = [1,1,1,1];
              m.beatStates = [[1],[1],[1],[1]];
            }
            measures[1].parallelTempo = {unit:'dottedEighth',mode:'free'};
            measures[1].repeatCount = '2';
            playingMeasureIndex = 0;currentStepInMeasure = 0;
            sequenceRepeatIndex = 0n;parallelBlock=null;pendingSequencePhaseEvents=[];
            nextNoteTime=.1;
            playClick = (_, time, __, details) => {
              if (details.subIndex === 0) events.push({ block:playingMeasureIndex,time });
            };
            for(let tick=0;tick<300 && events.length<19;tick++){
              scheduler();clock+=.1;
            }
            return events.slice(0,19);
          } finally {
            window.setTimeout = previous.timeout;
            audioCtx = previous.audioCtx; playClick = previous.playClick;
            scheduleVisualUpdate = previous.scheduleVisualUpdate;
            measures = previous.measures; metronomeMeasures = previous.metronomeMeasures;
            appMode = previous.appMode; currentBank = previous.currentBank;
            isPlaying = previous.isPlaying; playbackStarting = previous.playbackStarting;
            loopedMeasure = previous.loopedMeasure;playingMeasureIndex = previous.playingMeasureIndex;
            currentStepInMeasure = previous.currentStepInMeasure;nextNoteTime = previous.nextNoteTime;
            sequenceRepeatIndex = previous.sequenceRepeatIndex;parallelBlock = previous.parallelBlock;
            pendingSequencePhaseEvents = previous.pendingSequencePhaseEvents;
            silentModeEnabled = previous.silentModeEnabled;training.engaged = previous.engaged;
            training.active = previous.active;timerID = previous.timerID;
          }
        });
        assert.equal(actual.length, 19, '4 reference beats + 11 parallel beats + 4 next-block beats');
        assert.deepEqual(actual.map(e => e.block), [...Array(4).fill(0),...Array(11).fill(1),...Array(4).fill(2)]);
        for(let i=0;i<4;i++)assert(Math.abs(actual[i].time-(.1+i*.5))<1e-8);
        for(let i=0;i<11;i++)assert(Math.abs(actual[4+i].time-(2.1+i*.375))<1e-8);
        for(let i=0;i<4;i++)assert(Math.abs(actual[15+i].time-(6.1+i*(2/3)))<1e-8,
          'The next ordinary block starts exactly at the reference boundary, without waiting for another parallel beat');
        await buttons.nth(1).click();
        await page.locator('.sequence-parallel-dialog').getByRole('button', { name: 'Désactiver' }).click();
        assert.equal(await cards.nth(1).locator('.sequence-parallel-summary').count(), 0,
          'Disabling Tempo parallèle removes only its indicator');
        assert.equal(await page.evaluate(() => measures[1].tempo), 120);
        const overflow = await page.locator('#measureList').evaluate(el => el.scrollWidth - el.clientWidth);
        assert(overflow <= 1, 'No horizontal overflow at ' + viewport.width + 'px: ' + overflow);
        assert.deepEqual(errors, [], 'No unhandled browser exceptions at ' + viewport.width + 'px');
      } finally {
        await page.close();
      }
    }
  } finally {
    await runtime.browser.close();runtime.server?.close();
  }
  console.log('PASS navigateur PC + smartphone : UI, durée, BPM, coupure, passage bloc suivant et largeur.');
})().catch(error => { console.error(error); process.exitCode = 1; });
