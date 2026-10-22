/* Ambient presentation only: continuous spectral filaments shared with the arrival's UI mirror. */
(()=>{
 const header=document.querySelector('body>header');if(!header)return;
 const canvas=document.createElement('canvas');canvas.id='renaxHeaderWave';canvas.setAttribute('aria-hidden','true');header.prepend(canvas);
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return;
 const reduce=matchMedia('(prefers-reduced-motion:reduce)'),period=52000;
 let width=1,height=1,frame=0,last=0,elapsed=0,paintedAt=0,stopped=false;
 function contour(u,depth,theta){
  const phase=depth*5.9,packet=.5+.12*Math.sin(theta);
  const envelope=Math.exp(-Math.pow((u-packet)/.34,2));
  const ridge=.25+.75*Math.pow(.5+.5*Math.sin(u*17-theta+phase*.24),2);
  const carrier=Math.sin(u*25-theta+phase)+.42*Math.sin(u*49+theta*2-phase*.6)+.18*Math.sin(u*93-theta*3+phase);
  return carrier*(.18+envelope*.82)*ridge*(.38+depth*.62);
 }
 function resize(){
  const rect=header.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);
  const dpr=Math.min(devicePixelRatio||1,1.5);
  canvas.style.width=width+'px';canvas.style.height=(height+12)+'px';canvas.width=Math.round(width*dpr);canvas.height=Math.round((height+12)*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  draw();
 }
 function draw(){
  const theta=2*Math.PI*(elapsed%period)/period,base=height*.88+5,amplitude=height*.50;
  ctx.clearRect(0,0,width,height+12);
  const gradient=ctx.createLinearGradient(0,0,width,0);
  const ivory=document.documentElement.dataset.theme==='ivory';
  gradient.addColorStop(0,ivory?'#8fa929':'#ff7900');gradient.addColorStop(.32,ivory?'#d9ef62':'#ffbb65');gradient.addColorStop(.58,ivory?'#4e8065':'#cce6c2');gradient.addColorStop(1,ivory?'#70d5df':'#45d7e7');
  ctx.strokeStyle=gradient;ctx.lineWidth=.65;
  const points=Math.min(240,Math.max(100,Math.round(width/6)));
  for(let k=0;k<30;k++){
   const depth=k/29;ctx.globalAlpha=.12+depth*.16;ctx.beginPath();
   for(let j=0;j<=points;j++){
    const u=j/points,x=u*width,y=base+contour(u,depth,theta)*amplitude+(depth-.5)*height*.10;
    if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
   }
   ctx.stroke();
  }
  ctx.globalAlpha=1;
  // Keep the animation's visual copy on exactly the same live frame as the real header.
  const mirror=document.querySelector('.console-arrival-replica #renaxHeaderWave');
  if(mirror&&mirror!==canvas){const copy=mirror.getContext('2d',{alpha:true});if(copy){copy.clearRect(0,0,mirror.width,mirror.height);copy.drawImage(canvas,0,0,mirror.width,mirror.height);}}
 }
 function tick(now){
  frame=0;if(stopped||reduce.matches||document.hidden){last=0;return;}
  const arrival=document.getElementById('renaxArrival');
  if(arrival&&!arrival.hidden&&arrival.dataset.introPhase!=='fade-in'){
   last=0;frame=requestAnimationFrame(tick);return;
  }
  if(last)elapsed+=Math.min(100,now-last);last=now;
  if(now-paintedAt>=33){paintedAt=now;draw();}
  frame=requestAnimationFrame(tick);
 }
 function resume(){if(!stopped&&!reduce.matches&&!document.hidden&&!frame)frame=requestAnimationFrame(tick);}
 const observer=new ResizeObserver(resize);observer.observe(header);resize();resume();
 document.addEventListener('visibilitychange',resume);
 reduce.addEventListener('change',()=>{cancelAnimationFrame(frame);frame=0;last=0;draw();resume();});
 window.addEventListener('pagehide',()=>{stopped=true;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',resume);},{once:true});
})();
