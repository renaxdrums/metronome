const assert = require('node:assert/strict');
const { start, openPlaylist, save } = require('./audio-harness.cjs');

(async () => {
  const h = await start();
  const results = [];
  try {
    const p = await h.browser.newPage();
    await p.goto(h.url);
    await p.waitForFunction(() => window.RENAX_SONGS && window.RENAX_I18N);
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
