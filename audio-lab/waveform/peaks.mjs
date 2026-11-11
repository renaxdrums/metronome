/** Audio Lab multichannel peak pyramid; decoding responsibility stays in an I/O worker. */
export class PeakPyramidBuilder {
  constructor(channelCount, bucketSamples = 256) {
    if (!Number.isSafeInteger(channelCount) || channelCount < 1 || channelCount > 32)
      throw new RangeError('channelCount must be 1..32');
    if (!Number.isSafeInteger(bucketSamples) || bucketSamples < 16 || bucketSamples > 65536 ||
        (bucketSamples & (bucketSamples - 1)) !== 0)
      throw new RangeError('bucketSamples must be a power of two between 16 and 65536');
    this.channelCount = channelCount;
    this.bucketSamples = bucketSamples;
    this.sampleCount = 0;
    this.inBucket = 0;
    this.minimum = Array.from({ length: channelCount }, () => Infinity);
    this.maximum = Array.from({ length: channelCount }, () => -Infinity);
    this.mins = Array.from({ length: channelCount }, () => []);
    this.maxs = Array.from({ length: channelCount }, () => []);
    this.finished = false;
  }

  flush() {
    for (let c = 0; c < this.channelCount; c++) {
      this.mins[c].push(this.minimum[c]);
      this.maxs[c].push(this.maximum[c]);
      this.minimum[c] = Infinity;
      this.maximum[c] = -Infinity;
    }
    this.inBucket = 0;
  }

  /** blocks: one Float32Array per channel, same number of frames. */
  push(blocks) {
    if (this.finished) throw new Error('peak pyramid already finalized');
    if (!Array.isArray(blocks) || blocks.length !== this.channelCount ||
        !blocks.every((block) => block instanceof Float32Array && block.length === blocks[0].length))
      throw new TypeError('blocks must contain equal-length Float32Array channels');
    const length = blocks[0].length;
    if (!Number.isSafeInteger(this.sampleCount + length)) throw new RangeError('sample counter overflow');
    // Validation is transactional: rejecting a bad chunk must not alter builder state.
    for (const block of blocks) for (const sample of block)
      if (!Number.isFinite(sample)) throw new RangeError('non-finite audio sample');
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < this.channelCount; c++) {
        const value = blocks[c][i];
        if (value < this.minimum[c]) this.minimum[c] = value;
        if (value > this.maximum[c]) this.maximum[c] = value;
      }
      this.inBucket++;
      if (this.inBucket === this.bucketSamples) this.flush();
    }
    this.sampleCount += length;
  }

  /** Returns min/max Float32Array arrays for each channel at each doubling resolution. */
  finish() {
    if (this.finished) throw new Error('peak pyramid already finalized');
    this.finished = true;
    if (this.inBucket) this.flush();
    let minima = this.mins.map((values) => Float32Array.from(values));
    let maxima = this.maxs.map((values) => Float32Array.from(values));
    const levels = [];
    let samplesPerBucket = this.bucketSamples;
    while (minima[0].length) {
      levels.push({ samplesPerBucket, minimum: minima, maximum: maxima });
      if (minima[0].length === 1) break;
      const count = Math.ceil(minima[0].length / 2);
      minima = minima.map((values) => Float32Array.from({ length: count }, (_, j) =>
        Math.min(values[2 * j], values[2 * j + 1] ?? values[2 * j])));
      maxima = maxima.map((values) => Float32Array.from({ length: count }, (_, j) =>
        Math.max(values[2 * j], values[2 * j + 1] ?? values[2 * j])));
      samplesPerBucket *= 2;
    }
    return { channelCount: this.channelCount, sampleCount: this.sampleCount, levels };
  }
}
