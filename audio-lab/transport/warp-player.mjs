/**
 * Audio Lab Warp playback — a pre-rendered pitch-preserving buffer and RENAX click
 * buffers share one AudioContext clock. The scheduler's timer only queues audio
 * nodes ahead of time; audible timing never depends on a visual animation frame.
 *
 * This player deliberately DOES NOT time-stretch in real time. It plays the
 * already-rendered Warp PCM delivered by the offline Worker.
 */
import { scheduleWarpClickRange } from './warp-click.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function firstEventAtOrAfter(events, seconds) {
  let low = 0, high = events.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (events[mid].seconds < seconds) low = mid + 1; else high = mid;
  }
  return low;
}

/** All positions and loops are expressed in the *output* Warp timeline. */
export class WarpPlaybackSession {
  constructor({
    context, buffer, clickPlan = { events: [] }, clickSamples = null,
    destination = context?.destination, onState = () => {},
    leadSeconds = 0.06, lookaheadSeconds = 0.2, intervalMilliseconds = 35,
    audioGain = 0.7, clickGain = 0.7,
    clock = globalThis,
  }) {
    if (!context || typeof context.createBufferSource !== 'function' ||
        typeof context.createGain !== 'function' || typeof context.resume !== 'function' ||
        !buffer || !finite(buffer.duration) || buffer.duration <= 0 ||
        !Array.isArray(clickPlan?.events) || typeof onState !== 'function' ||
        !finite(leadSeconds) || leadSeconds < 0.02 || leadSeconds > 0.5 ||
        !finite(lookaheadSeconds) || lookaheadSeconds < leadSeconds ||
        lookaheadSeconds > 2 || !Number.isInteger(intervalMilliseconds) ||
        intervalMilliseconds < 10 || intervalMilliseconds > 200 ||
        !finite(audioGain) || audioGain < 0 || audioGain > 1 ||
        !finite(clickGain) || clickGain < 0 || clickGain > 1 ||
        typeof clock.setInterval !== 'function' ||
        typeof clock.clearInterval !== 'function') {
      throw new TypeError('Invalid Warp playback configuration');
    }
    if (clickSamples !== null &&
        (!Array.isArray(clickSamples) || clickSamples.length !== 3 ||
          clickSamples.some(sample => !sample || !finite(sample.duration) || sample.duration <= 0)))
      throw new TypeError('Three decoded RENAX click AudioBuffers are required');
    for (let i = 0; i < clickPlan.events.length; i++) {
      const event = clickPlan.events[i];
      if (!finite(event?.seconds) || event.seconds < 0 || event.seconds >= buffer.duration ||
          ![0, 1, 2].includes(event.accent) ||
          (i && event.seconds <= clickPlan.events[i - 1].seconds))
        throw new RangeError('Click events must be strictly increasing within Warp audio');
    }
    this.context = context;
    this.buffer = buffer;
    this.clickPlan = clickPlan;
    this.clickSamples = clickSamples;
    this.onState = onState;
    this.leadSeconds = leadSeconds;
    this.lookaheadSeconds = lookaheadSeconds;
    this.intervalMilliseconds = intervalMilliseconds;
    this.clock = clock;
    this.audioBus = context.createGain();
    this.audioBus.gain.value = audioGain;
    this.clickBus = context.createGain();
    this.clickBus.gain.value = clickGain;
    this.audioBus.connect(destination);
    this.clickBus.connect(destination);
    this.source = null;
    this.activeClicks = new Set();
    this.timer = null;
    this.generation = 0;
    this.playing = false;
    this.destroyed = false;
    this.position = 0;
    this.anchorTime = 0;
    this.anchorOffset = 0;
    this.scheduledThrough = 0;
    this.loop = null;
  }

  notify() {
    this.onState({
      playing: this.playing,
      positionSeconds: this.positionSeconds(),
      loop: this.loop,
    });
  }

