const assert = require('node:assert/strict');
const { start } = require('./audio-harness.cjs');

(async () => {
  const h = await start();
  try {
    for (const mode of ['metronome', 'polyrhythm']) {
      const page = await h.browser.newPage();
      await page.goto(h.url);
      await page.waitForFunction(() => audioCtx !== null);
      await page.evaluate((modeForTest) => {
        if (modeForTest === 'polyrhythm') setAppMode('polyrhythm');
      }, mode);
      await page.evaluate(() => {
        window.firstContext = audioCtx;
        window.firstSounds = [];
        const bank = SOUND_BANKS.userMetroclic;
        const play = bank.play;
        bank.play = function (...args) {
          window.firstSounds.push({ time: args[1], now: audioCtx.currentTime });
          return play.apply(this, args);
        };
      });
      await page.locator('#playBtn').click();
      await page.waitForFunction(() => isPlaying && window.firstSounds.length > 0);
      const result = await page.evaluate(() => ({
        reusedContext: audioCtx === window.firstContext,
        state: audioCtx.state,
        first: window.firstSounds[0],
      }));
      assert.equal(result.reusedContext, true, `${mode}: first click created a new context`);
      assert.equal(result.state, 'running');
      assert(
        result.first.time >= result.first.now,
        `${mode}: first sound was scheduled late (${JSON.stringify(result.first)})`,
      );
      await page.locator('#playBtn').click();
      await page.waitForFunction(() => !isPlaying);
      await page.close();
    }
    console.log('PASS first-start audio context reused and first sound scheduled in both modes');
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
