/* Local repeatable timings, not field percentiles or a physical-device certification. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('../tests/audio-harness.cjs');

(async () => {
  const h = await start();
  const samples = [];
  try {
    for (const profile of [
      { width: 1440, cpu: 1 },
      { width: 390, cpu: 4 },
    ]) {
      for (let repeat = 0; repeat < 3; repeat++) {
        const p = await h.browser.newPage({ viewport: { width: profile.width, height: 900 } });
        const session = await p.context().newCDPSession(p);
        await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
        const begin = performance.now();
        await p.goto(h.url);
        await p.waitForFunction(() => window.RENAX_SONGS && window.RENAX_FEEDBACK);
        const interfaceReadyMs = performance.now() - begin;
        const playBegin = performance.now();
        await p.locator('#playBtn').click();
        await p.waitForFunction(() => isPlaying);
        const firstPlayActionMs = performance.now() - playBegin;
        await p.locator('#playBtn').click();
        await p.waitForTimeout(250);
        const measures = await p.evaluate(() => ({
          navigation: performance.getEntriesByType('navigation').map((n) => ({
            domContentLoadedMs: n.domContentLoadedEventEnd,
            loadMs: n.loadEventEnd,
          })),
          vitals: RENAX_FEEDBACK.measurements,
          heap: performance.memory?.usedJSHeapSize ?? null,
          resources: performance.getEntriesByType('resource').map((r) => ({
            path: new URL(r.name).pathname,
            durationMs: r.duration,
            transferBytes: r.transferSize,
          })),
        }));
        samples.push({ ...profile, repeat, interfaceReadyMs, firstPlayActionMs, ...measures });
        await p.close();
      }
    }
    const output = process.env.TEST_OUTPUT_DIR || path.join(__dirname, '../tests/results');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      path.join(output, 'browser-benchmark.json'),
      JSON.stringify(
        {
          url: h.url,
          scope:
            'Fresh browser contexts, service workers blocked, desktop Chrome and simulated CPU throttling. No network throttling; no field population.',
          samples,
        },
        null,
        2,
      ) + '\n',
    );
    console.log('Measured ' + samples.length + ' browser startup and first-play samples');
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
