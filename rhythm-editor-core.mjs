const EPS=1e-8;
export const normalCount=n=>n===3?2:n>=5&&n<=7?4:n;
export const allowed=d=>[1,2,3,4,5,6,7,8].filter(n=>d*normalCount(n)<=32);
export function defaultGroups(m){
 if(m.denominator>=8&&m.numerator%3===0)return Array(m.numerator/3).fill(3);
 if(m.denominator>=8&&m.numerator>=5&&m.numerator%2){return [...Array((m.numerator-3)/2).fill(2),3];}
 if(m.denominator>=8&&m.numerator%2===0)return Array(m.numerator/2).fill(2);
 return Array(m.numerator).fill(1);
}
export function groupRanges(groups){let start=0;return groups.map(length=>{const g={start,end:start+length,length};start+=length;return g;});}
const signature=m=>m.beatSubdivisions.map((n,b)=>JSON.stringify([n,m.beatStates[b]]));
export function fromGrid(m,g){const slots=[];for(let b=g.start;b<g.end;b++){const n=m.beatSubdivisions[b];for(let s=0;s<n;s++)slots.push({start:b+s/n,state:m.beatStates[b][s]||0});}
 const attacks=slots.filter(s=>s.state),events=[];if(!attacks.length)return [{start:g.start,end:g.end,state:0}];
 if(attacks[0].start>g.start)events.push({start:g.start,end:attacks[0].start,state:0});
 attacks.forEach((a,i)=>events.push({...a,end:attacks[i+1]?.start??g.end}));return events;
}
export function editorModel(m){const raw=m.rhythmEditor,defaults=defaultGroups(m),groups=raw?.free?[m.numerator]:raw?.custom&&Array.isArray(raw.groups)&&raw.groups.every(n=>n===2||n===3)&&raw.groups.reduce((a,b)=>a+b,0)===m.numerator?raw.groups:defaults;
 const ranges=groupRanges(groups),sig=signature(m);let events=[];
 const saved=raw?.events;
 const intact=raw?.signature&&sig.every((v,i)=>v===raw.signature[i]);
 const valid=intact&&Array.isArray(saved)&&saved.length&&Math.abs(saved[0].start)<EPS&&Math.abs(saved.at(-1).end-m.numerator)<EPS&&saved.every((e,i)=>e.end>e.start&&[0,1,2,3].includes(e.state)&&(!i||Math.abs(e.start-saved[i-1].end)<EPS));
 if(valid)return {version:1,free:!!raw.free,custom:!raw.free&&!!raw.custom,groups:[...groups],events:saved.map(e=>({...e})),signature:sig};
 for(const g of ranges){const unchanged=raw?.signature&&sig.slice(g.start,g.end).every((s,i)=>s===raw.signature[g.start+i]);const saved=unchanged&&Array.isArray(raw.events)?raw.events.filter(e=>e.start>=g.start-EPS&&e.end<=g.end+EPS):null;
 const valid=saved?.length&&Math.abs(saved[0].start-g.start)<EPS&&Math.abs(saved.at(-1).end-g.end)<EPS&&saved.every((e,i)=>e.end>e.start&&[0,1,2,3].includes(e.state)&&(!i||Math.abs(e.start-saved[i-1].end)<EPS));events.push(...(valid?saved:fromGrid(m,g)));}
 return {version:1,free:!!raw?.free,custom:!raw?.free&&!!raw?.custom,groups:[...groups],events:events.map(e=>({...e})),signature:sig};
}
export function project(m,model){const divisions=[],states=[];for(let b=0;b<m.numerator;b++){const points=model.events.flatMap(e=>[e.start,e.end]).filter(t=>t>=b-EPS&&t<=b+1+EPS);const count=[m.beatSubdivisions[b],...allowed(m.denominator)].find(n=>allowed(m.denominator).includes(n)&&points.every(t=>Math.abs((t-b)*n-Math.round((t-b)*n))<EPS));if(!count)throw Error('Cette durée ne correspond pas aux subdivisions de ce temps.');divisions.push(count);states.push(Array(count).fill(0));}
 for(const e of model.events)if(e.state){const b=Math.floor(e.start+EPS);if(b<m.numerator)states[b][Math.round((e.start-b)*divisions[b])]=e.state;}
 return {divisions,states};}
