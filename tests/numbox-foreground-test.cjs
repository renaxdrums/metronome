'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, save, openControls, showMeasures, newTrack } = require('./audio-harness.cjs');

async function probe(menu) {
  return menu.evaluate(element => {
    const r = element.getBoundingClientRect(), blocked = [];
    for (const fx of [.2, .5, .8]) {
      for (let y = r.top + 8; y < r.bottom - 8; y += 14) {
        const hit = document.elementFromPoint(r.left + r.width * fx, y);
        if (!hit || !element.contains(hit)) blocked.push({y, hit:hit?.id || hit?.className});
      }
    }
    return {topLayer:element.matches(':popover-open'), blocked, bounds:r.toJSON()};
  });
}

(async () => {
  const h = await start(), results = [], errors = [];
  const out = path.resolve(process.env.TEST_OUTPUT_DIR || 'tests/results/numbox-foreground');
  fs.mkdirSync(out, {recursive:true});
  try {
    for (const [width,height] of [[320,740],[390,844],[844,390],[834,1112],[1440,900]]) {
      const p = await h.browser.newPage({viewport:{width,height},hasTouch:width<=1100});
      p.on('pageerror', error => errors.push(error.message));
      await p.goto(h.url);
      await p.waitForFunction(() => window.RENAX_WORKSPACE && window.RENAX_NUMBOX);
      // Settle the existing first-gesture fullscreen transition before the menus.
      await p.locator('#workspaceNav [data-workspace=metronome]').click();
      await p.waitForFunction(() => !document.fullscreenEnabled || !!document.fullscreenElement);
      await p.evaluate(() => document.fonts.ready);
      for (const theme of ['dark','light','ivory','avant']) {
        await p.evaluate(value => document.documentElement.dataset.theme=value, theme);
        for (const workspace of ['metronome','polyrhythm','training','sequence','multi','tracks']) {
          await p.evaluate(value => RENAX_WORKSPACE.go(value), workspace);
          if (workspace==='tracks') {
            await newTrack(p);
            await p.locator('[data-section-id] .song-block-header').first().click();
          }
          if (workspace==='multi') {
            await showMeasures(p);
            const create=p.locator('#multiPresetLibrary').getByRole('button',{name:'Nouveau preset',exact:true});
            if (await create.isVisible()) await create.click();
            if (!await p.locator('#multiTracks .multi-track').count()) await p.locator('.multi-add').filter({hasText:'Nouvelle piste'}).click();
          }
          if (workspace==='training') {
            const tab=p.locator('#workspaceMobileViews [data-pane=training]');
            if (await tab.isVisible()) await tab.click();
          } else if (['sequence','multi','tracks'].includes(workspace)) await showMeasures(p);
          await openControls(p);
          console.log('NUMBOX_FOREGROUND',JSON.stringify({width,height,theme,workspace}));
          const triggers = p.locator('.numbox-button');
          let count = 0;
          for (let i=0; i<await triggers.count(); i++) {
            const trigger=triggers.nth(i);
            if (!await trigger.isVisible() || !await trigger.isEnabled()) continue;
            // Scroll the control into its panel, then allow placement to settle.
            await trigger.scrollIntoViewIfNeeded();
            await trigger.click();
            const wrapper=trigger.locator('..'), menu=wrapper.locator('> .numbox-menu');
            await p.waitForFunction(() => document.querySelector('.numbox-menu:popover-open'));
            await p.evaluate(() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
            const context={width,height,theme,workspace,trigger:await trigger.getAttribute('aria-label')};
            const first=await probe(menu);
            assert(first.topLayer,JSON.stringify(context));
            assert(first.bounds.width>0 && first.bounds.height>0,JSON.stringify({context,first}));
            assert.deepEqual(first.blocked,[],JSON.stringify({context,first}));
            assert(first.bounds.top>=0 && first.bounds.left>=0 && first.bounds.bottom<=height+1 && first.bounds.right<=width+1,JSON.stringify({context,first}));
            // Deliberately simulate a future stacking-context regression. A
            // disabled top-layer negative control must detect the obstruction.
            await p.evaluate(() => {
              const cover=document.createElement('div');cover.id='numbox-foreground-obstruction';
              cover.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#1234';
              document.body.append(cover);
            });
            assert.deepEqual((await probe(menu)).blocked,[],JSON.stringify(context));
            await menu.evaluate(element => element.hidePopover());
            assert((await probe(menu)).blocked.length>0,'Negative control must detect coverage');
            await menu.evaluate(element => element.showPopover());
            assert.deepEqual((await probe(menu)).blocked,[],JSON.stringify(context));
            await p.locator('#numbox-foreground-obstruction').evaluate(element=>element.remove());
            // Select an actual visible option and verify the close lifecycle.
            const chosen=await menu.evaluate(element=>{
              const r=element.getBoundingClientRect();
              const options=[...element.querySelectorAll('.numbox-option:not(:disabled)')];
              return (options.find(item=>item.classList.contains('active')) || options.find(item=>{
                const b=item.getBoundingClientRect();return b.top>=r.top && b.bottom<=r.bottom;
              }))?.getAttribute('data-value');
            });
            assert.notEqual(chosen,null,JSON.stringify(context));
            const option=menu.locator('.numbox-option[data-value="'+chosen+'"]');
            await option.click();
            assert.equal(await trigger.getAttribute('aria-expanded'),'false');
            assert.equal(await wrapper.locator('> .numbox-native').inputValue(),chosen);
            assert.equal(await menu.evaluate(element=>element.matches(':popover-open')),false);
            await trigger.press('ArrowDown');
            // Virtual training controls keep focus on the trigger; selects
            // focus their current option. Both must accept Escape.
            await p.keyboard.press('Escape');
            assert.equal(await trigger.getAttribute('aria-expanded'),'false');
            assert.equal(await menu.evaluate(element=>element.matches(':popover-open')),false);
            count++;
          }
          assert(count>0,JSON.stringify({width,height,theme,workspace}));
          results.push({width,height,theme,workspace,count,hitTesting:true,negativeControl:true,selection:true,keyboard:true});
          if (workspace==='polyrhythm') {
            const trigger=p.locator('#polyVoiceCount').locator('..').locator('.numbox-button');
            await trigger.click();
            await p.screenshot({path:path.join(out,`${theme}-${width}-poly.png`)});
            await p.keyboard.press('Escape');
            await p.evaluate(()=>RENAX_NUMBOX.closeAll());
          }
        }
      }
      await p.close();
    }
    assert.deepEqual(errors,[]);
    save('numbox-foreground-results.json',{results,errors});
    console.log('PASS numbox foreground: four themes, six workspaces, five viewports, real hit testing and negative controls',results.length);
  } finally { await h.browser.close();h.server?.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
