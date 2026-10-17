/* Explicit compatibility probe; browser engines must be installed with Playwright. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const engines = require('playwright');
const { start } = require('../tests/audio-harness.cjs');

(async () => {
  const h = await start();
  await h.browser.close();
  const results = [];
  try {
    for (const name of (process.env.COMPAT_ENGINES || 'chromium,firefox,webkit').split(',')) {
      const browser = await engines[name].launch({
        headless: true,
        ...(name === 'chromium'
          ? process.env.CHROME_PATH
            ? { executablePath: process.env.CHROME_PATH }
            : { channel: 'chrome' }
          : {}),
      });
      try {
        for (const width of [1440, 390]) {
          const p = await browser.newPage({
            viewport: { width, height: 900 },
            serviceWorkers: 'block',
          });
          const errors = [];
          p.on('pageerror', (error) => errors.push(error.message));
          await p.addInitScript(() => localStorage.setItem('renax.arrival.enabled.v1', 'false'));
          await p.goto(h.url);
          await p.waitForFunction(() => window.RENAX_SONGS && window.RENAX_I18N);
          for (const theme of ['dark', 'light', 'ivory']) {
            await p.locator('#index2SettingsBtn').click();
            await p.locator('[data-appearance=' + theme + ']').click();
            await p.locator('#index2SettingsClose').click();
            for (const tab of [
              'Métronome',
              'Polyrythmie',
              'Entraînement',
              'Séquenceur',
              'Multipiste',
              'Track',
            ]) {
              await p.getByRole('tab', { name: tab, exact: true }).click();
              assert(
                await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
                name + '/' + width + '/' + theme + '/' + tab,
              );
            }
          }
          await p.getByRole('tab', { name: 'Métronome', exact: true }).click();
          if (!(await p.evaluate(() => !!(window.AudioContext || window.webkitAudioContext)))) {
            await p.locator('#playBtn').click();
            await p.waitForFunction(() =>
              RENAX_FEEDBACK.diagnostics.some((entry) => entry.detail.includes('Web Audio')),
            );
            assert.equal(await p.evaluate(() => playbackStarting), false);
            assert.deepEqual(errors, []);
            results.push({
              browser: name,
              version: browser.version(),
              width,
              themes: 3,
              modules: 6,
              audioUnavailable: true,
              gracefulFailure: true,
              errors,
            });
            await p.close();
            console.log(
              'PASS layout/degraded mode ' +
                name +
                ' ' +
                width +
                '; audio unavailable in this engine',
            );
            continue;
          }
          await p.locator('#playBtn').click();
          try {
            await p.waitForFunction(() => isPlaying && audioCtx.state === 'running');
          } catch (error) {
            const diagnostic = await p.evaluate(() => ({
              playing: isPlaying,
              audioState: audioCtx?.state,
              errors: window.RENAX_FEEDBACK?.diagnostics,
              contextAvailable: !!(window.AudioContext || window.webkitAudioContext),
            }));
            results.push({ browser: name, width, failed: 'playback', diagnostic, errors });
            console.error(JSON.stringify(diagnostic));
            throw error;
          }
          await p.locator('#playBtn').click();
          await p.waitForFunction(() => !isPlaying);
          const exported = await p.evaluate(async () => {
            const song = {
              id: 'compat',
              name: 'Compatibility',
              sections: [
                {
                  id: 's',
                  label: 'Part',
                  count: 1,
                  measure: {
                    numerator: 4,
                    denominator: 4,
                    tempo: 120,
                    beatSubdivisions: [1, 1, 1, 1],
                    beatStates: [[1], [1], [1], [1]],
                  },
                },
              ],
            };
            const before = JSON.stringify(song);
            const audio = await RENAX_MP3_EXPORT.isolatedRender(song, 'claves', 0.8);
            const midi = RENAX_MIDI_EXPORT.exportSong(song);
            return {
              duration: audio.score.duration,
              ticks: midi.report.ticks,
              unchanged: JSON.stringify(song) === before,
            };
          });
          assert.equal(exported.duration, 2);
          assert.equal(exported.ticks, 3840);
          assert(exported.unchanged);
          assert.deepEqual(errors, []);
          results.push({
            browser: name,
            version: browser.version(),
            width,
            themes: 3,
            modules: 6,
            playback: true,
            exported,
            errors,
          });
          await p.close();
          console.log('PASS compatibility ' + name + ' ' + width);
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    const out = process.env.TEST_OUTPUT_DIR || path.join(__dirname, '../tests/results');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      path.join(out, 'browser-compat.json'),
      JSON.stringify(results, null, 2) + '\n',
    );
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
