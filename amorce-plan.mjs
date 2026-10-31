// Pure arrangement plan shared by live playback and offline MP3 rendering.
export function planAmorce(song,speeches,candidates){
 if(speeches.length!==song.sections.length)throw Error('Annonces Amorce incomplètes.');
 const first=song.sections[0].measure,c=song.countIn||{numerator:first.numerator,denominator:first.denominator,count:2};
 const bar=(m)=>(60/m.tempo)*(4/m.denominator)*m.numerator;
 const duration=section=>globalThis.RENAX_SONG_TEMPO?.duration(section)??section.count*bar(section.measure);
 const lastBar=section=>globalThis.RENAX_SONG_TEMPO?.barDuration(section,section.count-1)??bar(section.measure);
 const countMeasure={...first,numerator:c.numerator,denominator:c.denominator,countIn:true,beatSubdivisions:Array(c.numerator).fill(1),beatStates:Array.from({length:c.numerator},()=>[1])};
 const initialBar=bar(countMeasure),count=Math.max(2,c.count||0,1+Math.ceil(candidates[0].anchorSeconds/initialBar));
 const effectiveCount=song.sections[0]._guideDisabled?(song.countIn?.count||0):count;
 const sections=[...(effectiveCount?[{id:'count-in:'+song.id,label:'Décompte',count:effectiveCount,measure:countMeasure}]:[]),...song.sections];
 let cursor=effectiveCount*initialBar,previous={count:effectiveCount,measure:countMeasure};const announcements=[];
 for(let i=0;i<song.sections.length;i++){
  if(song.sections[i]._guideDisabled||previous._guideDisabled){cursor+=duration(song.sections[i]);previous=song.sections[i];continue;}
  const target=cursor-lastBar(previous),start=target-candidates[i].anchorSeconds,end=start+speeches[i].pcm.length/speeches[i].sampleRate;
  if(start<-.000001)throw Error('Décompte insuffisant pour Amorce.');
  if(end>cursor+.000001)throw Error('Annonce trop longue pour la mesure précédente : '+song.sections[i].label);
  if(announcements.length&&start<announcements.at(-1).end-.000001)throw Error('Deux annonces Amorce se chevauchent. Ajoutez des mesures ou raccourcissez les libellés.');
  announcements.push({index:i,start,end,target,blockStart:cursor,measure:previous.measure});cursor+=duration(song.sections[i]);previous=song.sections[i];
 }
 return {sections,announcements,countInMeasures:effectiveCount,duration:cursor};
}
