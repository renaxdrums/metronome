/* RENAX DRUMS — cinematic scroll entrance; presentation only, no audio changes. */
(() => {
 const overlay=document.getElementById('renaxArrival');if(!overlay)return;
 const preference='renax.arrival.enabled.v1',reduce=matchMedia('(prefers-reduced-motion:reduce)');
 let enabled=true,finished=false,frame,canvas,curtain,previous;
 const timeouts=[],animations=[],origins=[];
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
  origins.forEach(([node,original])=>{node.style.transformOrigin=original;});
  overlay.hidden=true;canvas?.remove();curtain?.remove();
  overlay.style.removeProperty('transform');overlay.style.removeProperty('opacity');
  if(overlay.contains(document.activeElement))previous?.focus();
 }
 function sceneNodes(){
  // Animate only top-level layout pieces; no DOM cloning or moving existing controls.
  return Array.from(document.body.children).filter(el=>
   el!==overlay&&(el.matches('header,footer,.main-grid,#workspaceNav,#workspaceMobileViews,nav.mobile-tabs')));
 }
 function sceneZoom(){
  for(const el of sceneNodes()){
   if(el.hidden||getComputedStyle(el).display==='none')continue;
   const rect=el.getBoundingClientRect();
   if(!rect.width||!rect.height)continue;
   const saved=el.style.transformOrigin;
   origins.push([el,saved]);
   // The same viewport-centered transform origin makes distinct layout panels
   // read visually as one rigid camera plane. No geometry or data is changed.
   el.style.transformOrigin=(innerWidth/2-rect.left)+'px '+(innerHeight/2-rect.top)+'px';
   animations.push(el.animate([
    {offset:0,transform:'translate3d(0,85px,0) scale(.85) rotate(-.32deg)'},
    {offset:.48,transform:'translate3d(0,22px,0) scale(.95) rotate(.08deg)'},
    {offset:1,transform:'translate3d(0,0,0) scale(1) rotate(0deg)'}
   ],{duration:1040,fill:'both',easing:'cubic-bezier(.15,.72,.2,1)'}));
  }
 }
 function startCamera(){
  if(typeof overlay.animate!=='function'){finish();return;}
  // Visible camera pull-back WHILE the fox/brand is still visible.
  // The matte is darker than the intro, exposing the receding frame edges.
  // Then the entire frame travels upward like a real vertical page scroll.
  const timing={duration:1770,easing:'cubic-bezier(.40,.07,.17,1)',fill:'forwards'};
  const slide=overlay.animate([
   {offset:0,transform:'translate3d(0,0,0) scale(1) rotate(0deg)',borderRadius:'0px'},
   {offset:.08,transform:'translate3d(-2px,1px,0) scale(.991) rotate(-.13deg)',borderRadius:'4px'},
   {offset:.22,transform:'translate3d(3px,-2px,0) scale(.949) rotate(.3deg)',borderRadius:'12px'},
   {offset:.38,transform:'translate3d(-1px,-4px,0) scale(.89) rotate(-.36deg)',borderRadius:'16px'},
   {offset:.49,transform:'translate3d(0,-11px,0) scale(.89) rotate(0deg)',borderRadius:'16px'},
   {offset:.68,transform:'translate3d(0,-41%,0) scale(.92) rotate(0deg)',borderRadius:'8px'},
   {offset:1,transform:'translate3d(0,-112%,0) scale(.96) rotate(0deg)',borderRadius:'0px'}
  ],timing);
  animations.push(slide);
  if(curtain)animations.push(curtain.animate([
   {offset:0,transform:'translate3d(0,0,0)'},
   {offset:.47,transform:'translate3d(0,0,0)'},
   {offset:.68,transform:'translate3d(0,-41%,0)'},
   {offset:1,transform:'translate3d(0,-112%,0)'}
  ],timing));
  later(sceneZoom,670);
  slide.finished.then(finish,finish);
 }
 function begin(){
  if(overlay.hidden||finished)return;
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
    if(elapsed>=1710){canvas.remove();canvas=null;return;}
   // One travelling spectral field: fine interlaced audio filaments, not a sweeping edge.
   const wave=clamp((elapsed-180)/1450);
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
  // Fade the whole brand after the camera begins receding; not before it.
  later(startCamera,2270);
  later(()=>{
   const fade={duration:610,fill:'forwards',easing:'cubic-bezier(.35,0,.65,1)'};
   for(const target of [center,rings])if(target)animations.push(target.animate([{opacity:1},{opacity:0}],fade));
  },2660);
  later(finish,5000); // Safety fallback for background tabs and old browsers.
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
