const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  assert = require('node:assert/strict');
const { start, save } = require('./audio-harness.cjs');
const baseline = process.env.INVARIANCE_REF || '396287e3a921891b27e608f2e5f363091b5fe1c7',
  root = path.resolve(__dirname, '..'),
  cache = new Map();
const cascadeProbe = process.env.CASCADE_PROBE || '';
assert(['', 'remove-important', 'layers-only', 'layers-without-important'].includes(cascadeProbe));
const probeLayers = {
  'app-base.css': 'base',
  'accessibility.css': 'components',
  'training-modes.css': 'components',
  'navigation-index.css': 'layout',
};
async function restoreProbe(page) {
  if (!cascadeProbe) return;
  await page.evaluate(() => {
    for (const { link, style } of window.__cascadeProbe || []) {
      style.remove();
      link.disabled = false;
    }
    window.__cascadeProbe = [];
  });
}
async function applyProbe(page) {
  if (!cascadeProbe) return;
  const sources = Object.fromEntries(
    Object.entries(probeLayers).map(([file, layer]) => {
      let body = cp.execFileSync('git', ['show', baseline + ':' + file], {
        cwd: root,
        encoding: 'utf8',
      });
      if (cascadeProbe !== 'layers-only') body = body.replace(/!\s*important\b/gi, '');
      if (cascadeProbe !== 'remove-important')
        body = '@layer base, components, layout, themes;\n@layer ' + layer + ' {\n' + body + '\n}';
      return [file, body];
    }),
  );
  await page.evaluate((sources) => {
    window.__cascadeProbe = [];
    for (const link of document.querySelectorAll('link[rel=stylesheet]')) {
      const body = sources[new URL(link.href).pathname.split('/').pop()];
      if (body === undefined) continue;
      const style = document.createElement('style');
      style.textContent = body;
      link.before(style);
      link.disabled = true;
      window.__cascadeProbe.push({ link, style });
    }
  }, sources);
}
async function baselineRoute(page, url) {
  await page.route(url + '/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname,
      file = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    if (!cache.has(file)) {
      try {
        cache.set(
          file,
          cp.execFileSync('git', ['show', baseline + ':' + file], {
            cwd: root,
            maxBuffer: 16 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'ignore'],
          }),
        );
      } catch {
        cache.set(file, null);
      }
    }
    const body = cache.get(file);
    if (!body) return route.fulfill({ status: 404, body: 'Not found' });
    const contentType = /\.html$/.test(file)
      ? 'text/html'
      : /\.(js|mjs)$/.test(file)
        ? 'text/javascript'
        : /\.css$/.test(file)
          ? 'text/css'
          : /\.json$/.test(file)
            ? 'application/json'
            : /\.wav$/.test(file)
              ? 'audio/wav'
              : /\.svg$/.test(file)
                ? 'image/svg+xml'
                : 'application/octet-stream';
    await route.fulfill({ body, contentType });
  });
}
(async () => {
  const h = await start({
      launchArgs: ['--disable-gpu', '--disable-lcd-text', '--force-color-profile=srgb'],
    }),
    pcm = [],
    visuals = [],
    styleDiffs = [];
  try {
    const pages = [];
    for (const before of [true, false]) {
      const p = await h.browser.newPage();
      if (before) await baselineRoute(p, h.url);
      await p.addInitScript(() => {
        let seed = 42;
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
      });
      await p.goto(h.url);
      await p.evaluate(() => prepareAllVoiceAudio());
      await p.waitForFunction(() => allVoiceAudioReady);
      await p.evaluate(async () => {
        for (const bank of Object.keys(SOUND_BANKS)) await ensureInstrumentBankReady(bank);
      });
      pages.push(p);
    }
    if (process.env.VISUAL_ONLY !== '1')
      for (const rate of [44100, 48000]) {
        const outputs = [];
        for (const p of pages)
          outputs.push(
            await p.evaluate(async (rate) => {
              const hashes = {};
              for (const bank of Object.keys(SOUND_BANKS).sort()) {
                let seed = 42;
                Math.random = () => {
                  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                  return seed / 4294967296;
                };
                audioCtx = new OfflineAudioContext(1, rate * 4, rate);
                for (const first of [false, true])
                  for (const state of [1, 2, 3])
                    SOUND_BANKS[bank].play(
                      audioCtx.destination,
                      0.4 + (state - 1) * 0.5 + (first ? 1.5 : 0),
                      state,
                      first,
                      { beatNumber: state, subIndex: 0, beatDurationSec: 0.5 },
                    );
                const x = (await audioCtx.startRendering()).getChannelData(0);
                const digest = await crypto.subtle.digest('SHA-256', x.buffer);
                hashes[bank] = {
                  sha256: [...new Uint8Array(digest)]
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join(''),
                  samples: x.length,
                };
              }
              return hashes;
            }, rate),
          );
        assert.deepEqual(outputs[1], outputs[0], 'PCM changed at ' + rate);
        pcm.push({ rate, banks: outputs[1], identical: true });
      }
    for (const p of pages) await p.close();
    if (process.env.PCM_ONLY !== '1')
      for (const [width, height] of [
        [1440, 1000],
        [834, 1112],
        [390, 844],
      ]) {
        const views = [];
        for (const before of [true, false]) {
          const p = await h.browser.newPage({
            viewport: { width, height },
            hasTouch: width < 1100,
            reducedMotion: 'reduce',
          });
          if (before) await baselineRoute(p, h.url);

          await p.goto(h.url);
          await p.evaluate(() => prepareAllVoiceAudio());
          await p.waitForFunction(() => allVoiceAudioReady && window.RENAX_SONGS);
          await p.waitForFunction(() =>
            document.getElementById('audioReadyWrap').classList.contains('fade-out'),
          );
          await p.evaluate(() => document.fonts.ready);
          await p.addStyleTag({
            content:
              '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
          });
          views.push(p);
        }
        for (const theme of ['dark', 'light', 'ivory'])
          for (const module of [
            'Métronome',
            'Polyrythmie',
            'Entraînement',
            'Séquenceur',
            'Multipiste',
            'Track',
          ]) {
            const shots = [];
            for (const [i, p] of views.entries()) {
              await p.bringToFront();
              if (i) await restoreProbe(p);
              await p.locator('#index2SettingsBtn').click();
              await p.locator('[data-appearance=' + theme + ']').click();
              await p.locator('#index2SettingsClose').click();
              await p.getByRole('tab', { name: module, exact: true }).click();
              if (i) await applyProbe(p);
              await p.mouse.move(0, 0);
              await p.evaluate(() => {
                document.activeElement?.blur();
              });
              await p.evaluate(() => document.fonts.ready);
              await p.evaluate(
                () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
              );
              const name = [width, theme, module, i ? 'after' : 'before'].join('-') + '.png';
              shots.push(
                await p.screenshot({
                  path: path.join(process.env.TEST_OUTPUT_DIR || 'tests/results/invariance', name),
                  animations: 'disabled',
                  mask: [p.locator('canvas')],
                }),
              );
            }
            const maxChannelDifference = await views[1].evaluate(
              async (encoded) => {
                const images = await Promise.all(
                  encoded.map(async (b64) => {
                    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                    return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
                  }),
                );
                if (images[0].width !== images[1].width || images[0].height !== images[1].height)
                  return 255;
                const canvas = document.createElement('canvas');
                canvas.width = images[0].width;
                canvas.height = images[0].height;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                const pixels = images.map((img) => {
                  context.clearRect(0, 0, canvas.width, canvas.height);
                  context.drawImage(img, 0, 0);
                  img.close();
                  return context.getImageData(0, 0, canvas.width, canvas.height).data;
                });
                let max = 0;
                for (let i = 0; i < pixels[0].length; i++)
                  max = Math.max(max, Math.abs(pixels[0][i] - pixels[1][i]));
                return max;
              },
              shots.map((bytes) => bytes.toString('base64')),
            );
            const equal = maxChannelDifference === 0;
            visuals.push({ width, height, theme, module, identical: equal, maxChannelDifference });
            if (!equal) {
              const maps = [];
              for (const p of views)
                maps.push(
                  await p.evaluate(() => {
                    const out = {};
                    for (const e of document.body.querySelectorAll('*')) {
                      const b = e.getBoundingClientRect();
                      if (!b.width || !b.height || getComputedStyle(e).visibility === 'hidden')
                        continue;
                      let parts = [],
                        current = e;
                      while (current && current !== document.body) {
                        parts.unshift(
                          current.id
                            ? '#' + current.id
                            : current.tagName.toLowerCase() +
                                ':nth-child(' +
                                ([...current.parentElement.children].indexOf(current) + 1) +
                                ')',
                        );
                        if (current.id) break;
                        current = current.parentElement;
                      }
                      const s = getComputedStyle(e);
                      out[parts.join(' > ')] = Object.fromEntries(
                        [
                          'color',
                          'background-color',
                          'font-size',
                          'font-family',
                          'font-weight',
                          'display',
                          'height',
                          'min-height',
                          'max-height',
                          'width',
                          'min-width',
                          'padding-top',
                          'padding-bottom',
                          'opacity',
                          'border-color',
                          'border-radius',
                          'border-width',
                          'box-shadow',
                          'outline-color',
                          'outline-width',
                        ].map((k) => [k, s.getPropertyValue(k)]),
                      );
                    }
                    return out;
                  }),
                );
              for (const [selector, values] of Object.entries(maps[0]))
                if (maps[1][selector]) {
                  const changed = Object.keys(values).filter(
                    (k) => values[k] !== maps[1][selector][k],
                  );
                  if (changed.length)
                    styleDiffs.push({
                      width,
                      theme,
                      module,
                      selector,
                      changes: changed.map((k) => ({
                        property: k,
                        before: values[k],
                        after: maps[1][selector][k],
                      })),
                    });
                }
            }
          }
        for (const p of views) await p.close();
      }
    save('quality-invariance-results.json', { baseline, cascadeProbe, pcm, visuals, styleDiffs });
    assert(
      visuals.every((v) => v.identical),
      'Screenshots differ; inspect quality-invariance-results.json',
    );
    console.log(
      'PASS identical PCM at both rates; ' +
        visuals.length +
        ' baseline screenshot comparisons (maximum channel difference: 0/255)',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
