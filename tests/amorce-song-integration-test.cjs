const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { start } = require('./audio-harness.cjs');
(async () => {
  const h = await start();
  let closeAssets;
  try {
    const p = await h.browser.newPage({ viewport: { width: 390, height: 844 } }),
      errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    if (process.env.REAL_AMORCE)
      closeAssets = await require('./amorce-neural-route.cjs').install(p.context(), h.url);
    await p.route('**/*.mjs*', (route) => {
      const u = new URL(route.request().url());
      if (u.origin !== h.url) return route.fallback();
      if (!process.env.REAL_AMORCE && u.pathname.endsWith('/neural-engine.mjs'))
        return route.fulfill({
          contentType: 'text/javascript',
          body: `const cache=new Map();export function synthesize(text,language){const k=JSON.stringify([text,language]);if(!cache.has(k)){const pcm=new Float32Array(6000);for(let i=0;i<pcm.length;i++)pcm[i]=.15*Math.sin(i*.05);cache.set(k,Promise.resolve({pcm,sampleRate:24000,events:[{type:'phoneme',id:'t',audio_position:200,text_position:1},{type:'phoneme',id:'a',audio_position:220,text_position:1}]}));}return cache.get(k);}`,
        });
      let body = fs.readFileSync(path.join(__dirname, '..', u.pathname), 'utf8');
      if (u.pathname.endsWith('/neural-worker.mjs')) {
        const root = require('./amorce-neural-route.cjs').assetURL;
        body =
          `const testFetch=globalThis.fetch;globalThis.fetch=(input,options)=>{const url=typeof input==='string'?input:input.url;if(url.startsWith('https://huggingface.co/')){const relative=url.split('/resolve/')[1]?.split('/').slice(1).join('/');return testFetch(${JSON.stringify(root)}+'/'+relative,options);}return testFetch(input,options);};\n` +
          body;
      }
      return route.fulfill({ contentType: 'text/javascript', body });
    });
    await p.goto(h.url);
    await p.evaluate(() => prepareAllVoiceAudio());
    await p.waitForFunction(() => window.RENAX_SONGS && window.RENAX_AMORCE && allVoiceAudioReady);
    const result = await p.evaluate(async (real) => {
      const m = (n, tempo) => ({
        numerator: n,
        denominator: 4,
        tempo: real ? (tempo === 240 ? 100 : 120) : tempo,
        beatSubdivisions: Array(n).fill(2),
        beatStates: Array.from({ length: n }, (_, i) => [i === 0 ? 3 : 1, 1]),
      });
      const song = {
        id: 'song-amorce',
        name: 'Amorce test',
        amorce: true,
        sections: [
          { id: 'a', label: 'Couplet 1', count: real ? 2 : 1, measure: m(3, 300) },
          {
            id: 'b',
            label: 'Custom chorus',
            amorceLanguage: 'en',
            count: real ? 2 : 1,
            measure: m(4, 240),
          },
          { id: 'c', label: 'Fin', count: real ? 2 : 1, measure: m(3, 300) },
        ],
      };
      const library = {
        version: 1,
        activeProfile: 'test',
        profiles: [{ id: 'test', name: 'Test', songs: [song] }],
      };
      RENAX_SONGS.replaceLibrary(library);
      RENAX_SONGS.restoreNavigation({
        pane: 'songs',
        view: 'detail',
        song: song.id,
        profile: 'test',
      });
      const button = document.getElementById('songAmorceBtn');
      const plan = await RENAX_AMORCE.prepare(song);
      const midiA = new Uint8Array(
          await RENAX_MIDI_EXPORT.exportSong({ ...song, amorce: false }).blob.arrayBuffer(),
        ),
        midiB = new Uint8Array(await RENAX_MIDI_EXPORT.exportSong(song).blob.arrayBuffer());
      const trace = [],
        original = playClick,
        originalCount = renderVoiceCount;
      renderVoiceCount = (gender, dest, time, state, first, context, settings) => {
        if (context.mode === 'song-guide')
          trace.push({ bank: 'guideMale', state, time, first, ...context });
        return originalCount(gender, dest, time, state, first, context, settings);
      };
      playClick = (state, time, first, context) => {
        trace.push({ bank: currentBank, state, time, first, ...context });
        return original(state, time, first, context);
      };
      currentBank = 'claves';
      await startMetronome();
      const start = nextNoteTime,
        enabled = RENAX_AMORCE.active;
      await new Promise((r) => setTimeout(r, (plan.duration + 0.6) * 1000));
      const stopped = !isPlaying,
        unchanged = JSON.stringify(RENAX_SONGS.library) === JSON.stringify(library);
      const rendered = await RENAX_MP3_EXPORT.isolatedRender(song, 'claves', 0.8);
      let peak = 0;
      for (const x of rendered.pcm) peak = Math.max(peak, Math.abs(x));
      const encoded = await RENAX_MP3_EXPORT.exportSong(song, 'claves', 0.8);
      return {
        separateNumber: !!plan.speeches[0].separateNumber,
        voices: plan.speeches.map((s) => s.voice),
        realNeural: real,
        encodedBytes: encoded.blob.size,
        encodedPeak: encoded.report.decodedTruePeak,
        button: !!button,
        pressed: button.getAttribute('aria-pressed'),
        countIn: plan.countInMeasures,
        enabled,
        stopped,
        unchanged,
        midiEqual: midiA.length === midiB.length && midiA.every((v, i) => v === midiB[i]),
        trace,
        mp3PcmPeak: peak,
        mp3Score: rendered.score,
      };
    }, !!process.env.REAL_AMORCE);
    fs.writeFileSync(
      'tests/amorce-song-integration-results.json',
      JSON.stringify({ ...result, errors }, null, 2),
    );
    if (process.env.REAL_AMORCE) {
      assert.deepEqual(result.voices, ['fr_FR-siwis-medium', 'bm_george', 'fr_FR-siwis-medium']);
      assert(!result.separateNumber);
    }
    assert(result.encodedBytes > 1000 && result.encodedPeak < 1);
    assert(
      result.button &&
        result.pressed === 'true' &&
        result.countIn >= 2 &&
        result.enabled &&
        result.stopped &&
        result.unchanged &&
        result.midiEqual,
      JSON.stringify({ ...result, trace: result.trace.length, errors }),
    );
    assert(result.trace.some((e) => e.bank === 'guideMale' && e.beatNumber === 2));
    assert(result.trace.some((e) => e.bank === 'claves'));
    assert(result.mp3PcmPeak > 0 && result.mp3PcmPeak < 1);
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      'tests/amorce-song-integration-results.json',
      JSON.stringify({ ...result, errors }, null, 2),
    );
    console.log({ ...result, trace: result.trace.length });
  } finally {
    await h.browser.close();
    h.server?.close();
    closeAssets?.();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
