const assert = require('node:assert/strict');
const path = require('node:path');
const { start, save } = require('./audio-harness.cjs');
const frames = (p) =>
  p.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
async function inspect(p, language, view) {
  await frames(p);
  return p.evaluate(
    ({ language, view }) => {
      const protectedText =
        'script,style,textarea,input,option,[contenteditable=true],[data-no-translate],.song-title,.playlist-choice-name,.playlist-heading-name,.song-open .measure-num,.song-block-header .measure-num,.console-arrival-word';
      const french =
        /(?:\b(?:mesures?|pistes?|morceaux?|réglages|entraînement|chargement|sauvegarde|connexion|nouveau|nouvelle|aucun|annuler|enregistrer|supprimer|choisir|afficher|déplacer|démarrer|arrêter|accélération|libellé|aperçu|couplet|refrain)\b|d’arrivée|d’arriv[eé]e|pr[eé]f[eé]rences)/i;
      const legacy = window.RENAX_TRANSLATIONS.legacy;
      const phrases = new Map();
      for (const [fr, en] of Object.entries(legacy)) {
        if (fr.toLowerCase() !== en.toLowerCase()) phrases.set(fr.toLocaleLowerCase('fr'), en);
      }
      const englishPhrases = new Set(Object.values(legacy));
      const leaks = [],
        overflow = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const e = node.parentElement,
          text = node.data.trim();
        if (!e || e.closest(protectedText) || !text) continue;
        const r = e.getBoundingClientRect(),
          s = getComputedStyle(e);
        if (!r.width || !r.height || s.visibility === 'hidden' || s.display === 'none') continue;
        if (['es', 'de', 'it'].includes(language) && englishPhrases.has(text)) {
          const localized = window.RENAX_LOCALES[language]?.[text];
          if (
            localized &&
            localized.toLocaleLowerCase(language) !== text.toLocaleLowerCase(language)
          )
            leaks.push({ view, text, tag: e.tagName, reason: 'English fallback' });
        }
        const key = phrases.get(text.toLocaleLowerCase('fr'));
        const expected = language === 'en' ? key : window.RENAX_LOCALES[language]?.[key];
        if (
          language !== 'fr' &&
          ((key &&
            expected &&
            expected.toLocaleLowerCase(language) !== text.toLocaleLowerCase(language)) ||
            (!key && french.test(text)))
        )
          leaks.push({ view, text, tag: e.tagName });
      }
      for (const e of document.querySelectorAll('button,.btn,summary,.numbox-button')) {
        if (e.closest('.console-arrival-replica')) continue;
        const r = e.getBoundingClientRect(),
          s = getComputedStyle(e);
        if (
          !r.width ||
          !r.height ||
          s.visibility === 'hidden' ||
          s.display === 'none' ||
          !e.textContent.trim()
        )
          continue;
        // scrollWidth also counts an absolutely positioned decorative chevron.
        // Measure the actual glyphs: long or clipped labels must still fail.
        const labels = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        let label,
          outside = false;
        while ((label = labels.nextNode())) {
          if (!label.data.trim() || label.parentElement.closest('svg,[aria-hidden=true]')) continue;
          const range = document.createRange();
          range.selectNodeContents(label);
          for (const box of range.getClientRects())
            if (
              box.width &&
              box.height &&
              (box.left < r.left - 2 ||
                box.right > r.right + 2 ||
                box.top < r.top - 2 ||
                box.bottom > r.bottom + 2)
            )
              outside = true;
        }
        if (outside)
          overflow.push({
            view,
            text: e.textContent.trim().slice(0, 120),
            id: e.id,
            client: e.clientWidth,
            scroll: e.scrollWidth,
          });
      }
      for (const e of document.querySelectorAll('[data-i18n-key]')) {
        if (!e.getBoundingClientRect().width) continue;
        const expected = window.RENAX_I18N.t(e.dataset.i18nKey);
        if (e.textContent !== expected)
          leaks.push({
            view,
            text: e.textContent,
            key: e.dataset.i18nKey,
            reason: 'Keyed label mismatch',
          });
      }
      return { language, view, leaks, overflow };
    },
    { language, view },
  );
}
(async () => {
  const h = await start(),
    rows = [],
    errors = [];
  try {
    for (const [width, height] of process.env.LANGUAGE_SMOKE === '1'
      ? [[1440, 1000]]
      : [
          [1440, 1000],
          [834, 1112],
          [390, 844],
        ]) {
      const p = await h.browser.newPage({
        viewport: { width, height },
        hasTouch: width < 1100,
        reducedMotion: 'reduce',
      });
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(h.url);
      await p.waitForFunction(() => window.RENAX_I18N && window.RENAX_SONGS);
      await p.evaluate(() => document.fonts.ready);
      await p.addStyleTag({
        content:
          '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
      });
      const complete = await p.evaluate(() => {
        const expected = [
          ...new Set([
            ...Object.values(RENAX_TRANSLATIONS.legacy),
            ...Object.values(RENAX_TRANSLATIONS.messages.en),
          ]),
        ];
        return Object.fromEntries(
          Object.entries(RENAX_LOCALES).map(([code, dictionary]) => [
            code,
            expected.filter((key) => !dictionary[key]),
          ]),
        );
      });
      assert.deepEqual(complete, { es: [], de: [], it: [] }, 'Incomplete offline catalogs');
      for (const theme of process.env.LANGUAGE_SMOKE === '1'
        ? ['dark']
        : ['dark', 'light', 'ivory']) {
        await p.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          document
            .querySelectorAll('[data-appearance]')
            .forEach((button) =>
              button.setAttribute('aria-pressed', String(button.dataset.appearance === theme)),
            );
        }, theme);
        for (const language of ['fr', 'en', 'es', 'de', 'it']) {
          await p.evaluate((language) => RENAX_I18N.setLanguage(language), language);
          await frames(p);
          assert.equal(await p.evaluate(() => document.documentElement.lang), language);
          for (const tab of [0, 1, 2, 3, 4, 5]) {
            await p.locator('#workspaceNav [role=tab]').nth(tab).click();
            await frames(p);
            // Mobile visual/measure panes share the same navigation contracts.
            const row = await inspect(p, language, 'module-' + tab);
            row.width = width;
            row.theme = theme;
            rows.push(row);
          }
          if (width === 1440 && theme === 'dark' && language === 'es') {
            await p.evaluate(() => {
              const button = document.createElement('button');
              button.id = 'translation-negative-control';
              button.style.cssText =
                'position:fixed;top:0;left:0;width:24px;height:30px;white-space:nowrap;z-index:99999';
              button.textContent = 'Sauvegarde locale';
              document.body.append(button);
            });
            // Prevent the observer from translating the injected French probe.
            await p.evaluate(() => {
              const e = document.getElementById('translation-negative-control');
              e.setAttribute('data-no-translate', '');
            });
            const probe = await inspect(p, language, 'negative-control');
            assert(
              probe.overflow.some((x) => x.id === 'translation-negative-control'),
              'Long labels must be detected',
            );
            await p.locator('#translation-negative-control').evaluate((e) => e.remove());
          }
          await p.locator('#index2SettingsBtn').click();
          rows.push({ ...(await inspect(p, language, 'preferences')), width, theme });
          if (process.env.LANGUAGE_SMOKE !== '1')
            await p.screenshot({
              path: path.join(
                process.env.TEST_OUTPUT_DIR || 'tests/results',
                'languages-' + width + '-' + theme + '-' + language + '.png',
              ),
              animations: 'disabled',
            });
          await p.locator('#index2SettingsClose').click();
          await p.locator('#directAccountBtn').click();
          rows.push({ ...(await inspect(p, language, 'account')), width, theme });
          await p
            .locator('#directAccountDialog')
            .getByRole('button')
            .filter({ has: p.locator('svg') })
            .first()
            .click();
        }
      }
      await p.evaluate(() => RENAX_I18N.setLanguage('it'));
      await p.reload();
      await p.waitForFunction(() => RENAX_I18N.language === 'it');
      assert.equal(
        await p.evaluate(() => localStorage.getItem('renax.interfaceLanguage.v1')),
        'it',
      );
      await p.close();
    }
    save('multilingual-interface-results.json', { rows, errors });
    const leaks = rows.flatMap((r) =>
      r.leaks.map((x) => ({ ...x, language: r.language, width: r.width, theme: r.theme })),
    );
    const overflow = rows.flatMap((r) =>
      r.overflow.map((x) => ({ ...x, language: r.language, width: r.width, theme: r.theme })),
    );
    assert.deepEqual(errors, [], 'Browser exceptions');
    assert.deepEqual(leaks, [], 'French remains in translated UI');
    assert.deepEqual(overflow, [], 'Button text overflow');
    console.log(
      'PASS five offline languages, persistence and ' +
        rows.length +
        ' module/preferences/account layout checks',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
