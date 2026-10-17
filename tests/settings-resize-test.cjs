const assert = require('node:assert/strict');
const { start, save } = require('./audio-harness.cjs');
(async () => {
  const h = await start();
  try {
    const p = await h.browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [],
      states = [];
    p.on('pageerror', (error) => errors.push(error.message));
    await p.goto(h.url);
    await p.waitForFunction(() => window.RENAX_SONGS);
    await p.locator('#index2SettingsBtn').click();
    for (const width of [390, 1440, 390, 1366, 390]) {
      await p.setViewportSize({ width, height: 900 });
      await p.waitForFunction(
        () => {
          const panel = document.getElementById('index2SettingsPanel');
          return matchMedia('(min-width:1101px)').matches
            ? panel.classList.contains('open')
            : panel.classList.contains('mobile-active');
        },
        null,
        { timeout: 2000 },
      );
      await p.locator('[data-appearance=dark]').waitFor({ state: 'visible' });
      const state = await p.evaluate(() => ({
        width: innerWidth,
        desktop: matchMedia('(min-width:1101px)').matches,
        open: document.getElementById('index2SettingsPanel').classList.contains('open'),
        active: document.getElementById('index2SettingsPanel').classList.contains('mobile-active'),
      }));
      assert(state.desktop ? state.open : state.active);
      states.push(state);
    }
    await p.locator('#index2SettingsClose').click();
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.waitForFunction(
      () => !document.getElementById('index2SettingsPanel').classList.contains('open'),
    );
    assert.equal(await p.locator('[data-appearance=dark]').isVisible(), false);
    assert.deepEqual(errors, []);
    save('settings-resize-results.json', { states, closedStaysClosed: true, errors });
    console.log(
      'PASS open preferences preserved across five viewport changes; closed preferences stay closed',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
