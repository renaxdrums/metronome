import assert from 'node:assert/strict';
import { detectOnsetsInWorker } from '../audio-lab/analysis/onset-client.mjs';
import { createOnsetMessageHandler } from '../audio-lab/analysis/onset-worker.mjs';

const sampleRate = 8000;
const source = new Float32Array(sampleRate * 3);
for (const second of [.5, 1, 1.5])
  for (let i = 0; i < 100; i++) source[Math.round(second * sampleRate) + i] = Math.sin(i / 7) * .8;
let transferred = 0, terminated = false;
const workerFactory = () => {
  const listeners = new Map();
  const worker = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    postMessage(data, transfer) {
      transferred = transfer.length;
      const handle = createOnsetMessageHandler(result => queueMicrotask(() =>
        listeners.get('message')?.({ data: result })));
      queueMicrotask(() => handle({ data }));
    },
    terminate() { terminated = true; },
  };
  return worker;
};
const result = await detectOnsetsInWorker({
  buffer: { length: source.length, numberOfChannels: 1, sampleRate,
    getChannelData: () => source }, maxSeconds: 2, workerFactory,
});
assert.equal(transferred, 1);
assert(terminated);
assert(result.onsets.some(onset => Math.abs(onset.seconds - .5) < .1));
assert.equal(source.length, sampleRate * 3);
assert.equal(source[Math.round(.5 * sampleRate)], 0);

const controller = new AbortController();
const hangingWorkerFactory = () => ({
  addEventListener() {}, removeEventListener() {}, postMessage() {},
  terminate() { terminated = true; },
});
const pending = detectOnsetsInWorker({
  buffer: { length: source.length, numberOfChannels: 1, sampleRate,
    getChannelData: () => source }, signal: controller.signal,
  workerFactory: hangingWorkerFactory,
});
controller.abort();
await assert.rejects(pending, { name: 'AbortError' });
assert(terminated);
console.log('Audio Lab: onset FFT runs through a bounded cancellable Worker client');
