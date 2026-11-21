const assert = require('node:assert/strict');
const { start } = require('./audio-harness.cjs');

(async () => {
  const h = await start();
  try {
    for (const theme of ['dark', 'light', 'ivory', 'avant']) {
      for (const width of [1101, 1280, 1440, 1920]) {
        const page = await h.browser.newPage({ viewport: { width, height: 900 } });
        await page.addInitScript((value) => localStorage.setItem('renax-appearance', value), theme);
        await page.goto(h.url);
        const { nav, buttons } = await page.locator('#workspaceNav').evaluate((element) => ({
          nav: element.getBoundingClientRect().toJSON(),
          buttons: [...element.querySelectorAll('button')].map((button) => button.getBoundingClientRect().toJSON()),
        }));
        assert.equal(buttons.length, 6, `${theme} ${width}px: expected six tabs`);
        assert(Math.abs(buttons[0].left - nav.left) <= 2, `${theme} ${width}px: left gap`);
        assert(Math.abs(nav.right - buttons[5].right) <= 2, `${theme} ${width}px: right gap`);
        assert(buttons.every((button) => button.width >= 44 && button.height >= 42), `${theme} ${width}px: tabs too small`);
        const widths = buttons.map((button) => button.width);
        assert(Math.max(...widths) - Math.min(...widths) <= 2, `${theme} ${width}px: unequal columns`);
        await page.close();
      }
    }
    console.log('PASS six desktop tabs fill both edges across all four themes');
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
