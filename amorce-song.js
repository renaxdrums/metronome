// Song integration. Neural text/audio stays in the browser; main click path is unchanged when disabled.
(() => {
 let modules,session=null,generation=0;const plans=new Map(),sources=new Set();
 const guideVoice=Object.freeze({
  anchors:Object.freeze([0,.116,.175,.262,.143,.195,.256,.216,.097,.12,.176,.211,.15,.128,.125,.105,.189,.187,.091,.129,.14]),
  volumes:Object.freeze([0,.72,.82,.92]),firstGain:1.08,playbackRate:1,busGain:1
 });
 function playGuideCount(state,time,isFirst,context){
  if(!audioCtx)return;
  const out=audioCtx.createGain();out.gain.value=masterVolume*guideVoice.busGain;
  out.connect(getVoiceMixDestination(audioCtx));
  renderVoiceCount('male',out,time,state,isFirst,context,guideVoice);
 }
 const key=s=>JSON.stringify([s.id,s.sections.map(b=>[b.label,b.amorceLanguage||'fr',b.count,b.continuous,b._guideDisabled,b.measure,b.tempoRamp]),s.countIn]);
 const load=()=>modules||(modules=Promise.all([import('./prototypes/amorce/neural-engine.mjs?v=20261010-label-fast1'),import('./prototypes/amorce/syllables.mjs'),import('./amorce-plan.mjs?v=20261014-block-ramp1')]).catch(error=>{modules=null;throw error;}));
 async function prepare(song){const k=key(song);if(plans.has(k))return plans.get(k);const snapshot=JSON.parse(JSON.stringify(song));
  if(snapshot.sections.some(section=>section.continuous)){
    const job=(async()=>{
      const segmentPlans={};let initial=null;
      for(let start=0;start<snapshot.sections.length;){
        if(snapshot.sections[start].continuous){start++;continue;}
        let end=start+1;while(end<snapshot.sections.length&&!snapshot.sections[end].continuous)end++;
        const run={...snapshot,sections:snapshot.sections.slice(start,end)};
        if(start>0)delete run.countIn;
        const plan=await prepare(run);
        if(start===0)initial=plan;
        else{
          const lead=plan.sections[0].count*240*plan.sections[0].measure.numerator/plan.sections[0].measure.denominator/plan.sections[0].measure.tempo;
          segmentPlans[run.sections[0].id]={...plan,sections:run.sections,announcements:plan.announcements.filter(a=>a.index>0).map(a=>({...a,start:a.start-lead,end:a.end-lead,target:a.target-lead,blockStart:a.blockStart-lead}))};
        }
        start=end;
      }
      const sections=initial?[initial.sections[0],...snapshot.sections]:RENAX_SONGS.playbackSections(snapshot);
      return {...(initial||{announcements:[],speeches:[],candidates:[],countInMeasures:snapshot.countIn?.count||0}),sections,segmentPlans};
    })();plans.set(k,job);job.catch(()=>plans.delete(k));return job;
  }
  const job=(async()=>{const [engine,syllables,planner]=await load();const speeches=await Promise.all(snapshot.sections.map(b=>b._guideDisabled?{pcm:new Float32Array(0),sampleRate:48000,events:[]}:engine.synthesize(b.label,b.amorceLanguage||'fr')));const candidates=speeches.map((s,i)=>snapshot.sections[i]._guideDisabled?{anchorSeconds:0}:syllables.lastSyllableCandidate(s.events,snapshot.sections[i].amorceLanguage||'fr'));return {...planner.planAmorce(snapshot,speeches,candidates),speeches,candidates};})();plans.set(k,job);job.catch(()=>plans.delete(k));if(plans.size>12)plans.delete(plans.keys().next().value);return job;
 }
 function stop(){generation++;session=null;for(const source of sources){try{source.stop();}catch{}}sources.clear();}
 function install(plan){session={plan,origin:null};}
 function begin(context,origin,plan=session?.plan){if(!plan)return;session={plan,origin};
  for(const a of plan.announcements){const speech=plan.speeches[a.index],buffer=context.createBuffer(1,speech.pcm.length,speech.sampleRate);buffer.copyToChannel(speech.pcm,0);const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=.25*masterVolume;source.connect(gain);gain.connect(getAudioMixDestination(context));const planned=origin+a.start,late=Math.max(0,context.currentTime-planned);if(late>0)console.warn('Guide vocal : annonce en retard de '+Math.round(late*1000)+' ms.');if(late<buffer.duration){source.start(Math.max(planned,context.currentTime),late);sources.add(source);source.onended=()=>{sources.delete(source);source.disconnect();gain.disconnect();};}else{source.disconnect();gain.disconnect();}}
 }
 function step(time,state,isFirst,subIndex,beat){if(!session||session.origin===null||subIndex!==0)return false;const t=time-session.origin,a=session.plan.announcements.find(a=>t>=a.target-1e-6&&t<a.blockStart-1e-6);if(!a)return false;
  if(Math.abs(t-a.target)<1e-6)return false;
  const group=a.measure.denominator>=16?a.measure.denominator/4:1;
  if(state&&beat%group===0)playGuideCount(state,time,isFirst,{mode:'song-guide',beatNumber:Math.floor(beat/group)+1,subIndex:0,beatDurationSec:60/a.measure.tempo*4/a.measure.denominator*group});return false;
 }
 window.RENAX_AMORCE={maxAttackSeconds:Math.max(...guideVoice.anchors)/guideVoice.playbackRate,prepare,install,begin,step,stop,get active(){return !!session;},get generation(){return generation;}};
})();