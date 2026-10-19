const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { validate } = require('../tools/check-important-exceptions.cjs');
const { assignments, compare } = require('../tools/check-style-budget.cjs');
const root = path.resolve(__dirname, '..');
const isolated = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'renax-style-budget-'));
const probe = path.join(isolated, 'style-budget-negative-control.css');
fs.mkdirSync(path.join(isolated, 'tools'));
for (const file of ['check-style-budget.cjs', 'style-budget.json'])
  fs.copyFileSync(path.join(root, 'tools', file), path.join(isolated, 'tools', file));
fs.writeFileSync(
  path.join(isolated, 'index.html'),
  '<!doctype html><title>Negative control</title>',
);
fs.symlinkSync(path.join(root, 'node_modules'), path.join(isolated, 'node_modules'), 'dir');
assert.equal(assignments('/* e.style.width=1 */ const text="e.style.height=2";'), 0);
assert.equal(assignments('e.style.width="1px"; e["style"]["height"]="2px";'), 2);
assert.equal(assignments('e.style.setProperty("color","red");'), 0);
assert.deepEqual(
  compare({ css: { a: 1 }, javascript: {} }, { css: { a: 2 }, javascript: {} }, 'x'),
  [],
);
assert.equal(
  compare({ css: { a: 3 }, javascript: {} }, { css: { a: 2 }, javascript: {} }, 'x').length,
  1,
);
assert(!fs.existsSync(probe), 'Refuse to overwrite an existing probe');
try {
  fs.writeFileSync(probe, 'body { color: red !important; }\n');
  const result = cp.spawnSync(process.execPath, ['tools/check-style-budget.cjs'], {
    cwd: isolated,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0, 'New !important must fail CI');
  assert.match(result.stderr, /negative-control.css grew from 0 to 1/);
  fs.rmSync(probe);
  fs.writeFileSync(
    path.join(isolated, 'style-negative-control.js'),
    'document.body.style.color="red";',
  );
  const js = cp.spawnSync(process.execPath, ['tools/check-style-budget.cjs', '--update'], {
    cwd: isolated,
    encoding: 'utf8',
  });
  assert.notEqual(js.status, 0, 'Updating must not bless more style assignments');
  assert.match(js.stderr, /style-negative-control.js grew from 0 to 1/);
  const exceptions = require('../tools/important-exceptions.json');
  fs.copyFileSync(
    path.join(root, 'tools/important-exceptions.json'),
    path.join(isolated, 'tools/important-exceptions.json'),
  );
  for (const file of new Set(exceptions.flatMap((row) => [row.file, row.competitor.file])))
    fs.copyFileSync(path.join(root, file), path.join(isolated, file));
  assert.deepEqual(validate(isolated), validate(root));
  const first = exceptions[0],
    file = path.join(isolated, first.file),
    original = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, original.replace(/\/\* requis : contre [\s\S]*? \*\//, ''));
  assert.throws(() => validate(isolated), /Missing required comment|Stale exception comment/);
  fs.writeFileSync(file, original);
  exceptions[0].competitor.selector = '.intentionally-missing-theme-rule';
  fs.writeFileSync(
    path.join(isolated, 'tools/important-exceptions.json'),
    JSON.stringify(exceptions),
  );
  assert.throws(() => validate(isolated), /Missing required comment|Missing competing selector/);
} finally {
  fs.rmSync(isolated, { recursive: true, force: true });
}
console.log(
  'PASS style-budget negative control, lowering, reference growth and parsed JS assignments',
);
