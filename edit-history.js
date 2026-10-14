// Reversible edit history for this page session.
(() => {
 const clone=v=>JSON.parse(JSON.stringify(v)),wrapper=document.querySelector('.sequencer-wrapper');
 const toolbar=document.createElement('div');toolbar.className='reset-undo-tools';
 const undo=document.createElement('button');undo.type='button';undo.id='undoBtn';undo.title='Annuler la dernière modification';undo.setAttribute('aria-label',undo.title);
 undo.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12"/></svg>';
 toolbar.append(panicBtn,undo);wrapper.append(toolbar);
 const eraser='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 3 7 7-10 10H6l-4-4L14 3ZM7 11l7 7M11 20h10"/></svg>';
 function resetIcon(){if(panicBtn.querySelector('svg'))return;panicBtn.innerHTML=training.engaged?'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>':eraser;panicBtn.title=training.engaged?"Arrêter l'entraînement":'Réinitialiser';panicBtn.setAttribute('aria-label',panicBtn.title);}
 resetIcon();new MutationObserver(resetIcon).observe(panicBtn,{childList:true});
 const settings=['trainStart','trainEnd','trainDuration','trainDurationUnit','trainStep','trainInterval','trainIntervalUnit'];
 function snapshot(){const songs=window.RENAX_SONGS;return {mode:appMode,metro:clone(songs?.loaded?songs.loaded.previous:metronomeMeasures),poly:clone(polyrhythmMeasures),active:activeMeasureIndex,tempo,bank:currentBank,volume:masterVolume,silent:silentModeEnabled,clickMeasures,silentMeasures,direction:training.direction,training:window.RENAX_TRAINING?.editState,fields:Object.fromEntries(settings.map(id=>[id,document.getElementById(id)?.value])),library:songs?clone(songs.library):null,navigation:songs?.navigation};}
 function signature(s){const {active,navigation,tempo,...edit}=s;return JSON.stringify(edit);}
 let restoring=false,pending=null,baseline=snapshot(),history=[];
 const workspaceHistories=new Map();let workspace='metronome';
 window.RENAX_EDIT_HISTORY={leaveWorkspace(){commit();workspaceHistories.set(workspace,history);},enterWorkspace(next){clearTimeout(pending);pending=null;workspace=next;history=workspaceHistories.get(next)||[];baseline=snapshot();sync();}};
 function sync(){undo.disabled=!history.length;undo.setAttribute('aria-disabled',String(undo.disabled));}
 function commit(){clearTimeout(pending);pending=null;if(restoring)return;const next=snapshot();if(signature(next)!==signature(baseline)){history.push(baseline);baseline=next;}else baseline=next;sync();}
 function queue(){if(restoring)return;clearTimeout(pending);pending=setTimeout(commit,200);}
 document.addEventListener('change',queue,true);
 document.addEventListener('input',e=>{if(e.target.matches('#volumeSlider,#bpmSlider,.measure-tempo-input,.training-fields input'))queue();},true);
 document.addEventListener('click',e=>{if(!e.target.closest('#undoBtn,#playBtn,#trainBtn'))queue();},true);
 window.addEventListener('renax-library-edited',queue);
 document.addEventListener('pointerup',()=>{if(pending)queue();});
 undo.onclick=()=>{
  commit();if(!history.length)return;restoring=true;const s=history.pop(),songs=window.RENAX_SONGS;
  try{
   stopMetronome();endTraining();songs?.unload();
   if(s.library&&JSON.stringify(s.library)!==JSON.stringify(songs.library)){songs.replaceLibrary(clone(s.library));RENAX_STORAGE.write(s.library);window.dispatchEvent(new Event('renax-library-edited'));}
   metronomeMeasures=clone(s.metro);polyrhythmMeasures=clone(s.poly);measures=appMode==='metronome'?metronomeMeasures:polyrhythmMeasures;setAppMode(s.mode);
   activeMeasureIndex=Math.min(s.active,measures.length-1);tempo=s.tempo;
   currentBank=s.bank;soundBankSel.value=s.bank;syncNumbox(soundBankSel);
   masterVolume=s.volume;volumeSlider.value=Math.round(s.volume*100);volumeValue.textContent=volumeSlider.value+'%';
   clickMeasures=s.clickMeasures;silentMeasures=s.silentMeasures;clickMeasureCountSel.value=String(clickMeasures);silentMeasureCountSel.value=String(silentMeasures);syncNumbox(clickMeasureCountSel);syncNumbox(silentMeasureCountSel);setSilentMode(s.silent);
   training.direction=s.direction;dirToggle.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.dir===s.direction));
   for(const [id,value] of Object.entries(s.fields)){const e=document.getElementById(id);if(e&&value!==undefined){e.value=value;if(e.tagName==='SELECT')syncNumbox(e);}}
   window.RENAX_TRAINING?.restoreEditState(s.training);
   if(s.navigation?.pane==='songs')songs.restoreNavigation(s.navigation);
   renderSequencerList();renderActiveMeasure();refreshMeasurePreviews();syncTempoUI(measures[activeMeasureIndex]);updateVoiceGroupLabel();resetCustomizationTimer();resetIcon();
  }finally{restoring=false;baseline=snapshot();sync();}
 };
 sync();
})();
