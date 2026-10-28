/* Approved Meixs colours: exercise real desktop/phone menus and selected states. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const cp = require('node:child_process');
const approvedCSS = process.env.MEIXS_BASE_REF
  ? cp.execFileSync('git', ['show', process.env.MEIXS_BASE_REF + ':avant-garde-theme.css'], {
      encoding: 'utf8',
    })
  : null;
const { start, showMeasures, openControls, newTrack } = require('./audio-harness.cjs');
(async () => {
  const h = await start();
  const output = process.env.TEST_OUTPUT_DIR || path.join(__dirname, 'results');
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [1440, 390, 320]) {
      const p = await h.browser.newPage({
        viewport: { width, height: width > 1100 ? 1000 : 844 },
        reducedMotion: 'reduce',
        hasTouch: width < 1100,
      });
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.addInitScript(() => {
        Element.prototype.requestFullscreen = undefined;
      });
      await p.goto(h.url);
      await p.waitForFunction(() => window.RENAX_BACKUP);
      await p.evaluate(() => (document.documentElement.dataset.theme = 'avant'));
      await p.addStyleTag({
        content:
          '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}',
      });
      const palette = await p.locator('body>header').evaluate((e) => ({
        header: getComputedStyle(e).backgroundColor,
        lime: getComputedStyle(document.querySelector('#workspaceNav button[aria-selected=true]'))
          .backgroundColor,
        ink: getComputedStyle(document.querySelector('#workspaceNav button[aria-selected=true]'))
          .color,
        controlInk: getComputedStyle(document.body).color,
      }));
      const colour = async (selector, property, expected, pseudo) => {
        const values = await p
          .locator(selector)
          .evaluateAll(
            (es, [property, pseudo]) => es.map((e) => getComputedStyle(e, pseudo)[property]),
            [property, pseudo],
          );
        assert(values.length, selector + ' must exist');
        for (const value of values) assert.equal(value, expected, selector + ' ' + property);
      };
      const action = async (selector) => {
        await colour(selector, 'backgroundColor', palette.header);
        await colour(selector, 'color', palette.lime);
      };
      const capture = async (name) => {
        if (approvedCSS) {
          const settle = () =>
            p.evaluate(async () => {
              await document.fonts.ready;
              await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            });
          await settle();
          const geometry = () =>
            [...document.querySelectorAll('body *')]
              .filter((e) => e.getClientRects().length && !e.matches('style'))
              .map((e) => {
                const r = e.getBoundingClientRect(),
                  s = getComputedStyle(e);
                return [
                  e.tagName,
                  e.id.startsWith('vf-auto') ? '' : e.id,
                  ...['x', 'y', 'width', 'height'].map((k) => Math.round(r[k] * 100) / 100),
                  s.font,
                  s.padding,
                  s.margin,
                  s.borderWidth,
                  s.borderRadius,
                ];
              });
          const locked = () =>
            [
              ...document.querySelectorAll(
                '.multi-actions,.multi-actions button,#index2SettingsPanel,#index2SettingsPanel .index2-settings-section,.song-section:not(.song-playlist-card) .song-more-menu,.track-add-section:not(#mp3ExportOpen)',
              ),
            ].map((e) => {
              const s = getComputedStyle(e);
              return [s.backgroundColor, s.color, s.borderColor, s.boxShadow];
            });
          const current = await p.evaluate(geometry),
            lockedCurrent = await p.evaluate(locked);
          await p
            .locator('link[href^="avant-garde-theme.css"]')
            .evaluate((e) => (e.disabled = true));
          const reference = await p.addStyleTag({ content: approvedCSS });
          await settle();
          assert.deepEqual(
            await p.evaluate(geometry),
            current,
            `${width} ${name}: geometry changed`,
          );
          assert.deepEqual(
            await p.evaluate(locked),
            lockedCurrent,
            `${width} ${name}: approved controls changed`,
          );
          await reference.evaluate((e) => e.remove());
          await p
            .locator('link[href^="avant-garde-theme.css"]')
            .evaluate((e) => (e.disabled = false));
          await settle();
        }
        console.log(width, name);
        await p.screenshot({ path: path.join(output, `sound-menu-meixs-${width}-${name}.png`) });
      };
      const tab = async (name) => {
        await p.getByRole('tab', { name, exact: true }).click();
      };
      await colour('#sequencerContainer .beat-divider', 'backgroundColor', palette.header);
      await colour('#scoreMetronomeBtn', 'backgroundColor', palette.lime);
      await colour('#scoreMetronomeBtn svg', 'stroke', palette.ink);
      await action('#panicBtn,#undoBtn');
      assert.equal(await p.locator('#undoBtn').isEnabled(), false);
      assert(await p.locator('#undoBtn').evaluate((e) => Number(getComputedStyle(e).opacity) < 1));
      await colour('.numbox-button', 'borderRightColor', palette.lime, '::after');
      await capture('metronome');
      await openControls(p);
      await p.locator('#soundBank + .numbox-button').click();
      await p.locator('.sound-bank-cards.open .numbox-menu').waitFor({ state: 'visible' });
      await action('.sound-bank-cards .numbox-menu,.sound-bank-cards .numbox-option');
      await colour('.sound-bank-cards .numbox-option svg', 'stroke', palette.lime);
      await capture('sound-bank');
      await p.keyboard.press('Escape');
      await p.locator('#scorePartitionBtn').click();
      await colour('#scorePartitionBtn', 'backgroundColor', palette.lime);
      await p.locator('#scoreEditBtn').click();
      await colour('#scoreEditBtn', 'backgroundColor', palette.lime);
      await p.locator('#scoreFreeMeasureBtn').click();
      await colour('#scoreFreeMeasureBtn[aria-pressed=true] svg', 'stroke', palette.lime);
      await capture('score-editor');
      await tab('Polyrythmie');
      await showMeasures(p);
      await action('#sequenceAddMeasure');
      const visual = p.locator('#workspaceMobileViews [data-pane=visu]');
      if (await visual.isVisible()) await visual.click();
      await p.locator('#scorePartitionBtn').click();
      await colour('#scorePartitionBtn', 'backgroundColor', palette.lime);
      await capture('polyrhythm');
      await tab('Entraînement');
      const settings = p.locator('#workspaceMobileViews [data-pane=training]');
      if (await settings.isVisible()) await settings.click();
      await colour('#trainingMode-progressive', 'backgroundColor', palette.lime);
      await colour('#trainingMode-progressive svg', 'stroke', palette.controlInk);
      await action('#trainingMode-steps');
      await p.locator('.training-curve-select>summary').click();
      assert.equal(
        await p
          .locator('.training-curve-options button[aria-pressed=true]')
          .getAttribute('data-curve'),
        'linear-up',
      );
      await colour(
        '.training-curve-options button[aria-pressed=true]',
        'backgroundColor',
        palette.lime,
      );
      await colour(
        '.training-curve-options button[aria-pressed=true] svg',
        'stroke',
        palette.controlInk,
      );
      await action('.training-curve-options button[aria-pressed=false]');
      await capture('training-curves');
      await p.locator('.training-curve-options button[aria-pressed=true]').click();
      await p.locator('#trainingMode-steps').click();
      await colour('#trainingMode-steps', 'backgroundColor', palette.lime);
      await action('#trainingMode-progressive');
      await p.locator('.silent-collapse').click();
      await p.locator('#silentToggle').click();
      await colour('#silentToggle', 'backgroundColor', palette.lime);
      await colour('#silentToggle', 'color', palette.controlInk);
      await capture('training-steps');
      await tab('Séquenceur');
      await showMeasures(p);
      await action('#sequenceAddMeasure');
      await p.locator('.sequence-more summary').first().click();
      await action('.sequence-more-actions,.sequence-more-actions button');
      await capture('sequence-menu');
      await tab('Multipiste');
      await showMeasures(p);
      await p.getByRole('button', { name: 'Ouvrir Preset 1', exact: true }).click();
      await action('#multiControls>.multi-add');
      await colour('.multi-mute svg', 'stroke', palette.lime);
      const bank = p.locator('.multi-bank-row .numbox-button').first();
      await bank.click();
      await action('.multi-sound-bank .numbox-menu,.multi-sound-bank .numbox-option');
      await capture('multitrack-bank');
      await p.keyboard.press('Escape');
      await newTrack(p);
      await action('.song-count-in-button,#mp3ExportOpen');
      await p.getByRole('button', { name: 'Ajouter un décompte', exact: true }).click();
      await p.getByRole('button', { name: 'Actions du décompte', exact: true }).click();
      await action('.song-count-in .song-more-menu');
      await colour('.song-count-in .song-more-menu button', 'color', palette.lime);
      await capture('count-in-menu');
      await p.locator('#songPane .song-back').click();
      await p.locator('.song-playlist-card .song-more[aria-haspopup=menu]').first().click();
      await action('.song-playlist-card .song-more-menu');
      await colour('.song-playlist-card .song-more-menu button', 'color', palette.lime);
      await capture('track-menu');
      await p.evaluate(() => RENAX_SONGS.restoreNavigation({ pane: 'songs', view: 'home' }));
      await action('#songsHome>.song-entry');
      await p.getByRole('button', { name: 'Sauvegarde', exact: true }).click();
      await p.getByRole('button', { name: 'Sauvegarde locale', exact: true }).click();
      await action('#profilePane .backup-json');
      await colour('#profilePane .backup-json .song-note', 'color', palette.lime);
      await capture('backup');
      assert.equal(
        await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      assert.deepEqual(errors, []);
      console.log(
        `${width}: Meixs menus, arrows, active/inactive controls, curves, backup and no horizontal overflow PASS`,
      );
      await p.close();
    }
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
