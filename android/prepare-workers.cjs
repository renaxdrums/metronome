/* Bundle local worker imports for WebView's synthetic HTTPS asset origin.
 * Keep the pinned remote runtimes/models and all audio algorithms unchanged.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

async function prepare(site) {
  const root = path.resolve(site);
  for (const name of ['piper-worker.mjs', 'neural-worker.mjs']) {
    const entry = path.join(root, 'prototypes/amorce', name);
    const source = fs.readFileSync(entry, 'utf8');
    let contents = source;
    if (name === 'piper-worker.mjs') {
      const pattern = /fetch\(new URL\(["']\.\/piper-config\.json(?:\?[^"']*)?["'],\s*import\.meta\.url\)\)/g;
      if ([...source.matchAll(pattern)].length !== 1)
        throw Error('Expected exactly one local Piper configuration request');
      const config = JSON.parse(fs.readFileSync(path.join(path.dirname(entry), 'piper-config.json'), 'utf8'));
      // Worker subrequests do not consistently pass through WebViewClient.
      contents = source.replace(pattern, 'Promise.resolve({ok:true,json:async()=>(' + JSON.stringify(config) + ')})');
    }
    const result = await esbuild.build({
      stdin: { contents, resolveDir: path.dirname(entry), sourcefile: name, loader: 'js' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      minifyWhitespace: true,
      minifyIdentifiers: false,
      minifySyntax: false,
      legalComments: 'inline',
    });
    fs.writeFileSync(entry, result.outputFiles[0].contents);
  }
}

if (require.main === module) prepare(process.argv[2]).catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = prepare;
