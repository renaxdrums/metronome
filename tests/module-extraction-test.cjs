const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {start,save}=require('./audio-harness.cjs');
const root=path.resolve(__dirname,'..'),files=['app-base.css','sequencer-layout.css','appearance-theme.css','metronome-core.js'];
(async()=>{const h=await start(),rows=[];try{
 let inline=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const file of files){const content=fs.readFileSync(path.join(root,file),'utf8');if(file.endsWith('.js'))inline=inline.replace(new RegExp('<script src="'+file.replace('.','\\.')+'\\?v=[^"]+"><\\/script>'),()=>'<script>'+content+'</script>');else inline=inline.replace(new RegExp('<link([^>]*?)href="'+file.replace('.','\\.')+'\\?v=[^"]+"[^>]*>'),(_,attrs)=>'<style'+(attrs.includes('id="appearance-theme"')?' id="appearance-theme"':'')+'>'+content+'</style>');}
 for(const [width,height]of [[1440,1000],[390,844]]){
  const pages=[];for(const baseline of [true,false]){const p=await h.browser.newPage({viewport:{width,height},hasTouch:width<1100,reducedMotion:'reduce'});if(baseline)await p.route('**/inline-baseline.html',r=>r.fulfill({contentType:'text/html',body:inline}));await p.goto(baseline?h.url+'/inline-baseline.html':h.url);await p.waitForFunction(()=>allVoiceAudioReady&&window.RENAX_SONGS);await p.evaluate(()=>document.fonts.ready);await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});pages.push(p);}
  for(const theme of ['dark','light','ivory'])for(const module of ['Métronome','Polyrythmie','Entraînement','Séquenceur','Multipiste','Track']){
   const snapshots=[];for(const p of pages){await p.locator('#index2SettingsBtn').click();await p.locator('[data-appearance='+theme+']').click();await p.locator('#index2SettingsClose').click();await p.getByRole('tab',{name:module,exact:true}).click();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));snapshots.push(await p.evaluate(()=>[...document.body.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(e).visibility!=='hidden'}).map(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return{tag:e.tagName,class:e.className?.baseVal??e.className,rect:[b.x,b.y,b.width,b.height].map(n=>Math.round(n*100)/100),color:s.color,background:s.backgroundColor,font:s.fontFamily,fontSize:s.fontSize,border:s.borderRadius}})));}
   assert.deepEqual(snapshots[1],snapshots[0],JSON.stringify({width,height,theme,module}));rows.push({width,height,theme,module,visibleElements:snapshots[1].length});
  }
  for(const p of pages)await p.close();
 }
 save('module-extraction-results.json',{comparisons:rows,method:'Actual browser layout and computed appearance: external files versus same sources inlined at original positions'});console.log('PASS 36 module/theme/viewport layouts identical after extracting CSS and core script');
 }finally{await h.browser.close();h.server?.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
