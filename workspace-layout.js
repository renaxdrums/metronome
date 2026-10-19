/* Workspace presentation: original musical controls and engines are reused. */
(()=>{
 const nativeMode=document.getElementById('modeSwitch'),songTabs=document.querySelector('.song-tabs'),multiTabs=document.querySelector('.multi-mode-tabs'),visu=document.querySelector('.panel-visu'),footer=document.querySelector('footer'),params=document.querySelector('.panel-params'),trainPanel=document.querySelector('.panel-training'),trainHost=document.getElementById('mobileTrainingHost'),seqPanel=document.querySelector('.panel-seq');
 const desktop=matchMedia('(min-width:1101px)');
 const controls=document.createElement('details');controls.id='workspaceControls';controls.open=desktop.matches;
 controls.innerHTML='<summary>Réglages musicaux</summary><div class="workspace-controls-grid"></div>';
 controls.querySelector('div').append(...params.querySelectorAll(':scope > .control-group'));
 visu.querySelector('.visu-toolbar').after(controls);
 const musicGroups=[...controls.querySelector('.workspace-controls-grid').children];musicGroups.forEach((g,i)=>{g.classList.add('workspace-control-group');if(i===0)g.classList.add('workspace-tempo-group');});
 const volumeLabel=document.getElementById('volumeSlider').closest('.control-group').querySelector('label');volumeLabel.insertAdjacentHTML('afterbegin','<svg class="orange-ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m11 5-6 4H2v6h3l6 4V5Z M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>');
 const timerGroup=document.createElement('div');timerGroup.id='workspaceTimer';timerGroup.innerHTML='<span class="workspace-timer-label"><svg class="orange-ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5V2M12 9v4l3 2"/></svg>Chronomètre</span>';const timer=document.getElementById('trainTimer');timer.before(timerGroup);timerGroup.append(timer);
 const tempoShortcut=document.createElement('button');tempoShortcut.id='workspaceTempoShortcut';tempoShortcut.type='button';tempoShortcut.hidden=true;
 tempoShortcut.setAttribute('aria-controls','workspaceControls');tempoShortcut.innerHTML='<strong></strong><span> BPM</span>';
 timerGroup.before(tempoShortcut);
 function syncTempoShortcut(){
  const value=bpmDisplay.textContent.match(/\d+/)?.[0]||String(bpmSlider.value);
  const number=tempoShortcut.querySelector('strong');if(number.textContent!==value)number.textContent=value;
  tempoShortcut.setAttribute('aria-label','Ouvrir les réglages musicaux, tempo '+value+' BPM');
  tempoShortcut.hidden=desktop.matches||controls.open;
 }
 tempoShortcut.addEventListener('click',()=>{controls.open=true;syncTempoShortcut();document.getElementById('tempoFader')?.focus({preventScroll:true});controls.scrollIntoView({block:'nearest',behavior:'smooth'});});
 new MutationObserver(syncTempoShortcut).observe(bpmDisplay,{childList:true,subtree:true,characterData:true});
 bpmSlider.addEventListener('input',syncTempoShortcut);

 const silent=document.querySelector('.silent-section'),silentHome=document.createComment('silent-controls-home');silent.before(silentHome);
 const silentCollapse=document.createElement('button');silentCollapse.type='button';silentCollapse.className='silent-collapse';silentCollapse.textContent='Mesures vides';silentCollapse.setAttribute('aria-expanded','false');silentCollapse.setAttribute('aria-controls','silentSettings');silent.querySelector('.silent-head').prepend(silentCollapse);
 silentCollapse.onclick=()=>{const expanded=silent.classList.toggle('is-expanded');silentCollapse.setAttribute('aria-expanded',String(expanded));};
 const nav=document.getElementById('workspaceNav');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Espaces de travail');
 const items=['metronome','polyrhythm','training','sequence','multi','tracks'];
 let page='metronome',changing=false;
 // Each native workspace owns its musical model. The audio scheduler is reused.
 const musicalStates=new Map();
 const nativeWorkspaces=new Set(['metronome','training','sequence']);
 const initialBank=currentBank;
 function captureMusic(){return {measures:metronomeMeasures,index:activeMeasureIndex,bank:currentBank,silent:silentModeEnabled,click:clickMeasures,quiet:silentMeasures};}
 musicalStates.set('metronome',captureMusic());
 function restoreMusic(workspace){
  let state=musicalStates.get(workspace);
  if(!state){const m=createMeasure(4,4,120);m.beatSubdivisions=[1,1,1,1];m.beatStates=[[1],[1],[1],[1]];state={measures:[m],index:0,bank:initialBank,silent:false,click:3,quiet:1};musicalStates.set(workspace,state);}
  metronomeMeasures=state.measures;measures=metronomeMeasures;activeMeasureIndex=Math.max(0,Math.min(state.index,measures.length-1));playingMeasureIndex=activeMeasureIndex;currentStepInMeasure=0;
  currentBank=state.bank;soundBankSel.value=currentBank;syncNumbox(soundBankSel);
  clickMeasures=state.click;silentMeasures=state.quiet;clickMeasureCountSel.value=String(clickMeasures);silentMeasureCountSel.value=String(silentMeasures);syncNumbox(clickMeasureCountSel);syncNumbox(silentMeasureCountSel);setSilentMode(state.silent);
  measureCountSel.value=String(measures.length);closeBeatEditor();renderSequencerList();renderActiveMeasure();refreshMeasurePreviews();resetCustomizationTimer();
 }

 // One training transport, exposed in the appropriate view on each screen.
 const trainingButtonHome=document.createComment('training-button-home');trainBtn.before(trainingButtonHome);
 const trainingVisualButton=document.createElement('button');trainingVisualButton.id='trainingVisualBtn';trainingVisualButton.type='button';trainingVisualButton.className='btn btn-primary';
 playBtn.after(trainingVisualButton);trainingVisualButton.onclick=()=>trainBtn.click();
 function syncTrainingTransport(){const label=trainBtn.textContent; if(trainingVisualButton.textContent!==label)trainingVisualButton.textContent=label;trainingVisualButton.disabled=trainBtn.disabled;trainingVisualButton.setAttribute('aria-pressed',trainBtn.getAttribute('aria-pressed')||'false');trainingVisualButton.classList.toggle('active',trainBtn.classList.contains('active'));trainingVisualButton.title=trainBtn.title;}
 new MutationObserver(syncTrainingTransport).observe(trainBtn,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','aria-pressed','class','title']});syncTrainingTransport();
 playBtn.addEventListener('click',event=>{if(page!=='training')return;event.preventDefault();event.stopImmediatePropagation();trainBtn.click();},true);
 window.addEventListener('keydown',event=>{if(page!=='training'||event.code!=='Space'||isEditingField())return;event.preventDefault();event.stopImmediatePropagation();trainBtn.click();},true);
 const trainingTransportStyle=document.createElement('style');trainingTransportStyle.textContent=`
 #trainingVisualBtn{display:none!important}
 body[data-workspace=training] #playBtn{display:none!important}
 @media(min-width:1101px){body[data-workspace=training] .footer-center #trainBtn{display:inline-flex!important;align-items:center;justify-content:center;width:auto!important;min-width:210px;min-height:46px;margin:0;padding:12px 22px}}
 @media(max-width:1100px){body[data-workspace=training][data-mobile-pane=visu] #trainingVisualBtn{display:inline-flex!important;align-items:center;justify-content:center;min-height:44px;padding:10px 20px;background:#173f49;border:1px solid #327b89;color:#c4f1f5;border-radius:7px}html#renaxApp[data-theme=light] body[data-workspace=training] #trainingVisualBtn{background:#087c90!important;border-color:#087c90!important;color:white!important}}
 `;document.head.append(trainingTransportStyle);

 const buttons=new Map();
 const controlOpenByWorkspace=new Map();let shownWorkspace=null,wasDesktop=desktop.matches;
 function rememberControls(){if(!desktop.matches&&shownWorkspace!==null)controlOpenByWorkspace.set(shownWorkspace,controls.open);}
 function restoreControls(workspace){shownWorkspace=workspace;controls.open=desktop.matches||(controlOpenByWorkspace.get(workspace)??false);}
 for(const id of items){const b=nav.querySelector('[data-workspace="'+id+'"]');b.onclick=()=>go(id);buttons.set(id,b);}
 nav.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const list=[...buttons.values()],i=list.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?list.length-1:(i+(event.key==='ArrowRight'?1:-1)+list.length)%list.length;list[next].click();list[next].focus();});
 const mobileViews=document.createElement('div');mobileViews.id='workspaceMobileViews';mobileViews.setAttribute('role','group');mobileViews.setAttribute('aria-label','Vue de travail');
 mobileViews.innerHTML='<button type="button" data-pane="visu">Visualisation</button><button type="button" data-pane="seq">Mesures</button>';nav.after(mobileViews);
 const nativeSwitchTab=switchTab;
 switchTab=function(name){nativeSwitchTab(name);document.body.dataset.mobilePane=name==='params'?'visu':name;if(name==='params'){controls.open=true;visu.classList.add('mobile-active');}for(const b of mobileViews.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.pane===document.body.dataset.mobilePane));place();};
 for(const b of mobileViews.querySelectorAll('button'))b.onclick=()=>switchTab(b.dataset.pane);
 const countRow=document.getElementById('measureCount').closest('.seq-count-row');countRow.classList.add('sequence-count-row');
 const add=document.createElement('button');add.id='sequenceAddMeasure';add.type='button';add.className='multi-add sequence-add';add.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Nouvelle mesure</span>';countRow.before(add);
 function syncAdd(){add.disabled=playbackStarting||measures.length>=8;}
 add.onclick=()=>{if(playbackStarting||!['metronome','polyrhythm'].includes(appMode)||window.RENAX_MULTI?.active||measures.length>=8)return;stopMetronome();measureCountSel.value=String(measures.length+1);measureCountSel.dispatchEvent(new Event('change',{bubbles:true}));activeMeasureIndex=measures.length-1;renderSequencerList();renderActiveMeasure();syncAdd();};
 measureCountSel.addEventListener('change',syncAdd);new MutationObserver(syncAdd).observe(playBtn,{attributes:true,attributeFilter:['disabled','class']});syncAdd();
 function place(){syncTempoShortcut();if(desktop.matches&&page==='training'){if(trainBtn.parentNode!==playBtn.parentNode)playBtn.after(trainBtn);}else if(trainBtn.previousSibling!==trainingButtonHome)trainingButtonHome.after(trainBtn);syncTrainingTransport();const group=document.querySelector('.visu-bottom');if(group){if(desktop.matches){if(group.parentNode!==visu)visu.append(group);}else if(group.parentNode!==footer)footer.insertBefore(group,footer.querySelector('.footer-right'));}
  if(trainingSection&&trainingSection.parentNode!==trainHost)trainHost.append(trainingSection);
  const target=!desktop.matches&&page==='training'&&document.body.dataset.mobilePane==='training'?trainPanel:visu;
  if(desktop.matches){const toolbar=visu.querySelector('.visu-toolbar');if(controls.parentNode!==toolbar)toolbar.insertBefore(controls,timerGroup);for(const g of musicGroups)if(g.parentNode!==toolbar)toolbar.insertBefore(g,timerGroup);}
  else{const grid=controls.querySelector('.workspace-controls-grid');for(const g of musicGroups)if(g.parentNode!==grid)grid.append(g);if(controls.parentNode!==target){if(target===visu)visu.querySelector('.visu-toolbar').after(controls);else trainPanel.querySelector('.panel-title').after(controls);}}
  if(page==='training'){if(silent.parentNode!==trainPanel||trainPanel.querySelector('.panel-title').nextElementSibling!==silent)trainPanel.querySelector('.panel-title').after(silent);}else if(silent.parentNode!==silentHome.parentNode)silentHome.after(silent);
 }
 function sync(){if(changing)return;if(window.RENAX_MULTI?.active)page='multi';else if(!document.getElementById('songsRoot').hidden)page='tracks';else if(appMode==='polyrhythm')page='polyrhythm';else if(!['metronome','sequence','training'].includes(page))page='sequence';document.body.dataset.workspace=page;
  const viewButton=mobileViews.querySelector('button:last-child');viewButton.dataset.pane=page==='training'?'training':'seq';const viewSource=page==='training'?'Paramètres':page==='multi'?'Pistes':page==='tracks'?'Playlist':'Mesures';const viewLabel=window.RENAX_I18N?.t(viewSource)??viewSource;if(viewButton.textContent!==viewLabel)viewButton.textContent=viewLabel;for(const b of mobileViews.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.pane===document.body.dataset.mobilePane));
  for(const [id,b] of buttons){const selected=id===page;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}try{localStorage.setItem('renax.workspace.v1',page);}catch{}place();syncAdd();
 }
 function go(next){if(next===page&&shownWorkspace!==null){if(next==='training'&&!desktop.matches&&document.body.dataset.mobilePane!=='training')switchTab('training');return;}rememberControls();window.RENAX_EDIT_HISTORY?.leaveWorkspace();stopMetronome();endTraining();if(nativeWorkspaces.has(page)&&!window.RENAX_MULTI?.active&&document.getElementById('songsRoot').hidden)musicalStates.set(page,captureMusic());changing=true;try{
  if(next==='tracks'){if(appMode!=='metronome')nativeMode.querySelector('[data-mode="metronome"]').click();songTabs.querySelector('[data-pane="songs"]').click();}
  else{if(window.RENAX_MULTI?.active&&next!=='multi')multiTabs.querySelector('button:first-child').click();
   if(!document.getElementById('songsRoot').hidden)songTabs.querySelector('[data-pane="sequence"]').click();
   if(next==='multi'){if(!window.RENAX_MULTI?.active)multiTabs.querySelector('button:last-child').click();}
   else if(appMode!==(next==='polyrhythm'?'polyrhythm':'metronome'))nativeMode.querySelector('[data-mode="'+(next==='polyrhythm'?'polyrhythm':'metronome')+'"]').click();
  }page=next;if(nativeWorkspaces.has(next))restoreMusic(next);if(next==='training'){silent.classList.remove('is-expanded');silentCollapse.setAttribute('aria-expanded','false');}restoreControls(next);window.RENAX_EDIT_HISTORY?.enterWorkspace(next);
  if(!desktop.matches)switchTab(next==='training'?'training':['sequence','multi','tracks'].includes(next)?'seq':'visu');
 }finally{changing=false;sync();requestAnimationFrame(()=>{resizeCanvas();updateRingRadius();});}}
 const observer=new MutationObserver(sync);observer.observe(songTabs,{subtree:true,attributes:true,attributeFilter:['aria-selected']});observer.observe(multiTabs,{subtree:true,attributes:true,attributeFilter:['aria-selected']});observer.observe(nativeMode,{subtree:true,attributes:true,attributeFilter:['class']});
 new MutationObserver(place).observe(visu,{childList:true});window.addEventListener('resize',place);desktop.addEventListener('change',()=>{const settingsPanel=document.getElementById('index2SettingsPanel'),settingsBackdrop=document.getElementById('index2SettingsBackdrop');const settingsOpen=settingsPanel.classList.contains('open')||settingsPanel.classList.contains('mobile-active');if(!wasDesktop&&shownWorkspace!==null)controlOpenByWorkspace.set(shownWorkspace,controls.open);wasDesktop=desktop.matches;restoreControls(page);place();if(!desktop.matches)switchTab(settingsOpen?'settings':page==='training'?'training':['sequence','multi','tracks'].includes(page)?'seq':'visu');if(settingsOpen){settingsPanel.classList.toggle('open',desktop.matches);settingsBackdrop.classList.toggle('open',desktop.matches);if(desktop.matches)settingsPanel.classList.remove('mobile-active');}requestAnimationFrame(()=>{resizeCanvas();updateRingRadius();});});
 controls.addEventListener('toggle',()=>{rememberControls();syncTempoShortcut();requestAnimationFrame(()=>{resizeCanvas();updateRingRadius();});});
 window.RENAX_WORKSPACE={go,get current(){return page;}};
 const restored=history.state?.renaxNavigation?.screen;
 const initial=restored?.workspace||(restored?.songs?.pane==='songs'?'tracks':'metronome');
 // A fresh default view already owns the native model and rendered controls.
 // Rebuilding that same model adds DOM mutations and layouts before first paint.
 const defaultScreen=!restored||(restored.workspace==='metronome'&&restored.tab==='visu'&&!restored.settings&&restored.songs?.pane==='sequence');
 const freshDefault=defaultScreen&&initial==='metronome'&&appMode==='metronome'&&!window.RENAX_MULTI?.active&&document.getElementById('songsRoot').hidden&&!isPlaying&&!playbackStarting&&!trainBtn.classList.contains('active');
 if(freshDefault){restoreControls('metronome');resetCustomizationTimer();window.RENAX_EDIT_HISTORY?.enterWorkspace('metronome');if(!desktop.matches)switchTab('visu');sync();}
 else go(buttons.has(initial)?initial:'metronome');
 // Reveal after controls have moved and the canvas has its final dimensions.
 const reveal=()=>requestAnimationFrame(()=>{
  sync();place();resizeCanvas();updateRingRadius();
  window.RENAX_RELEASE_LAYOUT?.();
 });
 reveal();window.addEventListener('load',()=>{sync();place();},{once:true});
})();

