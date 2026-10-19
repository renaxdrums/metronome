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
    for (const [code, label] of [
      ['es', 'Español'],
      ['de', 'Deutsch'],
      ['it', 'Italiano'],
    ]) {
      const button = p.locator('[data-language="' + code + '"]');
      assert.equal(await button.getAttribute('aria-label'), label);
      assert.equal(await button.locator('svg[aria-hidden="true"]').count(), 1);
      assert.equal(await button.textContent(), '');
    }
    await p.evaluate(() => {
      window.__probeCalls = 0;
      window.__probeStopped = 0;
      window.__probeMode = 'ready';
      window.__probeTrackOpen = false;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            window.__probeCalls++;
            if (window.__probeMode === 'denied')
              throw new DOMException('PRIVATE_DEVICE_ERROR', 'NotAllowedError');
            window.__probeTrackOpen = true;
            return {
              getTracks: () => [
                {
                  stop: () => {
                    window.__probeStopped++;
                    window.__probeTrackOpen = false;
                  },
                },
              ],
            };
          },
          enumerateDevices: async () => {
            if (window.__probeTrackOpen) throw Error('Microphone still open during enumeration');
            if (window.__probeMode === 'enumerateFailure') throw Error('PRIVATE_DEVICE_ERROR');
            return [
              {
                kind: 'audiooutput',
                deviceId: 'default',
                groupId: 'PRIVATE_GROUP',
                label: 'PRIVATE_BUDS_NAME',
              },
              {
                kind: 'audiooutput',
                deviceId: 'PRIVATE_DEVICE_ID',
                groupId: 'PRIVATE_GROUP',
                label: 'PRIVATE_BUDS_NAME',
              },
              {
                kind: 'audioinput',
                deviceId: 'PRIVATE_MIC_ID',
                groupId: 'PRIVATE_GROUP',
                label: 'PRIVATE_MIC_NAME',
              },
            ];
          },
        },
      });
    });
    assert.equal(await p.evaluate(() => window.__probeCalls), 0);
    // Device permission is never requested while playback is active.
    await p.evaluate(() => RENAX_PLAYBACK.start());
    await p.locator('#latencyIdentifyOutputs').click();
    await p.waitForFunction(() => !document.getElementById('latencyIdentifyOutputs').disabled);
    assert.equal(await p.evaluate(() => window.__probeCalls), 0);
    await p.evaluate(() => RENAX_PLAYBACK.stop());
    for (const mode of ['ready', 'enumerateFailure', 'denied', 'ready']) {
      await p.evaluate((mode) => {
        window.__probeMode = mode;
      }, mode);
      await p.locator('#latencyIdentifyOutputs').click();
      await p.waitForFunction(() => !document.getElementById('latencyIdentifyOutputs').disabled);
      const probe = await p.evaluate(
        () => RENAX_FEEDBACK.diagnosticReport().playback.outputIdentification,
      );
      assert.equal(probe.status, mode === 'ready' ? 'ready' : 'failed');
      if (mode === 'ready') {
        assert.equal(probe.outputs.length, 2);
        assert(probe.outputs[0].default);
        assert.equal(probe.outputs[0].groupHash, probe.outputs[1].groupHash);
        assert.match(probe.outputs[1].idHash, /^[a-f0-9]{64}$/);
      } else {
        assert.equal(probe.outputs.length, 0);
        assert.equal(probe.error, mode === 'denied' ? 'NotAllowedError' : 'OtherError');
      }
    }
    assert.equal(await p.evaluate(() => window.__probeCalls), 4);
    assert.equal(await p.evaluate(() => window.__probeStopped), 3);
    const downloading = p.waitForEvent('download');
    await p.getByRole('button', { name: 'Exporter le diagnostic', exact: true }).click();
    const download = await downloading;
    const raw = fs.readFileSync(await download.path(), 'utf8');
    const report = JSON.parse(raw);
    assert.equal(report.format, 1);
    assert.equal(typeof report.playback.wakeLockSupported, 'boolean');
    assert.equal(typeof report.playback.audio.manualMs, 'number');
    assert(Array.isArray(report.playback.wakeEvents));
    assert(report.errors.length > 0);
    assert(!raw.includes('PRIVATE_SONG_TITLE'));
    assert(!raw.includes('PRIVATE_ACCOUNT_DETAIL'));
    for (const value of [
      'PRIVATE_GROUP',
      'PRIVATE_BUDS_NAME',
      'PRIVATE_DEVICE_ID',
      'PRIVATE_MIC_ID',
      'PRIVATE_MIC_NAME',
      'PRIVATE_DEVICE_ERROR',
    ])
      assert(!raw.includes(value));
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
