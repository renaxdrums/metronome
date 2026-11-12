/** Lightweight local tempo hypotheses from multiband onset times.
 * Confidence is relative and is not a claim of meter or downbeat recognition.
 */
export function inferTempoFromOnsets(onsets,{minBpm=40,maxBpm=240}={}){
  const events=onsets.filter(o=>Number.isFinite(o.seconds)).sort((a,b)=>a.seconds-b.seconds);
  if(events.length<5)return {candidates:[],confidence:0};
  const histogram=new Map();
  for(let i=0;i<events.length;i++){
    for(let j=i+1;j<Math.min(i+9,events.length);j++){
      const delta=events[j].seconds-events[i].seconds;
      if(delta<=0)continue;
      for(let multiple=1;multiple<=4;multiple++){
        const bpm=60*multiple/delta;
        if(bpm<minBpm||bpm>maxBpm)continue;
        const key=Math.round(bpm/2)*2;
        const weight=(events[i].strength??1)*(events[j].strength??1)/Math.sqrt(j-i);
        histogram.set(key,(histogram.get(key)||0)+weight);
      }
    }
  }
  const ranked=[...histogram].sort((a,b)=>b[1]-a[1]);
  if(!ranked.length)return {candidates:[],confidence:0};
  const best=ranked[0][1];
  const candidates=[];
  for(const [bpm,score] of ranked){
    if(candidates.some(c=>Math.abs(c.bpm-bpm)<6))continue;
    candidates.push({bpm,confidence:Math.min(1,score/(best*1.6))});
    if(candidates.length===3)break;
  }
  return {candidates,confidence:candidates[0]?.confidence??0};
}
