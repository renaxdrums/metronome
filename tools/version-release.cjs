/* Version statically identifiable local module/worker imports after minification. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const parser = require('espree');
const esbuild = require('esbuild');

module.exports = function versionRelease(directory) {
  const root = path.resolve(directory);
  const hashes = new Map();
  const visiting = new Set();
  const controls = new Set(['service-worker.js', 'offline-manifest.json']);
  const normalized = (file) =>
    fs
      .readFileSync(file, 'utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n');
  const digest = (file) =>
    crypto
      .createHash('sha256')
      .update(
        /\.(?:js|mjs|css|json|webmanifest|svg|html)$/.test(file)
          ? normalized(file)
          : fs.readFileSync(file),
      )
      .digest('hex')
      .slice(0, 12);

  function assetURL(value, owner) {
    if (
      /^(?:[a-z][\w+.-]*:|\/|#)/i.test(value) ||
      !/\.(?:js|mjs|css|json|wasm|svg|png|woff2|webmanifest)(?:\?[^#]*)?(?:#.*)?$/.test(value)
    )
      return value;
    const parsed = new URL(value, 'https://release.invalid/');
    const relative = value.split(/[?#]/)[0];
    const file = path.resolve(path.dirname(owner), relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
      return value;
    if (controls.has(path.relative(root, file))) return value;
    parsed.searchParams.set('v', processAsset(file));
    return relative + '?' + parsed.searchParams.toString() + parsed.hash;
  }

  function rewriteJS(source, owner) {
    const tree = parser.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    const edits = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Literal' && typeof node.value === 'string') {
        const value = assetURL(node.value, owner);
        if (value !== node.value)
          edits.push({ start: node.start, end: node.end, value: JSON.stringify(value) });
      }
      for (const child of Object.values(node)) {
        if (Array.isArray(child)) child.forEach(visit);
        else if (child && typeof child === 'object') visit(child);
      }
    }
    visit(tree);
    for (const edit of edits.sort((a, b) => b.start - a.start))
      source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
    return source;
  }

  function processAsset(file) {
    if (hashes.has(file)) return hashes.get(file);
    if (visiting.has(file))
      throw Error('Circular content-version dependency: ' + path.relative(root, file));
    visiting.add(file);
    // Third-party bundles are immutable inputs. Do not rewrite their internal literals.
    if (/\.(?:js|mjs)$/.test(file) && !file.startsWith(path.join(root, 'vendor') + path.sep)) {
      const rewritten = rewriteJS(normalized(file), file);
      const transformed = esbuild.transformSync(rewritten, {
        loader: 'js',
        minifyWhitespace: true,
        minifyIdentifiers: false,
        minifySyntax: false,
        legalComments: 'inline',
        charset: 'utf8',
        sourcefile: path.basename(file) + '.source',
        sourcemap: 'external',
        sourcesContent: true,
      });
      fs.writeFileSync(
        file,
        transformed.code + '//# sourceMappingURL=' + path.basename(file) + '.map\n',
      );
      fs.writeFileSync(file + '.map', transformed.map);
    }
    if (file.endsWith('.css')) {
      const rewritten = normalized(file).replace(
        /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi,
        (whole, a, b, c) => {
          const value = a ?? b ?? c,
            updated = assetURL(value, file);
          return updated === value ? whole : 'url(' + JSON.stringify(updated) + ')';
        },
      );
      const transformed = esbuild.transformSync(rewritten, {
        loader: 'css',
        minifyWhitespace: true,
        minifySyntax: false,
        sourcefile: path.basename(file) + '.source',
        sourcemap: 'external',
        sourcesContent: true,
      });
      fs.writeFileSync(
        file,
        transformed.code + '/*# sourceMappingURL=' + path.basename(file) + '.map */\n',
      );
      fs.writeFileSync(file + '.map', transformed.map);
    }
    visiting.delete(file);
    const hash = digest(file);
    hashes.set(file, hash);
    return hash;
  }

  function walk(folder) {
    return fs
      .readdirSync(folder, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)],
      );
  }
  const files = walk(root);
  for (const file of files)
    if (/\.(?:js|mjs)$/.test(file) && !controls.has(path.relative(root, file))) processAsset(file);
  for (const file of files.filter((name) => name.endsWith('.html'))) {
    let html = normalized(file);
    html = html.replace(
      /(\b(?:src|href)=["'])([^"']+)(["'])/g,
      (_whole, before, value, after) => before + assetURL(value, file) + after,
    );
    html = html.replace(
      /(<script\b([^>]*)>)([\s\S]*?)(<\/script>)/gi,
      (whole, opening, attrs, code, closing) => {
        if (/\bsrc=|application\/ld\+json/.test(attrs) || !code.trim()) return whole;
        return opening + rewriteJS(code, file) + closing;
      },
    );
    fs.writeFileSync(file, html);
  }
  return [...hashes].map(([file, hash]) => ({
    path: path.relative(root, file).replaceAll('\\', '/'),
    hash,
  }));
};
