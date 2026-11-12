const assert=require('node:assert/strict');
const {start}=require('./audio-harness.cjs');

/** Hand-built 24-bit stereo AIFF/96k file, no browser codec or external fixtures. */
function fixture(){
 const rate=96000,frames=rate/4,channels=2,bits=24;
 const bytes=Buffer.alloc(12+8+18+8+8+frames*channels*3);
 bytes.write('FORM',0);bytes.writeUInt32BE(bytes.length-8,4);bytes.write('AIFF',8);
 bytes.write('COMM',12);bytes.writeUInt32BE(18,16);
 bytes.writeUInt16BE(channels,20);bytes.writeUInt32BE(frames,22);bytes.writeUInt16BE(bits,26);
 Buffer.from([0x40,0x0f,0xbb,0x80,0,0,0,0,0,0]).copy(bytes,28);
 const pos=38;bytes.write('SSND',pos);bytes.writeUInt32BE(8+frames*channels*3,pos+4);
 bytes.writeUInt32BE(0,pos+8);bytes.writeUInt32BE(0,pos+12);
 for(let i=0;i<frames;i++)for(let ch=0;ch<channels;ch++){
   const n=Math.round(.24*8388607*Math.sin(2*Math.PI*(ch?660:440)*i/rate));
   const at=pos+16+(i*channels+ch)*3;
   bytes[at]=(n>>>16)&255;bytes[at+1]=(n>>>8)&255;bytes[at+2]=n&255;
 }
 return bytes;
}
(async()=>{
 const h=await start();try{
  const p=await h.browser.newPage({viewport:{width:960,height:740}});
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(h.url);await p.waitForFunction(()=>window.RENAX_WORKSPACE);
  await p.locator('#workspaceNav [data-workspace="audio-lab"]').click();
  await p.locator('#alFileInput').setInputFiles({
    name:'aiff-96k-24bit.aiff',mimeType:'audio/aiff',buffer:fixture(),
  });
  await p.waitForFunction(()=>!document.getElementById('alPlay').disabled,{timeout:30000});
  assert.equal(await p.locator('#alFileName').textContent(),'aiff-96k-24bit.aiff');
  assert((await p.locator('#alFormatInfo').textContent()).includes('24 bits'));
  assert((await p.locator('#alFormatInfo').textContent()).includes('96 kHz'));
  assert((await p.locator('#alFormatInfo').textContent()).includes('2 canaux'));
  assert.equal(await p.locator('#alEmpty').isVisible(),false);
  await p.locator('#alPlay').click();
  await p.waitForFunction(()=>document.getElementById('alPlaybackState').textContent==='LECTURE');
  await p.locator('#alStop').click();
  await p.waitForFunction(()=>document.getElementById('alPlaybackState').textContent==='À L’ARRÊT');
  assert.deepEqual(errors,[]);
  await p.close();
  console.log('PASS real Chromium local AIFF 24bit/96k import, stereo waveform and AudioContext transport');
 }finally{await h.browser.close();h.server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
