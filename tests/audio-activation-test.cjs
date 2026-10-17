const assert = require('node:assert/strict');
const { start, save } = require('./audio-harness.cjs');
(async () => {
  const h = await start();
  try {
    const p = await h.browser.newPage();
    const errors = [];
    p.on('pageerror', (error) => errors.push(error.message));
    await p.goto(h.url);
    await p.waitForFunction(() => window.RENAX_SONGS);
    await p.evaluate(async () => {
      await initAudio();
      await audioCtx.suspend();
      audioCtx.resume = () => new Promise(() => {});
    });
    const begin = performance.now();
    await p.locator('#playBtn').click();
    await p.waitForFunction(() => playbackStarting);
    await p.waitForFunction(() => !playbackStarting, null, { timeout: 11000 });
    const elapsedMs = performance.now() - begin;
    assert(elapsedMs >= 7900 && elapsedMs < 11000);
    assert.equal(await p.evaluate(() => isPlaying), false);
    await p
      .getByText('Impossible de démarrer le son. Vérifiez la sortie audio et réessayez.', {
        exact: true,
      })
      .waitFor();
    await p.locator('.app-error-notice button').click();
    await p.evaluate(() => {
      delete audioCtx.resume;
    });
    await p.locator('#playBtn').click();
    await p.waitForFunction(() => isPlaying && audioCtx.state === 'running');
    await p.locator('#playBtn').click();
    await p.waitForFunction(() => !isPlaying);
    assert.deepEqual(errors, []);
    save('audio-activation-results.json', {
      activationTimeoutMs: elapsedMs,
      errorVisible: true,
      retryPlayback: true,
      errors,
    });
    console.log(
      'PASS pending audio activation bounded, visible error and real playback after retry',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
