/* Per-block tempo curves. Positions are musical beats, never elapsed wall time. */
(function(root){
 'use strict';
 // Keep the twelve existing Training labels, icons and normalized profiles identical.
 const profiles=Object.freeze([

    ['linear-up','Montée linéaire','M6 18L28 4'],
    ['linear-down','Descente linéaire','M6 4L28 18'],
    ['linear-up-down','Montée puis descente linéaire','M6 18L17 4L28 18'],
    ['linear-down-up','Descente puis montée linéaire','M6 4L17 18L28 4'],
    ['round-up','Montée arrondie','M6 18Q17 4 28 4'],
    ['round-down','Descente arrondie','M6 4Q17 4 28 18'],
    ['round-up-down','Montée puis descente arrondie','M6 18Q17 -10 28 18'],
    ['round-down-up','Descente puis montée arrondie','M6 4Q17 32 28 4'],
    ['exponential-up','Montée exponentielle','M6 18C18 18 24 14 28 4'],
    ['exponential-down','Descente exponentielle','M6 4C10 14 16 18 28 18'],
    ['inverse-up','Montée exponentielle inverse','M6 18C8 7 16 4 28 4'],
    ['inverse-down','Descente exponentielle inverse','M6 4C18 4 26 7 28 18']
 ].map(item=>Object.freeze(item)));
 /** @param {string} key @param {number} p */
 function curveLevel(key,p){

    p=Math.max(0,Math.min(1,p));
    if(key==='exponential-up')return Math.expm1(3*p)/Math.expm1(3);
    if(key==='exponential-down')return Math.expm1(3*(1-p))/Math.expm1(3);
    if(key==='inverse-up')return Math.log1p(Math.expm1(3)*p)/3;
    if(key==='inverse-down')return Math.log1p(Math.expm1(3)*(1-p))/3;
    if(key==='linear-up')return p;
    if(key==='linear-down')return 1-p;
    if(key==='linear-up-down')return 1-Math.abs(2*p-1);
    if(key==='linear-down-up')return Math.abs(2*p-1);
    if(key==='round-up')return 2*p-p*p;
    if(key==='round-down')return 1-p*p;
    if(key==='round-up-down')return 4*p*(1-p);
    if(key==='round-down-up')return (2*p-1)*(2*p-1);
    return p;
 }
 /** @param {string} key */
 function startsHigh(key){return key.includes('down')&&!key.includes('up-down');}
 /** @param {import('./types/library').Section} section */
 function curveKey(section){return section.tempoRamp?.curve??'linear-up';}
 /** @param {import('./types/library').Section} section
  * @returns {section is import('./types/library').Section & {tempoRamp:{enabled:true,endTempo:number}}} */
 function active(section){
   const start=section?.measure?.tempo,end=section?.tempoRamp?.endTempo,key=curveKey(section);
   return !section?.continuous&&section?.tempoRamp?.enabled===true&&Number.isFinite(start)&&start>=2&&start<=999&&typeof end==='number'&&Number.isFinite(end)&&end>=2&&end<=999&&profiles.some(item=>item[0]===key)&&(startsHigh(key)?end<start:end>start);
 }
 /** @param {import('./types/library').Section} section @param {number} p */
 function atProgress(section,p){
   const start=section.measure.tempo,end=section.tempoRamp?.endTempo??start;
   return Math.min(start,end)+Math.abs(end-start)*curveLevel(curveKey(section),p);
 }
 /** Adaptive Simpson integration of seconds per normalized musical position.
  * @param {(p:number)=>number} fn @param {number} a @param {number} b */
 function integrate(fn,a,b){
   const middle=(a+b)/2,fa=fn(a),fm=fn(middle),fb=fn(b),whole=(b-a)*(fa+4*fm+fb)/6;
   /** @param {number} left @param {number} right @param {number} fl @param {number} fc @param {number} fr @param {number} previous @param {number} epsilon @param {number} depth @returns {number} */
   function refine(left,right,fl,fc,fr,previous,epsilon,depth){
     const center=(left+right)/2,f1=fn((left+center)/2),f2=fn((center+right)/2);
     const first=(center-left)*(fl+4*f1+fc)/6,second=(right-center)*(fc+4*f2+fr)/6;
     const delta=first+second-previous;
     if(depth===0||Math.abs(delta)<=15*epsilon)return first+second+delta/15;
     return refine(left,center,fl,f1,fc,first,epsilon/2,depth-1)+refine(center,right,fc,f2,fr,second,epsilon/2,depth-1);
   }
   return refine(a,b,fa,fm,fb,whole,1e-13*(b-a),20);
 }
 /** @param {number} initial @param {number} slope @param {number} count */
 function linearSpan(initial,slope,count){return slope===0?count/initial:Math.log1p(slope*count/initial)/slope;}
 /** @param {import('./types/library').Section} section @param {number} startBeat @param {number} beatCount */
 function spanDuration(section,startBeat,beatCount){
   const m=section.measure,factor=240/m.denominator;
   if(!active(section))return factor*beatCount/m.tempo;
   const total=section.count*m.numerator,key=curveKey(section),difference=section.tempoRamp.endTempo-m.tempo;
   // Preserve the exact existing accelerando calculation for old saved blocks.
   if(key==='linear-up'||key==='linear-down'){
     const slope=difference/total;
     return factor*linearSpan(m.tempo+slope*startBeat,slope,beatCount);
   }
   if(key==='linear-up-down'||key==='linear-down-up'){
     const middle=total/2,end=startBeat+beatCount,slope=2*difference/total;
     let seconds=0;
     if(startBeat<middle){const n=Math.min(end,middle)-startBeat;seconds+=linearSpan(m.tempo+slope*startBeat,slope,n);}
     if(end>middle){const from=Math.max(startBeat,middle);seconds+=linearSpan(section.tempoRamp.endTempo-slope*(from-middle),-slope,end-from);}
     return factor*seconds;
   }
   const a=startBeat/total,b=(startBeat+beatCount)/total,fn=/** @param {number} p */ p=>1/atProgress(section,p);
   // Split at the symmetric turning point, including odd bars and odd meters.
   const result=a<.5&&b>.5?integrate(fn,a,.5)+integrate(fn,.5,b):integrate(fn,a,b);
   return factor*total*result;
 }
 /** @param {import('./types/library').Section} section */
 function duration(section){return spanDuration(section,0,section.count*section.measure.numerator);}
 /** @param {import('./types/library').Section} section @param {number} bar */
 function barDuration(section,bar){return spanDuration(section,bar*section.measure.numerator,section.measure.numerator);}
 /** @param {import('./types/library').Section} section @param {number} bar @param {number} beat @param {number} sub @param {number} subdivisions */
 function stepDuration(section,bar,beat,sub,subdivisions){return spanDuration(section,bar*section.measure.numerator+beat+sub/subdivisions,1/subdivisions);}
 /** @param {import('./types/library').Section} section @param {number} position */
 function tempoAt(section,position){
   if(!active(section))return section.measure.tempo;
   return atProgress(section,Math.max(0,Math.min(1,position/(section.count*section.measure.numerator))));
 }
 const api={profiles,startsHigh,curveKey,curveLevel,active,spanDuration,duration,barDuration,stepDuration,tempoAt,liveStep:null};
 Object.assign(root,{RENAX_SONG_TEMPO:api});
})(typeof window!=='undefined'?window:globalThis);
