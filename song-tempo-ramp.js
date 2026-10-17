/* Optional linear accelerando per song block; fixed-tempo playback stays unchanged. */
(function(root){
 'use strict';
 /** @param {import('./types/library').Section} section
  * @returns {section is import('./types/library').Section & {tempoRamp:{enabled:true,endTempo:number}}} */
 function active(section){
   const start=section?.measure?.tempo,end=section?.tempoRamp?.endTempo;
   return section?.tempoRamp?.enabled===true&&Number.isFinite(start)&&typeof end==='number'&&Number.isFinite(end)&&end>start&&end<=999;
 }
 /** @param {import('./types/library').Section} section @param {number} startBeat @param {number} beatCount */
 function spanDuration(section,startBeat,beatCount){
   const m=section.measure,factor=240/m.denominator;
   if(!active(section))return factor*beatCount/m.tempo;
   const total=section.count*m.numerator,slope=(section.tempoRamp.endTempo-m.tempo)/total;
   const initial=m.tempo+slope*startBeat;
   return factor*Math.log1p(slope*beatCount/initial)/slope;
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
   return section.measure.tempo+(section.tempoRamp.endTempo-section.measure.tempo)*Math.max(0,Math.min(1,position/(section.count*section.measure.numerator)));
 }
 const api={active,spanDuration,duration,barDuration,stepDuration,tempoAt,liveStep:null};
 Object.assign(root,{RENAX_SONG_TEMPO:api});
})(typeof window!=='undefined'?window:globalThis);
