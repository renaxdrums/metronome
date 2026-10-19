const assert = require('node:assert/strict');
const path = require('node:path'),
  fs = require('node:fs');
const AxeBuilder = require('@axe-core/playwright').default;
const { Clock } = require('../multi-clock.js');
const { start, save } = require('./audio-harness.cjs');
(async () => {
  const h = await start();
  try {
    const clock = new Clock(1, 120);
    assert.equal(clock.visualWhen(2, 235), 2.235);
    assert.equal(clock.when(2), 2);
    clock.setTempo(60, 2);
    assert.equal(clock.visualWhen(3, -100), 2.9);
    assert.equal(clock.when(3), 3);
    const context = await h.browser.newContext();
    const p = await context.newPage();
    await p.addInitScript(() => {
      window.__locks = [];
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: async (type) => {
            if (type !== 'screen') throw Error('Unexpected wake type');
            const lock = new EventTarget();
            lock.released = false;
            lock.releaseCount = 0;
            lock.release = async () => {
              lock.releaseCount++;
              lock.released = true;
              lock.dispatchEvent(new Event('release'));
            };
            window.__locks.push(lock);
            return lock;
          },
        },
      });
    });
    await p.goto(h.url);
    await p.waitForFunction(() => window.RENAX_MULTI && window.RENAX_PLAYBACK);
    for (const mode of ['metronome', 'multi', 'song']) {
      if (mode === 'multi') await p.getByRole('tab', { name: 'Multipiste', exact: true }).click();
      if (mode === 'song') {
        await p.getByRole('tab', { name: 'Métronome', exact: true }).click();
        await p.evaluate(() => {
          const measure = createMeasure(4, 4);
          RENAX_SONGS.replaceLibrary({
            version: 1,
            activeProfile: 'p',
            profiles: [
              {
                id: 'p',
                name: 'p',
                songs: [
                  { id: 's', name: 's', sections: [{ id: 'a', label: 'a', count: 2, measure }] },
                ],
              },
            ],
          });
          RENAX_SONGS.restoreNavigation({ pane: 'songs', view: 'detail', song: 's', profile: 'p' });
          RENAX_SONGS.loadSong();
        });
      }
      const before = await p.evaluate(() => window.__locks.length);
      await p.evaluate(() => (RENAX_MULTI.active ? RENAX_MULTI.start() : startMetronome()));
      await p.waitForFunction(() => window.__locks.some((l) => !l.released));
      await p.evaluate(() => stopMetronome());
      await p.waitForFunction(() => window.__locks.every((l) => l.released));
      assert.equal(await p.evaluate(() => window.__locks.length), before + 1);
      await p.evaluate(() => startMetronome());
      await p.waitForFunction(() => window.__locks.some((l) => !l.released));
      await p.evaluate(() =>
        reportAudioFailure(
          Error('Injected ' + (RENAX_MULTI.active ? 'multi' : 'transport') + ' failure'),
        ),
      );
      await p.waitForFunction(() => window.__locks.every((l) => l.released));
    }
    assert(await p.evaluate(() => window.__locks.every((l) => l.releaseCount === 1)));
    await p.getByRole('tab', { name: 'Métronome', exact: true }).click();
    await p.evaluate(() => startMetronome());
    await p.waitForFunction(() => window.__locks.some((l) => !l.released));
    await p.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await p.waitForFunction(() => window.__locks.every((l) => l.released));
    await p.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await p.waitForFunction(() => window.__locks.some((l) => !l.released));
    await p.evaluate(() => {
      const original = playClick;
      playClick = () => {
        throw Error('Injected output failure');
      };
      nextNoteTime = audioCtx.currentTime + 0.001;
      schedulerSafely();
      playClick = original;
    });
    await p.waitForFunction(() => window.__locks.every((l) => l.released));
    const result = await p.evaluate(async () => {
      const support = RENAX_PLAYBACK;
      for (const value of [-101, 401, NaN, Infinity, null, 'true'])
        if (support.setBluetoothEnabled(value)) throw Error('Invalid Bluetooth state accepted');
      if (!support.setBluetoothEnabled(true)) throw Error('Cannot enable Bluetooth correction');
      const automatic = support.delayMs({ outputLatency: 0.2, baseLatency: 0.01 });
      const fallback = support.delayMs({ baseLatency: 0.02 });
      const previous = audioCtx,
        timeout = window.setTimeout,
        calls = [];
      audioCtx = { currentTime: 1, outputLatency: 0.2 };
      window.setTimeout = (_fn, delay) => {
        calls.push(delay);
        return 0;
      };
      scheduleVisualUpdate(0, 0, 1.1);
      schedulePolyVisualUpdate(0, { outer: true, inner: true, outerIndex: 0, innerIndex: 0 }, 1.1);
      window.setTimeout = timeout;
      audioCtx = previous;
      // A deferred acquisition which resolves after stop must immediately release.
      let resolve;
      const lock = new EventTarget();
      lock.released = false;
      lock.release = async () => {
        lock.released = true;
      };
      navigator.wakeLock.request = () => new Promise((r) => (resolve = r));
      support.start();
      support.stop();
      resolve(lock);
      await new Promise((r) => setTimeout(r, 0));
      return {
        automatic,
        fallback,
        calls,
        raceReleased: lock.released,
        manual: support.manualMs,
        locks: window.__locks.length,
      };
    });
    assert.equal(result.automatic, 400);
    assert.equal(result.fallback, 220);
    const disabledOffset = await p.evaluate(() => {
      RENAX_PLAYBACK.setBluetoothEnabled(false);
      return RENAX_PLAYBACK.delayMs({ outputLatency: 0.2 });
    });
    assert.equal(disabledOffset, 200);
    await p.evaluate(() => RENAX_PLAYBACK.setBluetoothEnabled(true));
    for (const delay of result.calls) assert(Math.abs(delay - 500) < 1e-6);
    assert(result.raceReleased);
    const pendingVisibility = await p.evaluate(async () => {
      const support = RENAX_PLAYBACK;
      let resolveFirst,
        count = 0;
      const locks = [];
      const makeLock = () => {
        const l = new EventTarget();
        l.released = false;
        l.release = async () => {
          l.released = true;
          l.dispatchEvent(new Event('release'));
        };
        locks.push(l);
        return l;
      };
      navigator.wakeLock.request = () =>
        ++count === 1
          ? new Promise((r) => {
              resolveFirst = r;
            })
          : Promise.resolve(makeLock());
      support.start();
      for (const state of ['hidden', 'visible']) {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => state,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      }
      resolveFirst(makeLock());
      await new Promise((r) => setTimeout(r, 0));
      const held = locks.filter((l) => !l.released).length;
      support.stop();
      await new Promise((r) => setTimeout(r, 0));
      navigator.wakeLock.request = async () => {
        throw new DOMException('Denied', 'NotAllowedError');
      };
      support.start();
      await new Promise((r) => setTimeout(r, 0));
      const diagnostic = support.diagnosticSnapshot({ outputLatency: 0.2, baseLatency: 0.01 });
      if (
        !diagnostic.wakeEvents.some(
          (event) => event.state === 'rejected' && event.reason === 'NotAllowedError',
        )
      )
        throw Error('Wake denial missing from diagnostic');
      if (diagnostic.audio.visualDelayMs !== 400) throw Error('Diagnostic latency mismatch');
      diagnostic.wakeEvents.length = 0;
      if (!support.diagnosticSnapshot().wakeEvents.length) throw Error('Mutable diagnostic leaked');
      support.stop();
      return { requests: count, held, released: locks.every((l) => l.released) };
    });
    assert.deepEqual(pendingVisibility, { requests: 2, held: 1, released: true });
    result.pendingVisibility = pendingVisibility;
    await p.reload();
    await p.waitForFunction(() => window.RENAX_PLAYBACK);
    assert.equal(await p.evaluate(() => RENAX_PLAYBACK.manualMs), 200);
    assert.equal(await p.evaluate(() => RENAX_PLAYBACK.bluetoothEnabled), true);
    await p.evaluate(() => {
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
    });
    await p.evaluate(() => startMetronome());
    await p.evaluate(() => stopMetronome());
    // Cancelling while audio assets prepare must not start playback later.
    assert.equal(
      await p.evaluate(async () => {
        const original = ensureVoiceMetronomeReady;
        let release, entered;
        const ready = new Promise((r) => (entered = r));
        ensureVoiceMetronomeReady = () => {
          entered();
          return new Promise((r) => (release = r));
        };
        const starting = startMetronome();
        await ready;
        stopMetronome();
        release();
        await starting;
        ensureVoiceMetronomeReady = original;
        return isPlaying;
      }),
      false,
    );
    await p.locator('#index2SettingsBtn').click();
    const violations = (await new AxeBuilder({ page: p }).include('#latencySettings').analyze())
      .violations;
    assert.deepEqual(violations, []);
    const captureDir = process.env.TEST_OUTPUT_DIR || path.join(__dirname, 'results');
    fs.mkdirSync(captureDir, { recursive: true });
    for (const [width, height] of [
      [1440, 1000],
      [834, 1112],
      [390, 844],
    ]) {
      const shot = await h.browser.newPage({ viewport: { width, height } });
      await shot.goto(h.url);
      await shot.waitForFunction(() => window.RENAX_PLAYBACK);
      await shot.locator('#index2SettingsBtn').click();
      for (const theme of ['dark', 'light', 'ivory']) {
        await shot.locator('[data-appearance=' + theme + ']').click();
        await shot.locator('#latencySettings').scrollIntoViewIfNeeded();
        await shot.screenshot({ path: path.join(captureDir, `latency-${theme}-${width}.png`) });
        assert(await shot.locator('#bluetoothHeadphones').isVisible());
      }
      await shot.close();
    }
    await p.locator('#index2SettingsClose').click();
    await p.getByRole('tab', { name: 'Métronome', exact: true }).click();
    await p.locator('#scorePartitionBtn').click();
    await p.waitForFunction(() => RENAX_SCORE.enabled && RENAX_SCORE.snapshot.notes > 0);
    const scoreLatency = await p.evaluate(async () => {
      const context = audioCtx,
        timeout = window.setTimeout;
      let clock = 1;
      audioCtx = {
        get currentTime() {
          return clock;
        },
        outputLatency: 0.2,
      };
      RENAX_PLAYBACK.setBluetoothEnabled(true);
      isPlaying = true;
      window.setTimeout = () => 0;
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      scheduleVisualUpdate(0, 0, 1.1, {
        beat: 0,
        subIndex: 0,
        subdivisions: 1,
        voiceGroupSize: 1,
        durationMs: 500,
      });
      await frame();
      clock = 1.499;
      await frame();
      const before = RENAX_SCORE.snapshot.active;
      clock = 1.501;
      await frame();
      const after = RENAX_SCORE.snapshot.active;
      window.setTimeout = timeout;
      audioCtx = context;
      stopMetronome();
      return { before, after };
    });
    assert.equal(scoreLatency.before, 0);
    assert(scoreLatency.after > 0);
    await p.locator('#index2SettingsBtn').click();
    const bluetoothSwitch = p.locator('#bluetoothHeadphones');
    await bluetoothSwitch.uncheck();
    assert.equal(await p.evaluate(() => RENAX_PLAYBACK.delayMs({ outputLatency: 0.024 })), 24);
    assert.equal(await p.locator('#visualLatencyMs').count(), 0);
    assert.equal(await p.locator('#latencyCalibrate').count(), 0);
    await p.locator('#index2SettingsBtn').click();
    await p.waitForFunction(() => history.state?.renaxNavigation?.screen?.settings === false);
    await p.reload();
    await p.waitForFunction(() => window.RENAX_PLAYBACK);
    assert.equal(await p.evaluate(() => RENAX_PLAYBACK.bluetoothEnabled), false);
    assert.equal(await p.evaluate(() => RENAX_PLAYBACK.manualMs), 200);
    await p.locator('#index2SettingsBtn').click();
    await p.locator('#bluetoothHeadphones').check();
    assert.equal(await p.evaluate(() => RENAX_PLAYBACK.delayMs({ outputLatency: 0.024 })), 224);
    await p.locator('#index2SettingsBtn').click();
    const storage = await h.browser.newPage();
    await storage.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new Error('Storage denied');
      };
      Storage.prototype.setItem = () => {
        throw new Error('Storage denied');
      };
    });
    await storage.goto(h.url);
    await storage.waitForFunction(() => window.RENAX_PLAYBACK);
    assert.deepEqual(
      await storage.evaluate(() => ({
        manual: RENAX_PLAYBACK.manualMs,
        saved: RENAX_PLAYBACK.setBluetoothEnabled(true),
      })),
      { manual: 200, saved: false },
    );
    await storage.close();
    await p.getByRole('tab', { name: 'Multipiste', exact: true }).click();
    await p.evaluate(() => RENAX_MULTI.start());
    await p.evaluate(() => RENAX_MULTI.stop());
    const multiLatency = await p.evaluate(async () => {
      const ctx = audioCtx,
        timeout = window.setTimeout,
        visual = scheduleVisualUpdate;
      const currentDescriptor = Object.getOwnPropertyDescriptor(ctx, 'currentTime');
      const latencyDescriptor = Object.getOwnPropertyDescriptor(ctx, 'outputLatency');
      const times = [],
        delays = [],
        visuals = [],
        originals = new Map();
      for (const bank of Object.values(SOUND_BANKS)) {
        originals.set(bank, bank.play);
        bank.play = (_out, time) => {
          times.push(time);
        };
      }
      Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => 1 });
      Object.defineProperty(ctx, 'outputLatency', { configurable: true, value: 0.2 });
      RENAX_PLAYBACK.setBluetoothEnabled(true);
      window.setTimeout = (_fn, delay) => {
        delays.push(delay);
        return 0;
      };
      scheduleVisualUpdate = (_m, _s, time) => {
        visuals.push(time);
      };
      try {
        await RENAX_MULTI.start();
        return { times, delays, visuals };
      } finally {
        RENAX_MULTI.stop();
        for (const [bank, play] of originals) bank.play = play;
        window.setTimeout = timeout;
        scheduleVisualUpdate = visual;
        if (currentDescriptor) Object.defineProperty(ctx, 'currentTime', currentDescriptor);
        else delete ctx.currentTime;
        if (latencyDescriptor) Object.defineProperty(ctx, 'outputLatency', latencyDescriptor);
        else delete ctx.outputLatency;
      }
    });
    assert.equal(multiLatency.times[0], 1.05);
    assert.deepEqual(multiLatency.visuals, multiLatency.times);
    assert(multiLatency.delays.some((d) => Math.abs(d - 450) < 1e-6));
    result.multiLatency = multiLatency;
    result.scoreLatency = scoreLatency;
    result.fixedBluetoothMs = 200;
    result.startCancellation = true;
    save('playback-support-results.json', result);
    console.log(
      'PASS wake ownership in all transports, visibility, audio failure, pending race, API absence; visual latency and persistence',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
