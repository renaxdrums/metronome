const assert = require('node:assert/strict');
const { start, openPlaylist, save } = require('./audio-harness.cjs');

(async () => {
  const h = await start();
  const results = [];
  try {
    const p = await h.browser.newPage();
    await p.goto(h.url);
    await p.waitForFunction(() => window.RENAX_SONGS && window.RENAX_I18N);
    const boundaries = await p.evaluate(() => {
      const original = JSON.stringify(RENAX_SONGS.library);
      const sample = () => JSON.parse(original);
      const bad = [null];
      const deep = sample();
      let cursor = deep;
      for (let i = 0; i < 34; i++) {
        cursor.extra = {};
        cursor = cursor.extra;
      }
      bad.push(deep);
      const polluted = sample();
      Object.defineProperty(polluted, '__proto__', { value: {}, enumerable: true });
      bad.push(polluted);
      const long = sample();
      long.profiles[0].name = 'x'.repeat(257);
      bad.push(long);
      const crowded = sample();
      crowded.profiles = Array.from({ length: 129 }, (_, i) => ({
        id: 'p' + i,
        name: 'p',
        songs: [],
      }));
      bad.push(crowded);
      const huge = sample();
      huge.extra = Array(200001).fill(0);
      bad.push(huge);
      const refused = bad.map((value) => {
        try {
          RENAX_SONGS.validateLibrary(value);
          return false;
        } catch {
          return true;
        }
      });
      return { refused, unchanged: JSON.stringify(RENAX_SONGS.library) === original };
    });
    assert.deepEqual(boundaries, {
      refused: [true, true, true, true, true, true],
      unchanged: true,
    });
    for (const name of [
      '<img src=x onerror="window.__xss=1">',
      '<svg onload="window.__xss=2">',
      '<script>window.__xss=3</script>',
      'Été 🎵 < & " \' — Morceau complet',
    ]) {
      await p.evaluate((name) => {
        window.__xss = 0;
        RENAX_SONGS.replaceLibrary({
          version: 1,
          activeProfile: 'p',
          profiles: [
            {
              id: 'p',
              name,
              songs: [
                {
                  id: 's',
                  name,
                  sections: [
                    {
                      id: 'b',
                      label: name,
                      count: 1,
                      measure: {
                        numerator: 4,
                        denominator: 4,
                        tempo: 120,
                        beatSubdivisions: [1, 1, 1, 1],
                        beatStates: [[1], [1], [1], [1]],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      }, name);
      await openPlaylist(p);
      assert.equal(await p.locator('.song-open .measure-num').textContent(), name);
      await p.locator('.song-playlist-card').dblclick();
      await p.getByLabel('Titre du track', { exact: true }).waitFor();
      assert.equal(await p.getByLabel('Titre du track', { exact: true }).inputValue(), name);
      for (const language of ['en', 'fr']) {
        await p.evaluate((language) => RENAX_I18N.setLanguage(language), language);
        await p.waitForTimeout(30);
        assert.equal(await p.evaluate(() => RENAX_SONGS.library.profiles[0].songs[0].name), name);
        assert.equal(await p.evaluate(() => window.__xss), 0);
        assert.equal(await p.locator('[onerror],[onload]').count(), 0);
      }
      results.push({ name, literal: true, executableNodes: 0, languages: ['fr', 'en'] });
    }
    save('security-text-results.json', results);
    console.log(
      'PASS literal untrusted names, Unicode and language switches; no injected executable nodes',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
