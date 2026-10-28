/* Meixs shared editor/dialog contrast and reversible Track count-in. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, newTrack, showMeasures } = require('./audio-harness.cjs');
const output = process.env.TEST_OUTPUT_DIR || path.join(__dirname, 'results');
const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
function contrast(a, b) {
  const luminance = value => rgb(value).map(x => {
    x /= 255;
    return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
  }).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const h = await start();
  try {
    for (const width of [1440, 390]) {
      const p = await h.browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await p.addInitScript(() => localStorage.setItem('renax-appearance', 'avant'));
      await p.goto(h.url);
      await p.waitForFunction(() => window.RENAX_MULTI && window.RENAX_SONGS);
      const style = selector => p.locator(selector).first().evaluate(e => {
        const s = getComputedStyle(e);
        return { background: s.backgroundColor, color: s.color, border: s.borderTopColor };
      });
      const header = await style('body>header');
      const lime = (await style('#workspaceNav button[aria-selected=true]')).background;
      const action = async selector => {
        const s = await style(selector);
        assert.equal(s.background, header.background, selector);
        assert.equal(s.color, lime, selector);
      };
      const capture = name => p.screenshot({ path: path.join(output, `targeted-${width}-${name}.png`) });
      const popup = async name => {
        const visual = p.locator('#workspaceMobileViews [data-pane=visu]');
        if (await visual.isVisible()) await visual.click();
        await p.locator('#sequencerContainer .step').first().click();
        await action('#beatEditor');
        for (const selector of ['#beatEditorTitle', '.beat-editor-division-label', '#beatEditor [aria-label=Fermer]'])
          assert.equal((await style(selector)).color, lime, selector);
        await p.locator('#beatEditor .numbox-button').click();
        await action('#beatEditor .numbox-menu');
        for (let n = 1; n <= 8; n++)
          assert.equal(await p.locator(`#beatEditor .numbox-option[data-value="${n}"]`).count(), 1);
        const selected = await style('#beatEditor .numbox-option[aria-selected=true]');
        assert(contrast(selected.color, selected.background) >= 4.5);
        await capture(name + '-selector');
        await p.locator('#beatEditor .numbox-option[data-value="4"]').click();
        await p.locator('#beatEditorDivision').waitFor();
        const pad = p.locator('#beatEditorPads button').first();
        for (let i = 0; i < 4; i++) {
          const s = await style('#beatEditorPads button');
          assert(contrast(s.color, s.background) >= 4.5, JSON.stringify(s));
          await pad.click();
        }
        await p.locator('#beatEditorDuplicateFirst').click();
        assert(await p.evaluate(() => measures[activeMeasureIndex].beatSubdivisions.every(n => n === 4)));
        await capture(name + '-editor');
        await p.locator('#beatEditor [aria-label=Fermer]').click();
      };
      await popup('metronome');
      for (const name of ['Séquenceur', 'Entraînement']) {
        await p.getByRole('tab', { name, exact: true }).click();
        await popup(name === 'Séquenceur' ? 'sequence' : 'training');
      }
      await p.getByRole('tab', { name: 'Polyrythmie', exact: true }).click();
      await showMeasures(p);
      await p.locator('.sequence-more summary').first().click();
      await p.locator('.sequence-more-actions').getByRole('button', { name: 'Renommer', exact: true }).first().click();
      const dialog = p.locator('.multi-modal');
      const checkDialog = async name => {
        await action('.multi-modal');
        for (const selector of ['.multi-modal h3', '.multi-modal-actions button:first-child', '.multi-modal-actions button:last-child'])
          assert.equal((await style(selector)).color, lime, selector);
        assert.equal((await style('.multi-modal-actions button:last-child')).border, lime);
        const input = dialog.locator('input');
        await input.fill(name);
        const s = await style('.multi-modal input');
        assert(contrast(s.color, s.background) >= 4.5);
        const selection = await input.evaluate(e => {
          e.select();
          const s = getComputedStyle(e, '::selection');
          return { color: s.color, background: s.backgroundColor };
        });
        assert(contrast(selection.color, selection.background) >= 4.5);
        await capture(name);
        await dialog.getByRole('button', { name: 'Valider', exact: true }).click();
      };
      await checkDialog('Poly-label');
      assert(await p.evaluate(() => measures.some(m => m.name === 'Poly-label')));
      await p.getByRole('tab', { name: 'Multipiste', exact: true }).click();
      await showMeasures(p);
      await action('#multiPresetLibrary>.btn');
      await p.locator('#multiPresetLibrary .multi-more summary').first().click();
      await p.locator('#multiPresetLibrary .multi-actions').getByRole('button', { name: 'Renommer', exact: true }).first().click();
      await checkDialog('Multi-label');
      await p.getByRole('button', { name: 'Ouvrir Multi-label', exact: true }).click();
      await popup('multi');
      await newTrack(p);
      await action('.track-add-section');
      await action('.song-count-in-button:not(#songAmorceBtn)');
      const original = await p.evaluate(() => JSON.stringify(RENAX_SONGS.library.profiles.flatMap(p => p.songs).at(-1).sections));
      const count = p.locator('.song-count-in-button:not(#songAmorceBtn)');
      await count.click();
      assert.equal(await count.getAttribute('aria-pressed'), 'true');
      assert.equal(await p.locator('.song-count-in').count(), 1);
      assert.equal((await style('.song-count-in-button:not(#songAmorceBtn)')).background, lime);
      await p.locator('#songAmorceBtn').click();
      assert.equal(await p.locator('#songAmorceBtn').getAttribute('aria-pressed'), 'true');
      assert.equal((await style('#songAmorceBtn')).background, lime);
      await capture('track-active');
      await count.click();
      assert.equal(await count.getAttribute('aria-pressed'), 'false');
      assert.equal(await p.locator('.song-count-in').count(), 0);
      assert.equal(await p.locator('#songAmorceBtn').getAttribute('aria-pressed'), 'true', 'Count-in removal must preserve vocal guide');
      await count.click();
      await p.locator('#songAmorceBtn').click();
      assert.equal(await p.locator('.song-count-in').count(), 1, 'Vocal guide must not remove count-in');
      await count.click();
      assert.equal(await p.evaluate(() => JSON.stringify(RENAX_SONGS.library.profiles.flatMap(p => p.songs).at(-1).sections)), original);
      await p.reload();
      await p.waitForFunction(() => window.RENAX_SONGS);
      assert(await p.evaluate(() => !RENAX_SONGS.library.profiles.flatMap(p => p.songs).at(-1).countIn));
      assert.deepEqual(errors, []);
      await p.close();
      console.log(`PASS ${width}: shared editor, subdivision/duplication, dialogs, creation controls, count-in removal/persistence and independent vocal toggle`);
    }
  } finally { await h.browser.close(); h.server?.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
