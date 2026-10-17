// Encoder characterization: validation/navigation are covered by browser boundary tests.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { save } = require('./audio-harness.cjs');
const root = path.resolve(__dirname, '..');
function encoder(source) {
  const context = vm.createContext({ Blob, TextEncoder });
  context.window = context;
  context.RENAX_SONGS = { validateLibrary() {}, playbackSections: (song) => song.sections };
  vm.runInContext(fs.readFileSync(path.join(root, 'song-tempo-ramp.js'), 'utf8'), context);
  vm.runInContext(source, context);
  return context;
}
function song(count, silent = false, ramp = false) {
  return {
    id: 's',
    name: 'Été 🎵',
    sections: [
      {
        id: 'a',
        label: 'Intro',
        count,
        measure: {
          numerator: 3,
          denominator: 8,
          tempo: 120,
          beatSubdivisions: [2, 3, 1],
          beatStates: silent ? [[0, 0], [0, 0, 0], [0]] : [[3, 1], [1, 2, 1], [1]],
        },
        ...(ramp ? { tempoRamp: { enabled: true, endTempo: 180 } } : {}),
      },
    ],
  };
}
(async () => {
  const context = encoder(fs.readFileSync(path.join(root, 'midi-export.js'), 'utf8'));
  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/midi-5291936.json'), 'utf8'),
  );
  for (const [name, value] of Object.entries({
    normal: song(4),
    silent: song(4, true),
    ramp: song(4, false, true),
    silentRamp: song(4, true, true),
  })) {
    const data = Buffer.from(await context.RENAX_MIDI_EXPORT.exportSong(value).blob.arrayBuffer());
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), fixture[name], name);
  }
  const timings = [];
  for (const value of [song(1000000000), song(1000000000, true), song(1000000000, true, true)]) {
    context.input = value;
    const before = JSON.stringify(value),
      begin = performance.now();
    assert.throws(
      () => vm.runInContext('RENAX_MIDI_EXPORT.exportSong(input)', context, { timeout: 1500 }),
      /trop long/,
    );
    timings.push(performance.now() - begin);
    assert.equal(JSON.stringify(value), before);
  }
  save('midi-resource-results.json', {
    baseline: fixture.baseline,
    identicalFiles: 4,
    rejectedOversizedFiles: 3,
    rejectionMs: timings,
  });
  console.log(
    'PASS four MIDI files identical to baseline; huge audible/silent/ramped inputs rejected without mutation',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
