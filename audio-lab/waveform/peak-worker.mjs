import { PeakPyramidBuilder } from './peaks.mjs';

/** Testable worker protocol. One recording per worker; every chunk acknowledged. */
export function createPeakMessageHandler(send) {
  let job = null;
  return ({ data }) => {
    const { id, op } = data || {};
    try {
      if (op === 'begin') {
        if (job) throw new Error('waveform worker is busy');
        job = { id, builder: new PeakPyramidBuilder(data.channelCount, data.bucketSamples) };
        send({ op: 'ready', id });
      } else if (op === 'abort') {
        if (job?.id === id) job = null;
        send({ op: 'aborted', id });
      } else {
        if (!job || job.id !== id) throw new Error('unknown or stale waveform job');
        if (op === 'chunk') {
          job.builder.push(data.channels);
          send({ op: 'ack', id, processedFrames: job.builder.sampleCount });
        } else if (op === 'finish') {
          const pyramid = job.builder.finish();
          job = null;
          const transfer = pyramid.levels.flatMap((level) => [
            ...level.minimum.map((array) => array.buffer),
            ...level.maximum.map((array) => array.buffer),
          ]);
          send({ op: 'result', id, pyramid }, transfer);
        } else throw new Error('unknown waveform operation');
      }
    } catch (error) {
      job = null;
      send({ op: 'error', id, message: error instanceof Error ? error.message : 'Waveform unavailable' });
    }
  };
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  const onMessage = createPeakMessageHandler((message, transfer = []) => self.postMessage(message, transfer));
  self.addEventListener('message', onMessage);
}
