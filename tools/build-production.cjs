/* Build a separate static release. Never rewrite readable application sources. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { minify } = require('html-minifier-terser');
const root = path.resolve(__dirname, '..');
const parent = path.join(root, 'dist');
const output = path.join(parent, 'site');

/** Only remove an output directory previously created by this builder. */
function prepareOutput() {
  fs.mkdirSync(parent, { recursive: true });
  if (fs.lstatSync(parent).isSymbolicLink()) throw Error('Build parent must not be a symlink.');
  if (fs.existsSync(output)) {
    if (
      fs.lstatSync(output).isSymbolicLink() ||
      !fs.realpathSync(output).startsWith(fs.realpathSync(parent) + path.sep)
    )
      throw Error('Unsafe build output.');
    if (!fs.existsSync(path.join(output, '.renax-built')))
      throw Error('Refusing to replace an unmanaged directory.');
    fs.rmSync(output, { recursive: true });
  }
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, '.renax-built'), 'Generated static release\n');
}

(async () => {
  prepareOutput();
  for (const folder of ['assets', 'vendor'])
    fs.cpSync(path.join(root, folder), path.join(output, folder), { recursive: true });
  // The guide imports these runtime modules dynamically; they are not entry-page links.
  fs.mkdirSync(path.join(output, 'prototypes'), { recursive: true });
  fs.cpSync(path.join(root, 'prototypes/amorce'), path.join(output, 'prototypes/amorce'), {
    recursive: true,
    filter: (file) => fs.statSync(file).isDirectory() || !file.endsWith('-results.json'),
  });
  const report = [];
  for (const name of fs.readdirSync(root)) {
    if (!/\.(?:html|css|js|mjs|webmanifest|ico|txt)$/.test(name) || name === 'eslint.config.mjs')
      continue;
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    let result = source;
    if (name.endsWith('.html')) {
      result = await minify(source, {
        removeComments: true,
        collapseWhitespace: false,
        minifyJS: false,
        minifyCSS: false,
      });
    }
    fs.writeFileSync(path.join(output, name), result);
    report.push({
      path: name,
      sourceBytes: Buffer.byteLength(source),
      productionBytes: Buffer.byteLength(result),
    });
  }
  const indexPath = path.join(output, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');
  const boundary = html.indexOf('</head>');
  const head = html.slice(0, boundary),
    tail = html.slice(boundary);
  const pattern =
    /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/gi;
  const tokens = [...head.matchAll(pattern)],
    groups = Array.from({ length: 4 }, () => []);
  const mobileIndex = tokens.findIndex((match) => match[0].includes('mobile-landscape.css'));
  if (mobileIndex < 0) throw Error('Missing dedicated mobile stylesheet');
  let index = 0;
  const bundledHead = head.replace(pattern, (token) => {
    const position = index++;
    if (position === mobileIndex) return token;
    const group =
      position < mobileIndex
        ? Math.min(1, Math.floor((position * 2) / mobileIndex))
        : 2 +
          Math.min(
            1,
            Math.floor(((position - mobileIndex - 1) * 2) / (tokens.length - mobileIndex - 1)),
          );
    let css;
    if (token.startsWith('<link')) {
      const name = token.match(/href=["']([^"'?]+)/)[1];
      const file = path.resolve(output, name);
      if (!file.startsWith(output + path.sep)) throw Error('Stylesheet outside release');
      css = fs.readFileSync(file, 'utf8');
    } else css = token.replace(/^<style\b[^>]*>/i, '').replace(/<\/style>$/i, '');
    const first = groups[group].length === 0;
    groups[group].push(css);
    return first ? '<link rel="stylesheet" href="styles-' + (group + 1) + '.css?v=pending">' : '';
  });
  for (let group = 0; group < groups.length; group++) {
    fs.writeFileSync(path.join(output, 'styles-' + (group + 1) + '.css'), groups[group].join('\n'));
  }
  html = bundledHead + tail;
  fs.writeFileSync(indexPath, html);
  const versions = require('./version-release.cjs')(output);
  fs.writeFileSync(
    path.join(parent, 'versioned-assets.json'),
    JSON.stringify(versions, null, 2) + '\n',
  );
  html = fs.readFileSync(indexPath, 'utf8');
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc=/.test(match[1]))
    .map(
      (match) => "'sha256-" + crypto.createHash('sha256').update(match[2]).digest('base64') + "'",
    );
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://www.gstatic.com https://cdn.jsdelivr.net https://www.google.com " +
      hashes.join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "connect-src 'self' blob: data: https://www.gstatic.com https://cdn.jsdelivr.net https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://huggingface.co https://*.huggingface.co https://*.hf.co",
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.google.com https://recaptcha.google.com",
  ].join('; ');
  fs.writeFileSync(path.join(parent, 'csp-candidate.txt'), policy + '\n');
  if (process.argv.includes('--csp'))
    html = html.replace(
      '<head>',
      '<head>\n<meta http-equiv="Content-Security-Policy" content="' + policy + '">',
    );
  fs.writeFileSync(indexPath, html);
  fs.mkdirSync(path.join(output, 'tools'));
  const stamper = path.join(output, 'tools/stamp-assets.cjs');
  fs.copyFileSync(path.join(root, 'tools/stamp-assets.cjs'), stamper);
  cp.execFileSync(process.execPath, [stamper], { stdio: 'inherit' });
  cp.execFileSync(process.execPath, [stamper, '--check'], { stdio: 'inherit' });
  fs.rmSync(stamper);
  fs.rmdirSync(path.dirname(stamper));
  for (const entry of report)
    entry.productionBytes = fs.statSync(path.join(output, entry.path)).size;
  fs.writeFileSync(path.join(parent, 'size-report.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write('Production release: ' + output + '\n');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
