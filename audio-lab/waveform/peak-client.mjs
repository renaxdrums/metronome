/** Worker-backed extraction with one inflight PCM chunk and cancellation. */
export async function extractWaveformPeaks(audioBuffer, options = {}) {
  const {
    chunkFrames = 16384, bucketSamples = 256,
    workerFactory = () => new Worker(new URL('./peak-worker.mjs', import.meta.url), { type: 'module' }),
    onProgress = () => {}, signal,
  } = options;
  if (!audioBuffer || !Number.isSafeInteger(audioBuffer.length) || audioBuffer.length <= 0 ||
      !Number.isSafeInteger(audioBuffer.numberOfChannels) || audioBuffer.numberOfChannels <= 0 ||
      typeof audioBuffer.getChannelData !== 'function') throw new TypeError('invalid decoded audio buffer');
  if (!Number.isSafeInteger(chunkFrames) || chunkFrames < 256 || chunkFrames > 262144)
    throw new RangeError('chunkFrames must be 256..262144');
  if (signal?.aborted) throw new Error('Waveform extraction cancelled');
  const worker = workerFactory();
  const id = 1;
  let activeReject = null;
  const cancel = () => { activeReject?.(new Error('Waveform extraction cancelled')); };
  signal?.addEventListener('abort', cancel, { once: true });
  function call(message, expect, transfer = []) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new Error('Waveform extraction cancelled')); return; }
      const cleanup = () => {
        worker.removeEventListener('message', receive);
        worker.removeEventListener('error', fail);
        activeReject = null;
      };
      function fail(event) { cleanup(); reject(new Error(event.message || 'Waveform worker failed')); }
      function receive(event) {
        const data = event.data;
        if (!data || data.id !== id) return;
        if (data.op === 'error') { cleanup(); reject(new Error(data.message)); return; }
        if (data.op !== expect) return;
        cleanup(); resolve(data);
      }
      activeReject = (error) => { cleanup(); reject(error); };
      worker.addEventListener('message', receive);
      worker.addEventListener('error', fail);
      try { worker.postMessage({ ...message, id }, transfer); }
      catch (error) { cleanup(); reject(error); }
    });
  }
  try {
    await call({ op: 'begin', channelCount: audioBuffer.numberOfChannels, bucketSamples }, 'ready');
    for (let start = 0; start < audioBuffer.length; start += chunkFrames) {
      const end = Math.min(audioBuffer.length, start + chunkFrames);
      const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, c) =>
        audioBuffer.getChannelData(c).slice(start, end));
      await call({ op: 'chunk', channels }, 'ack', channels.map((channel) => channel.buffer));
      onProgress(end, audioBuffer.length);
    }
    return (await call({ op: 'finish' }, 'result')).pyramid;
  } finally {
    signal?.removeEventListener('abort', cancel);
    worker.terminate();
  }
}
