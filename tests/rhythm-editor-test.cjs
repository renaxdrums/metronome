const assert = require('node:assert/strict'),
  fs = require('fs'),
  path = require('path');
const { start } = require('./audio-harness.cjs');
(async () => {
  const h = await start();
  try {
    const page = await h.browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().includes('Rhythm score:')) errors.push(m.text());
    });
    await page.route('**/*.mjs*', (r) => {
      const u = new URL(r.request().url());
      return u.origin === h.url
        ? r.fulfill({
            contentType: 'text/javascript',
            body: fs.readFileSync(path.join(__dirname, '..', u.pathname)),
          })
        : r.fallback();
    });
    await page.goto(h.url);
    await page.evaluate(() => prepareAllVoiceAudio());
    await page.waitForFunction(() => window.RENAX_SCORE && allVoiceAudioReady);
    await page.locator('#scorePartitionBtn').click();
    await page.waitForFunction(() => document.getElementById('rhythmScore').querySelector('svg'));
    await page.evaluate(() => {
      window.pulsePositions = [];
      window.pulseFade = [];
      document.querySelector('.score-pulse').addEventListener('animationstart', (e) => {
        if (e.animationName !== 'scorePulse') return;
        const pulse = document.querySelector('.score-pulse'),
          beat = Number(pulse.dataset.beat);
        if (!pulseFade.length) {
          const dot = pulse.querySelector('span'),
            animation = dot.getAnimations()[0],
            position = animation.currentTime,
            duration = animation.effect.getTiming().duration;
          animation.pause();
          for (const fraction of [0.1, 0.75, 1]) {
            animation.currentTime = duration * fraction;
            pulseFade.push(Number(getComputedStyle(dot).opacity));
          }
          animation.currentTime = position;
          animation.play();
        }
        setTimeout(() => {
          const dot = pulse.querySelector('span').getBoundingClientRect(),
            head = document
              .querySelector('[data-event="' + beat + '"] .vf-notehead')
              .getBoundingClientRect();
          pulsePositions.push({
            beat,
            x: dot.left + dot.width / 2,
            target: head.left + head.width / 2,
          });
        }, 220);
      });
    });
    await page.locator('#playBtn').click();
    await page.waitForFunction(() => pulsePositions.length >= 4, null, { timeout: 6000 });
    await page.locator('#playBtn').click();
    const positions = await page.evaluate(() => pulsePositions);
    const fade = await page.evaluate(() => pulseFade);
    assert(fade[0] > 0.8 && fade[1] < fade[0] && fade[2] === 0, JSON.stringify(fade));
    assert.deepEqual(
      positions.slice(0, 4).map((p) => p.beat),
      [0, 1, 2, 3],
    );
    for (const p of positions) assert(Math.abs(p.x - p.target) < 2, JSON.stringify(p));
    await page.locator('#scoreEditBtn').click();
    await page.locator('[data-event="0"]').first().click();
    assert.equal(await page.locator('.score-state-tools').count(), 0);
    for (const state of [2, 3, 0, 1]) {
      await page.locator('[data-event="0"]').first().click();
      assert.equal(await page.evaluate(() => measures[0].rhythmEditor.events[0].state), state);
    }
    assert(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector('.panel-visu'), '::-webkit-scrollbar').width ===
            '4px' &&
          (document.documentElement.dataset.theme === 'ivory'
            ? getComputedStyle(document.querySelector('.panel-visu'), '::-webkit-scrollbar-thumb')
                .backgroundColor === 'rgb(88, 191, 196)'
            : ['rgba(0, 229, 255, 0.78)', 'rgb(76, 215, 232)'].includes(
                getComputedStyle(document.querySelector('.panel-visu'), '::-webkit-scrollbar-thumb')
                  .backgroundColor,
              )),
      ),
    );
    await page.locator('[data-event="0"]').first().click();
    await page.locator('button[data-duration="8"][data-dotted="false"]').click();
    assert.deepEqual(await page.evaluate(() => measures[0].beatStates[0]), [2, 0]);
    assert.deepEqual(
      await page.evaluate(() => measures[0].rhythmEditor.events.slice(0, 2).map((e) => e.state)),
      [2, 0],
    );
    await page.locator('[data-event="1"]').first().click();
    await page.locator('[data-event="1"]').first().click();
    await page.locator('[data-event="1"]').first().click();
    assert.deepEqual(await page.evaluate(() => measures[0].beatStates[0]), [2, 2]);
    await page.evaluate(() => {
      measures = [
        {
          numerator: 6,
          denominator: 8,
          tempo: 120,
          beatSubdivisions: Array(6).fill(1),
          beatStates: Array.from({ length: 6 }, () => [1]),
        },
      ];
      metronomeMeasures = measures;
      activeMeasureIndex = 0;
      renderActiveMeasure();
    });
    await page.waitForFunction(() => document.querySelector('#rhythmEditor select'));
    assert.equal(await page.locator('.score-group-tools select').count(), 2);
    await page.locator('#scoreGroupingToggle').click();
    await page.locator('.score-group-tools select').first().selectOption('2');
    assert.deepEqual(await page.evaluate(() => measures[0].rhythmEditor.groups), [2, 2, 2]);
    await page.evaluate(() => {
      measures[0].tempo = 60;
      window.editorTrace = [];
      window.editorPulseTrace = [];
      document.querySelector('.score-pulse').addEventListener('animationstart', (e) => {
        if (e.animationName === 'scorePulse') editorPulseTrace.push(audioCtx.currentTime);
      });
      const original = playClick;
      playClick = function (state, time) {
        editorTrace.push({ state, time });
        return original.apply(this, arguments);
      };
    });
    await page.locator('#playBtn').click();
    await page.waitForTimeout(200);
    const windowBefore = await page.evaluate(() =>
      JSON.stringify(getSchedulingMeasure(measures[0]).beatStates),
    );
    await page.locator('[data-event="0"]').first().click();
    await page.locator('[data-event="0"]').first().click();
    await page.locator('[data-event="0"]').first().click();
    assert(await page.evaluate(() => isPlaying));
    assert.equal(
      await page.evaluate(() => JSON.stringify(getSchedulingMeasure(measures[0]).beatStates)),
      windowBefore,
    );
    await page.waitForTimeout(3200);
    const trace = await page.evaluate(() => editorTrace);
    const firstChanged = trace.find((e) => e.state === 3);
    assert(firstChanged);
    assert(firstChanged.time - trace[0].time >= 2.99);
    const pulses = await page.evaluate(() => editorPulseTrace);
    assert(pulses.length >= 3);
    for (let i = 1; i < pulses.length; i++)
      assert(Math.abs(pulses[i] - pulses[i - 1] - 1.5) < 0.12, JSON.stringify(pulses));
    await page.locator('#playBtn').click();
    assert(!(await page.evaluate(() => isPlaying)));
    const saved = await page.evaluate(() => {
      const lib = JSON.parse(JSON.stringify(RENAX_SONGS.library)),
        profile = lib.profiles[0];
      profile.songs = [
        {
          id: 'editor-song',
          name: 'Editor test',
          sections: [
            { id: 'editor-section', label: 'A', count: 1, measure: createMeasure(4, 4, 120) },
          ],
        },
      ];
      RENAX_SONGS.replaceLibrary(lib);
      RENAX_SONGS.restoreNavigation({
        pane: 'songs',
        view: 'detail',
        song: 'editor-song',
        profile: profile.id,
      });
      RENAX_SONGS.loadSong('editor-section');
      return profile.id;
    });
    await page.waitForTimeout(100);
    await page.locator('[data-event="0"]').first().click();
    await page.locator('button[data-duration="8"][data-dotted="false"]').click();
    assert(
      await page.evaluate(
        () => !!RENAX_SONGS.library.profiles[0].songs[0].sections[0].measure.rhythmEditor,
      ),
    );
    const persisted = await page.evaluate(() =>
      JSON.stringify(RENAX_SONGS.library.profiles[0].songs[0].sections[0].measure),
    );
    await page.reload();
    await page.waitForFunction(() => window.RENAX_SONGS);
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify(RENAX_SONGS.library.profiles[0].songs[0].sections[0].measure),
      ),
      persisted,
    );
    await page.evaluate(
      ({ profile }) => {
        RENAX_SONGS.restoreNavigation({
          pane: 'songs',
          view: 'detail',
          song: 'editor-song',
          profile,
        });
        RENAX_SONGS.loadSong('editor-section');
      },
      { profile: saved },
    );
    await page.locator('#playBtn').click();
    await page.waitForFunction(() => isPlaying);
    await page.waitForFunction(() => !isPlaying, { timeout: 6000 });
    await page.evaluate(() => RENAX_SONGS.unload());
    await page.locator('#scorePartitionBtn').click();
    await page.waitForFunction(() => document.getElementById('rhythmScore').querySelector('svg'));
    await page.locator('#scoreEditBtn').click();
    for (const denominator of [2, 4, 8, 16, 32])
      for (const count of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const normal = count === 3 ? 2 : count >= 5 && count <= 7 ? 4 : count;
        if (denominator * normal > 32) continue;
        await page.evaluate(
          ({ denominator, count }) => {
            measures = [
              {
                numerator: 1,
                denominator,
                tempo: 120,
                beatSubdivisions: [count],
                beatStates: [
                  Array.from({ length: count }, (_, i) => (i === 0 || i === count - 1 ? 1 : 0)),
                ],
              },
            ];
            metronomeMeasures = measures;
            renderActiveMeasure();
          },
          { denominator, count },
        );
        await page.waitForTimeout(40);
        assert.equal(
          await page.locator('.rhythm-score-status').count(),
          0,
          'render ' + denominator + '/' + count,
        );
      }
    await page.evaluate(() => {
      measures = [
        {
          numerator: 13,
          denominator: 8,
          tempo: 120,
          beatSubdivisions: Array(13).fill(4),
          beatStates: Array.from({ length: 13 }, () => [1, 1, 1, 1]),
        },
      ];
      metronomeMeasures = measures;
      renderActiveMeasure();
    });
    await page.waitForTimeout(100);
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 640 },
      { width: 768, height: 1024 },
      { width: 844, height: 390 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      const d = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
        panel: document.querySelector('.panel-visu').getBoundingClientRect().toJSON(),
        score: document.getElementById('rhythmScore').getBoundingClientRect().toJSON(),
      }));
      assert(d.scroll <= d.width);
      assert(
        await page.evaluate(
          () =>
            document.getElementById('rhythmEditor').scrollWidth <=
            document.getElementById('rhythmEditor').clientWidth + 1,
        ),
        'toolbar horizontal overflow',
      );
      assert(d.score.bottom <= d.panel.bottom + 1);
      const staveCount = await page.locator('.rhythm-score .vf-stave').count();
      assert.equal(staveCount, 1);
      assert(
        await page.evaluate(() => {
          const s = document
              .getElementById('rhythmScore')
              .querySelector('svg')
              .getBoundingClientRect(),
            h = document.getElementById('rhythmScore').getBoundingClientRect(),
            menu = document.querySelector('#rhythmEditor').getBoundingClientRect(),
            icons = document.getElementById('scoreViewSwitch').getBoundingClientRect();
          return (
            s.bottom <= h.bottom + 1 &&
            menu.left >= icons.right &&
            Math.abs(menu.top - icons.top) < 2
          );
        }),
      );
      assert(
        await page.evaluate(
          () =>
            document.getElementById('rhythmScore').scrollWidth <=
            document.getElementById('rhythmScore').clientWidth + 1,
        ),
      );
      await page.screenshot({ path: '/tmp/editor-' + viewport.width + '.png' });
    }
    assert.deepEqual(errors, []);
    console.log(
      'PASS duration, rest/state projection, 6/8 regrouping, live editing, all subdivision rendering and responsive layout',
    );
  } finally {
    await h.browser.close();
    h.server?.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