  positionSeconds() {
    if (!this.playing) return this.position;
    const elapsed = Math.max(0, this.context.currentTime - this.anchorTime);
    const raw = this.anchorOffset + elapsed;
    if (this.loop && raw >= this.loop.end) {
      const span = this.loop.end - this.loop.start;
      return this.loop.start + ((raw - this.loop.start) % span);
    }
    return Math.min(raw, this.buffer.duration);
  }

  clearScheduled(stopActive = true) {
    if (this.timer !== null) {
      this.clock.clearInterval(this.timer);
      this.timer = null;
    }
    if (stopActive) {
      for (const click of this.activeClicks) {
        try { click.stop(); } catch { /* already played / ended */ }
        try { click.disconnect(); } catch { /* cleanup */ }
      }
      this.activeClicks.clear();
    }
  }

  retireSource() {
    const old = this.source;
    this.source = null;
    if (!old) return;
    try { old.stop(); } catch { /* already ended */ }
    try { old.disconnect(); } catch { /* cleanup */ }
  }

  /** Schedules audible clicks only within the bounded lookahead window. */
  scheduleClicks() {
    if (!this.playing || !this.clickSamples || !this.clickPlan.events.length) return;
    const now = this.context.currentTime;
    const from = Math.max(this.scheduledThrough, this.anchorTime, now);
    const to = Math.min(now + this.lookaheadSeconds,
      this.anchorTime + (this.loop ? Infinity : this.buffer.duration - this.anchorOffset));
    if (!(to > from)) return;
    const firstOutput = this.anchorOffset + (from - this.anchorTime);
    const lastOutput = this.anchorOffset + (to - this.anchorTime);
    let eventsScheduled = 0;

    const scheduleCycle = (cycle, begin, end, minTime, maxTime) => {
      const events = this.clickPlan.events;
      const startIndex = firstEventAtOrAfter(events, begin);
      const endIndex = firstEventAtOrAfter(events, end);
      if (endIndex <= startIndex) return;
      if (eventsScheduled + endIndex - startIndex > 2048)
        throw new RangeError('Warp click lookahead exceeds 2048 events');
      const plan = {events: events.slice(startIndex, endIndex)};
      const startTime = this.anchorTime - this.anchorOffset + cycle;
      const nodes = scheduleWarpClickRange({
        context:this.context, clickSamples:this.clickSamples,
        destination:this.clickBus, plan,
        sessionStartAudioTime:startTime, fromSeconds:minTime,toSeconds:maxTime,gain:1,
      });
      for (const node of nodes) {
        const originalOnEnded = node.onended;
        node.onended = () => {
          try { originalOnEnded?.(); } finally { this.activeClicks.delete(node); }
        };
        this.activeClicks.add(node);
      }
      eventsScheduled += nodes.length;
    };

    if (!this.loop) {
      scheduleCycle(0, firstOutput, lastOutput, firstOutput, lastOutput);
    } else {
      const {start,end} = this.loop, span = end - start;
      const cycleStart = Math.max(0, Math.floor((firstOutput - start) / span));
      const cycleEnd = Math.max(cycleStart, Math.floor((lastOutput - start) / span));
      if (cycleEnd - cycleStart > 128)
        throw new RangeError('Warp click loop requires excessively short repetitions');
      for (let n=cycleStart; n<=cycleEnd; n++) {
        const timeShift = n * span;
        // n=0 begins at the current user-requested output position.
        const begin = Math.max(start, firstOutput - timeShift);
        const endSlice = Math.min(end, lastOutput - timeShift);
        if (endSlice <= begin) continue;
        scheduleCycle(timeShift, begin, endSlice, begin, endSlice);
      }
    }
    this.scheduledThrough = to;
  }

  scheduleTick() {
    if (!this.playing) return;
    try { this.scheduleClicks(); }
    catch (error) {
      this.pause();
      this.onState({playing:false,positionSeconds:this.position, error});
    }
  }

