const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
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
      const navRows=await page.locator('#workspaceNav [data-workspace]').evaluateAll(buttons=>new Set(buttons.map(button=>Math.round(button.getBoundingClientRect().top))).size);
      assert.equal(navRows,1,'all seven global tabs stay on one row');
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
      assert.equal(await page.locator('input[name=alPulseFeel]:checked').getAttribute('value'),'auto',
        'unassisted automatic analysis remains the default');
      await page.locator('#alDetectPulse').click();
      await page.waitForFunction(()=>document.getElementById('alPulseResult').textContent!=='Aucune analyse'&&
        document.getElementById('alDetectPulse').disabled===false,{timeout:10000});
      assert.equal(await page.locator('#alDetectPulse').isDisabled(),false,'Worker analysis releases the editor controls');
      assert.equal(await page.locator('#alTempoLevel button').count(),3,'tempo level provides detected, half and double choices');
      await page.locator('label:has(input[name=alPulseFeel][value=ternary])').click();
      assert((await page.locator('#alPulseResult').textContent()).includes('à recalculer'),
        'guidance changes never silently replace the automatic result');
      await page.locator('label:has(input[name=alPulseFeel][value=auto])').click();
      const space = await page.evaluate(() => {
        let audioClicks=0;
        document.getElementById('alPlay').addEventListener('click',()=>audioClicks++);
        const key=target=>target.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true,cancelable:true}));
        key(document.body);
        const activated=audioClicks;
        key(document.getElementById('alManualBpm'));
        return {activated,afterInput:audioClicks};
      });
      assert.deepEqual(space,{activated:1,afterInput:1},'Space controls Audio Lab except in an editable field');
      const themes = await page.evaluate(() => {
        const app=document.documentElement, lab=document.getElementById('audioLabRoot');
        const original=app.dataset.theme, result={};
        for(const theme of ['dark','light','ivory','avant']){
          app.dataset.theme=theme;
          const rows=new Set([...document.querySelectorAll('#workspaceNav [data-workspace]')].map(button=>Math.round(button.getBoundingClientRect().top))).size;
          result[theme]={wave:getComputedStyle(lab).getPropertyValue('--al-wave-primary').trim(),background:getComputedStyle(lab).backgroundColor,rows};
        }
        app.dataset.theme=original;
        return result;
      });
      assert.equal(new Set(Object.values(themes).map(theme=>theme.wave)).size,4,'waveform palette responds to four themes');
      assert.notEqual(themes.dark.background,themes.light.background,'light theme has its own editor surface');
      assert(Object.values(themes).every(theme=>theme.rows===1),'all four themes keep seven tabs on one row');
      if(size.width<1101){
        const transportFits=await page.locator('.al-transport').evaluate(node=>{
          const edge=node.getBoundingClientRect().right;
          return [...node.children].every(child=>child.getBoundingClientRect().right<=edge+1);
        });
        assert(transportFits,'all Audio Lab transport controls fit the phone width');
      }
      assert.equal(await page.locator('#alUndo').isDisabled(),true,'correction history starts empty');
      await page.locator('[data-al-tool=selection]').click();
      await page.locator('#alWaveCanvas').dragTo(page.locator('#alWaveCanvas'),{
        sourcePosition:{x:45,y:80},targetPosition:{x:170,y:80}});
      assert.equal(await page.locator('#alSelectionRegion').isVisible(),true,'selection drag highlights an audio region');
      await page.locator('[data-al-tool=loop]').click();
      await page.locator('#alWaveCanvas').dragTo(page.locator('#alWaveCanvas'),{
        sourcePosition:{x:60,y:80},targetPosition:{x:185,y:80}});
      assert.equal(await page.locator('#alLoopEnabled').isChecked(),true,'loop drag enables A/B');
      assert.equal(await page.locator('#alLoopRegion').isVisible(),true,'loop region is visible on waveform');
      await page.locator('#alUndo').click();
      assert.equal(await page.locator('#alLoopEnabled').isChecked(),false,'undo restores prior loop state');
      await page.locator('#alRedo').click();
      assert.equal(await page.locator('#alLoopEnabled').isChecked(),true,'redo restores loop');
      const loopStartBefore=Number(await page.locator('[data-loop-edge=start]').getAttribute('aria-valuenow'));
      await page.locator('[data-loop-edge=start]').focus();
      await page.keyboard.press('ArrowLeft');
      assert(Number(await page.locator('[data-loop-edge=start]').getAttribute('aria-valuenow'))<loopStartBefore,
        'keyboard adjusts the loop start handle');
      await page.locator('#alUndo').click();
      assert(Math.abs(Number(await page.locator('[data-loop-edge=start]').getAttribute('aria-valuenow'))-loopStartBefore)<.001,
        'loop-boundary correction is undoable');
      await page.locator('#alLoopEnabled').uncheck();
      await page.locator('#alSnap').click();
      assert.equal(await page.locator('#alSnap').getAttribute('aria-pressed'),'true','Snap has a visible active state');
      await page.locator('#alSnap').click();
      await page.locator('[data-al-tool=zoom]').click();
      await page.locator('#alWaveCanvas').dragTo(page.locator('#alWaveCanvas'),{
        sourcePosition:{x:70,y:80},targetPosition:{x:210,y:80}});
      assert(Number(await page.locator('#alZoom').inputValue())>1,'zoom tool magnifies selected region');
      await page.locator('[data-al-tool=hand]').click();
      await page.locator('#alWaveCanvas').dragTo(page.locator('#alWaveCanvas'),{
        sourcePosition:{x:180,y:80},targetPosition:{x:75,y:80}});
      const panStatus=await page.locator('#alStatus').textContent();
      assert(panStatus.includes('Vue déplacée'),
        'hand tool pans zoomed timeline: '+panStatus);
      await page.locator('#alZoom').fill('1');
      if(size.width<1101){
        const cdp=await page.context().newCDPSession(page);
        const box=await page.locator('#alWaveCanvas').boundingBox();
        const centerX=box.x+box.width/2,centerY=box.y+box.height/2;
        const points=separation=>[
          {x:Math.round(centerX-separation),y:Math.round(centerY),id:1},
          {x:Math.round(centerX+separation),y:Math.round(centerY),id:2},
        ];
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(35)});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(100)});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        assert(Number(await page.locator('#alZoom').inputValue())>1,'two-finger pinch zooms waveform on phone');
        await page.locator('#alZoom').fill('1');
        await cdp.detach();
      }
      await page.locator('#alNumerator').fill('7');
      await page.locator('#alDenominator').selectOption('8');
      await page.locator('#alGroups').fill('2+2+3');
      await page.locator('[data-al-tool=meter]').click();
      await page.locator('#alWaveCanvas').click({position:{x:130,y:80}});
      assert.equal(await page.locator('#alMarkerLayer .al-marker').count(),1);
      assert((await page.locator('#alMarkerInfo').textContent()).includes('7/8'));
      const markerBefore=Number(await page.locator('#alMarkerTime').inputValue());
      await page.locator('#alMarkerLayer .al-marker').focus();
      await page.keyboard.press('ArrowRight');
      assert(Number(await page.locator('#alMarkerTime').inputValue())>markerBefore,'keyboard moves marker precisely');
      await page.locator('#alUndo').click();
      assert(Math.abs(Number(await page.locator('#alMarkerTime').inputValue())-markerBefore)<.002,
        'marker correction is undoable');
      await page.locator('#alMarkerTime').fill('0.25');
      await page.locator('#alMarkerTime').dispatchEvent('change');
      assert.equal(await page.locator('#alMarkerTime').inputValue(),'0.250');
      await page.locator('[data-al-tool=warp]').click();
      await page.locator('#alWaveCanvas').click({position:{x:110,y:80}});
      await page.locator('#alMarkerTime').fill('0');
      await page.locator('#alMarkerTime').dispatchEvent('change');
      await page.locator('#alWarpMarkerValidated').click();
      assert.equal(await page.locator('#alWarpMarkerValidated').isChecked(),false,
        'an endpoint cannot be validated as an interior Warp anchor');
      await page.locator('#alMarkerTime').fill('0.2');
      await page.locator('#alMarkerTime').dispatchEvent('change');
      await page.locator('#alWarpMarkerBeat').fill('0.5');
      await page.locator('#alWarpMarkerBeat').dispatchEvent('change');
      await page.locator('#alWarpMarkerValidated').check();
      assert.equal(await page.locator('#alMarkerLayer .al-marker[data-kind=warp][data-validated=true]').count(),1);
      await page.locator('#alWarpSourceBpm').fill('120');
      await page.locator('#alWarpTargetBpm').fill('40');
      const unconfirmedWave=await page.locator('#alWaveCanvas').evaluate(node=>node.toDataURL());
      await page.locator('#alWarpConfirmed').check();
      const confirmedWave=await page.locator('#alWaveCanvas').evaluate(node=>node.toDataURL());
      assert.notEqual(confirmedWave,unconfirmedWave,'confirmed source BPM displays the Original musical grid before Warp rendering');
      await page.locator('#alClickEnabled').check();
      await page.waitForFunction(()=>document.getElementById('alStatus').textContent.includes('Clic RENAX manuel activé'),{timeout:10000});
      await page.locator('#alPrepareWarp').click();
      await page.waitForFunction(()=>!document.getElementById('alWarpMode').disabled,{timeout:45000});
      assert.equal(await page.locator('#alWarpMode').getAttribute('aria-pressed'),'true','Warp mode enters after Worker render');
      assert((await page.locator('#alDuration').textContent()).startsWith('00:01.5'),'120→40 triples output duration');
      assert((await page.locator('#alWarpStatus').textContent()).includes('120 → 40 BPM'));
      assert.equal(await page.locator('#alClickEnabled').isDisabled(),true,'Original click is isolated during Warp playback');
      const anchorX=Number.parseFloat(await page.locator('#alMarkerLayer .al-marker[data-kind=warp]').evaluate(node=>node.style.left));
      assert(Math.abs(anchorX-50)<2,'validated 0.5 beat anchor maps to half the Warp timeline');
      await page.evaluate(()=>{
        const original=AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start=function(...args){
          if(this.buffer?.duration>1)window.__alPlayedWarpBuffer=this.buffer;
          return original.apply(this,args);
        };
      });
      await page.locator('#alPlay').click();
      await page.waitForFunction(()=>!!window.__alPlayedWarpBuffer,{timeout:10000});
      const played=await page.evaluate(()=>{
        const buffer=window.__alPlayedWarpBuffer,data=buffer.getChannelData(0),rate=buffer.sampleRate;
        const start=Math.round(.4*rate),end=Math.round(.9*rate);
        let crossings=0;
        for(let i=start+1;i<end;i++)if(data[i-1]<=0&&data[i]>0)crossings++;
        return {duration:buffer.duration,frequency:crossings/.5};
      });
      assert(Math.abs(played.duration-1.5)<.02,'browser schedules rendered 120→40 audio');
      assert(Math.abs(played.frequency-200)<20,'Warp keeps 200 Hz source pitch near its original frequency');
      await page.locator('#alStop').click();
      await page.locator('#alSeek').fill('200');
      await page.locator('#alLoopA').click();
      await page.locator('#alSeek').fill('800');
      await page.locator('#alLoopB').click();
      await page.locator('#alLoopEnabled').check();
      assert.notEqual(await page.locator('#alLoopInfo').textContent(),'—','source A/B loop survives Warp mode');
      await page.locator('#alOriginalMode').click();
      assert((await page.locator('#alDuration').textContent()).startsWith('00:00.5'),'Original returns to source duration');
      assert.equal(await page.locator('#alClickEnabled').isChecked(),true,'Original click preference survives mode switch');
      await page.locator('#alWarpMode').click();
      assert((await page.locator('#alDuration').textContent()).startsWith('00:01.5'),'Warp render remains reusable');
      await page.locator('#alWarpTargetBpm').fill('60');
      assert.equal(await page.locator('#alWarpMode').isDisabled(),true,'changing target invalidates rendered Warp');
      assert.equal(await page.locator('#alPlay').isDisabled(),false,'Original transport remains available after invalidation');
      await page.locator('#alLoopEnabled').uncheck();
      await page.locator('#alMarkerLayer .al-marker[data-kind=warp]').click();
      await page.locator('#alDeleteMarker').click();
      await page.locator('[data-al-tool=tempo]').click();
      await page.locator('#alWaveCanvas').click({position:{x:220,y:80}});
      await page.locator('#alMarkerTime').fill('0.25');
      await page.locator('#alMarkerTime').dispatchEvent('change');
      await page.locator('#alTempoMarkerBpm').fill('60');
      await page.locator('#alTempoMarkerBpm').dispatchEvent('change');
      await page.locator('#alTempoMarkerValidated').check();
      assert.equal(await page.locator('#alMarkerLayer .al-marker[data-kind=tempo][data-validated=true]').count(),1);
      await page.locator('#alWarpTargetBpm').fill('40');
      await page.locator('#alPrepareWarp').click();
      await page.waitForFunction(()=>!document.getElementById('alWarpMode').disabled,{timeout:45000});
      assert((await page.locator('#alDuration').textContent()).startsWith('00:01.125'),'validated 120→60 source tempo change shapes Warp at target 40');
      await page.locator('#alManualBpm').fill('93');
      await page.locator('#alManualBpm').dispatchEvent('change');
      const [projectDownload]=await Promise.all([
        page.waitForEvent('download'),page.locator('#alExportProject').click(),
      ]);
      const projectJson=await fs.readFile(await projectDownload.path(),'utf8');
      const savedProject=JSON.parse(projectJson);
      assert.equal(savedProject.state.markers.filter(marker=>marker.kind==='tempo'&&marker.validated).length,1);
      assert.deepEqual(savedProject.state.baseMeter,{numerator:7,denominator:8,groups:[2,2,3]});
      assert.equal(savedProject.state.manualBpm,93);
      assert.equal(Object.hasOwn(savedProject,'pcm'),false,'local project does not embed audio PCM');
      await page.locator('#alNumerator').fill('4');
      await page.locator('#alDenominator').selectOption('4');
      await page.locator('#alGroups').fill('');
      await page.locator('#alGroups').dispatchEvent('change');
      await page.locator('#alManualBpm').fill('120');
      await page.locator('#alManualBpm').dispatchEvent('change');
      await page.locator('#alDeleteMarker').click();
      assert.equal(await page.locator('#alMarkerLayer .al-marker[data-kind=tempo]').count(),0);
      await page.locator('#alProjectInput').setInputFiles({name:'session.json',mimeType:'application/json',buffer:Buffer.from(projectJson)});
      await page.waitForFunction(()=>document.getElementById('alProjectStatus').textContent.includes('Métadonnées source concordantes'));
      assert.equal(await page.locator('#alMarkerLayer .al-marker[data-kind=tempo][data-validated=true]').count(),1,
        'matching local project restores validated tempo marker');
      assert.equal(await page.locator('#alWarpMode').isDisabled(),true,'restored Warp mode requires a fresh render');
      assert.equal(await page.locator('#alNumerator').inputValue(),'7');
      assert.equal(await page.locator('#alDenominator').inputValue(),'8');
      assert.equal(await page.locator('#alGroups').inputValue(),'2+2+3');
      assert.equal(await page.locator('#alManualBpm').inputValue(),'93','manual click BPM round-trips independently');
      assert((await page.locator('#alProjectStatus').textContent()).includes('contenu audio non vérifié'));
      savedProject.source.name='autre-source.wav';
      await page.locator('#alProjectInput').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(savedProject))});
      await page.waitForFunction(()=>document.getElementById('alProjectStatus').textContent.includes('Restauration refusée'));
      assert((await page.locator('#alProjectStatus').textContent()).includes('Restauration refusée'),
        'mismatched source project is rejected');
      await page.locator('#workspaceNav [data-workspace=metronome]').click();
      await page.waitForFunction(()=>window.RENAX_WORKSPACE.current==='metronome');
      assert.equal(await page.locator('#audioLabRoot').isVisible(),false);
      assert.equal(await page.locator('#sequencerContainer').isVisible(),true,'historical circular sequencer preserved');
      await page.locator('#workspaceNav [data-workspace=audio-lab]').click();
      await page.waitForFunction(()=>window.RENAX_WORKSPACE.current==='audio-lab');
      assert.equal(await page.locator('#alMarkerLayer .al-marker').count(),2,'annotations retained on workspace switch');
      const dimensions=await page.evaluate(()=>{
        const s=document.getElementById('audioLabRoot').getBoundingClientRect();
        return {overflow:document.documentElement.scrollWidth>window.innerWidth,rootWidth:s.width,rootHeight:s.height,style:getComputedStyle(document.getElementById('audioLabRoot')).backgroundColor};
      });
      assert.equal(dimensions.overflow,false,'no page horizontal overflow');
      assert(dimensions.rootWidth>240&&dimensions.rootHeight>150,'usable Audio Lab panel');
      assert.deepEqual(errors,[], 'no uncaught browser errors');
      report[size.width+'x'+size.height]=dimensions;
      await page.screenshot({path:(process.env.TEST_OUTPUT_DIR||'tests/results')+'/audio-lab-'+size.width+'.png',animations:'disabled'});
      await page.locator('[data-al-tool=downbeat]').click();
      await page.locator('#alWaveCanvas').click({position:{x:150,y:80}});
      assert.equal(await page.locator('#alDownbeatMarkerEditor').isVisible(),true,'Temps 1 opens its flag metric editor');
      await page.locator('#alDownbeatMeter').selectOption('6/8');
      assert.equal(await page.locator('#alNumerator').inputValue(),'6');
      assert.equal(await page.locator('#alDenominator').inputValue(),'8');
      await page.locator('#alMarkerTime').fill('0.1');
      await page.locator('#alMarkerTime').dispatchEvent('change');
      const waveBox=await page.locator('#alWaveCanvas').boundingBox();
      await page.locator('#alWaveCanvas').click({position:{x:Math.round(waveBox.width*.72),y:80}});
      await page.locator('#alMarkerTime').fill('0.3');
      await page.locator('#alMarkerTime').dispatchEvent('change');
      await page.locator('#alMarkerLayer .al-marker[data-kind=downbeat]').first().click();
      await page.locator('#alMarkerTime').fill('0.4');
      await page.locator('#alMarkerTime').dispatchEvent('change');
      const [sortedDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#alExportProject').click()]);
      const sortedState=JSON.parse(await fs.readFile(await sortedDownload.path(),'utf8')).state;
      assert.deepEqual(sortedState.markers.filter(marker=>marker.kind==='downbeat').map(marker=>marker.seconds),[.3,.4],
        'moving a downbeat across another keeps chronological marker order');
      await page.close();
    }
    for(const width of [1101,1200]){
      const page=await harness.browser.newPage({viewport:{width,height:810},reducedMotion:'reduce'});
      await page.goto(harness.url);
      await page.waitForFunction(()=>window.RENAX_WORKSPACE?.current==='metronome');
      const fit=await page.evaluate(()=>{
        const app=document.documentElement,original=app.dataset.theme,result={};
        for(const theme of ['dark','light','ivory','avant']){
          app.dataset.theme=theme;
          const nav=document.querySelector('#workspaceNav'),buttons=[...nav.querySelectorAll('[data-workspace]')];
          const bounds=buttons.map(button=>button.getBoundingClientRect()),container=nav.getBoundingClientRect();
          result[theme]={rows:new Set(bounds.map(rect=>Math.round(rect.top))).size,
            overlap:bounds.some((rect,index)=>index>0&&rect.left<bounds[index-1].right-1),
            overflow:bounds.at(-1).right>container.right+1};
        }
        app.dataset.theme=original;return result;
      });
      assert(Object.values(fit).every(theme=>theme.rows===1&&!theme.overlap&&!theme.overflow),
        'seven tabs fit at '+width+' px in all four themes: '+JSON.stringify(fit));
      report['nav-'+width]=fit;
      await page.close();
    }
    save('audio-lab-ui-results.json',report);
    console.log('PASS Audio Lab UI: seven tabs, four themes, WAV import, validated grid, 120→40 Warp, loop, click and mode switching at desktop/mobile sizes');
  } finally {
    await harness.browser.close();
    harness.server?.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
