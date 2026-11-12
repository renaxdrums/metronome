'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const {start} = require('./audio-harness.cjs');
(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'renax-wma-'));
  const filename=path.join(temp,'440Hz.wma');
  const ff=cp.spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi',
    '-i','sine=frequency=440:sample_rate=44100:duration=0.7','-ac','1',
    '-c:a','wmav2','-b:a','48k','-y',filename],{timeout:20000,encoding:'utf8'});
  if(ff.status!==0)throw Error('Cannot create WMA fixture: '+ff.stderr);
  let h;
  try{
    h=await start();
    const p=await h.browser.newPage({viewport:{width:1024,height:768}});
    const errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(h.url);await p.waitForFunction(()=>window.RENAX_WORKSPACE);
    await p.locator('#workspaceNav [data-workspace="audio-lab"]').click();
    await p.locator('#alFileInput').setInputFiles({name:'440Hz.wma',mimeType:'audio/x-ms-wma',buffer:fs.readFileSync(filename)});
    await p.waitForFunction(()=>!document.getElementById('alPlay').disabled,{timeout:30000});
    const details=await p.locator('#alFormatInfo').textContent();
    assert(details.startsWith('WMA'),details);
    assert(details.includes('44,1 kHz'),details);
    assert(details.includes('1 canal'),details);
    assert.equal(await p.locator('#alEmpty').isVisible(),false);
    await p.locator('#alPlay').click();
    await p.waitForFunction(()=>document.getElementById('alPlaybackState').textContent==='LECTURE');
    await p.locator('#alStop').click();
    assert.deepEqual(errors,[]);
    await p.close();
    console.log('PASS real Chromium offline WMA v2 via self-hosted LGPL WASM Worker, waveform and original transport');
  }finally{
    await h?.browser?.close();h?.server?.close();
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
