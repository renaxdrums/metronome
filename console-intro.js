/* RENAX DRUMS — cinematic scroll entrance; presentation only, no audio changes. */
(() => {
 const overlay=document.getElementById('renaxArrival');if(!overlay)return;
 const preference='renax.arrival.enabled.v1',reduce=matchMedia('(prefers-reduced-motion:reduce)');
 let enabled=true,finished=false,frame,canvas,curtain,previous,replica,backdrop;
 const timeouts=[],animations=[];
 try{enabled=localStorage.getItem(preference)!=='false';}catch{}
 const word=overlay.querySelector('.console-arrival-word');
 const center=overlay.querySelector('.console-arrival-center');
 const rings=overlay.querySelector('.console-arrival-lines');
 const logo=overlay.querySelector('.console-arrival-logo');
 const clamp=n=>Math.max(0,Math.min(1,n));
 function label(){
  const en=window.RENAX_I18N?.language==='en';
  overlay.setAttribute('aria-label',en?'Metronome introduction':'Animation d’arrivée Métronome');
  const title=en?'Metronome':'Métronome';
  if(word.textContent===title)return; // Never restart the letter animation for the same label.
  word.replaceChildren(...[...title].map((letter,i)=>{
   const span=document.createElement('span');span.textContent=letter;span.style.setProperty('--n',i);return span;
  }));
 }
 const later=(callback,ms)=>{timeouts.push(setTimeout(()=>{if(!finished)callback();},ms));};
 function finish(){
  if(finished)return;
  finished=true;timeouts.forEach(clearTimeout);cancelAnimationFrame(frame);
  animations.forEach(a=>{try{a.cancel();}catch{}});
  overlay.hidden=true;canvas?.remove();curtain?.remove();replica?.remove();backdrop?.remove();
  overlay.style.removeProperty('transform');overlay.style.removeProperty('opacity');
  if(overlay.contains(document.activeElement))previous?.focus();
 }
 function sceneNodes(){
  // Use the actual responsive application as the source of truth on EVERY load.
  return Array.from(document.body.children).filter(el=>
   el!==overlay&&el.matches('header,footer,.main-grid,#workspaceNav,#workspaceMobileViews,nav.mobile-tabs'));
 }
 function createReplica(){
  if(replica)return;
  backdrop=document.createElement('div');backdrop.className='console-arrival-stage';backdrop.setAttribute('aria-hidden','true');
  replica=document.createElement('div');replica.className='console-arrival-replica';
  replica.setAttribute('aria-hidden','true');replica.setAttribute('data-no-translate','');replica.inert=true;
  const style=getComputedStyle(document.body);
  replica.style.font=style.font;replica.style.color=style.color;
  replica.style.backgroundColor=style.backgroundColor;
  // Snapshot the EXACT rendered geometry, rather than asking the clone to
  // independently recompute a different flex layout. Responsive and future
  // UI changes automatically appear in the mirror on each new page load.
  for(const source of sceneNodes()){
   const rect=source.getBoundingClientRect();
   const copy=source.cloneNode(true);
   const computed=getComputedStyle(source);
   copy.style.setProperty('position','absolute','important');
   copy.style.setProperty('display',computed.display,'important');
   copy.style.boxSizing='border-box';
   copy.style.left=rect.left+'px';
   copy.style.top=rect.top+'px';
   copy.style.width=rect.width+'px';
   copy.style.height=rect.height+'px';
   copy.style.margin='0';
   copy.style.flex='none';
   copy.classList.add('console-arrival-mirror-piece');
   const fromFields=source.querySelectorAll('input,select,textarea,progress,meter');
   const toFields=copy.querySelectorAll('input,select,textarea,progress,meter');
   fromFields.forEach((field,i)=>{
    const dest=toFields[i];if(!dest)return;
    if('value' in field)dest.value=field.value;
    if('checked' in field)dest.checked=field.checked;
    if('selectedIndex' in field)dest.selectedIndex=field.selectedIndex;
    // Cloned duplicate IDs must not make the native fields underneath custom controls visible.
    const fieldStyle=getComputedStyle(field);
    for(const property of ['display','visibility','opacity','position','clip','clip-path','width','height','min-width','max-width','min-height','max-height','top','right','bottom','left'])dest.style.setProperty(property,fieldStyle.getPropertyValue(property),'important');
   });
   // No actions, focus, form submission or accessibility duplication.
   for(const node of copy.querySelectorAll('*')){
    for(const attribute of [...node.attributes])if(/^on/i.test(attribute.name))node.removeAttribute(attribute.name);
    if(node.matches('a,button,input,select,textarea,[tabindex]'))node.tabIndex=-1;
   }
   replica.append(copy);
  }
  document.body.append(backdrop,replica); // After the originals: original IDs remain the lookup targets.
  // The replica starts translated below the screen. Measure it at its
  // neutral final position, then restore the offscreen starting transform.
  // Otherwise getBoundingClientRect includes a full viewport of offset.
  replica.style.transform='none';
  try{
   synchronizeMirrorGeometry();
   syncReplicaCanvases();
  }finally{replica.style.removeProperty('transform');}
 }
 function synchronizeMirrorGeometry(){
  if(!replica)return;
  const original=document.querySelector('body > .main-grid > .panel-visu');
  const mirrored=replica.querySelector('.main-grid > .panel-visu');
  if(!original||!mirrored)return;
  // Fix the wrapper first: it establishes the height used by the circle's
  // container-query units. Then fix the circle to the exact source pixels.
  for(const selector of ['.visu-toolbar','.sequencer-wrapper','#sequencerContainer']){
   const source=original.querySelector(selector),copy=mirrored.querySelector(selector);
   if(!source||!copy)continue;
   const rect=source.getBoundingClientRect();
   if(!(rect.width>0&&rect.height>0))continue;
   if(selector==='.visu-toolbar'){
    const computed=getComputedStyle(source);
    for(const property of ['display','box-sizing','grid-template-columns','grid-template-rows','column-gap','row-gap','padding-top','padding-right','padding-bottom','padding-left','align-items'])copy.style.setProperty(property,computed.getPropertyValue(property),'important');
   }
   for(const [property,size] of [['width',rect.width],['height',rect.height],
     ['min-width',rect.width],['max-width',rect.width],['min-height',rect.height],['max-height',rect.height]]){
    copy.style.setProperty(property,size+'px','important');
   }
   // Relocate any residual offset caused by flex/grid recomputation, without
   // changing the structure or listeners of the functional original.
   const cloneRect=copy.getBoundingClientRect();
   const dx=rect.left-cloneRect.left,dy=rect.top-cloneRect.top;
   if(Math.abs(dx)>.5||Math.abs(dy)>.5){
    copy.style.translate=dx.toFixed(2)+'px '+dy.toFixed(2)+'px';
   }
  }
 }
 function syncReplicaCanvases(){
  if(!replica)return;
  const originals=sceneNodes().flatMap(el=>Array.from(el.querySelectorAll('canvas')));
  const copies=replica.querySelectorAll('canvas');
  originals.forEach((source,i)=>{
   const target=copies[i];if(!target)return;
   try{
    if(!source.width||!source.height)return;
    target.width=source.width;target.height=source.height;
    const ctx=target.getContext('2d',{alpha:true});
    if(ctx)ctx.drawImage(source,0,0);
   }catch{/* Canvas is a visual detail; the UI must remain usable even if it fails. */}
  });
 }
 async function startCamera(){
  if(typeof overlay.animate!=='function'){finish();return;}
  // Freeze the actual laid-out UI only after its fonts and first render have settled.
  try{await document.fonts?.ready;}catch{}
  if(finished||overlay.hidden)return;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(finished||overlay.hidden)return;
  try{createReplica();}catch(error){console.warn('[RENAX intro] Visual copy unavailable:',error);replica?.remove();backdrop?.remove();replica=null;backdrop=null;finish();return;}
  // Visible camera pull-back WHILE the fox/brand is still visible.
  // The matte is darker than the intro, exposing the receding frame edges.
  // Then the entire frame travels upward like a real vertical page scroll.
  const duration=2630, ease=x=>{x=clamp(x);return x*x*(3-2*x);};
  const frames=[],replicaFrames=[],desktop=innerWidth>1100;
  for(let i=0;i<=80;i++){
   const t=i/80,zoom=ease(t/.64),travel=ease((t-.23)/.77);
   const commonScale=1-.062*zoom*(1-ease((t-.78)/.22));
   const topScale=desktop?commonScale:1-.062*zoom;
   const topY=desktop?-100*travel*commonScale:-116*travel;
   frames.push({offset:t,transform:'translate3d(0,'+topY.toFixed(4)+'%,0) scale('+topScale.toFixed(5)+')'});
   // The lower scene starts exactly at the bottom edge of the upper page.
   // As it scrolls in, it gently grows to its real 100% size and position.
   const bottomScale=desktop?commonScale:.925+.075*ease(travel);
   const edge=Math.max(0,(1+topScale)/2-1.16*travel);
   const bottomY=desktop?topY+100*commonScale:100*(edge-(1-bottomScale)/2);
   replicaFrames.push({offset:t,transform:'translate3d(0,'+bottomY.toFixed(4)+'%,0) scale('+bottomScale.toFixed(5)+')'});
  }
  const timing={duration,easing:'linear',fill:'forwards'};
  const slide=overlay.animate(frames,timing);
  animations.push(slide);
  if(curtain)animations.push(curtain.animate(frames.map(frame=>({offset:frame.offset,transform:frame.transform.replace(/ scale\([^)]*\)/,'')})),timing));
  if(replica){
   syncReplicaCanvases();
   animations.push(replica.animate(replicaFrames,timing));
  }
  slide.finished.then(finish,finish);
 }
 function begin(){
  if(overlay.hidden||finished)return;
  // The replica is built just before the camera move, after layout readiness.
  // A black backing plane prevents premature exposure around the de-zoomed card.
  curtain=document.createElement('div');curtain.className='console-arrival-curtain';
  curtain.setAttribute('aria-hidden','true');overlay.before(curtain);
  canvas=document.createElement('canvas');canvas.className='console-arrival-wave';
  canvas.setAttribute('aria-hidden','true');overlay.append(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});
  if(ctx){
   let width,height,started;
   function resize(){
    width=innerWidth;height=innerHeight;
    const dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
   }
   resize();
   const samples=Array.from({length:231},(_,i)=>({u:i/230}));
   const yValues=new Float64Array(231);
   const phases=Array.from({length:38},(_,k)=>{const p=k*.173;return {cos:Math.cos(p),sin:Math.sin(p),cos6:Math.cos(p*.6),sin6:Math.sin(p*.6),cos24:Math.cos(p*.24),sin24:Math.sin(p*.24)};});
   function stroke(values,color,lineWidth,alpha,reflectionBase){
    if(alpha<=0)return;
    ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=lineWidth;
    ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    for(let i=0;i<values.length;i++){const x=i/(values.length-1)*width,y=reflectionBase===undefined?values[i]:reflectionBase+(reflectionBase-values[i])*.35+13;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();ctx.globalAlpha=1;
   }
   function tick(now){
    if(finished||overlay.hidden)return;
    if(width!==innerWidth||height!==innerHeight)resize();
    if(started===undefined)started=now;
    const elapsed=now-started;
    ctx.clearRect(0,0,width,height);
   // The spectral field stays in place and keeps breathing until the entire scene exits.
   const wave=clamp(elapsed/450);
   if(wave>0){
    const opacity=wave*wave*(3-2*wave),time=elapsed/1000;
    const base=height*.69,amplitude=Math.min(height*.14,115),packet=.5+.12*Math.sin(time*.45);
    const spectrum=ctx.createLinearGradient(0,0,width,0);
    spectrum.addColorStop(0,'#ff7900');spectrum.addColorStop(.32,'#ffbb65');spectrum.addColorStop(.58,'#cce6c2');spectrum.addColorStop(1,'#45d7e7');
    const energy=u=>Math.exp(-Math.pow((u-packet)/.34,2));
    ctx.save();ctx.globalCompositeOperation='lighter';
    // The spectral ridges stay thin and translucent behind the flowing lines.
    ctx.strokeStyle=spectrum;ctx.lineWidth=.45;
    for(let i=0;i<190;i++){
     const u=i/189,x=u*width,e=energy(u);
     const peak=Math.pow(Math.abs(Math.sin(u*83-time*2.7)+.45*Math.sin(u*157+time*1.8))/1.45,3);
     const h=amplitude*1.8*peak*(.12+e*.88);
     ctx.globalAlpha=opacity*(.025+e*.10);ctx.beginPath();ctx.moveTo(x,base+7);ctx.lineTo(x,base-h);ctx.stroke();
    }
    // Cache point phases once per frame rather than repeating 35,000 trigonometric
    // calls and allocating thousands of point objects while the title is moving.
    for(const sample of samples){
     const u=sample.u,a=u*25-time*2.1,b=u*49+time*.9,c=u*93-time*1.3,r=u*17-time*1.4;
     sample.e=energy(u);sample.sa=Math.sin(a);sample.ca=Math.cos(a);sample.sb=Math.sin(b);sample.cb=Math.cos(b);sample.sc=Math.sin(c);sample.cc=Math.cos(c);sample.sr=Math.sin(r);sample.cr=Math.cos(r);
    }
    for(let k=0;k<38;k++){
     const depth=k/37,p=phases[k];
     for(let i=0;i<samples.length;i++){
      const q=samples[i],ridge=.25+.75*Math.pow(.5+.5*(q.sr*p.cos24+q.cr*p.sin24),2);
      const carrier=q.sa*p.cos+q.ca*p.sin+.42*(q.sb*p.cos6-q.cb*p.sin6)+.18*(q.sc*p.cos+q.cc*p.sin);
      yValues[i]=base+carrier*amplitude*(.18+q.e*.82)*ridge*(.38+depth*.62)+(depth-.5)*18;
     }
     ctx.shadowColor=k<19?'#ffb268':'#7cdbe8';ctx.shadowBlur=k%12===0?5:0;
     stroke(yValues,spectrum,.55+depth*.3,opacity*(.10+depth*.075));
     if(k%4===0){ctx.shadowBlur=0;stroke(yValues,spectrum,.6,opacity*.035,base);}
    }
    ctx.restore();
   }
   frame=requestAnimationFrame(tick);
   }
   frame=requestAnimationFrame(tick);
  }
  // Preserve the entire composition as the black panel moves upward.
  later(startCamera,2270);
  later(finish,7500); // Safety fallback for background tabs and old browsers.
 }
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!overlay.hidden){e.preventDefault();finish();}
 },true);
 window.addEventListener('pagehide',finish,{once:true});
 reduce.addEventListener('change',()=>{if(reduce.matches)finish();});
 const settings=document.querySelector('#index2SettingsPanel .index2-settings-section');
 if(settings){
  const row=document.createElement('label');row.className='console-arrival-setting';
  const caption=document.createElement('span'),toggle=document.createElement('input');
  toggle.type='checkbox';toggle.checked=enabled;row.append(caption,toggle);settings.append(row);
  function translate(){caption.textContent=window.RENAX_I18N?.language==='en'?'Intro animation':'Animation d’arrivée';}
  translate();window.addEventListener('renax-language-changed',translate);
  toggle.onchange=()=>{enabled=toggle.checked;try{localStorage.setItem(preference,String(enabled));}catch{}};
 }
 window.addEventListener('renax-language-changed',()=>{if(!overlay.hidden)label();});
 async function launch(){
  // Complete the expensive UI snapshot before any visible entrance motion.
  // Fonts and the fox image cannot change the title geometry halfway through.
  try{await Promise.all([document.fonts?.ready,logo?.decode?.().catch(()=>{})]);}catch{}
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(finished)return;
  label();previous=document.activeElement;
  try{createReplica();}catch(error){console.warn('[RENAX intro] Visual copy unavailable:',error);finish();return;}
  overlay.dataset.introReady='true';
  later(begin,900);
 }
 if(enabled&&!reduce.matches)launch();else finish();
})();
