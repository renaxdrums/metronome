'use strict';
const assert = require('node:assert/strict');
const { start, save } = require('./audio-harness.cjs');
(async () => {
  const h = await start(),
    runs = [];
  try {
    for (const width of [1440, 390])
      for (const theme of ['dark', 'light', 'ivory']) {
        const p = await h.browser.newPage({ viewport: { width, height: 900 } }),
          errors = [];
        p.on('pageerror', (e) => errors.push(e.message));
        const cdp = await p.context().newCDPSession(p);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: width === 390 ? 4 : 1 });
        await p.addInitScript((theme) => {
          localStorage.setItem('renax-appearance', theme);
          window.__layout = { value: 0, revealedAt: null };
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) if (!e.hadRecentInput) __layout.value += e.value;
          }).observe({ type: 'layout-shift', buffered: true });
          new MutationObserver(() => {
            if (
              document.documentElement &&
              !document.documentElement.hasAttribute('data-workspace-loading') &&
              window.RENAX_WORKSPACE &&
              __layout.revealedAt === null
            )
              __layout.revealedAt = performance.now();
          }).observe(document, { attributes: true, subtree: true });
        }, theme);
        await p.goto(h.url);
        await p.waitForFunction(
          () =>
            window.RENAX_WORKSPACE &&
            !document.documentElement.hasAttribute('data-workspace-loading'),
        );
        await p.waitForTimeout(1100);
        const result = await p.evaluate(() => ({
          ...__layout,
          busy: document.querySelector('.main-grid').hasAttribute('aria-busy'),
          overflow: document.documentElement.scrollWidth > innerWidth,
          visible: getComputedStyle(document.querySelector('.main-grid')).visibility,
        }));
        assert(result.value < 0.1, JSON.stringify({ width, theme, ...result }));
        assert(
          result.revealedAt !== null && result.revealedAt < 3000,
          'Must reveal through normal initialization, before emergency timeout',
        );
        assert.equal(result.busy, false);
        assert.equal(result.visible, 'visible');
        assert.equal(result.overflow, false);
        for (const name of [
          'Track',
          'Multipiste',
          'Entraînement',
          'Polyrythmie',
          'Séquenceur',
          'Métronome',
        ])
          await p.getByRole('tab', { name, exact: true }).click();
        assert.deepEqual(errors, []);
        runs.push({ width, theme, ...result, errors });
        await p.close();
      }
    // A presentation script failure cannot leave the working core permanently hidden.
    const p = await h.browser.newPage();
    await p.route('**/workspace-layout.js*', (r) => r.abort());
    await p.goto(h.url);
    await p.waitForFunction(() => !document.documentElement.hasAttribute('data-workspace-loading'));
    assert(await p.locator('.main-grid').isVisible());
    assert.equal(await p.locator('.main-grid').getAttribute('aria-busy'), null);
    await p.close();
    save('startup-layout-results.json', { runs, failOpen: true });
    console.log('PASS six startup layouts below CLS 0.1, real navigation and fail-open recovery');
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
