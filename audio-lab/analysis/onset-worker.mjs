/** One bounded onset-analysis job per Worker. The expensive FFT stays off the UI thread. */
import { detectOnsets } from './onsets.mjs';

export function createOnsetMessageHandler(send) {
  return ({ data }) => {
    const { id, channels, sampleRate, maxOnsets } = data || {};
    try {
      if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('Invalid onset job ID');
      const result = detectOnsets(channels, sampleRate, { maxOnsets });
      send({ id, op: 'result', result });
    } catch (error) {
      send({ id, op: 'error', message: error instanceof Error ? error.message : 'Onset analysis failed' });
    }
  };
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('message', createOnsetMessageHandler((message) => self.postMessage(message)));
}
