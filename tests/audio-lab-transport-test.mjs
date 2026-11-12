import assert from 'node:assert/strict';
import { OriginalAudioPlayer } from '../audio-lab/transport/original-player.mjs';

class Gain {
  constructor() {
    this.gain = {
      value: 1,
      cancelScheduledValues() {},
      setValueAtTime(value) { this.value = value; },
      linearRampToValueAtTime(value) { this.value = value; },
      setTargetAtTime(value) { this.value = value; },
    };
  }
  connect() {}
  disconnect() {}
}
class Source {
  constructor() { this.playbackRate = { value: 1 }; this.started = []; this.stopped = []; }
  connect() {}
  disconnect() {}
  start(...args) { this.started.push(args); }
  stop(...args) { this.stopped.push(args); }
}
const context = {
  currentTime: 10, state: 'running', destination: {},
  createGain: () => new Gain(),
  createBufferSource: () => new Source(),
  resume: async () => {},
};
const states = [];
const player = new OriginalAudioPlayer({ context, buffer: { duration: 20 }, onState: (state) => states.push(state) });
assert.equal(player.positionSeconds(), 0);
const when = await player.play();
assert.equal(when, 10.025);
assert.equal(player.source.node.playbackRate.value, 1);
assert.equal(player.source.node.started[0][1], 0);
context.currentTime = 11.025;
assert(Math.abs(player.positionSeconds() - 1) < 1e-8);
player.pause();
assert(Math.abs(player.positionSeconds() - 1) < 1e-8);
assert.equal(player.playing, false);
await player.play();
context.currentTime = 12.025;
player.seek(5);
assert(Math.abs(player.positionSeconds() - 5) < 1e-8);
player.setLoop(5, 7);
context.currentTime = 16.05;
assert(Math.abs(player.positionSeconds() - 5) < 1e-8);
player.clearLoop();
assert.equal(player.loop, null);
player.setVolume(0.4);
assert.equal(player.output.gain.value, 0.4);
assert.throws(() => player.setLoop(8, 3), /invalid/);
assert.throws(() => player.seek(-1), /outside/);
player.stop();
assert.equal(player.positionSeconds(), 0);
player.dispose();
assert.throws(() => player.seek(5), /disposed/);
assert(states.length > 5);
// A queued resume must not start after a stop.
let allowResume;
const delayed = { ...context, resume: () => new Promise((resolve) => { allowResume = resolve; }) };
const stale = new OriginalAudioPlayer({ context: delayed, buffer: { duration: 5 } });
const pending = stale.play();
stale.stop();
allowResume();
assert.equal(await pending, null);
assert.equal(stale.playing, false);
console.log('Audio Lab: AudioContext transport play/pause/seek/loop/dispose and stale-start protection passed');
