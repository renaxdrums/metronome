/* Read-only visual tap after the existing final limiter. No extra audible output or microphone. */
(() => {
 const host=document.querySelector('.sequencer-wrapper');if(!host)return;
 const canvas=document.createElement('canvas');canvas.id='audioLandscape';canvas.hidden=true;canvas.setAttribute('aria-hidden','true');host.prepend(canvas);
 const paint=canvas.getContext('2d',{alpha:true});if(!paint)return;
 const reduce=matchMedia('(prefers-reduced-motion:reduce)'),phi=(1+Math.sqrt(5))/2;
 const bands=48,history=[],profile=new Float32Array(bands);
 let context,node,source,freq,samples,frame,width=0,height=0,level=0,last=0,historyAt=0;
 function resize(){
  const rect=host.getBoundingClientRect();width=Math.max(1,rect.width*2/3);height=width/phi;
  const ratio=Math.min(devicePixelRatio||1,2);canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);paint.setTransform(ratio,0,0,ratio,0,0);
 }
 const observer=new ResizeObserver(resize);observer.observe(host);resize();
 function attach(){
  const next=typeof audioCtx==='undefined'?null:audioCtx;
  if(!next||next.state==='closed')return false;
  if(context===next&&node)return true;
  // Read the existing mixer only; never initialize audio or alter its gain/routing.
  const mixer=typeof audioMixers==='undefined'?null:audioMixers.get(next);
  if(!mixer?.limiter)return false;
  if(source&&node){try{source.disconnect(node);}catch{}}
  context=next;source=mixer.limiter;node=context.createAnalyser();node.fftSize=2048;node.smoothingTimeConstant=.35;node.minDecibels=-100;node.maxDecibels=-10;
  source.connect(node);freq=new Float32Array(node.frequencyBinCount);samples=new Float32Array(node.fftSize);return true;
 }
 function measure(dt){
  let rms=0,peak=0;
  if(attach()&&context.state==='running'){
   node.getFloatTimeDomainData(samples);node.getFloatFrequencyData(freq);
   for(const x of samples){rms+=x*x;peak=Math.max(peak,Math.abs(x));}rms=Math.sqrt(rms/samples.length);
  }
  const actual=Math.min(1,Math.pow(Math.max(0,peak*.9+rms*2.2),.65));
  canvas.dataset.audioLevel=actual.toFixed(5);
  level=actual>level?actual:Math.max(actual,level*Math.exp(-dt/.16));
  for(let i=0;i<bands;i++){
   let energy=0,count=0;
   if(node&&context.state==='running'&&actual>.0002){
    const lo=30*Math.pow(600,i/bands),hi=30*Math.pow(600,(i+1)/bands),hz=context.sampleRate/node.fftSize;
    const start=Math.max(1,Math.floor(lo/hz)),end=Math.min(freq.length-1,Math.max(start,Math.ceil(hi/hz)));
    for(let j=start;j<=end;j++){const magnitude=Number.isFinite(freq[j])?Math.pow(10,freq[j]/20):0;energy+=magnitude*magnitude;count++;}
   }
   const spectral=count?Math.sqrt(energy/count):0;
   const value=Math.min(1,Math.sqrt(spectral*12))*level;
   profile[i]=value>profile[i]?value:Math.max(value,profile[i]*Math.exp(-dt/.12));
  }
  return level;
 }
 function sample(values,u){
  const p=u*(values.length-1),i=Math.floor(p),t=p-i;
  const a=values[Math.max(0,i-1)],b=values[i],c=values[Math.min(values.length-1,i+1)],d=values[Math.min(values.length-1,i+2)];
  return Math.max(0,.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t));
 }
 function draw(now){
  if(document.hidden){last=now;frame=requestAnimationFrame(draw);return;}
  const dt=Math.min(.1,(now-(last||now))/1000);last=now;
  const visible=host.getBoundingClientRect().height>0;
  const energy=measure(dt);paint.clearRect(0,0,width,height);
  if(now-historyAt>33){historyAt=now;history.unshift(Float32Array.from(profile));if(history.length>23)history.pop();}
  const retained=history.some(values=>values.some(v=>v>.002));
  canvas.hidden=!visible||reduce.matches||(!retained&&energy<.002);
  if(!canvas.hidden){
   const base=height-8,maxHeight=height*.82;
   // Each filament is an actual recent spectral frame; no synthetic rhythm or free-running wave.
   for(let k=history.length-1;k>=0;k--){
    const depth=1-k/Math.max(1,history.length),values=history[k];
    const shade=Math.round(105+depth*138);paint.strokeStyle='rgb('+shade+','+shade+','+shade+')';
    paint.globalAlpha=(.025+depth*.11)*Math.min(1,energy*2+.1);paint.lineWidth=.45+depth*.35;paint.beginPath();
    for(let j=0;j<=190;j++){
     const u=j/190,taper=Math.pow(Math.sin(Math.PI*u),.5),v=sample(values,u);
     const x=u*width,y=base-v*maxHeight*taper-k*.55;
     if(j===0)paint.moveTo(x,y);else paint.lineTo(x,y);
    }
    paint.stroke();
   }
   paint.globalAlpha=1;
  }
  frame=requestAnimationFrame(draw);
 }
 frame=requestAnimationFrame(draw);
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);observer.disconnect();if(source&&node){try{source.disconnect(node);}catch{}}node?.disconnect();canvas.remove();},{once:true});
})();

