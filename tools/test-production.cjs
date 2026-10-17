'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const release = path.join(root, 'dist/site');
const output = path.resolve(
  process.env.TEST_OUTPUT_DIR || path.join(root, 'tests/results/production'),
);
const available = [
  'tests/robustness-boundaries-test.cjs',
  'tests/pro-sound-context-test.cjs',
  'tests/mobile-landscape-test.cjs',
  'tests/mp3-output-level-test.cjs',
  'tests/security-text-test.cjs',
  'tests/diagnostics-test.cjs',
  'tests/audio-activation-test.cjs',
  'tests/language-fallback-test.cjs',
  'tests/settings-resize-test.cjs',
  'tests/startup-layout-test.cjs',
  'tools/check-production-csp.cjs',
  'tools/check-production-equivalence.cjs',
  'tools/check-production-offline.cjs',
  'tests/amorce-song-integration-test.cjs',
];

(async () => {
  if (!fs.existsSync(path.join(release, 'index.html'))) throw Error('Build production first.');
  const selected = process.env.PRODUCTION_ONLY?.split(',');
  const files = selected
    ? available.filter((file) => selected.includes(path.basename(file)))
    : available.filter((file) => !file.endsWith('amorce-song-integration-test.cjs'));
  if (selected && files.length !== selected.length)
    throw Error('Unknown or repeated production scenario.');
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const base = name.startsWith('/.qa-cache/') && process.env.REAL_AMORCE ? root : release;
    let file = path.resolve(base, '.' + name);
    if (file === release) file = path.join(release, 'index.html');
    if (!file.startsWith(base + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      const type = /\.(js|mjs)$/.test(file)
        ? 'text/javascript'
        : file.endsWith('.html')
          ? 'text/html'
          : file.endsWith('.css')
            ? 'text/css'
            : file.endsWith('.json')
              ? 'application/json'
              : file.endsWith('.wav')
                ? 'audio/wav'
                : file.endsWith('.svg')
                  ? 'image/svg+xml'
                  : 'application/octet-stream';
      response.setHeader('Content-Type', type);
      response.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const results = [];
  try {
    for (const file of files) {
      const name = path.basename(file);
      const directory = path.join(output, name);
      fs.mkdirSync(directory, { recursive: true });
      console.log('RUN production ' + name);
      const result = await new Promise((resolve) => {
        let log = '';
        const child = cp.spawn(
          process.execPath,
          ['--require', path.join(root, 'tests/test-output.cjs'), path.join(root, file)],
          {
            cwd: root,
            env: {
              ...process.env,
              TEST_URL: url,
              TEST_OUTPUT_DIR: directory,
              TEMP: output,
              TMP: output,
            },
            windowsHide: true,
          },
        );
        const timer = setTimeout(() => child.kill(), 180000);
        for (const stream of [child.stdout, child.stderr])
          stream.on('data', (data) => {
            log += data;
            process.stdout.write(data);
          });
        child.on('error', (error) => {
          clearTimeout(timer);
          resolve({ file, code: 1, log: log + error.message });
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({ file, code, log });
        });
      });
      fs.writeFileSync(path.join(directory, 'run.log'), result.log);
      results.push({ file: result.file, code: result.code });
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
      if (result.code !== 0) {
        process.exitCode = 1;
        break;
      }
    }
  } finally {
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
