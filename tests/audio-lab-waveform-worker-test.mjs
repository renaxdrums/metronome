import assert from 'node:assert/strict';
import { createPeakMessageHandler } from '../audio-lab/waveform/peak-worker.mjs';
import { extractWaveformPeaks } from '../audio-lab/waveform/peak-client.mjs';

class FakeWorker {
  constructor() {
    this.listeners = { message: new Set(), error: new Set() };
    this.handle = createPeakMessageHandler((data) => {
      queueMicrotask(() => { for (const listener of this.listeners.message) listener({ data }); });
    });
    this.terminated = false;
    this.inflight = 0;
    this.maxInflight = 0;
  }
  addEventListener(type, handler) { this.listeners[type].add(handler); }
  removeEventListener(type, handler) { this.listeners[type].delete(handler); }
  postMessage(data) {
    this.inflight++;
    this.maxInflight = Math.max(this.maxInflight, this.inflight);
    queueMicrotask(() => { this.inflight--; this.handle({ data }); });
  }
  terminate() { this.terminated = true; }
}
let worker;
const audio = {
  length: 160,
  numberOfChannels: 2,
  getChannelData: (c) => Float32Array.from({ length: 160 }, (_, i) => i === 14 && c === 0 ? -0.9 : i === 33 && c === 1 ? 0.8 : 0.1),
};
const progress = [];
const peaks = await extractWaveformPeaks(audio, {
  bucketSamples: 16, chunkFrames: 256,
  workerFactory: () => (worker = new FakeWorker()),
  onProgress: (done, total) => progress.push([done, total]),
});
assert.equal(peaks.channelCount, 2);
assert.equal(peaks.sampleCount, 160);
assert.equal(+peaks.levels[0].minimum[0][0].toFixed(2), -0.9);
assert.equal(+peaks.levels[0].maximum[1][2].toFixed(2), 0.8);
assert.equal(progress.at(-1)[0], 160);
assert(worker.terminated);
assert.equal(worker.maxInflight, 1);
const ctrl = new AbortController(); ctrl.abort();
await assert.rejects(extractWaveformPeaks(audio, { signal: ctrl.signal, workerFactory: () => new FakeWorker() }), /cancelled/);
console.log('Audio Lab: worker peak transfer protocol, bounded chunks and cancellation passed');
