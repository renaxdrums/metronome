'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, newTrack, save } = require('./audio-harness.cjs');

(async () => {
  const h = await start(), results = [], errors = [];
  const out = process.env.TEST_OUTPUT_DIR || path.join(__dirname, 'results/citron-dialog-layout');
  fs.mkdirSync(out, { recursive: true });
  try {
    for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [844, 390]]) {
      for (const theme of ['dark', 'light', 'ivory', 'avant']) {
        const p = await h.browser.newPage({ viewport: { width, height }, hasTouch: width <= 1100, reducedMotion: 'reduce' });
        p.on('pageerror', error => errors.push(error.message));
        await p.addInitScript(() => {
          Element.prototype.requestFullscreen = undefined;
          window.showSaveFilePicker = undefined;
        });
        await p.goto(h.url);
        await p.waitForFunction(() => window.RENAX_BACKUP && window.RENAX_NUMBOX);
        await p.evaluate(value => document.documentElement.dataset.theme = value, theme);
        await p.evaluate(() => document.fonts.ready);
        const shot = async name => p.screenshot({ path: path.join(out, `${theme}-${width}-${name}.png`) });
        const menuFor = id => p.locator('#' + id).locator('..').locator('.numbox-menu');
        const open = async id => {
          await p.locator('#' + id).locator('..').locator('.numbox-button').click();
          const menu = menuFor(id);
          await menu.waitFor({ state: 'visible' });
          await p.waitForFunction(id => document.getElementById(id).parentElement.querySelector('.numbox-menu').classList.contains('compact-floating'), id);
          const report = await menu.evaluate(el => {
            const r = el.getBoundingClientRect();
            const options = [...el.querySelectorAll('.numbox-option')].filter(option => {
              const b = option.getBoundingClientRect();
              return b.top >= r.top + 3 && b.bottom <= r.bottom - 3;
            });
            return {
              bounds: r.toJSON(), topLayer: el.matches(':popover-open'),
              rows: options.map(option => {
                const b = option.getBoundingClientRect();
                return { height: b.height, clickable: option.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)) };
              }),
              scrollbar: getComputedStyle(el).scrollbarColor,
              borders: ['Top', 'Right', 'Bottom', 'Left'].map(side => ({ color: getComputedStyle(el)['border' + side + 'Color'], width: getComputedStyle(el)['border' + side + 'Width'] })),
            };
          });
          assert(report.topLayer, 'Menu remains in the browser top layer');
          assert(report.bounds.x >= 0 && report.bounds.right <= width + 1 && report.bounds.y >= 0 && report.bounds.bottom <= height + 1, JSON.stringify(report));
          assert(report.rows.length && report.rows.every(row => row.clickable), JSON.stringify(report));
          if (theme === 'avant') {
            assert(report.bounds.height <= 193, 'Bounded editor list');
            assert(report.rows.every(row => row.height >= 44), 'Touch-sized options');
            assert(report.scrollbar.includes('215, 242, 24'), 'Citron scrollbar');
            if (id === 'beatEditorDivision')
              assert(report.borders.every(border => border.color === 'rgb(215, 242, 24)' && border.width === '1px'), 'Fine Citron border on all four sides of the number list');
          }
          return menu;
        };
        await p.evaluate(() => openBeatEditor(measures[activeMeasureIndex], 0));
        await p.locator('#beatEditor').waitFor({ state: 'visible' });
        await shot('subdivisions');
        await open('beatEditorDivision');
        if (theme === 'avant') {
          const menu = await menuFor('beatEditorDivision').boundingBox();
          const trigger = await p.locator('#beatEditorDivision').locator('..').locator('.numbox-button').boundingBox();
          if (height >= 740) assert(menu.y >= trigger.y + trigger.height, 'Use available space below the field');
        }
        await shot('subdivisions-menu');
        await menuFor('beatEditorDivision').getByRole('option', { name: '8', exact: true }).click();
        assert.equal(await p.locator('#beatEditorPads button').count(), 8);
        await p.locator('#beatEditorPads button').nth(2).click();
        const edited = await p.evaluate(() => measures[activeMeasureIndex].beatStates[0][2]);
        await p.locator('#beatEditorDuplicateFirst').click();
        assert(await p.evaluate(expected => measures[activeMeasureIndex].beatStates.every(states => states.length === 8 && states[2] === expected), edited));
        await open('beatEditorDivision');
        await p.keyboard.press('Escape');
        assert.equal(await menuFor('beatEditorDivision').isVisible(), false);
        await p.evaluate(() => closeBeatEditor());
        await newTrack(p);
        const library = await p.evaluate(() => JSON.stringify(RENAX_SONGS.library));
        await p.locator('#mp3ExportOpen').click();
        await p.locator('#mp3ExportDialog').waitFor({ state: 'visible' });
        await shot('export');
        const formatMenu = await open('songExportFormat');
        await shot('export-menu');
        await formatMenu.getByRole('option', { name: 'MIDI — notes et tempo', exact: true }).click();
        await p.locator('#mp3ExportSave').click();
        await p.locator('#mp3ExportDownload:not([hidden])').waitFor();
        const bytes = await p.locator('#mp3ExportDownload').evaluate(async el => [...new Uint8Array(await (await fetch(el.href)).arrayBuffer())].slice(0, 4));
        assert.equal(Buffer.from(bytes).toString(), 'MThd', 'Actual finite MIDI file');
        assert.equal(await p.evaluate(() => JSON.stringify(RENAX_SONGS.library)), library, 'Export does not edit the saved song');
        await p.locator('#mp3ExportDialog').getByRole('button', { name: 'Fermer', exact: true }).click();
        await p.locator('#mp3ExportDialog').waitFor({ state: 'detached' });
        assert.equal(await p.locator('#mp3ExportDialog').count(), 0);
        results.push({ width, height, theme, editor: true, duplicate: true, foreground: true, finiteMIDI: true, libraryUnchanged: true });
        await p.close();
      }
    }
    assert.deepEqual(errors, []);
    save('citron-dialog-layout-results.json', { results, errors });
    console.log('PASS export and subdivision dialogs: four themes, desktop, phone and landscape', results.length);
  } finally { await h.browser.close(); h.server?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
