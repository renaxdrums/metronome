'use strict';
const assert = require('node:assert/strict');
const { start, save } = require('../tests/audio-harness.cjs');

(async () => {
  if (!process.env.TEST_URL) throw Error('Provide the built release URL in TEST_URL.');
  const h = await start();
  try {
    const p = await h.browser.newPage();
    const errors = [];
    p.on('pageerror', (error) => errors.push(error.message));
    await p.addInitScript(() => {
      window.__policyViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__policyViolations.push({
          directive: event.effectiveDirective,
          blocked: event.blockedURI,
        });
      });
    });
    await p.goto(h.url);
    assert.equal(await p.locator('meta[http-equiv="Content-Security-Policy"]').count(), 1);
    await p.waitForFunction(() => window.RENAX_SONGS && window.RENAX_FEEDBACK);
    const preview = await p.evaluate(async () => {
      const frame = document.createElement('iframe');
      frame.style.display = 'none';
      const ready = new Promise((resolve) => (frame.onload = resolve));
      frame.src = location.href;
      document.body.append(frame);
      await ready;
      const { createAudioAdapter } = await import('./prototypes/amorce/audio-adapter.mjs');
      const adapter = await createAudioAdapter(frame);
      const deadline = performance.now() + 20000;
      while (!adapter.ready()) {
        if (performance.now() > deadline) throw Error('Preview voices not ready');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const context = new OfflineAudioContext(1, 48000, 48000);
      adapter.configure(context);
      adapter.count(1, 0.1, 1, true, 0.5);
      const rendered = await context.startRendering();
      const peak = Math.max(...rendered.getChannelData(0));
      frame.remove();
      return { peak, samples: rendered.length };
    });
    assert(preview.peak > 0.001);
    assert.equal(preview.samples, 48000);
    assert.deepEqual(await p.evaluate(() => window.__policyViolations), []);
    await p.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__unexpectedInlineExecution = 1';
      document.head.append(script);
    });
    await p.waitForFunction(() => window.__policyViolations.length > 0);
    assert.equal(await p.evaluate(() => window.__unexpectedInlineExecution), undefined);
    assert.deepEqual(errors, []);
    save('production-csp-results.json', { preview, blockedInline: true, errors });
    console.log(
      'PASS enforced production CSP, explicit cross-frame audio bridge and blocked untrusted inline script',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