  startSource() {
    if (this.position >= this.buffer.duration && !this.loop) this.position = 0;
    if (this.loop && (this.position < this.loop.start || this.position >= this.loop.end))
      this.position = this.loop.start;
    const node = this.context.createBufferSource();
    node.buffer = this.buffer;
    if (this.loop) {
      node.loop = true;
      node.loopStart = this.loop.start;
      node.loopEnd = this.loop.end;
    }
    node.connect(this.audioBus);
    const when = this.context.currentTime + this.leadSeconds;
    const generation = this.generation;
    this.anchorTime = when;
    this.anchorOffset = this.position;
    this.scheduledThrough = when;
    this.source = node;
    this.playing = true;
    node.onended = () => {
      try { node.disconnect(); } catch { /* cleanup */ }
      if (this.source !== node || generation !== this.generation || !this.playing) return;
      this.clearScheduled(false); // Preserve natural RENAX bell tails after audio ends.
      this.source = null;
      this.playing = false;
      this.position = this.buffer.duration;
      this.notify();
    };
    try {
      node.start(when, this.position);
      this.scheduleClicks();
      this.timer = this.clock.setInterval(() => this.scheduleTick(), this.intervalMilliseconds);
    } catch (error) {
      this.clearScheduled();
      this.retireSource();
      this.playing = false;
      throw error;
    }
    this.notify();
    return when;
  }

  async play() {
    if (this.destroyed) throw new Error('Warp player disposed');
    if (this.playing) return this.anchorTime;
    const generation = ++this.generation;
    await this.context.resume();
    if (this.destroyed || generation !== this.generation) return null;
    if (this.context.state !== 'running') throw new Error('AudioContext could not resume');
    return this.startSource();
  }

  pause() {
    if (this.destroyed) return;
    this.generation++;
    if (this.playing) this.position = this.positionSeconds();
    this.playing = false;
    this.clearScheduled();
    this.retireSource();
    this.notify();
  }

  stop() {
    if (this.destroyed) return;
    this.pause();
    this.position = 0;
    this.notify();
  }

  seek(seconds) {
    if (this.destroyed) throw new Error('Warp player disposed');
    if (!finite(seconds) || seconds < 0 || seconds > this.buffer.duration)
      throw new RangeError('seek outside rendered Warp output');
    const wasPlaying = this.playing;
    if (wasPlaying) {
      this.pause();
      this.position = seconds;
      this.generation++;
      this.startSource();
    } else {
      this.position = seconds;
      this.notify();
    }
  }

  setLoop(start, end) {
    if (this.destroyed) throw new Error('Warp player disposed');
    if (!finite(start) || !finite(end) || start < 0 || end > this.buffer.duration ||
        end - start < .04) throw new RangeError('invalid Warp loop');
    const current = this.positionSeconds();
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.loop = Object.freeze({start,end});
    this.position = clamp(current,start,end-.000001);
    if (wasPlaying) this.startSource(); else this.notify();
  }

  clearLoop() {
    if (!this.loop) return;
    const wasPlaying = this.playing, current = this.positionSeconds();
    if (wasPlaying) this.pause();
    this.loop = null;
    this.position = current;
    if (wasPlaying) this.startSource(); else this.notify();
  }

  setLevels({audio,click}) {
    if (this.destroyed) throw new Error('Warp player disposed');
    if (audio !== undefined) {
      if (!finite(audio) || audio < 0 || audio > 1) throw new RangeError('invalid audio gain');
      this.audioBus.gain.setTargetAtTime(audio, this.context.currentTime, .005);
    }
    if (click !== undefined) {
      if (!finite(click) || click < 0 || click > 1) throw new RangeError('invalid click gain');
      this.clickBus.gain.setTargetAtTime(click, this.context.currentTime, .005);
    }
  }

  dispose() {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
    this.audioBus.disconnect();
    this.clickBus.disconnect();
  }
}
