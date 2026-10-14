/* Optional linear accelerando per song block; fixed-tempo playback stays unchanged. */
(function(root){
 'use strict';
 function active(section){
   const start=section?.measure?.tempo,end=section?.tempoRamp?.endTempo;
   return section?.tempoRamp?.enabled===true&&Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end<=999;
 }
 function spanDuration(section,startBeat,beatCount){
   const m=section.measure,factor=240/m.denominator;
   if(!active(section))return factor*beatCount/m.tempo;
   const total=section.count*m.numerator,slope=(section.tempoRamp.endTempo-m.tempo)/total;
   const initial=m.tempo+slope*startBeat;
   return factor*Math.log1p(slope*beatCount/initial)/slope;
 }
 function duration(section){return spanDuration(section,0,section.count*section.measure.numerator);}
 function barDuration(section,bar){return spanDuration(section,bar*section.measure.numerator,section.measure.numerator);}
 function stepDuration(section,bar,beat,sub,subdivisions){return spanDuration(section,bar*section.measure.numerator+beat+sub/subdivisions,1/subdivisions);}
 function tempoAt(section,position){
   if(!active(section))return section.measure.tempo;
   return section.measure.tempo+(section.tempoRamp.endTempo-section.measure.tempo)*Math.max(0,Math.min(1,position/(section.count*section.measure.numerator)));
 }
 root.RENAX_SONG_TEMPO={active,spanDuration,duration,barDuration,stepDuration,tempoAt,liveStep:null};
})(typeof window!=='undefined'?window:globalThis);
