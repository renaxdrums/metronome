const assert = require('node:assert/strict');
const { start, save } = require('./audio-harness.cjs');

(async () => {
  const h = await start({ intro: true }), runs = [];
  try {
    for (const [width, height] of [[1440, 1000], [390, 844], [667, 320]]) {
      const page = await h.browser.newPage({ viewport: { width, height }, hasTouch: width < 1100 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.qaIntroText = {};
        const draw = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
          if (this.canvas.classList.contains('kern-intro-scene')) window.qaIntroText[text] = this.fillStyle;
          return draw.call(this, text, ...args);
        };
      });
      await page.goto(h.url);
      await page.waitForFunction(() => document.getElementById('renaxArrival').dataset.introReady === 'true');
      assert.equal(await page.locator('#renaxArrival').getAttribute('data-intro-variant'), 'kern');
      assert.equal(await page.locator('.console-arrival-replica').count(), 0);
      assert.equal(await page.locator('.kern-intro-presentation canvas').count(), 2);
      const original = await page.locator('#playBtn').evaluate(node => {
        const style = getComputedStyle(node);
        return { color: style.color, fill: style.webkitTextFillColor, fontWeight: style.fontWeight };
      });
      await page.keyboard.press('Space');
      await page.waitForFunction(() => isPlaying);
      await page.evaluate(() => { window.qaIntroAudio = audioCtx; });
      await page.setViewportSize({ width: height, height: width });
      await page.waitForFunction(() => document.getElementById('renaxArrival').dataset.introPhase === 'black', null, { polling: 20, timeout: 15000 });
      const black = await page.locator('#renaxArrival').evaluate(node => ({
        overlay: Number(getComputedStyle(node).opacity),
        scene: Number(getComputedStyle(node.querySelector('.kern-intro-presentation')).opacity),
        background: getComputedStyle(node).backgroundColor,
      }));
      assert.equal(black.overlay, 1);
      assert.equal(black.scene, 0);
      assert.equal(black.background, 'rgb(0, 0, 0)');
      const typography = await page.evaluate(() => window.qaIntroText);
      assert.equal(typography['R E N A X  D R U M S'], '#ffffff');
      assert.equal(typography['MÉTRO'], '#ffffff');
      assert.equal(typography.NOME, '#ff7900');
      await page.waitForFunction(() => {
        const node = document.getElementById('renaxArrival');
        const opacity = Number(getComputedStyle(node).opacity);
        return node.dataset.introPhase === 'fade-in' && opacity > .1 && opacity < .9;
      }, null, { polling: 20 });
      assert.equal(await page.locator('.kern-intro-presentation').evaluate(node => Number(getComputedStyle(node).opacity)), 0);
      await page.waitForFunction(() => document.getElementById('renaxArrival').hidden);
      assert.equal(await page.locator('.kern-intro-presentation').count(), 0);
      assert.equal(await page.locator('#playBtn').count(), 1);
      assert(await page.evaluate(() => isPlaying && audioCtx === window.qaIntroAudio));
      const revealed = await page.locator('#playBtn').evaluate(node => {
        const style = getComputedStyle(node);
        return { color: style.color, fill: style.webkitTextFillColor, fontWeight: style.fontWeight };
      });
      assert.deepEqual(revealed, original, 'The real interface keeps its text rendering');
      await page.locator('#playBtn').click();
      await page.waitForFunction(() => !isPlaying);
      assert.deepEqual(errors, []);
      runs.push({ width, height, black, fadeIn: true, playbackPreserved: true, errors });
      await page.close();
      console.log(`PASS KERN, black hold, native interface fade and continuous audio ${width}x${height}`);
    }
    for (const mode of ['reduced-motion', 'disabled', 'escape']) {
      const page = await h.browser.newPage(mode === 'reduced-motion' ? { reducedMotion: 'reduce' } : {});
      if (mode === 'disabled') await page.addInitScript(() => localStorage.setItem('renax.arrival.enabled.v1', 'false'));
      await page.goto(h.url);
      if (mode === 'escape') {
        await page.waitForFunction(() => document.getElementById('renaxArrival').dataset.introReady === 'true');
        await page.keyboard.press('Escape');
      }
      await page.waitForFunction(() => document.getElementById('renaxArrival').hidden);
      assert.equal(await page.locator('.kern-intro-presentation').count(), 0);
      await page.close();
      console.log('PASS intro cleanup: ' + mode);
    }
    save('intro-lifecycle-results.json', { runs, reducedMotion: true, disabled: true, escape: true });
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
