const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { start, save, openControls } = require('./audio-harness.cjs');
(async () => {
  const h = await start(),
    results = [];
  try {
    for (const theme of ['dark', 'light', 'ivory']) {
      for (const [width, height] of [
        [780, 360],
        [844, 390],
        [667, 320],
        [780, 300],
      ]) {
        const p = await h.browser.newPage({
          viewport: { width: 390, height: 844 },
          hasTouch: true,
        });
        const errors = [];
        p.on('pageerror', (error) => errors.push(error.message));
        await p.goto(h.url);
        await p.waitForFunction(() => document.documentElement.dataset.workspaceReady);
        await p.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await openControls(p);
        await p.locator('#playBtn').click();
        await p.setViewportSize({ width, height });
        await p.waitForTimeout(200);
        const state = await p.evaluate(() => {
          const box = (selector) =>
            document.querySelector(selector).getBoundingClientRect().toJSON();
          return {
            dial: box('#sequencerContainer'),
            wrapper: box('.panel-visu .sequencer-wrapper'),
            toolbar: box('.visu-toolbar'),
            controls: box('#workspaceControls'),
            footer: box('footer'),
            width: innerWidth,
            height: innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            playing: isPlaying,
            open: document.querySelector('#workspaceControls').open,
          };
        });
        results.push({ theme, width, height, state });
        save('phone-rotation.json', results);
        assert(state.playing && state.open);
        assert(state.dial.width >= Math.min(140, state.wrapper.height - 48), JSON.stringify(state));
        for (const child of [state.dial]) {
          assert(child.x >= state.wrapper.x && child.y >= state.wrapper.y);
          assert(
            child.right <= state.wrapper.right + 1 && child.bottom <= state.wrapper.bottom + 1,
          );
        }
        assert(state.controls.y >= state.toolbar.bottom);
        assert(state.footer.bottom <= state.height + 1);
        assert(state.scrollWidth <= state.width);
        await p.locator('#volumeSlider').scrollIntoViewIfNeeded();
        const volume = await p.locator('#volumeSlider').boundingBox();
        assert(
          volume.y >= state.controls.y && volume.y + volume.height <= state.controls.bottom + 1,
        );
        const dir = process.env.TEST_OUTPUT_DIR || path.join(__dirname, 'results');
        fs.mkdirSync(dir, { recursive: true });
        await p.screenshot({ path: path.join(dir, `rotation-${theme}-${width}x${height}.png`) });
        await p.setViewportSize({ width: 390, height: 844 });
        await p.waitForTimeout(100);
        assert(
          await p.evaluate(() => isPlaying && document.querySelector('#workspaceControls').open),
        );
        await p.locator('#playBtn').click();
        await p.waitForFunction(() => !isPlaying);
        assert.deepEqual(errors, []);
        await p.close();
      }
    }
    // Controls are reparented into training parameters on touch screens.
    // Their theme must travel with them, in both disclosure states.
    for (const theme of ['dark', 'light', 'ivory']) {
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        const p = await h.browser.newPage({ viewport, hasTouch: true, reducedMotion: 'reduce' });
        await p.goto(h.url);
        await p.waitForFunction(() => document.documentElement.dataset.workspaceReady);
        await p.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await openControls(p);
        const surface = () =>
          p.locator('#workspaceControls').evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              background: style.backgroundColor,
              border: style.borderTopColor,
              color: style.color,
            };
          });
        const expected = await surface();
        await p.getByRole('tab', { name: 'Entraînement', exact: true }).click();
        await p.locator('#workspaceMobileViews [data-pane=training]').click();
        assert.equal(
          await p
            .locator('#workspaceControls')
            .evaluate((e) => e.parentElement.classList.contains('panel-training')),
          true,
        );
        for (const open of [false, true]) {
          await p.locator('#workspaceControls').evaluate((e, value) => {
            e.open = value;
          }, open);
          const actual = await surface();
          assert.deepEqual(
            actual,
            expected,
            `Training controls theme lost: ${theme}, ${viewport.width}, open=${open}`,
          );
          const dir = process.env.TEST_OUTPUT_DIR || path.join(__dirname, 'results');
          fs.mkdirSync(dir, { recursive: true });
          await p
            .locator('#workspaceControls')
            .screenshot({
              path: path.join(dir, `training-controls-${theme}-${viewport.width}-${open}.png`),
            });
        }
        await p.close();
      }
    }
    console.log(
      'PASS 12 training disclosure/theme/orientation states retain their original themed surface',
    );
    console.log(
      '12 rotations pendant la lecture : cadran entier, réglages accessibles, retour portrait OK',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
