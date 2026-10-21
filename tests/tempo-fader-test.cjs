const assert = require('node:assert/strict');
const { start, save } = require('./audio-harness.cjs');

(async () => {
  const h = await start(),
    results = [];
  try {
    for (const width of [1440, 1101, 390]) {
      const page = await h.browser.newPage({
        viewport: { width, height: 950 },
        hasTouch: width < 1100,
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(h.url);
      await page.waitForFunction(() => window.RENAX_SONGS);
      await page.evaluate(() => document.fonts.ready);
      if (width < 1100)
        await page.locator('#workspaceControls').evaluate((node) => {
          node.open = true;
        });
      const fader = page.locator('#tempoFader');
      async function setBpm(bpm) {
        await page.evaluate((bpm) => {
          bpmSlider.value = String(bpm);
          bpmSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }, bpm);
      }
      for (const theme of ['dark', 'light', 'ivory']) {
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        const boxes = [];
        for (const bpm of [2, 9, 10, 39, 40, 99, 100, 120, 239, 240, 241, 999]) {
          await setBpm(bpm);
          boxes.push(await fader.boundingBox());
        }
        for (const box of boxes) {
          assert(
            Math.abs(box.x - boxes[0].x) < 0.1,
            `Fader must not move at digit boundaries: ${width}/${theme}`,
          );
          assert(
            Math.abs(box.width - boxes[0].width) < 0.1,
            `Fader must not resize: ${width}/${theme}`,
          );
        }
      }
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
      });
      await setBpm(99);
      await fader.evaluate((node) => {
        window.tempoDrag = [];
        node.addEventListener(
          'input',
          () => {
            const raw = node.value;
            queueMicrotask(() =>
              window.tempoDrag.push({ raw, settled: node.value, bpm: Number(bpmSlider.value) }),
            );
          },
          { capture: true },
        );
      });
      const box = await fader.boundingBox();
      // app-base.css gives the native thumb a 13px width. Chromium exposes the
      // host width, not the thumb width, through getComputedStyle(pseudo).
      const inset = 6.5;
      const x =
        box.x + inset + ((box.width - inset * 2) * Number(await fader.inputValue())) / 10000;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      // A pointer can stop between integer BPM positions. Display updates must
      // not snap that native position back to the rounded BPM's origin.
      await fader.evaluate((node) => {
        node.value = '3771';
        node.dispatchEvent(new Event('input', { bubbles: true }));
      });
      assert.equal(
        await fader.inputValue(),
        '3771',
        'Keep sub-BPM pointer precision until release',
      );
      for (let delta = 1; delta <= 20; delta++) await page.mouse.move(x + delta, y);
      const upward = await page.evaluate(() => window.tempoDrag.splice(0));
      assert(upward.length > 2, 'Exercise actual native pointer dragging');
      for (let i = 0; i < upward.length; i++) {
        assert.equal(
          upward[i].settled,
          upward[i].raw,
          'Do not rewrite the native range value during a drag',
        );
        if (i)
          assert(upward[i].bpm >= upward[i - 1].bpm, 'A rightward drag must not reverse the tempo');
      }
      for (let delta = 19; delta >= 0; delta--) await page.mouse.move(x + delta, y);
      const downward = await page.evaluate(() => window.tempoDrag.splice(0));
      for (let i = 0; i < downward.length; i++) {
        assert.equal(downward[i].settled, downward[i].raw);
        if (i)
          assert(
            downward[i].bpm <= downward[i - 1].bpm,
            'A leftward drag must not reverse the tempo',
          );
      }
      await page.mouse.up();
      assert.equal(
        await page.evaluate(() => Number(bpmSlider.value)),
        99,
        'Returning the pointer restores its original BPM',
      );
      if (width < 1100) {
        await setBpm(99);
        const session = await page.context().newCDPSession(page);
        await page.evaluate(() => {
          window.tempoDrag = [];
        });
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        });
        for (let delta = 1; delta <= 20; delta++) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: x + delta, y }],
          });
        }
        const touches = await page.evaluate(() => window.tempoDrag);
        assert(touches.length > 2, 'Exercise native touch dragging');
        for (let i = 0; i < touches.length; i++) {
          assert.equal(touches[i].settled, touches[i].raw);
          if (i) assert(touches[i].bpm >= touches[i - 1].bpm);
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await session.detach();
      }
      await setBpm(120);
      await fader.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => Number(bpmSlider.value)), 121);
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.evaluate(() => Number(bpmSlider.value)), 120);
      await page.keyboard.press('PageUp');
      assert.equal(await page.evaluate(() => Number(bpmSlider.value)), 130);
      await page.keyboard.press('Home');
      assert.equal(await page.evaluate(() => Number(bpmSlider.value)), 2);
      await page.keyboard.press('End');
      assert.equal(await page.evaluate(() => Number(bpmSlider.value)), 999);
      await setBpm(120);
      await page.locator('#tempoIncrease').click();
      assert.equal(await fader.getAttribute('aria-valuetext'), '121 BPM');
      await page.locator('#tempoDecrease').click();
      assert.equal(await fader.getAttribute('aria-valuetext'), '120 BPM');
      await page.evaluate(() => {
        bpmSlider.disabled = true;
      });
      await page.waitForFunction(() => document.getElementById('tempoFader').disabled);
      await page.evaluate(() => {
        bpmSlider.disabled = false;
      });
      await page.waitForFunction(() => !document.getElementById('tempoFader').disabled);
      await page.locator('#playBtn').click();
      await page.waitForFunction(() => isPlaying);
      await fader.focus();
      await page.keyboard.press('ArrowRight');
      assert(
        await page.evaluate(
          () => isPlaying && tempo === 121 && measures[activeMeasureIndex].tempo === 121,
        ),
      );
      await page.locator('#playBtn').click();
      await page.waitForFunction(() => !isPlaying);
      assert.deepEqual(errors, []);
      results.push({ width, upward, downward, errors });
      console.log(
        `PASS stable tempo geometry, native drag, keyboard, locking and playback at ${width}px`,
      );
      await page.close();
    }
    save('tempo-fader.json', results);
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
