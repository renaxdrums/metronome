const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  out = path.resolve(process.env.QA_OUTPUT || path.join(__dirname, 'results', 'current'));
fs.mkdirSync(out, { recursive: true });
const defaults = {
  CHROME_PATH:
    process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : require('playwright').chromium.executablePath(),
  RENAX_CHROME:
    process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : require('playwright').chromium.executablePath(),
  RENAX_PLAYWRIGHT: require.resolve('playwright'),
  ESPEAK_RUNTIME: path.join(root, '.qa-cache/espeak/espeak-ng.js'),
  NEURAL_TEST_ROOT: path.join(root, '.qa-cache'),
  PIPER_ASSETS: path.join(root, '.qa-cache/piper'),
  NEURAL_ASSETS: path.join(root, '.qa-cache/neural-assets'),
  TRANSFORMERS_MODULE: require('node:url').pathToFileURL(
    require.resolve('@huggingface/transformers').replace('.cjs', '.mjs'),
  ).href,
};
const only = process.argv
  .find((x) => x.startsWith('--only='))
  ?.slice(7)
  ?.split(',');
const firebase = process.argv.includes('--firebase');
let files = fs
  .readdirSync(__dirname)
  .filter((x) => /-test\.(cjs|mjs)$/.test(x))
  .map((x) => 'tests/' + x);
if (firebase)
  files = [
    'tests/firebase/core.test.mjs',
    'tests/firebase/rules.test.mjs',
    'tests/firebase/browser.test.mjs',
    'tests/firebase/local.test.mjs',
    'tests/firebase/navigation.test.mjs',
    'tests/account-scope-test.cjs',
  ];
else
  files.push(
    'tests/firebase/core.test.mjs',
    'tests/firebase/local.test.mjs',
    'tests/firebase/navigation.test.mjs',
  );
if (only) {
  for (const name of only)
    if (!files.some((f) => f === name || path.basename(f) === name))
      throw Error('Unknown test: ' + name);
  files = files.filter((f) => only.some((x) => f === x || path.basename(f) === x));
}
if (process.env.RENAX_NIGHTLY === '1' && !only && !firebase) {
  cp.execFileSync(process.execPath, [path.join(root, 'tools/check-test-coverage.cjs')], {
    stdio: 'inherit',
  });
  const policy = require('./ci-policy.json');
  for (const [file, entry] of Object.entries({ ...policy.excluded, ...policy.dedicated }))
    console.log('EXCLUDED ' + file + ': ' + entry.reason);
  files = files.filter((f) => !/-test\.(cjs|mjs)$/.test(f) || policy.nightly.includes(f));
}
const manualRequired = !only && !firebase ? ['tests/mp3-native-picker-test.cjs'] : [];
if (!only && !firebase) {
  files = files.filter((f) => !manualRequired.includes(f) && f !== 'tests/account-scope-test.cjs');
  console.log(
    'MANUAL REQUIRED: native Windows save picker; run test:native with a person selecting the destination. Account-scope integration runs with --firebase.',
  );
}

const exclude =
  process.argv
    .find((x) => x.startsWith('--exclude='))
    ?.slice(10)
    ?.split(',') || [];
files = files.filter((f) => !exclude.some((x) => f === x || path.basename(f) === x));
const results = [];
let current;
process.on('SIGINT', () => {
  current?.kill();
  process.exit(130);
});
function run(file) {
  return new Promise((resolve) => {
    const begin = Date.now(),
      name = file.replaceAll('/', '_'),
      dir = path.join(out, 'artifacts', name);
    fs.mkdirSync(dir, { recursive: true });
    let output = '';
    console.log('RUN ' + file);
    const child = (current = cp.spawn(
      process.execPath,
      ['--require', path.join(__dirname, 'test-output.cjs'), file],
      {
        cwd: root,
        env: { ...defaults, ...process.env, TEST_OUTPUT_DIR: dir, TEMP: out, TMP: out },
        windowsHide: true,
      },
    ));
    const limit = file.includes('audio-headroom')
      ? 1200000
      : file.includes('rapid-interactions')
        ? 600000
        : file.includes('neural') ||
            file.includes('voice-levels') ||
            file.includes('amorce-page') ||
            file.includes('piper-speed')
          ? 600000
          : 180000;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, limit);
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (d) => {
        output += d;
        if (/AUDIT |Progress:|PASS|passed|dBFS/.test(String(d))) process.stdout.write(d);
      });
    child.on('close', (code) => {
      clearTimeout(timer);
      const result = {
        file,
        code,
        timedOut,
        seconds: +((Date.now() - begin) / 1000).toFixed(2),
        log: name + '.log',
        tail: output.slice(-2400),
      };
      results.push(result);
      fs.writeFileSync(path.join(out, result.log), output);
      fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
      console.log(JSON.stringify({ ...result, tail: code === 0 ? '' : result.tail.slice(-1100) }));
      resolve();
    });
  });
}
(async () => {
  for (const file of files) await run(file);
  const summary = {
    manualRequired,
    total: results.length,
    passed: results.filter((x) => x.code === 0).length,
    failed: results.filter((x) => x.code !== 0).map((x) => x.file),
  };
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(summary);
  process.exitCode = summary.failed.length ? 1 : 0;
})();
