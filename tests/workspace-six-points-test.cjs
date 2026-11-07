'use strict';
const assert = require('node:assert/strict');
const { start } = require('./audio-harness.cjs');

function wavOneShot() {
  const rate = 16000, frames = 4000, pcm = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    const envelope = Math.exp(-i / 1200);
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 720 * i) / rate) * 12000 * envelope), i * 2);
  }
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav;
}
(async () => {
  const h = await start();
  try {
    for (const width of [1440, 390]) {
      const page = await h.browser.newPage({ viewport: { width, height: 940 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(h.url);
      await page.waitForFunction(() => window.RENAX_SONGS && window.RENAX_CUSTOM_SAMPLES);
      const nav = id => page.locator('#workspaceNav [data-workspace="' + id + '"]');

      // Eraser must affect the selected sequence block, never the list of blocks.
      await nav('sequence').click();
      await page.evaluate(() => {
        measures = [createMeasure(4, 4, 120), createMeasure(4, 4, 120),
          createMeasure(4, 4, 120), createMeasure(4, 4, 120)];
        for (const m of measures) {
          m.beatSubdivisions = [1, 2, 1, 1];
          m.beatStates = [[1], [2, 1], [3], [1]];
        }
        metronomeMeasures = measures;
        activeMeasureIndex = 1;
        renderSequencerList();
        renderActiveMeasure();
      });
      await page.locator('#panicBtn').evaluate(button => button.click());
      const erased = await page.evaluate(() => ({
        count: measures.length,
        active: measures[1].beatStates,
        untouched: [measures[0], measures[2], measures[3]].map(m => m.beatStates),
      }));
      assert.equal(erased.count, 4, 'The eraser must retain all four sequence blocks');
      assert.deepEqual(erased.active, [[0], [0, 0], [0], [0]], 'Only rhythm is erased');
      for (const states of erased.untouched)
        assert.deepEqual(states, [[1], [2, 1], [3], [1]], 'Other blocks must remain unchanged');

      // Silent measures exist in Sequencer, not Training.
      assert.equal(await page.locator('.silent-section').evaluate(el => el.hidden), false);
      await nav('training').click();
      assert.equal(await page.locator('.silent-section').evaluate(el => el.hidden), true);
      await nav('sequence').click();
      assert.equal(await page.locator('.silent-section').evaluate(el => el.hidden), false);

      // Polyrythm: default two voices and optional independent four-voice editing.
      await nav('polyrhythm').click();
      assert.equal(await page.locator('#polyVoiceCount').inputValue(), '2');
      await page.locator('#polyVoiceCount').evaluate(select => {
        select.value = '4'; select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      assert.equal(await page.locator('.poly-dot[data-poly-voice="3"]').count(), 2);
      await page.locator('.poly-dot[data-poly-voice="2"]').first().evaluate(dot => dot.click());
      await page.locator('#polyBeatEditor select[aria-label="Subdivisions du temps"]').selectOption('3');
      await page.locator('#polyBeatEditor .poly-beat-pad').nth(1).click();
      assert(await page.evaluate(() => measures[activeMeasureIndex].polyVoices[2].states[0][1] > 0));
      assert(await page.evaluate(() => getPolyEvents(measures[activeMeasureIndex])
        .some(event => event.hits.some(hit => hit.voice === 2 && hit.sub === 1))));

      // Imported one-shots remain local and survive reload.
      await page.locator('input[aria-label="Choisir des samples audio locaux"]').setInputFiles({
        name: 'renax-qa-one-shot.wav', mimeType: 'audio/wav', buffer: wavOneShot(),
      });
      await page.waitForFunction(() => !!document.querySelector('#soundBank option[value^="localSample:"]'));
      const sampleId = await page.evaluate(() =>
        [...document.querySelector('#soundBank').options].find(option => option.value.startsWith('localSample:')).value,
      );
      await page.reload();
      await page.waitForFunction(() => window.RENAX_CUSTOM_SAMPLES && !!window.RENAX_SONGS);
      await page.evaluate(() => window.RENAX_CUSTOM_SAMPLES.ready);
      assert(await page.evaluate(id => !!SOUND_BANKS[id], sampleId), 'Imported sound survives reload');
      assert(await page.evaluate(async id => {
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('renax.local.samples.v1');
          req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
        const row = await new Promise((resolve, reject) => {
          const req = db.transaction('samples', 'readonly').objectStore('samples').get(id);
          req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
        db.close(); return !!row?.data;
      }, sampleId));

      const exported = await page.evaluate(async id => {
        const song = {id:'sample-export',name:'Local sample',sections:[{
          id:'sample-block',label:'Intro',count:1,measure:createMeasure(4,4,120),
        }]};
        const result = await RENAX_MP3_EXPORT.isolatedRender(song,id,0.8);
        let peak=0;for(const value of result.pcm)peak=Math.max(peak,Math.abs(value));
        return {peak,events:result.score.events};
      }, sampleId);
      assert(exported.peak>0.01,'Imported sample must remain audible in isolated export');
      assert.equal(exported.events,4);

      // A multipiste fader stores a value for the individual track.
      await nav('multi').click();
      if (!await page.locator('.multi-volume-row input').count())
        await page.locator('#multiPresetLibrary').getByRole('button', { name: 'Nouveau preset' }).click();
      await page.waitForFunction(() => !!document.querySelector('.multi-volume-row input'));
      const volume = page.locator('.multi-volume-row input').first();
      await volume.evaluate(el => {
        el.value = '37';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      assert.equal(await page.evaluate(() =>
        JSON.parse(localStorage.getItem('renax.multimetro.v1')).tracks[0].volume), 0.37);
      assert.deepEqual(errors, [], 'No uncaught browser errors at ' + width + 'px');
      await page.close();
      console.log('PASS six-point workspace regression at ' + width + 'px');
    }
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
