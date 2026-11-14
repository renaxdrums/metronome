# Warp playback beyond the full AudioBuffer budget

## Current boundary

`prepareWarpPlayback` materializes one output `AudioBuffer`. Its 128 MiB render budget covers the Worker output and overlap weights; a separate 256 MiB estimated peak budget accounts for source, Worker and playback copies. These preflight estimates do not guarantee memory availability on a device. A three-minute stereo 44.1 kHz source slowed from 120 to 40 BPM produces nine minutes (23,814,000 frames): about 182 MiB of interleaved PCM, 273 MiB for the current render-budget formula, and a larger temporary peak. The current full-buffer player cannot play this case within its default budget. Increasing the limit without a device-specific memory proof risks tab termination.

`renderWarpChunksInWorker` and `exportWarpWavToSink` already render this case in bounded chunks with explicit backpressure. They can produce a local 24-bit WAV when the source transfer and RIFF limits permit it. A downloadable WAV is **not** an AudioContext-clocked playback session with synchronized RENAX click.

## Contract for a future streamed player

1. Persist ordered output PCM chunks in OPFS or an equivalent local seekable store. Commit a manifest only after every frame and checksum is written; delete incomplete sessions on cancellation or failure. Check storage quota before rendering. Do not retain all chunks in JavaScript arrays.
2. Feed an `AudioWorkletProcessor` through a bounded ring buffer. Its read cursor is an integer **output frame**. Decode/fetch at least two seconds ahead, cap the ring (for example eight seconds), and ACK the rendering Worker only after the persisted chunk is durable. Do not use an `HTMLAudioElement` as a silent fallback because its clock and loop semantics do not meet the current click alignment contract.
3. Define `play`, `pause`, `stop`, `seek`, `setLoop` and `dispose` in output frames. A seek waits until its target chunk is buffered before unmuting. A/B loop wraps at exact frame boundaries, with a tested short crossfade where the audio itself is discontinuous. An underrun pauses with a visible error; it must never insert unreported silence while the click continues.
4. Schedule RENAX click events against the same `AudioContext` and worklet output-frame clock. On pause, seek, loop edit or underrun, cancel future click nodes and rebuild the lookahead. Preserve the existing samples, gain and accent rules.
5. Verify continuity at chunk boundaries, exact frame counts, loop/click drift over at least 30 minutes, pitch and transient quality at 120→40, seek/abort/reload, storage quota failure, and Samsung S23 memory/CPU. Only then expose streamed Warp playback in the UI.

`planWarpResources` is the preflight API. `playbackMode: 'streamed-player-required'` means the current player must reject playback, even when `exportMode: 'backpressured-wav'` indicates a bounded local export is possible. The result is attached as `error.resourcePlan` on the current `MEMORY_PRESSURE` failure.
