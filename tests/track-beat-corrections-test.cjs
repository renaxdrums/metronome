const assert = require('node:assert/strict');
const { start, newTrack, save } = require('./audio-harness.cjs');

(async () => {
  const h = await start(), results = [];
  try {
    for (const viewport of [{width:390,height:844},{width:923,height:668},{width:1440,height:1000}]) {
      const page = await h.browser.newPage({viewport}), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(h.url);
      await page.waitForFunction(() => window.RENAX_WORKSPACE && window.RENAX_SONGS);
      await page.evaluate(() => RENAX_WORKSPACE.go('tracks'));
      await page.waitForFunction(() => playBtn.hidden && getComputedStyle(playBtn).display === 'none');
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => isPlaying), false);
      await newTrack(page);
      assert.equal(await page.locator('#playBtn').isVisible(), true);
      await page.evaluate(() => RENAX_SONGS.restoreNavigation({pane:'songs',view:'playlist',profile:RENAX_SONGS.library.activeProfile,song:null}));
      await page.locator('.song-playlist-card .song-more[aria-haspopup="menu"]').click();
      await page.locator('.song-playlist-card .song-more-menu').getByRole('menuitem',{name:'Supprimer',exact:true}).click();
      await page.locator('.song-confirmation').getByRole('button',{name:'Supprimer',exact:true}).click();
      await page.waitForFunction(() => playBtn.hidden && getComputedStyle(playBtn).display === 'none');
      await page.evaluate(() => RENAX_WORKSPACE.go('metronome'));
      assert.equal(await page.locator('#playBtn').isVisible(), true);
      await page.evaluate(() => {
        const first=createMeasure(4,4,120),other=createMeasure(3,8,87);
        first.beatSubdivisions=[4,1,2,3];first.beatStates=[[1,2,0,3],[3],[0,2],[1,0,2]];
        metronomeMeasures=measures=[first,other];activeMeasureIndex=0;
        renderSequencerList();renderActiveMeasure();
      });
      for (const theme of ['dark','light','ivory']) {
        await page.evaluate(theme => document.documentElement.dataset.theme=theme,theme);
        await page.locator('#sequencerContainer .step').nth(1).click();
        const before=await page.evaluate(() => JSON.stringify(measures));
        await page.waitForTimeout(250);
        const button=page.locator('#beatEditorDuplicateFirst');
        assert.equal(await button.isVisible(),true);
        assert(await page.evaluate(() => {
          const button=document.querySelector('#beatEditorDuplicateFirst'),legend=document.querySelector('.beat-editor-legend');
          return button.nextElementSibling===legend && button.getBoundingClientRect().bottom<=legend.getBoundingClientRect().top+1;
        }));
        await button.click();
        assert.deepEqual(await page.evaluate(() => measures[0].beatSubdivisions),[4,4,4,4]);
        assert.deepEqual(await page.evaluate(() => measures[0].beatStates),Array.from({length:4},()=>[1,2,0,3]));
        assert(await page.evaluate(() => new Set(measures[0].beatStates).size===4));
        assert.equal(await page.evaluate(() => JSON.stringify(measures[1])),JSON.stringify(JSON.parse(before)[1]));
        await page.waitForTimeout(250);
        await page.keyboard.press('Escape');
        await page.locator('#undoBtn').click();
        assert.equal(await page.evaluate(() => JSON.stringify(measures)),before);
      }
      for(const language of ['fr','en','es','de','it']) {
        await page.evaluate(code => RENAX_I18N.setLanguage(code),language);
        await page.locator('#sequencerContainer .step').first().click();
        await page.waitForFunction(() => document.querySelector('#beatEditorDuplicateFirst').textContent===RENAX_I18N.t('Dupliquer le temps 1 sur tous les temps'));
        const bounds=await page.locator('#beatEditor').boundingBox();
        assert(bounds.x>=0 && bounds.x+bounds.width<=viewport.width+1);
        await page.keyboard.press('Escape');
      }
      await page.evaluate(() => {
        measures[0].tempo=240;metronomeMeasures=measures=[measures[0]];activeMeasureIndex=0;
        renderSequencerList();renderActiveMeasure();window.__copyBeatTimes=[];
        const original=scheduleVisualUpdate;
        scheduleVisualUpdate=function(m,s,time,position){if(position?.subIndex===0)window.__copyBeatTimes.push(time);return original.apply(this,arguments);};
      });
      await page.locator('#playBtn').click();
      await page.waitForFunction(() => isPlaying && window.__copyBeatTimes.length>=2);
      await page.locator('#sequencerContainer .step').nth(1).click();
      await page.locator('#beatEditorDuplicateFirst').click();
      await page.waitForFunction(() => window.__copyBeatTimes.length>=10);
      const times=await page.evaluate(() => {const times=[...window.__copyBeatTimes];stopMetronome();return times;});
      for(let i=1;i<times.length;i++)assert(Math.abs(times[i]-times[i-1]-.25)<1e-6,'Duplication moved the playing beat grid: '+JSON.stringify(times));
      assert.deepEqual(errors,[]);
      results.push({viewport,emptyTrackHidden:true,creationAndDeletion:true,otherWorkspacesUnaffected:true,duplicationAndUndo:true,independentCopies:true,liveBeatGridStable:true,themes:3,languages:5});
      await page.close();
    }
    save('track-beat-corrections-results.json',results);
    console.log(results);
  } finally { await h.browser.close();h.server?.close(); }
})().catch(error => {console.error(error);process.exit(1);});
