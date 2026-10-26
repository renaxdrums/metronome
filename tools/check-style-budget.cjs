/* Ratchet owned CSS importance and direct JavaScript style assignments. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const espree = require('espree');
const root = path.resolve(__dirname, '..');
const reference = path.join(__dirname, 'style-budget.json');
function assignments(source) {
  const tree = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  let count = 0;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') {
      const left = node.left || node.argument;
      if (left?.type === 'MemberExpression' && left.object?.type === 'MemberExpression') {
        const member = left.object;
        if (
          (!member.computed && member.property.name === 'style') ||
          (member.computed && member.property.value === 'style')
        )
          count++;
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(tree);
  return count;
}
function measure() {
  const result = { css: {}, javascript: {} };
  function walk(folder) {
    for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
      const name = folder ? folder + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        if (name === 'prototypes' || name.startsWith('prototypes/')) walk(name);
      } else if (/\.(css|js|mjs)$/.test(name)) {
        const source = fs.readFileSync(path.join(root, name), 'utf8');
        if (name.endsWith('.css'))
          result.css[name] = (
            source.replace(/\/\*[\s\S]*?\*\//g, '').match(/!\s*important\b/gi) || []
          ).length;
        else result.javascript[name] = assignments(source);
      }
    }
  }
  walk('');
  return result;
}
function compare(current, budget, label) {
  const errors = [];
  for (const category of ['css', 'javascript'])
    for (const [name, value] of Object.entries(current[category])) {
      const ceiling = budget[category][name] ?? 0;
      if (value > ceiling)
        errors.push(label + ': ' + name + ' grew from ' + ceiling + ' to ' + value);
    }
  return errors;
}
function main() {
  const current = measure();
  if (!fs.existsSync(reference)) {
    if (!process.argv.includes('--update')) throw Error('Missing style budget');
    fs.writeFileSync(reference, JSON.stringify(current, null, 2) + '\n');
  }
  const budget = JSON.parse(fs.readFileSync(reference, 'utf8'));
  const errors = compare(current, budget, 'Source');
  const base = process.env.STYLE_BUDGET_BASE;
  if (base) {
    const old = cp.spawnSync('git', ['show', base + ':tools/style-budget.json'], {
      cwd: root,
      encoding: 'utf8',
    });
    if (old.status === 0) {
      const previous = JSON.parse(old.stdout);
      /* A new opt-in appearance may declare its initial budget only once.
         All legacy sheets and scripts must keep their existing ratchets. */
      const firstRegistration = {
        css: new Set(['avant-garde-theme.css']),
        javascript: new Set(['avant-garde-motion.js']),
      };
      const previouslyTracked = { css: {}, javascript: {} };
      for (const category of ['css', 'javascript']) {
        for (const [name, value] of Object.entries(budget[category])) {
          const isNewFile = !Object.hasOwn(previous[category], name);
          if (isNewFile && firstRegistration[category].has(name)) continue;
          previouslyTracked[category][name] = value;
        }
      }
      errors.push(...compare(previouslyTracked, previous, 'Reference'));
    }
    else if (
      cp.spawnSync('git', ['cat-file', '-e', base + '^{commit}'], { cwd: root }).status !== 0
    )
      throw Error('Cannot validate style budget against missing base commit ' + base);
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  if (/<style\b|!\s*important\b/i.test(html))
    errors.push('index.html must contain neither style blocks nor !important');
  if (errors.length) throw Error(errors.join('\n'));
  require('./check-important-exceptions.cjs').validate(root);
  if (process.argv.includes('--update'))
    fs.writeFileSync(reference, JSON.stringify(current, null, 2) + '\n');
  console.log(
    'PASS style budget: ' +
      Object.values(current.css).reduce((a, b) => a + b, 0) +
      ' !important; ' +
      Object.values(current.javascript).reduce((a, b) => a + b, 0) +
      ' direct style assignments',
  );
}
module.exports = { assignments, measure, compare };
if (require.main === module) main();
