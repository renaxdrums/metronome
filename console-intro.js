/* Presentation only: geometry is read from the visible instrument, never written back. */
(() => {
 const overlay=document.getElementById('renaxArrival');if(!overlay)return;
 const preference='renax.arrival.enabled.v1',reduce=matchMedia('(prefers-reduced-motion:reduce)');
 let enabled=true,timer,frame,canvas,cover,previous;
 try{enabled=localStorage.getItem(preference)!=='false';}catch{}
 const word=overlay.querySelector('.console-arrival-word'),logo=overlay.querySelector('.console-arrival-logo');
 const captions=[word,...overlay.querySelectorAll('.console-arrival-brand,.console-arrival-sweep,.console-arrival-lines')];
 const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{n=clamp(n);return n*n*(3-2*n);};
 function label(){const en=window.RENAX_I18N?.language==='en';overlay.setAttribute('aria-label',en?'Metronome introduction':'Animation d’arrivée Métronome');word.replaceChildren(...[...(en?'Metronome':'Métronome')].map((letter,i)=>{const span=document.createElement('span');span.textContent=letter;span.style.setProperty('--n',i);return span;}));}
 function finish(){
  clearTimeout(timer);cancelAnimationFrame(frame);overlay.hidden=true;
  canvas?.remove();cover?.remove();canvas=cover=null;
  overlay.style.removeProperty('background');overlay.style.pointerEvents='';
  logo.style.removeProperty('opacity');for(const e of captions){e.style.opacity='';e.style.filter='';}
  if(overlay.contains(document.activeElement))previous?.focus();
 }
 function begin(){
  if(overlay.hidden)return;
  canvas=document.createElement('canvas');canvas.className='console-arrival-dust';canvas.setAttribute('aria-hidden','true');overlay.append(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});if(!ctx){finish();return;}
  cover=document.createElement('div');cover.className='console-arrival-matte';cover.setAttribute('aria-hidden','true');overlay.prepend(cover);overlay.style.setProperty('background','transparent','important');
  // Particle sources are sampled from the approved logo itself: no substitute artwork.
  // Separate mobility, lift, drag and release delays prevent uniform or mechanical motion.
  let seed=20261013;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const particles=[];
  const rect=logo.getBoundingClientRect();
  // Keep the original engraving highlight before the dust phase.
  const scale=Math.min(rect.width/772,rect.height/958);
  const origin={x:rect.left+(rect.width-772*scale)/2,y:rect.top+(rect.height-958*scale)/2};
  const mapped=p=>({x:origin.x+p.x*scale,y:origin.y+p.y*scale});
  const ns='http://www.w3.org/2000/svg',sampler=document.createElementNS(ns,'svg');
  sampler.style.cssText='position:fixed;left:-2px;top:-2px;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.append(sampler);
  let curves=[];
  try{
   const paths=['M146 331 105 208 118 31 286 183H486L654 31 667 208 626 331',
    'M146 331 286 183','M626 331 486 183',
    'M187 332 264 449 256 461 312 597 356 662H416L460 597 516 461 508 449 585 332',
    'M128 405 107 437 276 548','M644 405 665 437 496 548'];
   curves=paths.map(d=>{
    const p=document.createElementNS(ns,'path');p.setAttribute('d',d);sampler.append(p);
    const length=p.getTotalLength();
    return Array.from({length:81},(_,i)=>{const q=p.getPointAtLength(length*i/80);return {x:q.x,y:q.y};});
   });
  }finally{sampler.remove();}
  try{
   const sample=document.createElement('canvas');
   sample.width=Math.max(2,Math.round(rect.width*2));sample.height=Math.max(2,Math.round(rect.height*2));
   const sampleCtx=sample.getContext('2d',{willReadFrequently:true});
   sampleCtx.drawImage(logo,0,0,sample.width,sample.height);
   const pixels=sampleCtx.getImageData(0,0,sample.width,sample.height).data;
   for(let y=0;y<sample.height;y++)for(let x=0;x<sample.width;x+=2){
    const offset=(y*sample.width+x)*4;
    if(pixels[offset+3]<75||random()<.16)continue;
    particles.push({
     u:(x+.5+(random()-.5)*1.1)/sample.width,v:(y+.5+(random()-.5)*1.1)/sample.height,
     delay:random()*340+(x/sample.width)*160, mobility:.16+Math.pow(random(),1.55)*1.2,
     lift:(random()-.65)*1.35,whirl:.2+random()*.8,phase:random()*Math.PI*2,
     radius:.19+random()*.36,alpha:.68+random()*.3,
     gustA:.35+random()*.65,gustB:.30+random()*.70,gustC:.28+random()*.72
    });
   }
  }catch(error){console.info('[RENAX intro] Échantillonnage du logo indisponible :',error);}
  let width,height,started;
  function resize(){
   width=innerWidth;height=innerHeight;
   const dpr=Math.min(devicePixelRatio||1,2);
   canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
   ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();
  function stroke(points,color,lineWidth,alpha){if(alpha<=0)return;ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.globalAlpha=1;}
  function tick(now){
   if(overlay.hidden){finish();return;}if(width!==innerWidth||height!==innerHeight)resize();
   if(started===undefined)started=now;
   const elapsed=now-started;
   ctx.clearRect(0,0,width,height);
   // One grazing light follows the approved orange engraving before it transforms.
   if(elapsed<1100){
    const scan=elapsed/1100;
    for(let k=0;k<curves.length;k++){const curve=curves[k],at=(scan*1.2-k*.07);if(at<0||at>1)continue;const j=Math.round(at*80);stroke(curve.slice(Math.max(0,j-4),Math.min(81,j+5)).map(mapped),'#ffd5a6',Math.max(.8,scale*12),Math.sin(Math.PI*at)*.65);}
   }
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
   // Dust starts while the fox is appearing: no long static hold or ring transformation.
   // Gusts, turbulence and drag are independent for each grain; none aims at the sequencer.
   if(elapsed>=570){
    const logoFade=ease((elapsed-780)/2090);
    logo.style.setProperty('opacity',String(1-logoFade),'important');
    const current=logo.getBoundingClientRect();
    const appearance=ease((elapsed-570)/420)*(1-ease((elapsed-3540)/700));
    ctx.save();ctx.fillStyle='#ff7900';
    for(const p of particles){
     const age=clamp((elapsed-570-p.delay)/2350);
     const gust=age*age*(.87+.10*Math.sin(age*11+p.phase))
      +.025*age*(1-Math.cos(age*14+p.phase));
     const breeze=(6*age+44*gust)*p.mobility;
     // Three staggered, softly accelerating air currents from different sides.
     // Each grain reacts according to its position and its own mobility.
     const airA=ease((elapsed-1530)/800)*p.gustA*(.28+.72*(1-p.u)); // up-right
     const airB=ease((elapsed-2150)/780)*p.gustB*(.28+.72*p.u);     // up-left
     const airC=ease((elapsed-2670)/670)*p.gustC*(.34+.66*p.v);    // down-right
     const swirl=age*p.whirl;
     const baseX=current.left+p.u*current.width,baseY=current.top+p.v*current.height;
     const x=baseX+breeze+(36*airA-43*airB+54*airC)*p.mobility
      +Math.sin(age*7.7+p.phase)*7*swirl
      +Math.sin(age*15.1+p.phase*.7)*2.4*swirl;
     const y=baseY+p.lift*(12*age+47*gust)*p.mobility
      +(-18*airA-23*airB+20*airC)*p.mobility
      +Math.cos(age*8.6+p.phase)*7*swirl+Math.sin(age*13+p.phase)*2.2*swirl;
     const distance=Math.hypot(x-baseX,y-baseY);
     const radius=p.radius/(1+distance/67);
     const worn=1-ease((age-.79)/.21);
     const alpha=p.alpha*appearance*worn;
     if(alpha<.015)continue;
     ctx.globalAlpha=alpha;
     ctx.beginPath();ctx.arc(x,y,Math.max(.07,radius),0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
   }
   // Reveal the page beneath the dust without moving the instrument or its panels.
   if(elapsed>=1950){
    const progress=clamp((elapsed-1950)/2080);
    const stops=Array.from({length:13},(_,i)=>{
     const y=i/12,t=clamp((progress-(1-y)*.35)/.65);
     return 'rgba(0,0,0,'+(1-ease(t)).toFixed(4)+') '+(y*100).toFixed(2)+'%';
    });
    cover.style.maskImage='linear-gradient(to bottom,'+stops.join(',')+')';
    cover.style.webkitMaskImage=cover.style.maskImage;
    const textFade=1-ease((elapsed-2430)/1390);
    word.style.opacity=String(textFade);
    word.style.filter='blur('+((1-textFade)*2).toFixed(2)+'px)';
    for(const e of captions.slice(1))e.style.opacity=String(1-ease((elapsed-2500)/1350));
    if(elapsed>2800)overlay.style.pointerEvents='none';
   }
   if(elapsed>=4400)finish();else frame=requestAnimationFrame(tick);
  }
  frame=requestAnimationFrame(tick);timer=setTimeout(finish,5000);
 }
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden){e.preventDefault();finish();}},true);
 window.addEventListener('pagehide',finish,{once:true});reduce.addEventListener('change',()=>{if(reduce.matches)finish();});
 const settings=document.querySelector('#index2SettingsPanel .index2-settings-section');
 if(settings){const row=document.createElement('label');row.className='console-arrival-setting';const caption=document.createElement('span'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=enabled;row.append(caption,toggle);settings.append(row);function translate(){caption.textContent=window.RENAX_I18N?.language==='en'?'Intro animation':'Animation d’arrivée';}translate();window.addEventListener('renax-language-changed',translate);toggle.onchange=()=>{enabled=toggle.checked;try{localStorage.setItem(preference,String(enabled));}catch{}};}
 window.addEventListener('renax-language-changed',()=>{if(!overlay.hidden)label();});
 if(enabled&&!reduce.matches){label();previous=document.activeElement;timer=setTimeout(begin,900);}else finish();
})();

