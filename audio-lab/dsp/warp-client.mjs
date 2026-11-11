/**
 * Worker adapter for offline Warp. The original AudioBuffer is never transferred
 * or modified; PCM is copied before ownership passes to the Worker.
 */
import { WarpRenderError } from './wsola.mjs';

/** Process decoded audio outside the UI thread, with hard cancellation. */
export function renderWarpInWorker(config) {
  const { buffer, timeline, signal, onProgress = () => {},
    workerFactory = () => new Worker(new URL('./warp-worker.mjs', import.meta.url), { type: 'module' }),
    maxOutputBytes = 256 * 1024 * 1024 } = config || {};
  if (!buffer || !Number.isSafeInteger(buffer.length) || buffer.length <= 0 ||
      !Number.isSafeInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1 ||
      buffer.numberOfChannels > 8 || typeof buffer.getChannelData !== 'function' ||
      !Number.isFinite(buffer.sampleRate) || !timeline || !Number.isFinite(timeline.outputDurationSeconds))
    throw new TypeError('decoded AudioBuffer and Warp timeline are required');
  if (typeof onProgress !== 'function' || typeof workerFactory !== 'function')
    throw new TypeError('invalid Worker callback');
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 1024)
    throw new RangeError('maxOutputBytes is invalid');
  const outFrames = Math.round(timeline.outputDurationSeconds * buffer.sampleRate);
  if (!Number.isSafeInteger(outFrames) || outFrames <= 0 ||
      outFrames * (buffer.numberOfChannels + 1) * 4 > maxOutputBytes)
    throw new WarpRenderError('MEMORY_PRESSURE', 'Warp output exceeds memory budget');
  if (signal?.aborted) throw new WarpRenderError('CANCELLED', 'Warp rendering cancelled');
  const inputBytes = buffer.length * buffer.numberOfChannels * 4;
  if (!Number.isSafeInteger(inputBytes) || inputBytes > maxOutputBytes)
    throw new WarpRenderError('MEMORY_PRESSURE', 'Input PCM exceeds safe transfer budget');

  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    Float32Array.from(buffer.getChannelData(index)));
  const transfer = channels.map(ch => ch.buffer);
  return new Promise((resolve, reject) => {
    let worker, settled = false, listener;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', listener);
      try { worker?.terminate(); } catch { /* best-effort cleanup */ }
      if (error) reject(error); else resolve(result);
    };
    listener = () => finish(new WarpRenderError('CANCELLED', 'Warp rendering cancelled'));
    signal?.addEventListener('abort', listener, { once: true });
    if (signal?.aborted) { listener(); return; }
    try {
      worker = workerFactory();
      worker.onmessage = event => {
        const data = event.data || {};
        if (data.id !== 1 || settled) return;
        if (data.type === 'progress') {
          try { onProgress(data.progress); }
          catch (error) { finish(error); }
        } else if (data.type === 'done') finish(null, data.rendered);
        else if (data.type === 'error')
          finish(new WarpRenderError(data.code || 'DSP_FAILED', data.message || 'Warp render failed'));
      };
      worker.onerror = event =>
        finish(new WarpRenderError('DSP_FAILED', event?.message || 'Warp Worker crashed'));
      worker.postMessage({ id: 1, type: 'render', config: {
        channels, sampleRate: buffer.sampleRate, timeline, maxOutputBytes,
      } }, transfer);
    } catch (error) { finish(error); }
  });
}
