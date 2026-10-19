/* Every retained exception must name a real declaration in a frozen theme. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const small = ['accessibility.css', 'app-base.css', 'training-modes.css', 'navigation-index.css'];
const themes = [
  'renax-pulse-ivory.css',
  'appearance-theme.css',
  'ivory-theme.css',
  'console-theme.css',
];
const clean = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const normalize = (text) => text.replace(/\s+/g, ' ').trim();
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function validate(root = path.resolve(__dirname, '..')) {
  const rows = JSON.parse(
    fs.readFileSync(path.join(root, 'tools/important-exceptions.json'), 'utf8'),
  );
  const counts = Object.fromEntries(small.map((file) => [file, 0]));
  for (const row of rows) {
    assert(small.includes(row.file), 'Unexpected small stylesheet: ' + row.file);
    assert(themes.includes(row.competitor.file), 'Exception must name a frozen theme');
    const source = fs.readFileSync(path.join(root, row.file), 'utf8');
    assert(source.includes(row.selector), 'Missing exception selector: ' + row.selector);
    const comment =
      '/* requis : contre ' +
      row.competitor.file +
      ':' +
      normalize(row.competitor.selector) +
      ' */';
    assert(
      new RegExp(
        escape(comment) + '\\s*' + escape(row.property) + '\\s*:[^;{}]*!\\s*important\\b',
        'i',
      ).test(source),
      'Missing required comment: ' + row.file + ':' + row.property,
    );
    const theme = normalize(clean(fs.readFileSync(path.join(root, row.competitor.file), 'utf8')));
    const at = theme.indexOf(normalize(row.competitor.selector));
    assert(
      at >= 0,
      'Missing competing selector: ' + row.competitor.file + ':' + row.competitor.selector,
    );
    const body = theme.slice(theme.indexOf('{', at) + 1, theme.indexOf('}', at));
    assert(
      new RegExp('(?:^|;)\\s*' + escape(row.competitor.property) + '\\s*:', 'i').test(body),
      'Missing competing property: ' + row.competitor.property,
    );
    counts[row.file]++;
  }
  for (const file of small) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(
      (clean(source).match(/!\s*important\b/gi) || []).length,
      counts[file],
      'Unlisted !important: ' + file,
    );
    assert.equal(
      (source.match(/\/\* requis : contre /g) || []).length,
      counts[file],
      'Stale exception comment: ' + file,
    );
  }
  return counts;
}
module.exports = { validate };
if (require.main === module) console.log('PASS documented CSS exceptions', validate());
