const assert = require('node:assert/strict');
const { start, save } = require('./audio-harness.cjs');
(async () => {
  const harness = await start();
  const report = {};
  try {
    for (const size of [{width:1365,height:810},{width:390,height:844}]) {
      const page = await harness.browser.newPage({ viewport:size, hasTouch:size.width<1101, reducedMotion:'reduce' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(harness.url);
      await page.waitForFunction(() => window.RENAX_WORKSPACE?.current === 'metronome');
      assert.equal(await page.locator('#audioLabRoot').isVisible(),false,'Audio Lab hidden by default');
      assert.equal(await page.locator('#workspaceNav [data-workspace]').count(),7,'seven workspaces');
      const selectedBefore = await page.locator('#workspaceNav [aria-selected=true]').count();
      assert.equal(selectedBefore,1);
      await page.locator('#workspaceNav [data-workspace=audio-lab]').click();
      await page.waitForFunction(() => window.RENAX_WORKSPACE?.current === 'audio-lab' && !document.getElementById('audioLabRoot').hidden);
      assert.equal(await page.locator('#audioLabRoot').isVisible(),true);
      assert.equal(await page.locator('#sequencerContainer').isVisible(),false,'Circular editor hidden ONLY while Audio Lab active');
      assert.equal(await page.locator('#workspaceNav [aria-selected=true]').count(),1);
      assert.equal(await page.locator('#workspaceNav [data-workspace=audio-lab]').getAttribute('aria-selected'),'true');
      assert.equal(await page.locator('#alPlay').isDisabled(),true,'no fake playback before importing');
      await page.evaluate(() => {
        const sampleRate=44100,frames=sampleRate/2,bytes=new Uint8Array(44+frames*2);
        const view=new DataView(bytes.buffer);
        const put=(at,s)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};
        put(0,'RIFF');view.setUint32(4,bytes.length-8,true);put(8,'WAVE');put(12,'fmt ');
        view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
        view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);
        view.setUint16(32,2,true);view.setUint16(34,16,true);
        put(36,'data');view.setUint32(40,frames*2,true);
        for(let i=0;i<frames;i++)view.setInt16(44+i*2,Math.round(Math.sin(2*Math.PI*200*i/sampleRate)*9000),true);
        const dt=new DataTransfer();dt.items.add(new File([bytes],'interface-source.wav',{type:'audio/wav'}));
        const file=document.getElementById('alFileInput');file.files=dt.files;file.dispatchEvent(new Event('change',{bubbles:true}));
      });
      await page.waitForFunction(() => document.getElementById('alPlay').disabled===false,{timeout:45000});
      assert.equal(await page.locator('#alFileName').textContent(),'interface-source.wav');
      assert.equal(await page.locator('#alEmpty').isVisible(),false);
      assert((await page.locator('#alDuration').textContent()).startsWith('00:00.5'));
      await page.locator('#alNumerator').fill('7');
      await page.locator('#alDenominator').selectOption('8');
      await page.locator('#alGroups').fill('2+2+3');
      await page.locator('[data-al-tool=meter]').click();
      await page.locator('#alWaveCanvas').click({position:{x:130,y:80}});
      assert.equal(await page.locator('#alMarkerLayer .al-marker').count(),1);
      assert((await page.locator('#alMarkerInfo').textContent()).includes('7/8'));
      await page.locator('#alMarkerTime').fill('0.25');
      await page.locator('#alMarkerTime').dispatchEvent('change');
      assert.equal(await page.locator('#alMarkerTime').inputValue(),'0.250');
      await page.locator('#workspaceNav [data-workspace=metronome]').click();
      await page.waitForFunction(()=>window.RENAX_WORKSPACE.current==='metronome');
      assert.equal(await page.locator('#audioLabRoot').isVisible(),false);
      assert.equal(await page.locator('#sequencerContainer').isVisible(),true,'historical circular sequencer preserved');
      await page.locator('#workspaceNav [data-workspace=audio-lab]').click();
      await page.waitForFunction(()=>window.RENAX_WORKSPACE.current==='audio-lab');
      assert.equal(await page.locator('#alMarkerLayer .al-marker').count(),1,'annotations retained on workspace switch');
      const dimensions=await page.evaluate(()=>{
        const s=document.getElementById('audioLabRoot').getBoundingClientRect();
        return {overflow:document.documentElement.scrollWidth>window.innerWidth,rootWidth:s.width,rootHeight:s.height,style:getComputedStyle(document.getElementById('audioLabRoot')).backgroundColor};
      });
      assert.equal(dimensions.overflow,false,'no page horizontal overflow');
      assert(dimensions.rootWidth>240&&dimensions.rootHeight>150,'usable Audio Lab panel');
      assert.deepEqual(errors,[], 'no uncaught browser errors');
      report[size.width+'x'+size.height]=dimensions;
      await page.screenshot({path:(process.env.TEST_OUTPUT_DIR||'tests/results')+'/audio-lab-'+size.width+'.png',animations:'disabled'});
      await page.close();
    }
    save('audio-lab-ui-results.json',report);
    console.log('PASS Audio Lab: dark seventh workspace, real WAV import, editable 7/8 markers, desktop/mobile isolation');
  } finally {
    await harness.browser.close();
    harness.server?.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
