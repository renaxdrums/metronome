/** Offline Warp in a dedicated Worker; rendering never runs on the UI thread. */
import { renderWarpPCM } from './wsola.mjs';

self.addEventListener('message', (event) => {
  const { id, type, config } = event.data || {};
  if (type !== 'render') return;
  try {
    const rendered = renderWarpPCM({
      ...config,
      onProgress: progress => self.postMessage({ id, type: 'progress', progress }),
    });
    self.postMessage({ id, type: 'done', rendered },
      rendered.channels.map(channel => channel.buffer));
  } catch (error) {
    self.postMessage({ id, type: 'error', code: error.code || 'DSP_FAILED',
      message: error.message || 'Warp rendering failed' });
  }
});
