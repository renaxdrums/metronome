/* Reproducible local transfer inventory; no network, application edits or telemetry. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'offline-manifest.json'), 'utf8'));
const resources = manifest.resources.map(({ path: name }) => {
  const data = fs.readFileSync(path.join(root, name));
  return { path: name, bytes: data.length, gzipBytes: zlib.gzipSync(data, { level: 9 }).length };
});
function walk(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? walk(directory + '/' + entry.name) : [directory + '/' + entry.name]);
}
const voices = walk('assets/voices').filter(name => name.endsWith('.wav'))
  .map(name => ({ path: name, bytes: fs.statSync(path.join(root, name)).size }));
const report = {
  note: 'Local gzip estimate. Offline inventory is not the same as initial-page transfer. External voice models excluded.',
  shellBytes: resources.reduce((sum, item) => sum + item.bytes, 0),
  shellGzipBytes: resources.reduce((sum, item) => sum + item.gzipBytes, 0),
  voiceWavBytes: voices.reduce((sum, item) => sum + item.bytes, 0),
  resources: resources.sort((a, b) => b.bytes - a.bytes),
  voices,
};
const output = process.argv.find(value => value.startsWith('--output='))?.slice(9);
if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
else process.stdout.write(JSON.stringify(report, null, 2) + '\n');
