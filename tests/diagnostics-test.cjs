const assert = require('node:assert/strict');
const fs = require('node:fs');
const { start, save } = require('./audio-harness.cjs');

(async () => {
  const h = await start();
  try {
    const p = await h.browser.newPage({ acceptDownloads: true });
    const requests = [];
    p.on('request', (request) => requests.push(request.url()));
    await p.goto(h.url);
    await p.waitForFunction(() => window.RENAX_FEEDBACK?.measurements.inpSupported);
    await p.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'qaSlowInteraction';
      button.textContent = 'Slow interaction fixture';
      button.onclick = () => {
        const end = performance.now() + 120;
        while (performance.now() < end) {}
      };
      document.body.append(button);
    });
    await p.locator('#qaSlowInteraction').click();
    await p.waitForFunction(() => typeof RENAX_FEEDBACK.measurements.inpMs === 'number');
    const metrics = await p.evaluate(() => RENAX_FEEDBACK.measurements);
    assert(metrics.inpMs >= 100 && metrics.inpMs < 5000);
    await p.evaluate(() =>
      RENAX_FEEDBACK.error('PRIVATE_SONG_TITLE', new Error('PRIVATE_ACCOUNT_DETAIL')),
    );
    await p.locator('#index2SettingsBtn').click();
    const downloading = p.waitForEvent('download');
    await p.getByRole('button', { name: 'Exporter le diagnostic', exact: true }).click();
    const download = await downloading;
    const raw = fs.readFileSync(await download.path(), 'utf8');
    const report = JSON.parse(raw);
    assert.equal(report.format, 1);
    assert(report.errors.length > 0);
    assert(!raw.includes('PRIVATE_SONG_TITLE'));
    assert(!raw.includes('PRIVATE_ACCOUNT_DETAIL'));
    assert(!Object.hasOwn(report, 'library'));
    assert(!Object.hasOwn(report, 'account'));
    assert(requests.every((url) => url.startsWith(h.url) || url.startsWith('data:')));
    save('diagnostics-results.json', { metrics, report, externalRequests: 0 });
    console.log(
      'PASS real slow interaction measured, local diagnostic download and private data excluded',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
