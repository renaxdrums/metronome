// Song integration. Neural text/audio stays in the browser; main click path is unchanged when disabled.
(() => {
 let modules,session=null,generation=0;const plans=new Map(),sources=new Set();
 const guideAnchors=[0,.116,.175,.262,.143,.195,.256,.216,.097,.12,.176,.211,.15,.128,.125,.105,.189,.187,.091,.129,.14];
 const key=s=>JSON.stringify([s.id,s.sections.map(b=>[b.label,b.amorceLanguage||'fr',b.count,b.measure]),s.countIn]);
 const load=()=>modules||(modules=Promise.all([import('./prototypes/amorce/neural-engine.mjs?v=20261010-label-fast1'),import('./prototypes/amorce/syllables.mjs'),import('./amorce-plan.mjs')]).catch(error=>{modules=null;throw error;}));
 async function prepare(song){const k=key(song);if(plans.has(k))return plans.get(k);const snapshot=JSON.parse(JSON.stringify(song));
  const job=(async()=>{const [engine,syllables,planner]=await load();const speeches=await Promise.all(snapshot.sections.map(b=>engine.synthesize(b.label,b.amorceLanguage||'fr')));const candidates=speeches.map((s,i)=>syllables.lastSyllableCandidate(s.events,snapshot.sections[i].amorceLanguage||'fr'));return {...planner.planAmorce(snapshot,speeches,candidates),speeches,candidates};})();plans.set(k,job);job.catch(()=>plans.delete(k));if(plans.size>12)plans.delete(plans.keys().next().value);return job;
 }
 function stop(){generation++;session=null;for(const source of sources){try{source.stop();}catch{}}sources.clear();}
 function install(plan){session={plan,origin:null};}
 function begin(context,origin,plan=session?.plan){if(!plan)return;session={plan,origin};
  for(const a of plan.announcements){const speech=plan.speeches[a.index],buffer=context.createBuffer(1,speech.pcm.length,speech.sampleRate);buffer.copyToChannel(speech.pcm,0);const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=.25*masterVolume;source.connect(gain);gain.connect(getAudioMixDestination(context));source.start(origin+a.start);sources.add(source);source.onended=()=>sources.delete(source);}
 }
 function step(time,state,isFirst,subIndex,beat){if(!session||session.origin===null||subIndex!==0)return false;const t=time-session.origin,a=session.plan.announcements.find(a=>t>=a.target-1e-6&&t<a.blockStart-1e-6);if(!a)return false;
  if(Math.abs(t-a.target)<1e-6)return false;
  if(state){const bank=currentBank;currentBank='voiceMale';try{playClick(state,time,isFirst,{mode:'metronome',beatNumber:beat+1,subIndex:0,voiceAnchorSeconds:guideAnchors[beat+1],beatDurationSec:60/a.measure.tempo*4/a.measure.denominator});}finally{currentBank=bank;}}return false;
 }
 window.RENAX_AMORCE={prepare,install,begin,step,stop,get active(){return !!session;},get generation(){return generation;}};
})();