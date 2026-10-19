const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  cp = require('node:child_process'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'renax-guard-'));
const write = (name, text) => {
  const file = path.join(sandbox, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
try {
  const policy = require('./ci-policy.json');
  write('tests/ci-policy.json', JSON.stringify(policy));
  for (const file of [
    ...policy.nightly,
    ...Object.keys(policy.excluded),
    ...Object.keys(policy.dedicated),
  ])
    write(file, '// isolated inventory fixture\n');
  for (const name of [
    '.github/workflows/audio-cc0-validation.yml',
    '.github/workflows/nightly-tests.yml',
    'tools/check-test-coverage.cjs',
    'tests/run.cjs',
  ])
    write(name, fs.readFileSync(path.join(root, name), 'utf8'));
  const probe = (name, source, checker) => {
    const file = path.join(sandbox, name);
    assert(!fs.existsSync(file));
    try {
      write(name, source);
      const result = cp.spawnSync(process.execPath, [path.join(sandbox, checker)], {
        cwd: sandbox,
        encoding: 'utf8',
        env: { ...process.env, NODE_PATH: path.join(root, 'node_modules') },
      });
      assert.notEqual(result.status, 0, 'Guard accepted ' + name);
    } finally {
      fs.rmSync(file, { force: true });
    }
  };
  const clean = cp.spawnSync(
    process.execPath,
    [path.join(sandbox, 'tools/check-test-coverage.cjs')],
    { cwd: sandbox, encoding: 'utf8' },
  );
  assert.equal(clean.status, 0, clean.stderr);
  probe(
    'tests/coverage-probe-test.cjs',
    '// intentionally unclassified\n',
    'tools/check-test-coverage.cjs',
  );
  console.log('PASS isolated inventory rejects forgotten tests');
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
