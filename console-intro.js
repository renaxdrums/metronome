/* Presentation only: geometry is read from the visible instrument, never written back. */
(() => {
 const overlay=document.getElementById('renaxArrival');if(!overlay)return;
 const preference='renax.arrival.enabled.v1',reduce=matchMedia('(prefers-reduced-motion:reduce)');
 let enabled=true,timer,frame,canvas,cover,staging,previous;
 try{enabled=localStorage.getItem(preference)!=='false';}catch{}
 const word=overlay.querySelector('.console-arrival-word'),logo=overlay.querySelector('.console-arrival-logo');
 const captions=[word,...overlay.querySelectorAll('.console-arrival-brand,.console-arrival-sweep,.console-arrival-lines')];
 const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{n=clamp(n);return n*n*(3-2*n);};
 function label(){const en=window.RENAX_I18N?.language==='en';overlay.setAttribute('aria-label',en?'Metronome introduction':'Animation d’arrivée Métronome');word.replaceChildren(...[...(en?'Metronome':'Métronome')].map((letter,i)=>{const span=document.createElement('span');span.textContent=letter;span.style.setProperty('--n',i);return span;}));}
 function finish(){
  clearTimeout(timer);cancelAnimationFrame(frame);overlay.hidden=true;
  canvas?.remove();cover?.remove();staging?.remove();canvas=cover=staging=null;
  overlay.style.removeProperty('background');overlay.style.pointerEvents='';
  logo.style.removeProperty('opacity');for(const e of captions){e.style.opacity='';e.style.filter='';}
  if(overlay.contains(document.activeElement))previous?.focus();
 }
 function begin(){
  if(overlay.hidden)return;
  canvas=document.createElement('canvas');canvas.className='console-arrival-dust';canvas.setAttribute('aria-hidden','true');overlay.append(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});if(!ctx){finish();return;}
  cover=document.createElement('div');cover.className='console-arrival-matte';cover.setAttribute('aria-hidden','true');overlay.prepend(cover);overlay.style.setProperty('background','transparent','important');
  const ns='http://www.w3.org/2000/svg';staging=document.createElementNS(ns,'svg');staging.classList.add('console-arrival-sampler');staging.setAttribute('aria-hidden','true');document.body.append(staging);
  const paths=['M146 331 105 208 118 31 286 183H486L654 31 667 208 626 331','M146 331 286 183','M626 331 486 183','M187 332 264 449 256 461 312 597 356 662H416L460 597 516 461 508 449 585 332','M128 405 107 437 276 548','M644 405 665 437 496 548'];
  const curves=paths.map(d=>{const p=document.createElementNS(ns,'path');p.setAttribute('d',d);staging.append(p);const length=p.getTotalLength();return Array.from({length:81},(_,i)=>{const q=p.getPointAtLength(length*i/80);return {x:q.x,y:q.y};});});
  const contours=[
   [[146,331],[105,208],[118,31],[286,183],[486,183],[654,31],[667,208],[626,331]],
   [[146,331],[286,183]],[[626,331],[486,183]],
   [[187,332],[264,449],[256,461],[312,597],[356,662],[416,662],[460,597],[516,461],[508,449],[585,332]],
   [[128,405],[107,437],[276,548]],[[644,405],[665,437],[496,548]]
  ];
  const fragments=contours.flatMap(contour=>contour.slice(1).flatMap((p,i)=>Array.from({length:3},(_,part)=>({edge:i,part,a:{x:contour[i][0]+(p[0]-contour[i][0])*part/3,y:contour[i][1]+(p[1]-contour[i][1])*part/3},b:{x:contour[i][0]+(p[0]-contour[i][0])*(part+1)/3,y:contour[i][1]+(p[1]-contour[i][1])*(part+1)/3}}))));
  fragments.sort((a,b)=>Math.atan2((a.a.y+a.b.y)/2-330,(a.a.x+a.b.x)/2-386)-Math.atan2((b.a.y+b.b.y)/2-330,(b.a.x+b.b.x)/2-386));
  const details=['m230 320 77 29 18 33 13 53-26-52-43-19Z','m542 320-77 29-18 33-13 53 26-52 43-19Z','M352 610Q386 594 420 610Q410 628 386 646Q362 628 352 610Z'].map(d=>new Path2D(d));
  const rect=logo.getBoundingClientRect(),scale=Math.min(rect.width/772,rect.height/958);
  const origin={x:rect.left+(rect.width-772*scale)/2,y:rect.top+(rect.height-958*scale)/2};
  const mapped=p=>({x:origin.x+p.x*scale,y:origin.y+p.y*scale});
  const cross=mapped({x:386,y:735});
  let width,height,started;
  function resize(){width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  resize();
  function destination(){
   const instrument=document.getElementById('sequencerContainer'),r=instrument?.getBoundingClientRect();
   const visible=r&&r.width>1&&r.height>1;
   const center={x:visible?r.x+r.width/2:width/2,y:visible?r.y+r.height/2:height*.6};
   const raw=visible?[...instrument.querySelectorAll('.step,.poly-dot')]:[];
   const points=raw.map(e=>{const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,outer:e.classList.contains('outer'),inner:e.classList.contains('inner'),visible:b.width>0};}).filter(p=>p.visible);
   const radii=points.map(p=>Math.hypot(p.x-center.x,p.y-center.y)).filter(n=>n>2);
   const radius=radii.length?Math.max(...radii):Math.min(width*.22,height*.2,170);
   const inner=points.some(p=>p.inner)?Math.max(...points.filter(p=>p.inner).map(p=>Math.hypot(p.x-center.x,p.y-center.y))):radius*.65;
   return {center,radius,inner,points,poly:document.body.dataset.workspace==='polyrhythm',multi:document.body.dataset.workspace==='multi',visible};
  }
  function stroke(points,color,lineWidth,alpha){if(alpha<=0)return;ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.globalAlpha=1;}
  function tick(now){
   if(overlay.hidden){finish();return;}if(width!==innerWidth||height!==innerHeight)resize();
   if(started===undefined)started=now;
   const elapsed=now-started,progress=clamp((elapsed-1100)/3200),motion=ease(progress),target=destination();
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
   if(elapsed>=1100){
    logo.style.setProperty('opacity','0','important');
    const phase=motion<.45?motion/.45:(motion-.45)/.55;
    const fromColor=motion<.45?[255,121,0]:[238,232,221],toColor=motion<.45?[238,232,221]:[69,215,231];
    const color='rgb('+fromColor.map((v,i)=>Math.round(v+(toColor[i]-v)*phase)).join(',')+')';
    const handoff=1-ease((progress-.88)/.12);
    // Separate every angular edge before it unfurls into an arc. The breakup is deliberately readable.
    for(let k=0;k<fragments.length;k++){
     const f=fragments[k],half=fragments.length/2,inner=target.poly&&k>=half;
     const ring=inner?target.inner:target.radius,parts=target.poly?half:fragments.length,segment=k%parts;
     const start=-Math.PI+segment*Math.PI*2/parts,end=start+Math.PI*2/parts;
     const stagger=(k%7)*.009,unfold=ease((progress-.22-stagger)/.70);
     const travel=ease((progress-.16)/.84),head=mapped({x:386,y:330});
     const radius=48+(ring-48)*travel,cx=head.x+(target.center.x-head.x)*travel,cy=head.y+(target.center.y-head.y)*travel;
     const mx=(f.a.x+f.b.x)/2-386,my=(f.a.y+f.b.y)/2-330,len=Math.hypot(mx,my)||1;
     const separation=(18+f.part*9)*ease(progress/.22)*(1-unfold),lift=Math.sin(Math.PI*unfold)*18;
     const points=Array.from({length:17},(_,i)=>{
      const u=i/16,from=mapped({x:f.a.x+(f.b.x-f.a.x)*u,y:f.a.y+(f.b.y-f.a.y)*u});
      const angle=start+(end-start)*u,to={x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius};
      const detached={x:from.x+mx/len*separation,y:from.y+my/len*separation};
      const bend=Math.sin(Math.PI*unfold),tangent=24*bend*bend*Math.sin(k*.73);
      // Continuous in-between geometry: split engraving, bowed filament, then exact circular arc.
      return {x:detached.x+(to.x-detached.x)*unfold-Math.sin(angle)*tangent,y:detached.y+(to.y-detached.y)*unfold-lift+Math.cos(angle)*tangent};
     });
     const arcColor=target.poly&&!inner?'#ff7900':color;
     stroke(points,arcColor,scale*26*(1-unfold)+1.2*unfold,handoff*.9);
     if(unfold>.06&&unfold<.94){
      const filament=Math.sin(Math.PI*unfold),offset=2.8*filament;
      for(const sign of [-1,1])stroke(points.map((p,i)=>({x:p.x+sign*offset*Math.sin(start+i/16*(end-start)),y:p.y-sign*offset*Math.cos(start+i/16*(end-start))})),arcColor,.5,handoff*filament*.17);
     }
     if(progress>.05&&progress<.36){
      ctx.fillStyle='#f4d5b5';ctx.globalAlpha=Math.sin(Math.PI*(progress-.05)/.31)*.5;
      for(const p of [points[0],points.at(-1)]){ctx.beginPath();ctx.arc(p.x,p.y,.65,0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=1;
     }
    }
    // Eyes and muzzle remain distinct pieces; each takes its own path towards a real beat.
    const detailCenters=[{x:292,y:368},{x:480,y:368},{x:386,y:625}];
    for(let i=0;i<details.length;i++){
     const c=detailCenters[i],from=mapped(c),travel=ease((progress-.20-i*.04)/.72);
     const destination=target.points.length?target.points.reduce((best,p)=>i===0?(p.x<best.x?p:best):i===1?(p.x>best.x?p:best):(p.y>best.y?p:best),target.points[0]):target.center;
     const spread=(i-1)*Math.sin(Math.PI*travel)*14;
     const pos={x:from.x+(destination.x-from.x)*travel+spread,y:from.y+(destination.y-from.y)*travel};
     ctx.save();ctx.translate(pos.x,pos.y);ctx.rotate((i-1)*Math.sin(Math.PI*travel)*.35);
     const size=scale*(1-travel*.7);ctx.scale(size,size);ctx.translate(-c.x,-c.y);
     ctx.globalAlpha=1-ease((progress-.48)/.5);ctx.fillStyle=color;ctx.fill(details[i]);ctx.restore();
    }
    // Straight shafts rotate together around their crossing; they never bend.
    const center={x:cross.x+(target.center.x-cross.x)*motion,y:cross.y+(target.center.y-cross.y)*motion};
    const half=330*scale+(target.radius-330*scale)*motion;
    for(let k=0;k<2;k++){
     const initial=(k?146:34)*Math.PI/180,final=k?Math.PI/2:0,angle=initial+(final-initial)*motion;
     const a={x:center.x-Math.cos(angle)*half,y:center.y-Math.sin(angle)*half},b={x:center.x+Math.cos(angle)*half,y:center.y+Math.sin(angle)*half};
     stroke([a,b],color,scale*24*(1-motion)+motion,handoff*(target.poly?1-ease(progress/.8):.85));
     if(progress<.55){ctx.globalAlpha=1-ease(progress/.55);ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(a.x,a.y,scale*12,scale*9,angle,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    }
    // The final destinations come from the actual metric, including both polyrhythm rings.
    const pointAlpha=ease((progress-.36)/.35)*handoff*.75;
    for(let i=0;i<target.points.length;i++){
     const p=target.points[i],seed=mapped(curves[i%curves.length][Math.floor(i*13%81)]);
     const x=seed.x+(p.x-seed.x)*motion,y=seed.y+(p.y-seed.y)*motion;
     ctx.fillStyle=target.poly&&p.outer?'#ff7900':color;ctx.globalAlpha=pointAlpha;ctx.beginPath();ctx.arc(x,y,1.6+motion*1.2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    }
    if(target.multi){for(let i=1;i<=2;i++){const alpha=Math.sin(Math.PI*progress)*.12;ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=.7;ctx.globalAlpha=alpha;ctx.arc(center.x,center.y,half+i*6*Math.sin(Math.PI*motion),-.5+motion*i,Math.PI*1.6+motion*i);ctx.stroke();ctx.globalAlpha=1;}}
    // The matte fades from its bottom, over a very broad feather. It never translates.
    const stops=Array.from({length:13},(_,i)=>{const y=i/12,t=clamp((progress-(1-y)*.35)/.65),alpha=1-ease(t);return `rgba(0,0,0,${alpha.toFixed(4)}) ${(y*100).toFixed(2)}%`;});
    cover.style.maskImage='linear-gradient(to bottom,'+stops.join(',')+')';cover.style.webkitMaskImage=cover.style.maskImage;
    const textFade=1-ease((progress-.42)/.58);word.style.opacity=String(textFade);word.style.filter=`blur(${((1-textFade)*2).toFixed(2)}px)`;
    for(const e of captions.slice(1))e.style.opacity=String(1-ease(progress/.7));
    if(progress>.25)overlay.style.pointerEvents='none';
   }
   if(elapsed>=4550)finish();else frame=requestAnimationFrame(tick);
  }
  frame=requestAnimationFrame(tick);timer=setTimeout(finish,5200);
 }
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden){e.preventDefault();finish();}},true);
 window.addEventListener('pagehide',finish,{once:true});reduce.addEventListener('change',()=>{if(reduce.matches)finish();});
 const settings=document.querySelector('#index2SettingsPanel .index2-settings-section');
 if(settings){const row=document.createElement('label');row.className='console-arrival-setting';const caption=document.createElement('span'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=enabled;row.append(caption,toggle);settings.append(row);function translate(){caption.textContent=window.RENAX_I18N?.language==='en'?'Intro animation':'Animation d’arrivée';}translate();window.addEventListener('renax-language-changed',translate);toggle.onchange=()=>{enabled=toggle.checked;try{localStorage.setItem(preference,String(enabled));}catch{}};}
 window.addEventListener('renax-language-changed',()=>{if(!overlay.hidden)label();});
 if(enabled&&!reduce.matches){label();previous=document.activeElement;timer=setTimeout(begin,900);}else finish();
})();

