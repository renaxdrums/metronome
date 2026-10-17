// The frame owns its audio context and scheduler; the parent only uses this explicit bridge.
export async function createAudioAdapter(frame) {
  const adapter=frame.contentWindow.RENAX_AUDIO_ADAPTER;
  if(!adapter)throw new Error('Audio preview is not ready.');
  await adapter.prepare();
  return adapter;
}
