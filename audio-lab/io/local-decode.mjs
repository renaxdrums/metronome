import { inspectWavPcm } from './wav-info.mjs';

/**
 * Audio Lab local import: no upload, no writes to the original file.
 * decodeAudioData is a whole-file decoder; memory limits are explicit.
 */
export class AudioLabImportError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'AudioLabImportError';
    this.code = code;
    this.recoverable = true;
  }
}

function aborted(signal) {
  if (signal?.aborted) throw new AudioLabImportError('CANCELLED', 'Import annulé.');
}

/** Recognize media signatures; actual codec support is browser-dependent. */
export function sniffAudioFormat(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return null;
  const ascii = (start, len) => String.fromCharCode(...bytes.subarray(start, start + len));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'wav';
  if (ascii(0, 4) === 'fLaC') return 'flac';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(0, 3) === 'ID3') return 'mp3';
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 &&
      (bytes[1] & 0x06) !== 0 && (bytes[2] & 0xf0) !== 0xf0) return 'mp3';
  if (ascii(4, 4) === 'ftyp') return 'mp4';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
  return null;
}

/**
 * @param {Blob} file
 * @param {{ signal?: AbortSignal, onProgress?: (loaded: number, total: number) => void, maxEncodedBytes?: number }} [options]
 */
export async function readLocalAudioBytes(file, options = {}) {
  const { signal, onProgress = () => {}, maxEncodedBytes = 512 * 1024 * 1024 } = options;
  if (!file || typeof file.size !== 'number' || typeof file.arrayBuffer !== 'function' ||
      !Number.isSafeInteger(file.size) || file.size < 12)
    throw new AudioLabImportError('UNSUPPORTED_FORMAT', 'Fichier audio vide, tronqué ou invalide.');
  if (!Number.isSafeInteger(maxEncodedBytes) || maxEncodedBytes <= 0)
    throw new RangeError('maxEncodedBytes must be a positive safe integer');
  if (file.size > maxEncodedBytes)
    throw new AudioLabImportError('MEMORY_PRESSURE', 'Fichier trop volumineux pour le budget d’import actuel.');
  aborted(signal);
  let bytes;
  if (typeof file.stream === 'function') {
    bytes = new Uint8Array(file.size);
    const reader = file.stream().getReader();
    let written = 0;
    try {
      for (;;) {
        aborted(signal);
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array) || written + value.byteLength > bytes.byteLength)
          throw new AudioLabImportError('DECODE_FAILED', 'Flux du fichier incohérent.');
        bytes.set(value, written);
        written += value.byteLength;
        onProgress(written, file.size);
      }
      if (written !== file.size)
        throw new AudioLabImportError('DECODE_FAILED', 'Lecture du fichier incomplète.');
    } finally {
      reader.releaseLock();
    }
  } else {
    try { bytes = new Uint8Array(await file.arrayBuffer()); }
    catch (error) { throw new AudioLabImportError('DECODE_FAILED', 'Lecture locale impossible.', error); }
    if (bytes.length !== file.size) throw new AudioLabImportError('DECODE_FAILED', 'Lecture du fichier incomplète.');
    onProgress(bytes.length, bytes.length);
  }
  aborted(signal);
  const format = sniffAudioFormat(bytes);
  if (!format) throw new AudioLabImportError('UNSUPPORTED_FORMAT', 'Format audio non reconnu.');
  return { bytes: bytes.buffer, format };
}

/**
 * The caller owns the returned context and must close it when finished.
 * @param {File | Blob} file
 * @param {{ createContext?: () => AudioContext, maxEncodedBytes?: number, maxDecodedBytes?: number,
 * signal?: AbortSignal, onProgress?: (event: { phase: 'read'|'decode'|'ready', loaded: number, total: number }) => void }} [options]
 */
export async function decodeLocalAudio(file, options = {}) {
  const { createContext = () => new AudioContext(), maxDecodedBytes = 768 * 1024 * 1024,
    signal, onProgress = () => {} } = options;
  if (!Number.isSafeInteger(maxDecodedBytes) || maxDecodedBytes <= 0)
    throw new RangeError('maxDecodedBytes must be a positive safe integer');
  const { bytes, format } = await readLocalAudioBytes(file, {
    ...options,
    onProgress: (loaded, total) => onProgress({ phase: 'read', loaded, total }),
  });
  const sourcePcm = format === 'wav' ? inspectWavPcm(new Uint8Array(bytes)) : null;
  aborted(signal);
  let context;
  try {
    context = createContext();
    onProgress({ phase: 'decode', loaded: 0, total: 1 });
    const buffer = await context.decodeAudioData(bytes);
    aborted(signal);
    if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0 ||
        !Number.isSafeInteger(buffer.length) || buffer.length <= 0 ||
        !Number.isSafeInteger(buffer.numberOfChannels) || buffer.numberOfChannels <= 0)
      throw new AudioLabImportError('DECODE_FAILED', 'Décodage audio invalide.');
    if (buffer.length * buffer.numberOfChannels * 4 > maxDecodedBytes)
      throw new AudioLabImportError('MEMORY_PRESSURE', 'Audio décodé trop volumineux pour la mémoire disponible.');
    onProgress({ phase: 'ready', loaded: 1, total: 1 });
    return {
      buffer, context, format,
      identity: {
        name: typeof file.name === 'string' ? file.name : 'Audio local',
        sizeBytes: file.size,
        mimeType: file.type || '',
        sampleRate: buffer.sampleRate,
        sourceSampleRate: sourcePcm?.sampleRate,
        sourceBitDepth: sourcePcm?.bitDepth,
        sourceChannels: sourcePcm?.channels,
        channels: buffer.numberOfChannels,
        durationSeconds: buffer.duration,
      },
    };
  } catch (error) {
    try { await context?.close?.(); } catch { /* best-effort cleanup */ }
    if (error instanceof AudioLabImportError) throw error;
    throw new AudioLabImportError('DECODE_FAILED', 'Décodage non pris en charge ou ressources insuffisantes.', error);
  }
}
