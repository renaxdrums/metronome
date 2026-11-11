import { inspectWavPcm } from '../audio-lab/io/wav-info.mjs';
import assert from 'node:assert/strict';
import { AudioLabImportError, sniffAudioFormat, readLocalAudioBytes, decodeLocalAudio } from '../audio-lab/io/local-decode.mjs';

const mp3 = Uint8Array.from([...Buffer.from('ID3'), ...new Uint8Array(97)]);
const wav = Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE'), ...new Uint8Array(48)]);
const flac = Uint8Array.from([...Buffer.from('fLaC'), ...new Uint8Array(24)]);
assert.equal(sniffAudioFormat(mp3), 'mp3');
assert.equal(sniffAudioFormat(wav), 'wav');
assert.equal(sniffAudioFormat(flac), 'flac');
assert.equal(sniffAudioFormat(new Uint8Array(20)), null);
const file = new File([mp3], 'recording.mp3', { type: 'audio/mpeg' });
const progress = [];
const raw = await readLocalAudioBytes(file, { onProgress: (loaded, total) => progress.push([loaded, total]) });
assert.equal(raw.bytes.byteLength, mp3.length);
assert.equal(raw.format, 'mp3');
assert.equal(progress.at(-1)[0], mp3.length);
await assert.rejects(readLocalAudioBytes(file, { maxEncodedBytes: 20 }), (error) => error.code === 'MEMORY_PRESSURE');
await assert.rejects(readLocalAudioBytes(new File([new Uint8Array(20)], 'x.mp3')), (error) => error.code === 'UNSUPPORTED_FORMAT');
const controller = new AbortController(); controller.abort();
await assert.rejects(readLocalAudioBytes(file, { signal: controller.signal }), (error) => error.code === 'CANCELLED');

let closed = 0;
const buffer = { duration: 2, length: 88200, numberOfChannels: 2, sampleRate: 44100 };
const createContext = () => ({ decodeAudioData: async () => buffer, close: async () => { closed++; } });
const events = [];
const decoded = await decodeLocalAudio(file, { createContext, onProgress: (e) => events.push(e) });
assert.equal(decoded.identity.channels, 2);
assert.equal(decoded.identity.name, 'recording.mp3');
assert.equal(decoded.identity.sampleRate, 44100);
assert.deepEqual(events.filter((e) => e.phase !== 'read').map((e) => e.phase), ['decode', 'ready']);
assert.equal(closed, 0, 'success returns context ownership to caller');
await assert.rejects(decodeLocalAudio(file, { createContext, maxDecodedBytes: 100 }), (error) => error.code === 'MEMORY_PRESSURE');
assert.equal(closed, 1, 'failed decode cleans up owned context');
await assert.rejects(decodeLocalAudio(file, { createContext: () => ({ decodeAudioData: async () => { throw Error('bad codec'); }, close: async () => { closed++; } }) }), (error) => error.code === 'DECODE_FAILED');
assert.equal(closed, 2);
assert(AudioLabImportError.prototype instanceof Error);
console.log('Audio Lab: offline local import, format sniffing, progress, cancellation, decode diagnostics passed');

function buildSourceWav(sampleRate, bitDepth, withOddJunk = true) {
  const channels = 2, bytesPerSample = bitDepth / 8, dataLength = 16 * channels * bytesPerSample;
  const extra = withOddJunk ? 18 : 0;
  const bytes = new Uint8Array(44 + dataLength + extra);
  const view = new DataView(bytes.buffer);
  const put = (at, s) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); put(8, 'WAVE');
  let at = 12;
  if (withOddJunk) { put(at, 'JUNK'); view.setUint32(at + 4, 9, true); at += 18; }
  put(at, 'fmt '); view.setUint32(at + 4, 16, true);
  view.setUint16(at + 8, 1, true); view.setUint16(at + 10, channels, true);
  view.setUint32(at + 12, sampleRate, true);
  view.setUint32(at + 16, sampleRate * channels * bytesPerSample, true);
  view.setUint16(at + 20, channels * bytesPerSample, true);
  view.setUint16(at + 22, bitDepth, true);
  at += 24;
  put(at, 'data'); view.setUint32(at + 4, dataLength, true);
  return bytes;
}
for (const sourceSampleRate of [44100, 48000, 96000]) {
  for (const sourceBitDepth of [16, 24]) {
    const bytes = buildSourceWav(sourceSampleRate, sourceBitDepth);
    assert.deepEqual(inspectWavPcm(bytes), {
      sampleRate: sourceSampleRate, bitDepth: sourceBitDepth,
      containerBits: sourceBitDepth, channels: 2, encoding: 'pcm',
    });
    const pcmFile = new File([bytes], 'source.wav', { type: 'audio/wav' });
    const converted = await decodeLocalAudio(pcmFile, { createContext: () => ({
      decodeAudioData: async () => ({ duration: 0.01, length: 480, sampleRate: 48000, numberOfChannels: 2 }),
      close: async () => {},
    }) });
    assert.equal(converted.identity.sourceSampleRate, sourceSampleRate);
    assert.equal(converted.identity.sourceBitDepth, sourceBitDepth);
    assert.equal(converted.identity.sourceChannels, 2);
    assert.equal(converted.identity.sampleRate, 48000, 'decoded rate can differ from original rate');
    assert.equal(inspectWavPcm(bytes.subarray(0, 20)), null, 'truncated header is not parsed');
    await converted.context.close();
  }
}
assert.equal(inspectWavPcm(new Uint8Array(32)), null);
assert.equal(inspectWavPcm(buildSourceWav(44100, 32)), null);
console.log('Audio Lab: WAV source PCM 16/24-bit, 44.1/48/96 kHz metadata preserved independently of decoded sample rate');
