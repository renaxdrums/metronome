/** Copy at most maxSeconds of source PCM, then analyse in a disposable Worker. */
export async function detectOnsetsInWorker({ buffer, maxSeconds = 35, maxOnsets = 3000,
  signal, workerFactory = () => new Worker(new URL('./onset-worker.mjs', import.meta.url), { type: 'module' }) } = {}) {
  if (!buffer || !Number.isSafeInteger(buffer.length) || buffer.length <= 0 ||
      !Number.isSafeInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1 ||
      !Number.isFinite(buffer.sampleRate) || buffer.sampleRate < 8000 ||
      typeof buffer.getChannelData !== 'function' ||
      !Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 120 ||
      !Number.isSafeInteger(maxOnsets) || maxOnsets < 1 || maxOnsets > 100000)
    throw new TypeError('Invalid onset Worker input');
  if (signal?.aborted) throw new DOMException('Onset analysis cancelled', 'AbortError');
  const frames = Math.min(buffer.length, Math.round(buffer.sampleRate * maxSeconds));
  const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) =>
    buffer.getChannelData(i).slice(0, frames));
  const worker = workerFactory();
  let rejectJob;
  const abort = () => rejectJob?.(new DOMException('Onset analysis cancelled', 'AbortError'));
  signal?.addEventListener('abort', abort, { once: true });
  try {
    return await new Promise((resolve, reject) => {
      rejectJob = reject;
      const cleanup = () => {
        worker.removeEventListener('message', receive);
        worker.removeEventListener('error', fail);
      };
      const receive = ({ data }) => {
        if (data?.id !== 1) return;
        cleanup();
        if (data.op === 'result') resolve(data.result);
        else reject(new Error(data.message || 'Onset Worker failed'));
      };
      const fail = (event) => { cleanup(); reject(new Error(event.message || 'Onset Worker failed')); };
      worker.addEventListener('message', receive);
      worker.addEventListener('error', fail);
      if (signal?.aborted) { cleanup(); abort(); return; }
      try { worker.postMessage({ id: 1, channels, sampleRate: buffer.sampleRate, maxOnsets },
        channels.map((channel) => channel.buffer)); }
      catch (error) { cleanup(); reject(error); }
    });
  } finally {
    signal?.removeEventListener('abort', abort);
    worker.terminate();
  }
}
