'use strict';
const assert = require('node:assert/strict');
const { start } = require('./audio-harness.cjs');

(async () => {
  const h = await start({ tool: 'tuner' });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await h.browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(h.url);
      await page.waitForFunction(() => window.RENAX_TOOLS?.current === 'tuner');
      assert.equal(await page.locator('.tuner-range').count(), 0);
      await page.locator('#tunerSettingsOpen').click();
      await page.locator('#tunerAdvanced > summary').click();
      assert.equal(await page.locator('#tunerAdvanced').evaluate((node) => node.open), true);
      const notes = page.locator('#tunerCustomNotes');
      await notes.fill('not-a-note');
      await page.locator('#tunerUseCustomNotes').click();
      assert.equal(await notes.getAttribute('aria-invalid'), 'true');
      assert.match(await page.locator('#tunerCustomError').innerText(), /invalide/i);
      await notes.fill('D2 A2 D3 F#3 A3 D4');
      await page.locator('#tunerUseCustomNotes').click();
      assert.equal(await notes.getAttribute('aria-invalid'), null);
      assert.equal(await page.locator('#tunerInstrument').inputValue(), 'custom');
      assert.equal(await page.locator('#tunerStrings button').count(), 6);
      await page.locator('#tunerUseCustomTemperament').click();
      assert.equal(await page.locator('#tunerTemperament').inputValue(), 'custom');
      const offset = page.locator('#tunerOffsets input').first();
      assert.equal(await offset.isEnabled(), true);
      await offset.fill('12.3');
      await offset.press('Tab');
      for (let i = 1; i < 12; i++) {
        const input = page.locator('#tunerOffsets input').nth(i);
        await input.fill(String(i - 6));
        await input.press('Tab');
      }
      await page.reload();
      await page.waitForFunction(() => window.RENAX_TOOLS?.current === 'tuner');
      await page.locator('#tunerSettingsOpen').click();
      await page.locator('#tunerAdvanced > summary').click();
      assert.equal(await page.locator('#tunerInstrument').inputValue(), 'custom');
      assert.equal(await page.locator('#tunerTemperament').inputValue(), 'custom');
      assert.equal(await page.locator('#tunerOffsets input').first().inputValue(), '12.3');
      for (let i = 1; i < 12; i++)
        assert.equal(await page.locator('#tunerOffsets input').nth(i).inputValue(), String(i - 6));
      assert.equal(await page.locator('#tunerCustomNotes').inputValue(), 'D2 A2 D3 F♯3 A3 D4');
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Advanced tuner controls: ${viewport.width}x${viewport.height} passed`);
    }
  } finally {
    await h.browser.close();
    if (h.server) await new Promise((resolve) => h.server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
