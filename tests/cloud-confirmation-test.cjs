const assert = require('node:assert/strict');
const fs = require('node:fs');
const AxeBuilder = require('@axe-core/playwright').default;
const { start, save } = require('./audio-harness.cjs');
(async () => {
  const h = await start();
  try {
    const context = await h.browser.newContext();
    const p = await context.newPage();
    p.on('dialog', () => {
      throw Error('Native dialog must not be used');
    });
    await p.goto(h.url);
    await p.waitForFunction(() => window.RENAX_DIALOGS && window.RENAX_I18N);
    const results = [];
    for (const width of [390, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      for (const language of ['fr', 'en', 'es', 'de', 'it']) {
        await p.evaluate((language) => RENAX_I18N.setLanguage(language), language);
        const trigger = p.locator('#directAccountBtn');
        await trigger.focus();
        await p.evaluate(() => {
          window.__confirmResult = null;
          RENAX_DIALOGS.confirm({
            messageKey: 'cloud.importGuest',
            parameters: { count: 3, email: 'test@example.test' },
          }).then((value) => {
            window.__confirmResult = value;
          });
        });
        const dialog = p.locator('#renaxCloudConfirm');
        await dialog.waitFor({ state: 'visible' });
        assert((await dialog.textContent()).includes('test@example.test'));
        assert(!(await dialog.textContent()).includes('{count}'));
        assert.equal(
          await p.evaluate(
            () => document.activeElement === document.querySelector('#renaxCloudConfirm button'),
          ),
          true,
        );
        await p.keyboard.press('Shift+Tab');
        assert.equal(
          await p.evaluate(
            () =>
              document.activeElement ===
              document.querySelector('#renaxCloudConfirm button:last-child'),
          ),
          true,
        );
        await p.keyboard.press('Tab');
        assert.equal(
          await p.evaluate(
            () => document.activeElement === document.querySelector('#renaxCloudConfirm button'),
          ),
          true,
        );
        const violations = (
          await new AxeBuilder({ page: p }).include('#renaxCloudConfirm').analyze()
        ).violations;
        assert.deepEqual(violations, []);
        await p.keyboard.press('Escape');
        await p.waitForFunction(
          () =>
            window.__confirmResult === false && document.activeElement.id === 'directAccountBtn',
        );
        await p.evaluate(() => {
          window.__confirmResult = null;
          RENAX_DIALOGS.confirm({
            messageKey: 'cloud.importDuplicate',
            parameters: { name: '<img src=x onerror=alert(1)> & "Buds"' },
          }).then((value) => {
            window.__confirmResult = value;
          });
        });
        await dialog.waitFor({ state: 'visible' });
        assert.equal(await dialog.locator('img').count(), 0);
        assert((await dialog.textContent()).includes('<img src=x'));
        await p.keyboard.press('Tab');
        await p.keyboard.press('Enter');
        await p.waitForFunction(
          () => window.__confirmResult === true && document.activeElement.id === 'directAccountBtn',
        );
        results.push({ width, language, keyboard: true, focusRestored: true, violations: 0 });
      }
    }
    await p.evaluate(() => {
      const original = document.createElement('button');
      original.id = 'replacementTrigger';
      original.textContent = 'Fixture';
      document.body.append(original);
      original.focus();
      RENAX_DIALOGS.confirm({
        messageKey: 'cloud.importDuplicate',
        parameters: { name: 'Fixture' },
      });
      const replacement = original.cloneNode(true);
      original.replaceWith(replacement);
    });
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => document.activeElement.id === 'replacementTrigger');
    await p.locator('#replacementTrigger').evaluate((button) => button.remove());
    const source = fs.readFileSync(require.resolve('../cloud-backup.js'), 'utf8');
    assert.equal((source.match(/await RENAX_DIALOGS\.confirm/g) || []).length, 2);
    assert(!/\bconfirm\(/.test(source.replace(/RENAX_DIALOGS\.confirm\(/g, '')));
    save('cloud-confirmation-results.json', results);
    console.log(
      'PASS cloud confirmations: keyboard, Escape, focus, five languages, untrusted names and Axe',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
