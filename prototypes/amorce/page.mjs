import {synthesize} from './neural-engine.mjs?v=20261009-male-level';
import {lastSyllableCandidate} from './syllables.mjs';
import {languageState} from './planner.mjs';
import {renderSequence} from './sequence-render.mjs?v=20261009-neural';
import {isolatedPlayback} from './sequence.mjs';
import {createAudioAdapter} from './audio-adapter.mjs?v=20261009-count-attacks';
const $=id=>document.getElementById(id),languages=languageState(3);
const labels=['Introduction','Couplet personnalisé','Refrain final'];
for(let i=0;i<3;i++){
 const row=document.createElement('div');row.className='block';
 const label=document.createElement('label');label.textContent=`Bloc ${i+1}`;
 const input=document.createElement('input');input.value=labels[i];input.id=`label-${i}`;label.append(input);const readiness=document.createElement('small');readiness.id=`ready-${i}`;readiness.textContent='À préparer';label.append(readiness);input.addEventListener('input',()=>{readiness.textContent='À préparer';});input.addEventListener('blur',()=>prepareBlock(i));row.append(label);
 const controls=document.createElement('div');controls.className='languages';
 for(const lang of ['fr','en']){const button=document.createElement('button');button.textContent=lang.toUpperCase();button.dataset.index=i;button.dataset.lang=lang;button.setAttribute('aria-label',`${lang.toUpperCase()} pour le bloc ${i+1}`);button.onclick=()=>{languages.choose(i,lang);refreshLanguages();for(let j=0;j<3;j++)prepareBlock(j);};controls.append(button);}
 row.append(controls);$('blocks').append(row);
}
async function prepareBlock(i){
 const input=$(`label-${i}`),text=input.value,language=languages.get(i),note=$(`ready-${i}`);
 const key=JSON.stringify([text,language]);note.dataset.key=key;
 if(!text.trim()){note.textContent='Libellé vide';return;}
 note.textContent='Préparation…';
 try{const speech=await synthesize(text,language);if(note.dataset.key===key&&input.value===text&&languages.get(i)===language)note.textContent=`Prêt · ${speech.backend.toUpperCase()} · calcul ${(speech.inferenceMs/1000).toFixed(2)} s`;}
 catch(error){if(note.dataset.key===key)note.textContent='Préparation échouée — réessayer à la lecture';}
}
function refreshLanguages(){document.querySelectorAll('[data-lang]').forEach(b=>{const selected=languages.get(Number(b.dataset.index))===b.dataset.lang;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',selected);});}
refreshLanguages();
let playback,token=0,completion;
window.addEventListener('amorce-neural-progress',e=>{if(playback&&!playback.stopped)$('status').textContent=e.detail;});
function busy(value){document.querySelectorAll('input,select,[data-lang],#run').forEach(e=>e.disabled=value);$('stop').disabled=!value;}
async function stop(){token++;clearTimeout(completion);if(playback)await playback.stop();playback=null;busy(false);$('status').textContent='Lecture arrêtée. Calage à valider.';}
$('stop').onclick=stop;
const errors={OVERLAPPING_ANNOUNCEMENTS:'Deux annonces se chevauchent. Augmentez les mesures par bloc ou raccourcissez les libellés.',ANNOUNCEMENT_OVERFLOWS_BLOCK:'Une annonce dépasse la mesure disponible. Réduisez le tempo ou raccourcissez le libellé.',NO_SYLLABLE_NUCLEUS:'Ce libellé ne fournit pas de repère syllabique exploitable.',INSUFFICIENT_PREROLL:'Le temps disponible avant l’annonce est insuffisant.'};
$('run').onclick=async()=>{
 const id=++token;busy(true);$('status').textContent='Préparation des voix naturelles… Le premier chargement du modèle peut prendre un moment.';
 const context=new AudioContext();playback=isolatedPlayback(context);
 try{
  await context.resume();
  const [numerator,denominator]=$('meter').value.split('/').map(Number);
  const bpm=Number($('bpm').value),measures=Number($('measures').value);
  if(bpm<40||bpm>320||!Number.isInteger(measures)||measures<2||measures>8)throw new Error('Tempo : 40–320 BPM ; mesures par bloc : 2–8.');
  const blocks=labels.map((_,i)=>({text:$(`label-${i}`).value,language:languages.get(i),numerator,denominator,measures,bank:$('bank').value}));
  const speeches=[],candidates=[];
  for(const b of blocks){const speech=await synthesize(b.text,b.language);if(id!==token)return;speeches.push(speech);candidates.push(lastSyllableCandidate(speech.events,b.language));}
  const frame=$('audio-app');
  // Same-origin hidden iframe: separate instance of the unchanged app engine.
  const adapter=await createAudioAdapter(frame);
  const started=performance.now();
  while(!adapter.ready()){if(id!==token)return;if(performance.now()-started>20000)throw new Error('Chargement des samples trop long. Réessayez.');await new Promise(r=>setTimeout(r,100));}
  if(id!==token)return;
  const result=renderSequence(context,blocks,speeches,candidates,{bpm,subdivisions:Number($('subdivisions').value)},adapter);
  window.amorceTest={result,blocks,candidates,speeches,voices:speeches.map(s=>({model:s.model,voice:s.voice,timingSource:s.timingSource,backend:s.backend,inferenceMs:s.inferenceMs,preparationMs:s.preparationMs,fallbackReason:s.fallbackReason,level:s.level})),status:'calage-a-valider'};
  $('status').textContent=`Lecture · ${result.countInMeasures} mesures de décompte · calage à valider\n`+blocks.map((b,i)=>`${i+1}. ${b.text} (${b.language.toUpperCase()}) — début du bloc à ${result.layout[i].blockStart.toFixed(2)} s`).join('\n');
  completion=setTimeout(async()=>{if(id!==token)return;await playback.stop();playback=null;busy(false);$('status').textContent+='\nLecture terminée. Le repère acoustique reste à valider.';},Math.ceil((result.end+.5)*1000));
 }catch(error){if(id!==token)return;if(playback)await playback.stop();playback=null;busy(false);$('status').textContent=errors[error.message]||error.message;}
};
