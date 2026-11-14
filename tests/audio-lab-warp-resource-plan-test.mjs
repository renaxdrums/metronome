import assert from 'node:assert/strict';
import { planWarpResources } from '../audio-lab/dsp/warp-resource-plan.mjs';
import { prepareWarpPlayback } from '../audio-lab/transport/warp-session.mjs';

const rate = 44100, channels = 2;
const short = planWarpResources({ sourceFrames: 5 * rate, channels, sampleRate: rate,
  outputDurationSeconds: 15 });
assert.equal(short.playbackMode, 'full-buffer');
assert.equal(short.exportMode, 'backpressured-wav');

// 120 -> 40 BPM triples a 3-minute source to 9 minutes of output.
const song = planWarpResources({ sourceFrames: 180 * rate, channels, sampleRate: rate,
  outputDurationSeconds: 540 });
assert.equal(song.outputFrames, 540 * rate);
assert.equal(song.playbackMode, 'streamed-player-required');
assert.equal(song.fullBufferPossible, false);
assert.equal(song.exportMode, 'backpressured-wav');
assert(song.fullRenderBudgetBytes > 128 * 1024 * 1024);
assert(song.estimatedPeakBytes > song.fullRenderBudgetBytes,
  'peak memory estimate includes worker and browser copies');
assert(song.sourcePcmBytes < song.streamInputBudgetBytes,
  'existing bounded chunk worker can render the song to a local WAV sink');
const peakLimited = planWarpResources({ sourceFrames: 65 * rate, channels,
  sampleRate: rate, outputDurationSeconds: 195 });
assert(peakLimited.fullRenderBudgetBytes < peakLimited.fullBufferBudgetBytes);
assert(peakLimited.estimatedPeakBytes > peakLimited.estimatedPeakBudgetBytes);
assert.equal(peakLimited.playbackMode, 'streamed-player-required');
let workerStarted = false;
await assert.rejects(prepareWarpPlayback({
  context: { createBuffer() {}, createBufferSource() {} },
  sourceBuffer: { length: 180 * rate, numberOfChannels: channels,
    sampleRate: rate, getChannelData() { throw Error('full PCM copy must not start'); } },
  warpTimeline: { outputDurationSeconds: 540 }, clickEnabled: false,
  workerFactory() { workerStarted = true; throw Error('worker must not start'); },
}), error => error.code === 'MEMORY_PRESSURE' &&
  error.resourcePlan?.exportMode === 'backpressured-wav');
assert.equal(workerStarted, false);

const tooLongForRiff = planWarpResources({ sourceFrames: 200 * 60 * rate,
  channels, sampleRate: rate, outputDurationSeconds: 600 * 60 });
assert.equal(tooLongForRiff.exportMode, 'unsupported-by-current-format');
assert.throws(() => planWarpResources({ sourceFrames: 1, channels: 0,
  sampleRate: rate, outputDurationSeconds: 3 }), /Invalid/);
console.log('Audio Lab: bounded 120→40 resource plan distinguishes playback from streamed WAV export');
