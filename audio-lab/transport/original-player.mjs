/**
 * Independent, non-destructive original-file transport.
 * Source time is derived solely from AudioContext.currentTime; visual frames
 * may sample positionSeconds(), never schedule sound themselves.
 * No pitch-preserving slowdown or Warp rendering is claimed in this class.
 */
export class OriginalAudioPlayer {
  constructor({ context, buffer, destination, onState = () => {}, leadSeconds = 0.025 }) {
    if (!context || !buffer || typeof context.createBufferSource !== 'function' ||
        typeof context.createGain !== 'function' || !Number.isFinite(buffer.duration) || buffer.duration <= 0)
      throw new TypeError('valid AudioContext and decoded AudioBuffer are required');
    if (!Number.isFinite(leadSeconds) || leadSeconds < 0 || leadSeconds > 1)
      throw new RangeError('invalid leadSeconds');
    this.context = context;
    this.buffer = buffer;
    this.onState = onState;
    this.leadSeconds = leadSeconds;
    this.output = context.createGain();
    this.output.gain.value = 0.7; // Audio Lab only; RENAX's validated gains are untouched.
    this.output.connect(destination || context.destination);
    this.source = null;
    this.startedAt = 0;
    this.startedOffset = 0;
    this.offset = 0;
    this.playing = false;
    this.loop = null;
    this.destroyed = false;
    this.generation = 0;
  }

  notify() {
    this.onState({ playing: this.playing, positionSeconds: this.positionSeconds(), loop: this.loop });
  }

  positionSeconds() {
    if (!this.playing) return this.offset;
    const elapsed = Math.max(0, this.context.currentTime - this.startedAt);
    let position = this.startedOffset + elapsed;
    if (this.loop && position >= this.loop.end) {
      const length = this.loop.end - this.loop.start;
      position = this.loop.start + ((position - this.loop.start) % length);
    }
    return Math.min(position, this.buffer.duration);
  }

  stopNode(fade = true) {
    const holder = this.source;
    this.source = null;
    if (!holder) return;
    const now = this.context.currentTime;
    try {
      if (fade) {
        holder.gain.gain.cancelScheduledValues(now);
        holder.gain.gain.setValueAtTime(holder.gain.gain.value, now);
        holder.gain.gain.linearRampToValueAtTime(0, now + 0.004);
        holder.node.stop(now + 0.005);
      } else holder.node.stop();
    } catch { /* node may have finished naturally */ }
    // Keep onended attached so both retired and current graph nodes disconnect.
  }

  startNode() {
    if (this.offset >= this.buffer.duration && !this.loop) this.offset = 0;
    if (this.loop && (this.offset < this.loop.start || this.offset >= this.loop.end))
      this.offset = this.loop.start;
    const node = this.context.createBufferSource();
    const gain = this.context.createGain();
    node.buffer = this.buffer;
    node.playbackRate.value = 1;
    if (this.loop) {
      node.loop = true;
      node.loopStart = this.loop.start;
      node.loopEnd = this.loop.end;
    }
    gain.gain.value = 0;
    node.connect(gain);
    gain.connect(this.output);
    const when = this.context.currentTime + this.leadSeconds;
    this.startedAt = when;
    this.startedOffset = this.offset;
    this.source = { node, gain };
    this.playing = true;
    node.onended = () => {
      try { node.disconnect(); gain.disconnect(); } catch { /* disconnect is best effort */ }
      if (this.source?.node !== node || !this.playing) return;
      this.source = null;
      this.playing = false;
      this.offset = this.buffer.duration;
      this.notify();
    };
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(1, when + 0.005);
    try { node.start(when, this.offset); }
    catch (error) {
      this.source = null;
      this.playing = false;
      try { node.disconnect(); gain.disconnect(); } catch { /* cleanup */ }
      throw error;
    }
    this.notify();
    return when;
  }

  /** Returns the scheduled AudioContext time, reusable by a future click adapter. */
  async play() {
    if (this.destroyed) throw new Error('player disposed');
    if (this.playing) return this.startedAt;
    const request = ++this.generation;
    await this.context.resume();
    if (this.destroyed || request !== this.generation) return null;
    if (this.context.state !== 'running') throw new Error('AudioContext could not start');
    return this.startNode();
  }

  pause() {
    if (this.destroyed) return;
    this.generation++;
    if (!this.playing) return;
    this.offset = this.positionSeconds();
    this.playing = false;
    this.stopNode();
    this.notify();
  }

  stop() {
    if (this.destroyed) return;
    this.generation++;
    this.playing = false;
    this.stopNode();
    this.offset = 0;
    this.notify();
  }

  seek(seconds) {
    if (this.destroyed) throw new Error('player disposed');
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > this.buffer.duration)
      throw new RangeError('seek outside audio duration');
    this.offset = seconds;
    if (this.playing) {
      this.stopNode();
      this.startNode();
    } else this.notify();
  }

  setLoop(startSeconds, endSeconds) {
    if (this.destroyed) throw new Error('player disposed');
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) ||
        startSeconds < 0 || endSeconds > this.buffer.duration || endSeconds <= startSeconds)
      throw new RangeError('invalid A/B loop');
    const at = this.positionSeconds();
    this.loop = Object.freeze({ start: startSeconds, end: endSeconds });
    this.offset = at < startSeconds || at >= endSeconds ? startSeconds : at;
    if (this.playing) { this.stopNode(); this.startNode(); }
    else this.notify();
  }

  clearLoop() {
    if (this.destroyed) return;
    if (!this.loop) return;
    const at = this.positionSeconds();
    this.loop = null;
    this.offset = at;
    if (this.playing) { this.stopNode(); this.startNode(); }
    else this.notify();
  }

  setVolume(value) {
    if (this.destroyed) throw new Error('player disposed');
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw new RangeError('volume must be between 0 and 1');
    this.output.gain.setTargetAtTime(value, this.context.currentTime, 0.005);
  }

  dispose() {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
    this.output.disconnect();
  }
}
