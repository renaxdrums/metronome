'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {start,save}=require('./audio-harness.cjs');
(async()=>{
  const runner=await start(),results=[];
  const folder=path.resolve(process.env.TEST_OUTPUT_DIR||'outputs');
  fs.mkdirSync(folder,{recursive:true});
  try{
    for(const [width,height] of [[320,740],[390,844],[1440,900]]){
      const page=await runner.browser.newPage({viewport:{width,height},hasTouch:width<=1100});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(()=>localStorage.setItem('renax-appearance','avant'));
      await page.goto(runner.url);
      await page.waitForFunction(()=>window.RENAX_NUMBOX&&window.RENAX_WORKSPACE);
      await page.getByRole('tab',{name:'Polyrythmie',exact:true}).click();
      for(const id of ['polyVoiceCount']){
        const wrapper=page.locator('#'+id).locator('..'),trigger=wrapper.locator('.numbox-button');
        await trigger.click();
        const state=await page.evaluate(id=>{
          const menu=document.querySelector('#'+id)?.parentElement?.querySelector('.numbox-menu');
          const nav=document.getElementById('workspaceNav'),grid=document.querySelector('.main-grid'),panel=document.querySelector('.main-grid>.panel-visu');
          return {open:!!menu?.getClientRects().length,navZ:Number(getComputedStyle(nav).zIndex),gridZ:Number(getComputedStyle(grid).zIndex),panelZ:Number(getComputedStyle(panel).zIndex),panelOverflow:getComputedStyle(panel).overflow,gridOverflow:getComputedStyle(grid).overflow};
        },id);
        assert(state.open,JSON.stringify({width,id,...state}));
        assert(state.gridZ>state.navZ,JSON.stringify({width,id,...state}));
        assert(state.panelZ>state.navZ,JSON.stringify({width,id,...state}));
        assert.equal(state.panelOverflow,'visible',JSON.stringify({width,id,...state}));
        assert.equal(state.gridOverflow,'visible',JSON.stringify({width,id,...state}));
        await wrapper.locator('.numbox-option[data-value="3"]').click();
        assert.equal(await page.locator('#'+id).inputValue(),'3');
      }
      await page.locator('#index2SettingsBtn').click();
      const colors=await page.evaluate(()=>{
        const current=document.querySelector('#appearanceSettings [data-appearance=avant]'),other=document.querySelector('#appearanceSettings [data-appearance=dark]');
        return {currentPressed:current.getAttribute('aria-pressed'),otherPressed:other.getAttribute('aria-pressed'),currentBackground:getComputedStyle(current).backgroundColor,currentColor:getComputedStyle(current).color,otherBackground:getComputedStyle(other).backgroundColor,otherColor:getComputedStyle(other).color};
      });
      assert.deepEqual(colors,{currentPressed:'true',otherPressed:'false',currentBackground:'rgb(215, 242, 24)',currentColor:'rgb(22, 26, 21)',otherBackground:'rgb(52, 59, 69)',otherColor:'rgb(215, 242, 24)'},JSON.stringify({width,colors}));
      assert.equal(errors.length,0,errors.join('; '));
      await page.screenshot({path:path.join(folder,'meixs-poly-appearance-'+width+'.png'),animations:'disabled'});
      results.push({width,height,menusForeground:true,appearanceInverted:true});
      await page.close();
    }
  }finally{await runner.browser.close();runner.server?.close();}
  save('meixs-poly-appearance-results.json',results);console.log(results);
})().catch(error=>{console.error(error);process.exit(1)});
