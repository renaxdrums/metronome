'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const policy = require('../tests/ci-policy.json');
const walk = (dir) =>
  fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() && !['results', 'node_modules'].includes(e.name)
        ? walk(dir + '/' + e.name)
        : e.isFile() && /-test\.(cjs|mjs)$/.test(e.name)
          ? [dir + '/' + e.name]
          : [],
    );
const found = walk('tests'),
  covered = [...policy.nightly, ...Object.keys(policy.excluded), ...Object.keys(policy.dedicated)];
assert.equal(new Set(covered).size, covered.length, 'A test has several CI classifications');
assert.deepEqual(
  [...covered].sort(),
  found.sort(),
  'Every test must be classified, with no stale entries',
);
for (const [file, entry] of Object.entries({ ...policy.excluded, ...policy.dedicated }))
  assert(entry.reason?.trim(), 'Missing reason: ' + file);
for (const [file, entry] of Object.entries(policy.dedicated))
  assert(
    fs.readFileSync(path.join(root, entry.workflow), 'utf8').includes(entry.command),
    'Missing dedicated CI command: ' + file,
  );
const runner = fs.readFileSync(path.join(root, 'tests/run.cjs'), 'utf8');
for (const file of policy.nightly)
  assert(
    path.dirname(file) === 'tests',
    'Nightly runner only discovers the top-level tests: ' + file,
  );
for (const file of Object.keys(policy.dedicated)) {
  const selection = runner.match(/if\s*\(firebase\)\s*files\s*=\s*(\[[^;]+\])/);
  assert(
    selection && selection[1].includes(file),
    'Dedicated test missing from Firebase selection: ' + file,
  );
}
const workflow = fs.readFileSync(path.join(root, '.github/workflows/nightly-tests.yml'), 'utf8');
assert(
  workflow.includes('pnpm test') &&
    workflow.includes('RENAX_NIGHTLY:') &&
    workflow.includes('schedule:'),
  'Nightly suite must remain enabled',
);
console.log('PASS every test explicitly covered or excluded with a reason (' + found.length + ')');
