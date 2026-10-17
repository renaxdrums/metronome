const assert = require('node:assert/strict');
const { start, save } = require('./audio-harness.cjs');
(async () => {
  const h = await start();
  try {
    const p = await h.browser.newPage();
    const errors = [];
    p.on('pageerror', (error) => errors.push(error.message));
    await p.addInitScript(() => localStorage.setItem('renax.interfaceLanguage.v1', 'en'));
    await p.route('**/interface-translations.js*', (route) => route.abort());
    await p.goto(h.url);
    await p.waitForFunction(() => window.RENAX_I18N && window.RENAX_SONGS);
    assert.equal(await p.evaluate(() => document.documentElement.lang), 'fr');
    assert.equal(await p.evaluate(() => localStorage.getItem('renax.interfaceLanguage.v1')), 'en');
    assert.equal(await p.locator('[data-language=en]').isDisabled(), true);
    await p.locator('#index2SettingsBtn').click();
    await p
      .getByText('Traductions indisponibles. Interface conservée en français.', { exact: true })
      .waitFor();
    await p.locator('#index2SettingsClose').click();
    await p.unroute('**/interface-translations.js*');
    await p.reload();
    await p.waitForFunction(() => window.RENAX_I18N?.language === 'en');
    assert.equal(await p.evaluate(() => RENAX_I18N.t('diagnostics.export')), 'Export diagnostics');
    await p.waitForFunction(() =>
      document.getElementById('directAccountBtn')?.title.startsWith('Sign in and account · '),
    );
    await p.evaluate(() => RENAX_I18N.setLanguage('fr'));
    assert.equal(
      await p.evaluate(() => RENAX_I18N.t('diagnostics.export')),
      'Exporter le diagnostic',
    );
    assert.deepEqual(errors, []);
    await p.waitForFunction(() =>
      document.getElementById('directAccountBtn')?.title.startsWith('Connexion et compte · '),
    );
    save('language-fallback-results.json', {
      missingData: 'French usable',
      savedPreference: 'preserved',
      restoredData: 'English recovered',
      errors,
    });
    console.log('PASS missing translation resource, preserved preference and FR/EN recovery');
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
