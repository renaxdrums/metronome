/* A bounded Chrome session with explicit preparation and post-GC observations. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { start } = require('../tests/audio-harness.cjs');

(async () => {
  const duration = Number(process.env.SESSION_DURATION_MS || 600000);
  if (!Number.isFinite(duration) || duration < 60000 || duration > 1800000)
    throw Error('Invalid session duration.');
  const h = await start();
  const rows = [];
  const errors = [];
  try {
    const p = await h.browser.newPage();
    p.on('pageerror', (error) => errors.push(error.message));
    await p.goto(h.url);
    await p.waitForFunction(() => window.RENAX_SONGS);
    await p.evaluate(() => prepareAllVoiceAudio());
    const session = await p.context().newCDPSession(p);
    await session.send('Performance.enable');
    const tabs = ['Métronome', 'Polyrythmie', 'Séquenceur', 'Multipiste', 'Track'];
    for (const tab of tabs) await p.getByRole('tab', { name: tab, exact: true }).click();
    await p.getByRole('tab', { name: 'Métronome', exact: true }).click();
    async function snapshot() {
      await session.send('HeapProfiler.collectGarbage');
      const { metrics } = await session.send('Performance.getMetrics');
      return Object.fromEntries(
        metrics
          .filter((m) =>
            ['JSHeapUsedSize', 'Nodes', 'Documents', 'JSEventListeners'].includes(m.name),
          )
          .map((m) => [m.name, m.value]),
      );
    }
    const before = await snapshot();
    const begin = Date.now();
    let cycles = 0;
    while (Date.now() - begin < duration) {
      await p.getByRole('tab', { name: tabs[cycles % tabs.length], exact: true }).click();
      await p.getByRole('tab', { name: 'Métronome', exact: true }).click();
      await p.locator('#playBtn').click();
      await p.waitForFunction(() => isPlaying);
      await p.waitForTimeout(150);
      await p.locator('#playBtn').click();
      await p.waitForFunction(() => !isPlaying);
      cycles++;
      if (cycles % 10 === 0)
        rows.push({ elapsedMs: Date.now() - begin, cycles, metrics: await snapshot() });
      await p.waitForTimeout(4500);
    }
    await p.waitForTimeout(2000);
    const after = await snapshot();
    assert.deepEqual(errors, []);
    assert(
      after.JSHeapUsedSize < before.JSHeapUsedSize + 50 * 1024 * 1024,
      'Large retained JS heap growth',
    );
    assert(after.Nodes < before.Nodes + 300, 'Unexpected retained DOM-node growth');
    const report = {
      elapsedMs: Date.now() - begin,
      cycles,
      before,
      after,
      samples: rows,
      errors,
      scope:
        'Single Chrome session, prepared voices, repeated navigation and playback; post-GC observations. Not an OS audio/memory certification.',
    };
    const directory = process.env.TEST_OUTPUT_DIR || path.join(__dirname, '../tests/results');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'long-session.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(
      'PASS long session: ' + cycles + ' navigation/playback cycles in ' + report.elapsedMs + 'ms',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