/* Text fitting is presentation only; option names and handlers are preserved. */
(()=>{
 const selectors='.numbox-button,#workspaceNav button,#tapBtn,.btn,.multi-add,.training-mode-tabs button';
 const observed=new WeakSet(),original=new WeakMap(),fitted=new WeakMap();let frame=0,generation=0;
 // Restore, measure and apply in separate passes. Interleaving these operations
 // forces a document layout for every label, especially on slower phones.
 function scan(){
  frame=0;const candidates=[];
  for(const button of document.querySelectorAll(selectors)){
   if(button.closest('.console-arrival-replica'))continue;
   if(!observed.has(button)){observed.add(button);resize.observe(button);}
   if(!button.isConnected||button.clientWidth===0)continue;
   const label=button.matches('.numbox-button')?button.querySelector(':scope>span'):button;
   if(!label)continue;
   const signature=button.clientWidth+'|'+label.textContent+'|'+generation;
   if(fitted.get(button)===signature)continue;
   if(!original.has(label))original.set(label,{value:label.style.getPropertyValue('font-size'),priority:label.style.getPropertyPriority('font-size')});
   candidates.push({button,label,saved:original.get(label)});
  }
  for(const {label,saved} of candidates){
   if(label.style.getPropertyValue('font-size')!==saved.value||label.style.getPropertyPriority('font-size')!==saved.priority){
    if(saved.value)label.style.setProperty('font-size',saved.value,saved.priority);else label.style.removeProperty('font-size');
   }
  }
  const measurements=candidates.map(item=>({...item,base:parseFloat(getComputedStyle(item.label).fontSize),available:item.label.clientWidth,overflow:item.label.scrollWidth}));
  for(const {button,label,base,available,overflow} of measurements){
   if(!available||!base)continue;
   if(overflow>available+1){const size=Math.max(9,Math.min(base,base*available/overflow));label.style.setProperty('font-size',size+'px','important');}
   if(button.matches('.numbox-button')&&button.title!==label.textContent.trim())button.title=label.textContent.trim();
  }
  for(const {button,label,base,available} of measurements)if(available&&base)fitted.set(button,button.clientWidth+'|'+label.textContent+'|'+generation);
 }
 const resize=new ResizeObserver(()=>queue());
 function queue(){if(!frame)frame=requestAnimationFrame(scan);}
 new MutationObserver(queue).observe(document.body,{childList:true,subtree:true,characterData:true});
 const invalidate=()=>{generation++;queue();};
 new MutationObserver(invalidate).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','lang']});
 window.addEventListener('resize',invalidate);document.fonts?.ready.then(invalidate);queue();
})();
