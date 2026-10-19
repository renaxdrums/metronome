'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const espree = require('espree');
const root = path.resolve(__dirname, '..');
const contract = require('./classic-script-globals.json');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)src="([^"?]+)(?:\?[^\"]*)?"/g)]
  .filter((match) => !match[1].includes('type="module"') && !match[2].includes('/'))
  .map((match) => match[2]);
assert.deepEqual(
  scripts,
  contract.scripts,
  'Classic-script order changed without updating its contract',
);
function names(pattern) {
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'ObjectPattern')
    return pattern.properties.flatMap((p) => names(p.value || p.argument));
  if (pattern.type === 'ArrayPattern') return pattern.elements.filter(Boolean).flatMap(names);
  if (pattern.type === 'AssignmentPattern') return names(pattern.left);
  if (pattern.type === 'RestElement') return names(pattern.argument);
  return [];
}
for (const file of scripts) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const found = ast.body.flatMap((node) =>
    node.type === 'VariableDeclaration'
      ? node.declarations.flatMap((declaration) => names(declaration.id))
      : ['FunctionDeclaration', 'ClassDeclaration'].includes(node.type)
        ? [node.id.name]
        : [],
  );
  assert.deepEqual(found, contract.bindings[file] || [], 'Shared declarations changed: ' + file);
  for (const name of found)
    assert(Object.hasOwn(contract.globals, name), 'Missing ESLint global: ' + name);
}
console.log('PASS explicit classic-script declarations and unchanged loading order');
