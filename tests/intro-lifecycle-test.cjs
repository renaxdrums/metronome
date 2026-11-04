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
      // An opaque opening must not keep redrawing the covered application.
      await page.evaluate(() => {
        // Observe short transition phases in the page, before playback/resize.
        // The runner can resume after finish() has removed the presentation.
        // Keep the exact visual requirements; a missing phase still times out.
        window.qaIntroFrames = {};
        const overlay = document.getElementById('renaxArrival');
        const observer = new MutationObserver(() => {
          const scene = overlay.querySelector('.kern-intro-presentation');
          if (scene) {
            const frame = {
              overlay: Number(getComputedStyle(overlay).opacity),
              scene: Number(getComputedStyle(scene).opacity),
              background: getComputedStyle(overlay).backgroundColor,
            };
            if (overlay.dataset.introPhase === 'black' && frame.overlay === 1 && frame.scene === 0)
              window.qaIntroFrames.black = frame;
            if (overlay.dataset.introPhase === 'fade-in' && frame.overlay > .1 && frame.overlay < .9 && frame.scene === 0)
              window.qaIntroFrames.fadeIn = frame;
          }
          if (overlay.hidden) observer.disconnect();
        });
        observer.observe(overlay, { attributes: true, childList: true, subtree: true });
        window.qaCoveredDraws = { particleCanvas: 0, renaxHeaderWave: 0 };
        const clear = CanvasRenderingContext2D.prototype.clearRect;
        CanvasRenderingContext2D.prototype.clearRect = function (...args) {
          if (Object.hasOwn(window.qaCoveredDraws, this.canvas.id)) window.qaCoveredDraws[this.canvas.id]++;
          return clear.apply(this, args);
        };
      });
      await page.waitForTimeout(350);
      assert.deepEqual(await page.evaluate(() => window.qaCoveredDraws), { particleCanvas: 0, renaxHeaderWave: 0 });
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
      const blackFrame = await page.waitForFunction(() => window.qaIntroFrames.black,
        null, { polling: 20, timeout: 15000 });
      const black = await blackFrame.jsonValue();
      await blackFrame.dispose();
      assert.equal(black.overlay, 1);
      assert.equal(black.scene, 0);
      assert.equal(black.background, 'rgb(0, 0, 0)');
      const typography = await page.evaluate(() => window.qaIntroText);
      assert.equal(await page.evaluate(() => window.RENAX_KERN.DURATION), 10.5);
      assert.equal(Object.hasOwn(typography, 'David Arens'), false);
      assert.equal(typography['R E N A X  D R U M S'], '#ffffff');
      assert.equal(typography['MÉTRO'], '#ffffff');
      assert.equal(typography.NOME, '#ff7900');
      await page.waitForFunction(() => window.qaIntroFrames.fadeIn, null, { polling: 20 });
      assert.equal(await page.evaluate(() => window.qaIntroFrames.fadeIn.scene), 0);
      await page.waitForFunction(() => document.getElementById('renaxArrival').hidden);
      await page.waitForTimeout(100);
      assert(await page.evaluate(() => window.qaCoveredDraws.particleCanvas > 0 && window.qaCoveredDraws.renaxHeaderWave > 0), 'Covered visuals resume after the intro');
      const timerChanges = await page.evaluate(() => new Promise(resolve => {
        let changes = 0;
        const observer = new MutationObserver(records => { changes += records.length; });
        observer.observe(trainTimerEl, { childList: true });
        setTimeout(() => { observer.disconnect(); resolve(changes); }, 200);
      }));
      assert(timerChanges <= 1, 'The seconds display must not replace identical text every frame');
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
