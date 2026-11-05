const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'sequence-parallel.js'), 'utf8'), sandbox);
const api = sandbox.window.RENAX_SEQUENCE_PARALLEL;
const base = { numerator: 4, denominator: 4, tempo: 120, repeatCount: '2' };
const model = (unit, count = '2') => ({ ...base, repeatCount: count, parallelTempo: { unit, mode: 'free' } });
for (const [note, num, den, bpm] of [
  ['dottedEighth', 4, 3, 160], ['quarterTriplet', 3, 2, 180],
  ['dottedQuarter', 2, 3, 80], ['eighthTriplet', 3, 1, 360]
]) {
  const ratio = api.config(model(note));
  assert.equal(ratio.numerator, num);
  assert.equal(ratio.denominator, den);
  assert.equal(ratio.bpm, bpm);
  assert.equal(api.suggested(ratio), den);
  assert.equal(api.isComplete(ratio, BigInt(den)), true);
  if (den > 1) assert.equal(api.isComplete(ratio, 1n), false);
}
assert.equal(api.repetitions(model('dottedEighth','9007199254740993')).toString(), '9007199254740993');
for (const [num, den] of [[2,1],[1,2],[4,2]]) {
  assert.equal(api.config({ ...base, parallelTempo: {unit:'custom',numerator:String(num),denominator:String(den)} }), null);
}
for (const [num,den,bpm] of [[3,2,180],[2,3,80],[4,3,160]]) {
  assert.equal(api.config({ ...base, parallelTempo: {unit:'custom',numerator:String(num),denominator:String(den)} }).bpm,bpm);
}
assert.equal(api.config({ ...base, parallelTempo:{unit:'custom',numerator:'bad',denominator:'3'} }),null);
assert.equal(api.config({ ...base, denominator:8,parallelTempo:{unit:'quarter'} }),null);
assert.equal(api.config(base),null);
const transport = fs.readFileSync(path.join(root,'metronome-transport.js'),'utf8');
assert.match(transport,/nextNoteTime\s*=\s*parallel\s*\?\s*Math\.min\(parallelBlock\.endTime,/);
assert.match(transport,/advanceScheduledMeasure\(true\)/);
assert.match(transport,/nextNoteTime\s*\+\s*phaseShift\s*<\s*parallelBlock\.endTime/);
const core = fs.readFileSync(path.join(root,'metronome-core.js'),'utf8');
assert.match(core,/RENAX_SEQUENCE_PARALLEL\.button/);
console.log('PASS Tempo parallèle ratios, modes de durée, coupures, exclusions et intégration.');
