/**
 * Read source PCM metadata without decoding or changing any sample.
 * A null result leaves codec negotiation to the browser audio decoder.
 * RIFF/WAVE (little-endian) only; RF64 and RIFX are not interpreted here.
 */
export function inspectWavPcm(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fourCC = (at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (fourCC(0) !== 'RIFF' || fourCC(8) !== 'WAVE') return null;
  // The RIFF length is trusted only to bound scanning, not to validate decoder success.
  const riffEnd = Math.min(bytes.length, view.getUint32(4, true) + 8);
  for (let at = 12; at + 8 <= riffEnd;) {
    const size = view.getUint32(at + 4, true);
    const start = at + 8;
    if (size > riffEnd - start) return null;
    if (fourCC(at) === 'fmt ') {
      if (size < 16) return null;
      const tag = view.getUint16(start, true);
      const channels = view.getUint16(start + 2, true);
      const sampleRate = view.getUint32(start + 4, true);
      const byteRate = view.getUint32(start + 8, true);
      const blockAlign = view.getUint16(start + 12, true);
      const containerBits = view.getUint16(start + 14, true);
      let bitDepth = containerBits;
      let isPcm = tag === 1;
      if (tag === 0xfffe && size >= 40) {
        // WAVE_FORMAT_EXTENSIBLE: PCM SubFormat GUID starts with LE format tag 1.
        const subtype = view.getUint32(start + 24, true);
        const tail = [0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71];
        isPcm = subtype === 1 && tail.every((b, i) => bytes[start + 28 + i] === b);
        const validBits = view.getUint16(start + 18, true);
        if (validBits > 0 && validBits <= containerBits) bitDepth = validBits;
      }
      if (!isPcm || channels < 1 || sampleRate < 1 || containerBits % 8 !== 0 ||
          (bitDepth !== 16 && bitDepth !== 24) ||
          blockAlign !== channels * (containerBits / 8) ||
          byteRate !== sampleRate * blockAlign) return null;
      return { sampleRate, bitDepth, containerBits, channels, encoding: 'pcm' };
    }
    at = start + size + (size & 1);
  }
  return null;
}