export function commitModel(m,model){const p=project(m,model);m.beatSubdivisions=p.divisions;m.beatStates=p.states;model.signature=signature(m);m.rhythmEditor=model;}
export function changeEvent(m,index,{length,state}={}){const model=editorModel(m),event=model.events[index];if(!event)throw Error('Sélectionne une note ou un silence.');const g=groupRanges(model.groups).find(g=>event.start>=g.start-EPS&&event.start<g.end-EPS),end=length===undefined?event.end:event.start+length;if(length!==undefined&&end>g.end+EPS||end<=event.start+EPS)throw Error('La durée doit rester dans le groupe.');
 const next={...event,end,state:state??event.state},events=model.events.slice(0,index);events.push(next);
 if(end<event.end-EPS)events.push({start:end,end:event.end,state:0});
 for(const following of model.events.slice(index+1)){if(following.end<=end+EPS)continue;events.push({...following,start:Math.max(following.start,end)});}
 model.events=events;project(m,model);return model;}
export function regroup(m,custom,groups){const model=editorModel(m);model.free=false;model.custom=custom;model.groups=custom?groups:defaultGroups(m);if(model.groups.reduce((a,b)=>a+b,0)!==m.numerator||custom&&!model.groups.every(n=>n===2||n===3))throw Error('Les groupes doivent totaliser la mesure.');
 model.events=groupRanges(model.groups).flatMap(g=>model.events.filter(e=>e.end>g.start+EPS&&e.start<g.end-EPS).map(e=>({...e,start:Math.max(e.start,g.start),end:Math.min(e.end,g.end),state:e.start<g.start-EPS?0:e.state})));project(m,model);return model;}
export function setFreeMeasure(m,enabled){const model=editorModel(m);model.free=!!enabled;model.custom=false;model.groups=enabled?[m.numerator]:defaultGroups(m);project(m,model);return model;}
export function groupCombinations(total){if(total===0)return [[]];if(total<2)return [];return [2,3].flatMap(n=>groupCombinations(total-n).map(t=>[n,...t]));}
// Spell exact values; exotic grids retain their original tuplet ratio.
export function spell(m,model){return groupRanges(model.groups).map(g=>{const pieces=[];model.events.forEach((e,index)=>{if(e.end<=g.start+EPS||e.start>=g.end-EPS)return;const eventEnd=Math.min(e.end,g.end);let t=Math.max(e.start,g.start);while(t<eventEnd-EPS){const beat=Math.floor(t+EPS),count=m.beatSubdivisions[beat],normal=normalCount(count),exotic=count!==normal;let end=exotic?Math.min(eventEnd,beat+1):eventEnd;
 if(!exotic){for(let b=beat+1;b<end-EPS;b++)if(normalCount(m.beatSubdivisions[b])!==m.beatSubdivisions[b]){end=b;break;}}
 let remaining=(end-t)/m.denominator*(exotic?count/normal:1);while(remaining>EPS){let picked;for(const duration of [1,2,4,8,16,32,64,128])for(const dots of [1,0]){const value=(dots?1.5:1)/duration;if(value<=remaining+EPS&&(!picked||value>picked.value))picked={duration,dots,value};}if(!picked)throw Error('Durée non représentable.');const length=picked.value*m.denominator*(exotic?normal/count:1),piece={...picked,start:t,end:t+length,state:e.state,index,beat,tuplet:exotic?{count,normal}:null,tie:t>e.start+EPS};pieces.push(piece);t+=length;remaining-=picked.value;}}
 });return {...g,count:pieces.length,notes:pieces};});}
