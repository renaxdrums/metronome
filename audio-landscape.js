/* Read-only visual tap after the existing final limiter. No extra audible output or microphone. */
(() => {
 const host=document.querySelector('.sequencer-wrapper');if(!host)return;
 const canvas=document.createElement('canvas');canvas.id='audioLandscape';canvas.hidden=true;canvas.setAttribute('aria-hidden','true');host.prepend(canvas);
 const paint=canvas.getContext('2d',{alpha:true});if(!paint)return;
 const reduce=matchMedia('(prefers-reduced-motion:reduce)'),phi=(1+Math.sqrt(5))/2;
 const bands=64,history=[],profile=new Float32Array(bands);
 let context,node,source,freq,samples,frame,width=0,height=0,level=0,last=0,historyAt=0,flow=0;
 function resize(){
  const rect=host.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.min(width/phi,rect.height*2/3);
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
  flow+=actual*dt*3.5;
  level=actual>level?actual:Math.max(actual,level*Math.exp(-dt/.25));
  for(let i=0;i<bands;i++){
   let energy=0,count=0;
   if(node&&context.state==='running'&&actual>.0002){
    const lo=30*Math.pow(600,i/bands),hi=30*Math.pow(600,(i+1)/bands),hz=context.sampleRate/node.fftSize;
    const start=Math.max(1,Math.floor(lo/hz)),end=Math.min(freq.length-1,Math.max(start,Math.ceil(hi/hz)));
    for(let j=start;j<=end;j++){const magnitude=Number.isFinite(freq[j])?Math.pow(10,freq[j]/20):0;energy+=magnitude*magnitude;count++;}
   }
   const spectral=count?Math.sqrt(energy/count):0;
   const strength=spectral>0?Math.max(0,Math.min(1,(20*Math.log10(spectral)+85)/60)):0;
   const value=strength*Math.pow(level,.55);
   profile[i]=value>profile[i]?value:Math.max(value,profile[i]*Math.exp(-dt/.25));
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
  if(now-historyAt>16){historyAt=now;history.unshift(Float32Array.from(profile));if(history.length>48)history.pop();}
  const retained=history.some(values=>values.some(v=>v>.002));
  canvas.hidden=!visible||reduce.matches||(!retained&&energy<.002);
  if(!canvas.hidden){
   const base=height-3,maxHeight=height*.94;
   const retainedLevel=history.reduce((top,values)=>Math.max(top,...values),0);
   const visibility=Math.min(1,retainedLevel*3);
   let first=bands-1,lastBand=0;
   for(const values of history)for(let i=0;i<bands;i++)if(values[i]>Math.max(.002,retainedLevel*.035)){first=Math.min(first,i);lastBand=Math.max(lastBand,i);}
   const low=first/(bands-1),range=Math.max(1,lastBand-first)/(bands-1);
   // A dense depth field interpolates the real recent spectra. Every contour fades with the actual sound.
   const count=96,points=Math.min(320,Math.max(160,Math.round(width/4)));
   for(let k=0;k<count;k++){
    const depth=k/(count-1),age=(1-depth)*(history.length-1);
    const a=history[Math.floor(age)],b=history[Math.min(history.length-1,Math.ceil(age))],blend=age%1;
    const shade=depth<.35?Math.round(55+depth*180):depth<.8?Math.round(148+(depth-.35)*180):Math.round(235+(depth-.8)*100);
    paint.strokeStyle='rgb('+shade+','+shade+','+shade+')';
    paint.globalAlpha=(.15+depth*.38)*visibility;paint.lineWidth=depth>.86?.85:.55;
    paint.beginPath();let started=false;
    for(let j=0;j<=points;j++){
     const u=j/points,spread=(1-depth)*.055;
     const seed=(Math.sin((k+1)*127.1)*43758.5453)%1;
     const drift=(Math.sin(u*(9+Math.abs(seed)*16)+k*.71+flow)+.35*Math.sin(u*39-k*1.17-flow*.7))*.045*Math.sin(Math.PI*u);
     const coordinate=low+Math.max(0,Math.min(1,u+(u-.5)*spread+drift))*range;
     const current=sample(a,coordinate)*(1-blend)+sample(b,coordinate)*blend;
     const echo=sample(history[Math.min(history.length-1,Math.floor(age+7))],low+Math.max(0,Math.min(1,u+drift*2))*range);
     const raw=current*.78+echo*.22;
     const edge=.3+.7*Math.pow(Math.sin(Math.PI*u),.65);
     const irregular=.78+.22*Math.sin(u*(13+Math.abs(seed)*24)+k*.37+flow*.9)+.08*Math.sin(u*73+k*.83-flow);
     const relief=Math.pow(raw,.64)*maxHeight*edge*(.48+depth*.52)*irregular;
     const x=u*width,y=base-relief-(1-depth)*height*.045*visibility;
     if(raw<.002){started=false;continue;}
     if(!started){paint.moveTo(x,y);started=true;}else paint.lineTo(x,y);
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

