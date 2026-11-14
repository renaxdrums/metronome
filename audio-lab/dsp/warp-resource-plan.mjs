/** Preflight for the existing full-buffer player and backpressured WAV renderer.
 * This reports memory and format bounds; it does not claim streamed playback.
 */
const MIB = 1024 * 1024;
const RIFF_PCM_LIMIT = 0xffffffff - 36;

export function planWarpResources({ sourceFrames, channels, sampleRate,
  outputDurationSeconds, fullBufferBudgetBytes = 128 * MIB,
  estimatedPeakBudgetBytes = 256 * MIB,
  streamInputBudgetBytes = 512 * MIB, wavBitDepth = 24 }) {
  if (!Number.isSafeInteger(sourceFrames) || sourceFrames <= 0 ||
      !Number.isSafeInteger(channels) || channels < 1 || channels > 8 ||
      !Number.isSafeInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      !Number.isFinite(outputDurationSeconds) || outputDurationSeconds <= 0 ||
      !Number.isSafeInteger(fullBufferBudgetBytes) || fullBufferBudgetBytes <= 1024 ||
      !Number.isSafeInteger(estimatedPeakBudgetBytes) || estimatedPeakBudgetBytes <= 1024 ||
      !Number.isSafeInteger(streamInputBudgetBytes) || streamInputBudgetBytes <= 1024 ||
      ![16, 24].includes(wavBitDepth))
    throw new RangeError('Invalid Warp resource plan input');
  const outputFrames = Math.round(outputDurationSeconds * sampleRate);
  if (!Number.isSafeInteger(outputFrames) || outputFrames <= 0)
    throw new RangeError('Warp output frame count exceeds safe integer range');
  const sourcePcmBytes = sourceFrames * channels * 4;
  const outputPcmBytes = outputFrames * channels * 4;
  // The full renderer stores output samples and overlap weights before the
  // browser allocates another AudioBuffer copy for playback.
  const fullRenderBudgetBytes = outputFrames * (channels + 1) * 4;
  const estimatedPeakBytes = sourcePcmBytes * 2 + outputPcmBytes * 3 +
    outputFrames * 4;
  const wavPcmBytes = outputFrames * channels * wavBitDepth / 8;
  if (![sourcePcmBytes, outputPcmBytes, fullRenderBudgetBytes,
        estimatedPeakBytes, wavPcmBytes].every(Number.isSafeInteger))
    throw new RangeError('Warp resource size exceeds safe integer range');
  const fullBufferPossible = sourcePcmBytes <= fullBufferBudgetBytes &&
    fullRenderBudgetBytes <= fullBufferBudgetBytes &&
    estimatedPeakBytes <= estimatedPeakBudgetBytes;
  const streamExportPossible = sourcePcmBytes <= streamInputBudgetBytes &&
    outputFrames <= 0x7fffffff && wavPcmBytes <= RIFF_PCM_LIMIT;
  return Object.freeze({ outputFrames, sourcePcmBytes, outputPcmBytes,
    fullRenderBudgetBytes, estimatedPeakBytes, wavPcmBytes,
    fullBufferBudgetBytes, estimatedPeakBudgetBytes, streamInputBudgetBytes,
    fullBufferPossible, streamExportPossible,
    playbackMode: fullBufferPossible ? 'full-buffer' : 'streamed-player-required',
    exportMode: streamExportPossible ? 'backpressured-wav' : 'unsupported-by-current-format',
  });
}
