'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { start, save } = require('./audio-harness.cjs');
const { default: AxeBuilder } = require('@axe-core/playwright');
const out = process.env.TEST_OUTPUT_DIR || path.resolve('tests/results/tuner-interface');
fs.mkdirSync(out, { recursive: true });
const wav = path.join(out, 'tuner-a440.wav'),
  samples = 48000 * 2,
  data = Buffer.alloc(44 + samples * 2);
data.write('RIFF');
data.writeUInt32LE(data.length - 8, 4);
data.write('WAVEfmt ', 8);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20);
data.writeUInt16LE(1, 22);
data.writeUInt32LE(48000, 24);
data.writeUInt32LE(96000, 28);
data.writeUInt16LE(2, 32);
data.writeUInt16LE(16, 34);
data.write('data', 36);
data.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++)
  data.writeInt16LE(Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / 48000)), 44 + i * 2);
fs.writeFileSync(wav, data);
(async () => {
  const h = await start({
      tool: null,
      launchArgs: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--use-file-for-fake-audio-capture=' + wav,
      ],
    }),
    proof = [];
  try {
    const context = await h.browser.newContext({ viewport: { width: 1440, height: 1000 } }),
      p = await context.newPage(),
      errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(h.url);
    await p.waitForFunction(() => window.RENAX_TOOLS);
    assert.equal(await p.evaluate(() => window.RENAX_TOOLS.current), 'home');
    assert(await p.locator('#toolHome').isVisible());
    assert.equal(await p.locator('#workspaceNav').isVisible(), false);
    await p.evaluate(() => (document.documentElement.dataset.theme = 'avant'));
    for (const tool of ['toolHome', 'tunerRoot']) {
      const logo = p.locator(`#${tool} .renax-orbit-mark`);
      assert.equal(await logo.evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(215, 242, 24)');
      assert.match(await logo.evaluate((el) => getComputedStyle(el).maskImage), /renax-logo-approved\.svg/);
    }
    await p.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
    await p.locator('#toolHome [data-tool-link=metronome]').click();
    await p.waitForFunction(() => window.RENAX_TOOLS.current === 'metronome');
    const switchIcon = p.locator('#toolSwitchLink svg path');
    const tunerIcon = await switchIcon.getAttribute('d');
    assert.equal(await p.locator('#workspaceNav [role=tab]').count(), 6);
    await p.evaluate(() => {
      bpmSlider.value = '137';
      bpmSlider.dispatchEvent(new Event('input', { bubbles: true }));
      window.__tunerMeasures = measures;
    });
    await p.locator('#toolSwitchLink').click();
    await p.waitForFunction(() => window.RENAX_TOOLS.current === 'tuner');
    assert.equal(
      await switchIcon.getAttribute('d'),
      await p.locator('#workspaceNav [data-workspace="metronome"] svg path').getAttribute('d'),
    );
    assert.notEqual(await switchIcon.getAttribute('d'), tunerIcon);
    assert(await p.locator('#tunerRoot').isVisible());
    assert.equal(await p.locator('#playBtn').isVisible(), false);
    await p.keyboard.press('Space');
    assert.equal(
      await p.evaluate(() => isPlaying),
      false,
      'Hidden metronome shortcuts stay inactive',
    );
    await p.locator('#tunerListen').click();
    await p.waitForFunction(
      () => document.getElementById('tunerNote').textContent === 'La4',
      null,
      { timeout: 20000 },
    );
    await p.waitForFunction(
      () =>
        Math.abs(
          parseFloat(
            document.getElementById('tunerCents').textContent.replace('−', '-').replace(',', '.'),
          ),
        ) < 0.2,
    );
    assert.equal(await p.locator('.tuner-measurement').getAttribute('data-tuned'), 'true');
    const orbit = p.locator('.tuner-orbit .renax-orbit-motion');
    const tunedOrbit = await orbit.getAttribute('style');
    const measured = await p.locator('#tunerFrequency').textContent();
    await p.locator('[data-tuner-a4="442"]').click();
    assert.equal(await p.locator('#tunerA4').inputValue(), '442');
    assert.equal(await p.locator('#tunerA4Slider').inputValue(), '442');
    await p.waitForFunction(
      () =>
        Math.abs(
          parseFloat(
            document.getElementById('tunerCents').textContent.replace('−', '-').replace(',', '.'),
          ) + 7.85,
        ) < 0.2,
    );
    assert.match(await p.locator('#tunerNeedle').getAttribute('transform'), /^rotate\(-/);
    await p.waitForFunction(
      (previous) => document.querySelector('.tuner-orbit .renax-orbit-motion').getAttribute('style') !== previous,
      tunedOrbit,
    );
    await p.locator('#tunerA4').fill('');
    await p.locator('#tunerA4').pressSequentially('432.5');
    assert.equal(
      await p.locator('#tunerA4').inputValue(),
      '432.5',
      'Decimal entry remains editable while typing',
    );
    await p.locator('#tunerA4').press('Tab');
    assert.equal(await p.locator('#tunerA4Slider').inputValue(), '432.5');
    await p.locator('#tunerA4Slider').fill('441.3');
    assert.equal(await p.locator('#tunerA4').inputValue(), '441.3');
    await p.locator('#tunerTemperament').selectOption('pythagorean');
    await p.locator('#tunerTonic').selectOption('7');
    await p.locator('#tunerInstrument').selectOption('bass5');
    assert.equal(await p.locator('#tunerStrings button').count(), 5);
    await p.locator('#tunerStrings button').first().click();
    assert.equal(await p.locator('#tunerTarget').inputValue(), '23');
    await p.locator('#tunerInstrument').selectOption('chromatic');
    await p.locator('[data-tuner-a4="440"]').click();
    await p.locator('#tunerTemperament').selectOption('equal');
    await p.locator('#tunerTone').click();
    assert.equal(await p.locator('#tunerListen').getAttribute('aria-pressed'), 'false');
    assert.equal(await p.locator('#tunerTone').getAttribute('aria-pressed'), 'true');
    await p.locator('#toolSwitchLink').click();
    assert.equal(await p.evaluate(() => window.RENAX_TOOLS.current), 'metronome');
    assert.equal(await p.locator('#tunerTone').getAttribute('aria-pressed'), 'false');
    assert(
      await p.evaluate(() => measures === window.__tunerMeasures),
      'Switching preserves the same musical model',
    );
    assert.equal(await p.locator('#bpmSlider').inputValue(), '137');
    await p.goBack();
    await p.waitForFunction(() => window.RENAX_TOOLS.current === 'tuner');
    await p.goForward();
    await p.waitForFunction(() => window.RENAX_TOOLS.current === 'metronome');
    await p.locator('#toolSwitchLink').click();
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
      { width: 320, height: 600 },
      { width: 740, height: 360 },
    ]) {
      await p.setViewportSize(viewport);
      for (const theme of ['dark', 'light', 'ivory', 'avant']) {
        await p.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        assert.equal(
          await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          JSON.stringify({
            viewport,
            theme,
            overflow: await p.evaluate(() =>
              [...document.querySelectorAll('body *')]
                .map((e) => ({
                  tag: e.tagName,
                  id: e.id,
                  cls: e.className?.baseVal ?? e.className,
                  right: e.getBoundingClientRect().right,
                  width: e.getBoundingClientRect().width,
                  visibility: getComputedStyle(e).visibility,
                }))
                .filter((e) => e.width && e.right > innerWidth + 1)
                .slice(0, 18),
            ),
          }),
        );
        assert(await p.locator('#tunerListen').isVisible());
        const b = await p.locator('#tunerRoot').boundingBox();
        assert(b.height > 100);
        assert(b.y + b.height <= viewport.height + 1, JSON.stringify({ viewport, theme, b }));
        if (theme === 'avant' && [390, 1440].includes(viewport.width)) {
          const target = p.locator('.numbox-custom:has(#tunerTarget)');
          const trigger = target.locator('.numbox-button');
          const menu = target.locator('.numbox-menu');
          await trigger.click();
          await menu.waitFor({ state: 'visible' });
          const selected = menu.locator('.numbox-option[aria-selected="true"]');
          const option = menu.locator('.numbox-option[aria-selected="false"]').first();
          for (const row of [selected, option]) {
            assert.equal(await row.evaluate((el) => getComputedStyle(el).color), 'rgb(215, 242, 24)');
          }
          await option.hover();
          assert.equal(await option.evaluate((el) => getComputedStyle(el).color), 'rgb(215, 242, 24)');
          await p.keyboard.press('Escape');
          await menu.waitFor({ state: 'hidden' });
          assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
        }
        if (viewport.width === 390 || viewport.width === 1440) {
          const scan = await new AxeBuilder({ page: p })
            .include('#tunerRoot')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
          assert.deepEqual(
            scan.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
            })),
            [],
            JSON.stringify({ viewport, theme }),
          );
        }
        if (viewport.width === 390 || viewport.width === 1440)
          await p.screenshot({
            path: path.join(out, 'tuner-' + theme + '-' + viewport.width + '.png'),
            animations: 'disabled',
          });
        proof.push({ viewport, theme, measurement: 'A440 synthetic microphone', measured });
      }
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
    await p.locator('#tunerAdvanced').evaluate((node) => (node.open = true));
    await p.locator('#tunerTemperament').selectOption('custom');
    await p.locator('#tunerOffsets input').first().fill('12.3');
    await p.locator('#tunerOffsets input').first().press('Tab');
    await p.reload();
    await p.waitForFunction(() => window.RENAX_TOOLS);
    assert.equal(await p.evaluate(() => window.RENAX_TOOLS.current), 'tuner');
    assert.equal(await p.locator('#tunerTemperament').inputValue(), 'custom');
    assert.equal(await p.locator('#tunerOffsets input').first().inputValue(), '12.3');
    assert.equal(await p.locator('#tunerListen').getAttribute('aria-pressed'), 'false');
    // A browser denial must settle cleanly; the next explicit attempt may retry.
    await p.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    await p.locator('#tunerListen').click();
    await p.waitForFunction(() =>
      document.getElementById('tunerStatus').textContent.includes('refusé'),
    );
    assert.equal(await p.locator('#tunerListen').getAttribute('aria-pressed'), 'false');
    // Late permission results must not leave a microphone running after navigating away.
    await p.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () =>
        new Promise((resolve) => {
          window.__finishPermission = () => {
            const ctx = new AudioContext(),
              destination = ctx.createMediaStreamDestination();
            window.__lateTrack = destination.stream.getAudioTracks()[0];
            window.__lateContext = ctx;
            resolve(destination.stream);
          };
        });
    });
    await p.locator('#tunerListen').click();
    await p.waitForFunction(() => !!window.__finishPermission);
    await p.locator('#toolHomeLink').click();
    await p.evaluate(() => window.__finishPermission());
    await p.waitForFunction(() => window.__lateTrack.readyState === 'ended');
    await p.evaluate(() => window.__lateContext.close());
    assert.equal(await p.evaluate(() => window.RENAX_TOOLS.current), 'home');
    assert.deepEqual(errors, []);
    await p.screenshot({ path: path.join(out, 'home-mobile.png'), animations: 'disabled' });
    save('tuner-interface-results.json', {
      proof,
      errors,
      microphone: 'synthetic WAV; physical microphones require manual validation',
    });
    const offlineContext = await h.browser.newContext({ serviceWorkers: 'allow' }),
      offlinePage = await offlineContext.newPage();
    await offlinePage.goto(h.url + '/?tool=tuner');
    await offlinePage.waitForFunction(
      () => window.RENAX_OFFLINE?.ready && !!navigator.serviceWorker.controller,
      null,
      { timeout: 60000 },
    );
    await offlineContext.setOffline(true);
    await offlinePage.reload();
    await offlinePage.waitForFunction(() => window.RENAX_TOOLS?.current === 'tuner');
    await offlinePage.locator('#tunerListen').click();
    await offlinePage.waitForFunction(
      () => document.getElementById('tunerNote').textContent === 'La4',
      null,
      { timeout: 20000 },
    );
    await offlineContext.close();
    await p.close();
    console.log(
      'PASS tuner microphone pipeline, A4, instruments, temperaments, 16 layouts, Back/Forward, state retention, denial and late permission cleanup',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
