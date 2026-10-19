'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ESLint } = require('eslint');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
(async () => {
  const eslint = new ESLint({ cwd: root });
  const lint = async (source, filePath = 'tests/lint-contract-fixture.cjs') =>
    (await eslint.lintText(source, { filePath }))[0].messages;
  const bad = await lint(
    'function probe(){ const unusedLocal = 1; return misspelledRenaxGlobal; } probe();',
  );
  assert(bad.some((message) => message.ruleId === 'no-undef'));
  assert(bad.some((message) => message.ruleId === 'no-unused-vars'));
  assert((await lint('if (Date.now()) {}')).some((message) => message.ruleId === 'no-empty'));
  assert.deepEqual(await lint('try { throw new Error("fixture"); } catch {}'), []);
  assert.deepEqual(
    await lint('/* exported audioCtx */ let audioCtx; audioCtx = null;', 'metronome-audio.js'),
    [],
  );
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.equal(parsed.options.strict, true);
  assert.equal(parsed.fileNames.filter((file) => file.endsWith('.js')).length, 7);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'renax-types-'));
  const probe = path.join(directory, 'contract.ts');
  try {
    const check = (version) => {
      fs.writeFileSync(
        probe,
        'window.RENAX_STORAGE.write({ version: ' + version + ', profiles: [] });',
      );
      return ts.getPreEmitDiagnostics(
        ts.createProgram([...parsed.fileNames, probe], parsed.options),
      );
    };
    assert.equal(check(1).length, 0, 'Valid typed storage contract must compile');
    const errors = check(2);
    assert(
      errors.some((error) => error.file?.fileName === probe && error.code === 2322),
      'Invalid library version must be rejected',
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log(
    'PASS lint rejects undefined/unused/empty code; seven strict modules reject an invalid global API payload',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
