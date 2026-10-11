/* One musical clock shared by all tracks. No per-track wall-clock timers. */
(function(root){
 function layout(model){return {numerator:model.numerator,denominator:model.denominator,beatSubdivisions:[...model.beatSubdivisions],beatStates:model.beatStates.map(s=>[...s])};}
 function cursor(model){return {model,layout:layout(model),origin:0,step:0,quarter:0};}
 function next(c){const m=c.layout;let step=c.step,beat=0;while(step>=m.beatSubdivisions[beat]){step-=m.beatSubdivisions[beat++];}const subIndex=step,subdivisions=m.beatSubdivisions[beat],duration=4/m.denominator/subdivisions;
  const event={quarter:c.quarter,beat,subIndex,subdivisions,duration,layout:m};c.step++;
  if(c.step>=m.beatSubdivisions.reduce((a,b)=>a+b,0)){c.origin+=m.numerator*4/m.denominator;c.layout=layout(c.model);c.step=0;c.quarter=c.origin;}
  else{let n=c.step,b=0,q=0;while(n>=m.beatSubdivisions[b]){q+=4/m.denominator;n-=m.beatSubdivisions[b++];}c.quarter=c.origin+q+n*4/m.denominator/m.beatSubdivisions[b];}
  return event;
 }
 class Clock{constructor(time,bpm){this.time=time;this.quarter=0;this.bpm=bpm;}at(time){return this.quarter+(time-this.time)*this.bpm/60;}when(quarter){return this.time+(quarter-this.quarter)*60/this.bpm;}setTempo(bpm,now){if(bpm===this.bpm)return;const t=Math.max(now,this.time);this.quarter=this.at(t);this.time=t;this.bpm=bpm;}}
 const api={Clock,cursor,next,layout};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RenaxMultiClock=api;
})(typeof window!=='undefined'?window:globalThis);

