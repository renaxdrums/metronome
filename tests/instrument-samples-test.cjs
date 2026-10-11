const assert = require('node:assert/strict');
const { start, save } = require('./audio-harness.cjs');

(async () => {
  const runner = await start();
  const page = await runner.browser.newPage();
  try {
    await page.goto(runner.url);
    const result = await page.evaluate(async () => {
      await initAudio();
      const bankNames = ['clic', 'cloche', 'claves', 'clic808', 'beep'];
      const prepared = [];
      for (const bank of bankNames) {
        await ensureInstrumentBankReady(bank);
        const samples = instrumentSamples[bank];
        if (samples?.length !== 3) throw Error('Missing 3 samples in ' + bank);
        prepared.push({bank, samples: samples.map(s => ({
          rms: s.rms, peak: s.peak, offsetMs: s.offset * 1000,
          gain: s.gain, duration: s.duration
        }))});
      }
      const saved = {context: audioCtx, bank: currentBank, volume: masterVolume,
        mixer: getAudioMixDestination};
      // Bypass only the unchanged safety limiter IN THIS TEST, so the measured
      // peak is strictly the incoming PCM before any limiter intervention.
      getAudioMixDestination = ctx => ctx.destination;
      const scenarios = [];
      const render = async (bank, bpm, subdivisions, poly = null) => {
        const duration = poly ? 8 : 4 * 60 / bpm;
        const rate = 44100, events = [];
        if (!poly) {
          for (let beat = 0; beat < 4; beat++)
            for (let sub = 0; sub < subdivisions; sub++)
              events.push({time: 0.1 + (beat + sub / subdivisions) * 60 / bpm,
                state: sub === 0 ? (beat === 0 ? 3 : 2) : 1,
                first: beat === 0 && sub === 0});
        } else {
          const [outer, inner] = poly, cycle = outer * 60 / bpm;
          for (let bar = 0; bar < Math.ceil(duration / cycle); bar++) {
            for (let i = 0; i < outer; i++)
              events.push({time: 0.1 + bar * cycle + i * 60 / bpm,
                state: i % 3 + 1, first: i === 0});
            for (let i = 0; i < inner; i++)
              events.push({time: 0.1 + bar * cycle + i * cycle / inner,
                state: i % 3 + 1, first: i === 0});
          }
        }
        audioCtx = new OfflineAudioContext(2, Math.ceil((duration + 0.65) * rate), rate);
        currentBank = bank;
        masterVolume = 1;
        for (const event of events)
          playClick(event.state, event.time, event.first);
        const buffer = await audioCtx.startRendering();
        let peak = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const x = buffer.getChannelData(channel);
          for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
        }
        return {bank, bpm, subdivisions, poly, peak, peakDbFS: 20 * Math.log10(peak)};
      };
      try {
        for (const bank of bankNames) {
          for (const bpm of [60, 120, 240]) {
            for (const subdiv of [1, 2, 4, 8])
              scenarios.push(await render(bank, bpm, subdiv));
          }
          for (const poly of [[3, 4], [7, 8], [20, 20]])
            scenarios.push(await render(bank, 240, 1, poly));
        }
      } finally {
        audioCtx = saved.context;
        currentBank = saved.bank;
        masterVolume = saved.volume;
        getAudioMixDestination = saved.mixer;
      }
      return {prepared, scenarios,
        safetyThreshold: Math.pow(10, -0.1 / 20)};
    });
    for (const bank of result.prepared) {
      assert.equal(bank.samples.length, 3);
      for (const s of bank.samples) {
        assert.ok(Number.isFinite(s.gain) && s.gain > 0, 'Invalid gain');
        assert.ok(s.rms > 0.01 && s.rms < 0.13, 'Uncontrolled single-sample RMS');
        assert.ok(s.peak < 0.785, 'Sample lacks static peak headroom');
        assert.ok(s.offsetMs >= 0 && s.offsetMs < 100, 'Attack offset suspect');
      }
    }
    for (const s of result.scenarios) {
      assert.ok(s.peak < result.safetyThreshold,
        'Limiter would engage: ' + JSON.stringify(s));
    }
    save('instrument-samples-validation.json', result);
    console.log('CC0 instrumental samples: 15 audio sources prepared, ' +
      result.scenarios.length + ' stereo offline renders below safety ceiling.');
  } finally {
    await runner.browser.close();
    runner.server?.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
