const assert = require('node:assert/strict');
const { start } = require('./audio-harness.cjs');

(async () => {
  const h = await start();
  try {
    const p = await h.browser.newPage();
    const errors = [];
    p.on('pageerror', (error) => errors.push(error.message));
    await p.goto(h.url);
    assert.equal(await p.evaluate(() => allVoiceAudioReady), false);
    // Delay real WAV bytes: do not let a warm cache conceal the live-switch bug.
    await p.route('**/assets/voices/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.continue();
    });
    await p.locator('#playBtn').click();
    await p.waitForFunction(() => isPlaying);
    const initialBank = await p.evaluate(() => currentBank);
    await p.evaluate(() => {
      window.voiceStarts = [];
      const create = audioCtx.createBufferSource.bind(audioCtx);
      audioCtx.createBufferSource = () => {
        const source = create(), start = source.start;
        source.start = function (...args) {
          for (const [gender, buffers] of Object.entries(VOICE_METRONOME_BUFFERS))
            for (const [number, buffer] of Object.entries(buffers))
              if (source.buffer === buffer) window.voiceStarts.push({ gender, number });
          return start.apply(this, args);
        };
        return source;
      };
    });
    await p.selectOption('#soundBank', 'voiceMale');
    assert.equal(await p.evaluate(() => currentBank), initialBank);
    await p.waitForFunction(() => window.voiceStarts.some((s) => s.gender === 'male'));
    assert.equal(await p.evaluate(() => isPlaying), true);
    await p.selectOption('#soundBank', 'voiceFemale');
    await p.waitForFunction(() => window.voiceStarts.some((s) => s.gender === 'female'));
    await p.locator('#playBtn').click();
    await p.waitForFunction(() => !isPlaying);
    assert.deepEqual(errors, []);

    // A superseded voice choice cannot replace the user's newer selection.
    await p.reload();
    await p.locator('#playBtn').click();
    await p.waitForFunction(() => isPlaying);
    await p.selectOption('#soundBank', 'voiceMale');
    await p.selectOption('#soundBank', 'claves');
    await p.waitForFunction(() => allVoiceAudioReady);
    assert.equal(await p.evaluate(() => currentBank), 'claves');
    await p.locator('#playBtn').click();
    console.log('PASS cold male/female live switches schedule original voices; obsolete choice ignored');
  } finally {
    await h.browser.close();
    h.server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
