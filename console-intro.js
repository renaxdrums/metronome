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
  word.replaceChildren(...[...(en?'Metronome':'Métronome')].map((letter,i)=>{
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
  replica.setAttribute('aria-hidden','true');replica.inert=true;
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
   });
   // No actions, focus, form submission or accessibility duplication.
   for(const node of copy.querySelectorAll('*')){
    for(const attribute of [...node.attributes])if(/^on/i.test(attribute.name))node.removeAttribute(attribute.name);
    if(node.matches('a,button,input,select,textarea,[tabindex]'))node.tabIndex=-1;
   }
   replica.append(copy);
  }
  document.body.append(backdrop,replica); // After the originals: original IDs remain the lookup targets.
  syncReplicaCanvases();
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
 function startCamera(){
  if(typeof overlay.animate!=='function'){finish();return;}
  // Visible camera pull-back WHILE the fox/brand is still visible.
  // The matte is darker than the intro, exposing the receding frame edges.
  // Then the entire frame travels upward like a real vertical page scroll.
  const duration=2630, ease=x=>{x=clamp(x);return x*x*(3-2*x);};
  const frames=[],replicaFrames=[];
  for(let i=0;i<=80;i++){
   const t=i/80,zoom=ease(t/.64),travel=ease((t-.23)/.77);
   const topScale=1-.062*zoom;
   const topY=-116*travel;
   frames.push({offset:t,transform:'translate3d(0,'+topY.toFixed(4)+'%,0) scale('+topScale.toFixed(5)+')'});
   // The lower scene starts exactly at the bottom edge of the upper page.
   // As it scrolls in, it gently grows to its real 100% size and position.
   const bottomScale=.925+.075*ease(travel);
   const edge=Math.max(0,(1+topScale)/2-1.16*travel);
   const bottomY=100*(edge-(1-bottomScale)/2);
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
  // Build the visual copy before motion begins: no full-app clone per frame.
  try{createReplica();}catch(error){console.warn('[RENAX intro] Visual copy unavailable:',error);replica?.remove();backdrop?.remove();replica=null;backdrop=null;}
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
   function stroke(points,color,lineWidth,alpha){
    if(alpha<=0)return;
    ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=lineWidth;
    ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.globalAlpha=1;
   }
   function tick(now){
    if(finished||overlay.hidden)return;
    if(width!==innerWidth||height!==innerHeight)resize();
    if(started===undefined)started=now;
    const elapsed=now-started;
    ctx.clearRect(0,0,width,height);
    if(elapsed>=1200)return; // Keep the final visible wave frame with the black panel.
   // One travelling spectral field: fine interlaced audio filaments, not a sweeping edge.
   const wave=clamp((Math.min(elapsed,1200)-180)/1450);
   if(wave>0&&wave<1){
    const opacity=Math.pow(Math.sin(Math.PI*wave),.75),time=elapsed/1000;
    const base=height*.69,amplitude=Math.min(height*.14,115),packet=wave*1.5-.25;
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
    for(let k=0;k<38;k++){
     const depth=k/37,phase=k*.173,points=[];
     for(let i=0;i<=230;i++){
      const u=i/230,e=energy(u),ridge=.25+.75*Math.pow(.5+.5*Math.sin(u*17-time*1.4+phase*.24),2);
      const carrier=Math.sin(u*25-time*2.1+phase)+.42*Math.sin(u*49+time*.9-phase*.6)+.18*Math.sin(u*93-time*1.3+phase);
      const y=base+carrier*amplitude*(.18+e*.82)*ridge*(.38+depth*.62)+(depth-.5)*18;
      points.push({x:u*width,y});
     }
     ctx.shadowColor=k<19?'#ffb268':'#7cdbe8';ctx.shadowBlur=k%12===0?5:0;
     stroke(points,spectrum,.55+depth*.3,opacity*(.10+depth*.075));
     if(k%4===0){
      const reflected=points.map(p=>({x:p.x,y:base+(base-p.y)*.35+13}));
      ctx.shadowBlur=0;stroke(reflected,spectrum,.6,opacity*.035);
     }
    }
    ctx.restore();
   }
   frame=requestAnimationFrame(tick);
   }
   frame=requestAnimationFrame(tick);
  }
  // Preserve the entire composition as the black panel moves upward.
  later(startCamera,2270);
  later(finish,5600); // Safety fallback for background tabs and old browsers.
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
 if(enabled&&!reduce.matches){label();previous=document.activeElement;later(begin,900);}else finish();
})();
