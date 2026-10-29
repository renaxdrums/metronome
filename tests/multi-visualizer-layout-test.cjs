const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { start, showMeasures } = require('./audio-harness.cjs');
const base = '8e7dd740ebf9e822883578ee0bdfab6ddd6eb5de';
const output = process.env.TEST_OUTPUT_DIR || path.join(__dirname, 'results');
const sources = new Map(
  ['avant-garde-theme.css', 'renax-pulse-ivory.css', 'backup-index2.css'].map((file) => [
    file,
    cp.execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }),
  ]),
);
const rounded = (n) => Math.round(n * 100) / 100;
async function geometry(p) {
  return p.evaluate(() => {
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const c = document.querySelector('#sequencerContainer'),
      e = document.querySelector('#beatDisplay'),
      s = getComputedStyle(e);
    return {
      dial: rect(c),
      wrapper: rect(c.parentElement),
      counter: rect(e),
      toolbar: rect(document.querySelector('.visu-toolbar')),
      switch: rect(document.querySelector('#scoreViewSwitch')),
      steps: [...c.querySelectorAll('.step')].map(rect),
      typography: [s.fontFamily, s.fontSize, s.fontWeight, s.letterSpacing, s.fontVariantNumeric],
      pattern: JSON.stringify(
        measures.map((m) => [m.numerator, m.denominator, m.beatSubdivisions, m.beatStates]),
      ),
    };
  });
}
async function inkOffset(p, digit) {
  await p.locator('#beatDisplay').evaluate((e, n) => {
    e.textContent = n;
  }, digit);
  const r = await p.locator('#beatDisplay').boundingBox();
  const clip = {
    x: Math.floor(r.x) - 8,
    y: Math.floor(r.y) - 8,
    width: Math.ceil(r.x + r.width) - Math.floor(r.x) + 16,
    height: Math.ceil(r.y + r.height) - Math.floor(r.y) + 16,
  };
  const png = await p.screenshot({ clip });
  return p.evaluate(
    async ({ b64, clip }) => {
      const img = await createImageBitmap(
        await (await fetch('data:image/png;base64,' + b64)).blob(),
      );
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const color = getComputedStyle(document.querySelector('#beatDisplay'))
        .color.match(/\d+/g)
        .slice(0, 3)
        .map(Number);
      let minX = Infinity,
        maxX = -1,
        minY = Infinity,
        maxY = -1;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (Math.max(...color.map((v, k) => Math.abs(v - d[i + k]))) < 8) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      const r = document.querySelector('#sequencerContainer').getBoundingClientRect();
      return [
        clip.x + (minX + maxX + 1) / 2 - r.x - r.width / 2,
        clip.y + (minY + maxY + 1) / 2 - r.y - r.height / 2,
      ];
    },
    { b64: png.toString('base64'), clip },
  );
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const h = await start(),
    reports = [];
  try {
    for (const [width, height] of [
      [1906, 608],
      [1440, 900],
      [1280, 720],
      [390, 844],
      [844, 390],
    ])
      for (const theme of ['dark', 'light', 'ivory', 'avant']) {
        const pages = [],
          measurements = [];
        for (const before of [true, false]) {
          const p = await h.browser.newPage({
            viewport: { width, height },
            reducedMotion: 'reduce',
            hasTouch: width <= 1100,
          });
          pages.push(p);
          if (before)
            await p.route('**/*.css?*', (route) => {
              const file = new URL(route.request().url()).pathname.split('/').at(-1);
              return sources.has(file)
                ? route.fulfill({ contentType: 'text/css', body: sources.get(file) })
                : route.continue();
            });
          await p.addInitScript((t) => localStorage.setItem('renax-appearance', t), theme);
          await p.goto(h.url);
          await p.waitForFunction(() => window.RENAX_MULTI);
          await p.evaluate(() => document.fonts.ready);
          await p.getByRole('tab', { name: 'Multipiste', exact: true }).click();
          const open = p.locator('.multi-preset-open').first();
          if (await open.isVisible()) await open.click();
          const visual = p.locator('#workspaceMobileViews [data-pane=visu]');
          if (await visual.isVisible()) await visual.click();
          await p.evaluate(
            () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
          );
          measurements.push(await geometry(p));
        }
        const [old, current] = measurements;
        assert.deepEqual(current.typography, old.typography, 'No font/size/weight/tracking change');
        assert.equal(current.pattern, old.pattern, 'Musical data unchanged');
        assert.deepEqual(current.toolbar, old.toolbar, 'Musical controls stay in place');
        assert.deepEqual(current.switch, old.switch, 'View controls stay in place');
        assert(Math.abs(current.dial.width - current.dial.height) < 1);
        assert(
          current.dial.width <= current.wrapper.width &&
            current.dial.height <= current.wrapper.height,
        );
        const grew =
          theme === 'ivory' && width > 1100 && current.wrapper.width >= 720 && old.dial.width < 650;
        if (grew)
          assert(current.dial.width >= old.dial.width + 45, 'Recover the spare control row');
        else
          assert.deepEqual(current.dial, old.dial, 'Other sizes/themes keep their dial geometry');
        if (width <= 1100)
          assert.deepEqual(current.counter, old.counter, 'Mobile counter unchanged');
        const overlap = (a, b) =>
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        for (const step of current.steps)
          assert(!overlap(step, current.switch), 'Beat marker must clear view controls');
        const ink = [];
        if (width === 1440 && ['ivory', 'avant'].includes(theme)) {
          for (const digit of ['1', '2', '3', '4']) {
            const offset = await inkOffset(pages[1], digit);
            ink.push({ digit, offset });
            assert(
              Math.abs(offset[0]) <= 2.5 && Math.abs(offset[1]) <= 2.5,
              'Visible glyph centered: ' + JSON.stringify(offset),
            );
          }
        }
        if (width === 1440 || width === 390) {
          await pages[1].screenshot({
            path: path.join(output, `multi-visualizer-${theme}-${width}.png`),
          });
          await pages[1].getByRole('tab', { name: 'Track', exact: true }).click();
          await showMeasures(pages[1]);
          await pages[1].getByRole('button', { name: 'Sauvegarde', exact: true }).click();
          const remember = pages[1].locator('#backupRemember');
          const aligned = await remember.evaluate((e) => {
            const a = e.getBoundingClientRect(),
              b = e.nextElementSibling.getBoundingClientRect();
            return {
              width: a.width,
              gap: b.left - a.right,
              dy: a.y + a.height / 2 - b.y - b.height / 2,
            };
          });
          assert(
            aligned.width <= 20 && Math.abs(aligned.gap - 8) <= 1 && Math.abs(aligned.dy) <= 1,
          );
          await remember.check();
          assert(await remember.isChecked());
          await pages[1].locator('label').filter({ has: remember }).click();
          assert(!(await remember.isChecked()));
          if (theme === 'avant')
            await pages[1].screenshot({ path: path.join(output, `backup-remember-${width}.png`) });
        }
        reports.push({
          viewport: [width, height],
          theme,
          before: rounded(old.dial.width),
          after: rounded(current.dial.width),
          ink,
        });
        for (const p of pages) await p.close();
      }
    fs.writeFileSync(
      path.join(output, 'multi-visualizer-layout-results.json'),
      JSON.stringify(reports, null, 2),
    );
    console.log(reports);
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
