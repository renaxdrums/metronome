const assert = require('node:assert/strict');
const { start, newTrack, openPlaylist, showMeasures } = require('./audio-harness.cjs');
(async () => {
  const h = await start();
  try {
    for (const width of [1440, 390, 320]) {
      const p = await h.browser.newPage({ viewport: { width, height: 900 } }),
        errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.addInitScript(() => (Element.prototype.requestFullscreen = undefined));
      await p.goto(h.url);
      await p.waitForFunction(() => window.RENAX_BACKUP);
      await newTrack(p);
      const title = p.getByLabel('Titre du track', { exact: true });
      await title.fill('À supprimer');
      await title.press('Tab');
      const menu = async () => {
        await p.locator('[data-section-id] .song-more[aria-haspopup=menu]').first().click();
        const remove = p
          .locator('[data-section-id] .song-more-menu')
          .getByRole('menuitem', { name: 'Supprimer', exact: true });
        assert(await remove.isEnabled(), 'the last block must be deletable');
        await remove.click();
      };
      await menu();
      assert(await p.locator('.song-confirmation').isVisible());
      await p
        .locator('.song-confirmation')
        .getByRole('button', { name: 'Annuler', exact: true })
        .click();
      assert.equal(await p.locator('[data-section-id]').count(), 1);
      assert.equal(await p.evaluate(() => RENAX_SONGS.library.profiles[0].songs.length), 1);
      await menu();
      await p
        .locator('.song-confirmation')
        .getByRole('button', { name: 'Supprimer', exact: true })
        .click();
      assert.equal(await p.evaluate(() => RENAX_SONGS.library.profiles[0].songs.length), 0);
      assert.equal(await p.evaluate(() => RENAX_SONGS.navigation.view), 'playlist');
      assert.equal(await p.locator('.song-playlist-card').count(), 0);
      assert.equal(await p.locator('#playBtn').isVisible(), false);
      await p.reload();
      await p.waitForFunction(() => window.RENAX_BACKUP);
      await openPlaylist(p);
      assert.equal(await p.locator('.song-playlist-card').count(), 0);
      await newTrack(p);
      const kept = await p.evaluate(() => RENAX_SONGS.library.profiles[0].songs[0].id);
      await p.getByRole('button', { name: '+ Ajouter une section', exact: true }).click();
      await menu();
      assert.equal(await p.locator('.song-confirmation').count(), 0);
      assert.equal(await p.locator('[data-section-id]').count(), 1);
      assert.equal(await p.evaluate(() => RENAX_SONGS.library.profiles[0].songs[0].id), kept);
      // A concurrent new block while the confirmation is open must preserve the track.
      await menu();
      await p.evaluate(() => {
        const lib = JSON.parse(JSON.stringify(RENAX_SONGS.library)),
          s = lib.profiles[0].songs[0],
          copy = JSON.parse(JSON.stringify(s.sections[0]));
        copy.id = crypto.randomUUID();
        s.sections.push(copy);
        RENAX_SONGS.replaceLibrary(lib, true);
        RENAX_STORAGE.write(lib);
      });
      await p
        .locator('.song-confirmation')
        .getByRole('button', { name: 'Supprimer', exact: true })
        .click();
      assert.equal(await p.locator('[data-section-id]').count(), 2);
      await menu();
      assert.equal(await p.locator('[data-section-id]').count(), 1);
      await p.locator('#songPane .song-back').click();
      await newTrack(p);
      const victim = await p.evaluate(() => RENAX_SONGS.navigation.song);
      assert.notEqual(victim, kept);
      await p.getByRole('button', { name: 'Ajouter un décompte', exact: true }).click();
      await p.evaluate(() => startMetronome());
      await p.waitForFunction(() => isPlaying);
      await showMeasures(p);
      await menu();
      await p
        .locator('.song-confirmation')
        .getByRole('button', { name: 'Supprimer', exact: true })
        .click();
      assert.equal(await p.evaluate(() => isPlaying), false);
      assert.deepEqual(
        await p.evaluate(() => RENAX_SONGS.library.profiles[0].songs.map((s) => s.id)),
        [kept],
      );
      assert.equal(await p.locator('.song-playlist-card').count(), 1);
      await p.reload();
      await p.waitForFunction(() => window.RENAX_BACKUP);
      await openPlaylist(p);
      assert.deepEqual(
        await p.evaluate(() => RENAX_SONGS.library.profiles[0].songs.map((s) => s.id)),
        [kept],
      );
      assert.deepEqual(errors, []);
      console.log(
        width +
          ': last block deletes its track, cancel/reload, other blocks/tracks, concurrent edit and playback stop PASS',
      );
      await p.close();
    }
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
