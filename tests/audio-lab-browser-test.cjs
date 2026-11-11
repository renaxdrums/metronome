const assert = require('node:assert/strict');
const { start, save } = require('./audio-harness.cjs');
(async () => {
  const harness = await start();
  try {
    const page = await harness.browser.newPage();
    await page.goto(harness.url);
    const result = await page.evaluate(async () => {
      const { decodeLocalAudio } = await import('/audio-lab/io/local-decode.mjs');
      const { extractWaveformPeaks } = await import('/audio-lab/waveform/peak-client.mjs');
      const { OriginalAudioPlayer } = await import('/audio-lab/transport/original-player.mjs');
      const sampleRate = 44100, frames = sampleRate / 2;
      const pcm = new Uint8Array(44 + frames * 2);
      const view = new DataView(pcm.buffer);
      const put = (offset, str) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
      };
      put(0, 'RIFF'); view.setUint32(4, pcm.length - 8, true);
      put(8, 'WAVE'); put(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      put(36, 'data'); view.setUint32(40, frames * 2, true);
      for (let i = 0; i < frames; i++)
        view.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 220 * i / sampleRate) * 12000), true);
      const sourceBytes = pcm.slice();
      const file = new File([pcm], 'original.wav', { type: 'audio/wav' });
      const phases = [];
      const imported = await decodeLocalAudio(file, { onProgress: (event) => phases.push(event.phase) });
      const points = [];
      const peaks = await extractWaveformPeaks(imported.buffer, {
        onProgress: (done) => points.push(done),
      });
      const player = new OriginalAudioPlayer({ context: imported.context, buffer: imported.buffer });
      try {
        await player.play();
        player.seek(0.12);
        player.setLoop(0.1, 0.3);
        const position = player.positionSeconds();
        player.pause();
        player.stop();
        return {
          duration: imported.identity.durationSeconds,
          sampleRate: imported.identity.sampleRate,
          channels: imported.identity.channels,
          peakLevels: peaks.levels.length,
          frames: peaks.sampleCount,
          progress: points.at(-1),
          phases,
          position,
          intact: sourceBytes.every((value, i) => value === pcm[i]),
        };
      } finally {
        player.dispose();
        await imported.context.close();
      }
    });
    assert(Math.abs(result.duration - 0.5) < 1e-5, JSON.stringify(result));
    assert([44100, 48000, 96000].includes(result.sampleRate), JSON.stringify(result));
    assert.equal(result.channels, 1);
    assert(result.peakLevels >= 3);
    assert.equal(result.frames, Math.round(result.sampleRate * 0.5));
    assert.equal(result.progress, result.frames);
    assert(result.phases.includes('decode') && result.phases.includes('ready'));
    assert(result.position >= 0.1 && result.position < 0.3);
    assert(result.intact);
    save('audio-lab-browser-results.json', result);
    console.log('PASS Audio Lab: real browser WAV import, Web Worker peaks and AudioContext transport');
  } finally {
    await harness.browser.close();
    harness.server?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
