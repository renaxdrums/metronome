/* Workspace presentation: original musical controls and engines are reused. */
(()=>{
 const nativeMode=document.getElementById('modeSwitch'),songTabs=document.querySelector('.song-tabs'),multiTabs=document.querySelector('.multi-mode-tabs'),visu=document.querySelector('.panel-visu'),footer=document.querySelector('footer'),params=document.querySelector('.panel-params'),trainPanel=document.querySelector('.panel-training'),trainHost=document.getElementById('mobileTrainingHost'),seqPanel=document.querySelector('.panel-seq');
 const desktop=matchMedia('(min-width:1101px)');
 const controls=document.createElement('details');controls.id='workspaceControls';controls.open=true;
 controls.innerHTML='<summary>Réglages musicaux</summary><div class="workspace-controls-grid"></div>';
 controls.querySelector('div').append(...params.querySelectorAll(':scope > .control-group'));
 visu.querySelector('.visu-toolbar').after(controls);
 const musicGroups=[...controls.querySelector('.workspace-controls-grid').children];musicGroups.forEach((g,i)=>{g.classList.add('workspace-control-group');if(i===0)g.classList.add('workspace-tempo-group');});
 const volumeLabel=document.getElementById('volumeSlider').closest('.control-group').querySelector('label');volumeLabel.insertAdjacentHTML('afterbegin','<svg class="orange-ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m11 5-6 4H2v6h3l6 4V5Z M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>');
 const timerGroup=document.createElement('div');timerGroup.id='workspaceTimer';timerGroup.innerHTML='<span class="workspace-timer-label"><svg class="orange-ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5V2M12 9v4l3 2"/></svg>Chronomètre</span>';const timer=document.getElementById('trainTimer');timer.before(timerGroup);timerGroup.append(timer);
 const tempoShortcut=document.createElement('button');tempoShortcut.id='workspaceTempoShortcut';tempoShortcut.type='button';tempoShortcut.hidden=true;
 tempoShortcut.setAttribute('aria-controls','workspaceControls');tempoShortcut.innerHTML='<strong></strong><span>BPM</span>';
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
 const nav=document.createElement('nav');nav.id='workspaceNav';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Espaces de travail');
 const trainIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5V2M12 9v4l3 2"/></svg>';
 const items=[['metronome','Métronome',nativeMode.querySelector('[data-mode="metronome"] svg').outerHTML],['polyrhythm','Polyrythmie',nativeMode.querySelector('[data-mode="polyrhythm"] svg').outerHTML],['training','Entraînement',trainIcon],['sequence','Séquenceur',multiTabs.querySelector('button:first-child svg').outerHTML],['multi','Multipiste',multiTabs.querySelector('button:last-child svg').outerHTML],['tracks','Track',document.querySelector('.song-tabs [data-pane="songs"] svg')?.outerHTML||'<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/></svg>']];
 let page='metronome',changing=false;try{const stored=localStorage.getItem('renax.workspace.v1');if(items.some(i=>i[0]===stored))page=stored;}catch{}
 const buttons=new Map();
 const controlOpenByWorkspace=new Map();let shownWorkspace=null,wasDesktop=desktop.matches;
 function rememberControls(){if(!desktop.matches&&shownWorkspace!==null)controlOpenByWorkspace.set(shownWorkspace,controls.open);}
 function restoreControls(workspace){shownWorkspace=workspace;controls.open=desktop.matches||(controlOpenByWorkspace.get(workspace)??(workspace==='metronome'));}
 for(const [id,label,icon] of items){const b=document.createElement('button');b.type='button';b.dataset.workspace=id;b.setAttribute('role','tab');b.setAttribute('aria-controls',id==='training'?'mobileTrainingHost':id==='tracks'?'songsRoot':id==='sequence'||id==='multi'?'sequencePane':'sequencerContainer');b.innerHTML=icon+'<span>'+label+'</span>';b.onclick=()=>go(id);nav.append(b);buttons.set(id,b);}
 document.querySelector('header').after(nav);
 nav.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const list=[...buttons.values()],i=list.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?list.length-1:(i+(event.key==='ArrowRight'?1:-1)+list.length)%list.length;list[next].click();list[next].focus();});
 const mobileViews=document.createElement('div');mobileViews.id='workspaceMobileViews';mobileViews.setAttribute('role','group');mobileViews.setAttribute('aria-label','Vue de travail');
 mobileViews.innerHTML='<button type="button" data-pane="visu">Visualisation</button><button type="button" data-pane="seq">Blocs</button>';nav.after(mobileViews);
 const nativeSwitchTab=switchTab;
 switchTab=function(name){nativeSwitchTab(name);document.body.dataset.mobilePane=name==='params'?'visu':name;if(name==='params'){controls.open=true;visu.classList.add('mobile-active');}for(const b of mobileViews.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.pane===document.body.dataset.mobilePane));place();};
 for(const b of mobileViews.querySelectorAll('button'))b.onclick=()=>switchTab(b.dataset.pane);
 const countRow=document.getElementById('measureCount').closest('.seq-count-row');countRow.classList.add('sequence-count-row');
 const add=document.createElement('button');add.id='sequenceAddMeasure';add.type='button';add.className='multi-add sequence-add';add.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Nouvelle mesure</span>';countRow.before(add);
 function syncAdd(){add.disabled=playbackStarting||measures.length>=8;}
 add.onclick=()=>{if(playbackStarting||!['metronome','polyrhythm'].includes(appMode)||window.RENAX_MULTI?.active||measures.length>=8)return;stopMetronome();measureCountSel.value=String(measures.length+1);measureCountSel.dispatchEvent(new Event('change',{bubbles:true}));activeMeasureIndex=measures.length-1;renderSequencerList();renderActiveMeasure();syncAdd();};
 measureCountSel.addEventListener('change',syncAdd);new MutationObserver(syncAdd).observe(playBtn,{attributes:true,attributeFilter:['disabled','class']});syncAdd();
 function place(){syncTempoShortcut();const group=document.querySelector('.visu-bottom');if(group){if(desktop.matches){if(group.parentNode!==visu)visu.append(group);}else if(group.parentNode!==footer)footer.insertBefore(group,footer.querySelector('.footer-right'));}
  if(trainingSection&&trainingSection.parentNode!==trainHost)trainHost.append(trainingSection);
  const target=!desktop.matches&&page==='training'&&document.body.dataset.mobilePane==='training'?trainPanel:visu;
  if(desktop.matches){const toolbar=visu.querySelector('.visu-toolbar');if(controls.parentNode!==toolbar)toolbar.insertBefore(controls,timerGroup);for(const g of musicGroups)if(g.parentNode!==toolbar)toolbar.insertBefore(g,timerGroup);}
  else{const grid=controls.querySelector('.workspace-controls-grid');for(const g of musicGroups)if(g.parentNode!==grid)grid.append(g);if(controls.parentNode!==target){if(target===visu)visu.querySelector('.visu-toolbar').after(controls);else trainPanel.querySelector('.panel-title').after(controls);}}
  if(page==='training'){if(silent.parentNode!==trainPanel||trainPanel.querySelector('.panel-title').nextElementSibling!==silent)trainPanel.querySelector('.panel-title').after(silent);}else if(silent.parentNode!==silentHome.parentNode)silentHome.after(silent);
 }
 function sync(){if(changing)return;if(window.RENAX_MULTI?.active)page='multi';else if(!document.getElementById('songsRoot').hidden)page='tracks';else if(appMode==='polyrhythm')page='polyrhythm';else if(!['metronome','sequence','training'].includes(page))page='sequence';document.body.dataset.workspace=page;
  for(const [id,b] of buttons){const selected=id===page;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}try{localStorage.setItem('renax.workspace.v1',page);}catch{}place();syncAdd();
 }
 function go(next){rememberControls();changing=true;try{
  if(next==='tracks'){if(appMode!=='metronome')nativeMode.querySelector('[data-mode="metronome"]').click();songTabs.querySelector('[data-pane="songs"]').click();}
  else{if(window.RENAX_MULTI?.active&&next!=='multi')multiTabs.querySelector('button:first-child').click();
   if(!document.getElementById('songsRoot').hidden)songTabs.querySelector('[data-pane="sequence"]').click();
   if(next==='multi'){if(!window.RENAX_MULTI?.active)multiTabs.querySelector('button:last-child').click();}
   else if(appMode!==(next==='polyrhythm'?'polyrhythm':'metronome'))nativeMode.querySelector('[data-mode="'+(next==='polyrhythm'?'polyrhythm':'metronome')+'"]').click();
  }page=next;if(next==='training'){silent.classList.remove('is-expanded');silentCollapse.setAttribute('aria-expanded','false');setSilentMode(false);}restoreControls(next);
  if(!desktop.matches)switchTab(next==='training'?'training':['sequence','multi','tracks'].includes(next)?'seq':'visu');
 }finally{changing=false;sync();requestAnimationFrame(()=>{resizeCanvas();updateRingRadius();});}}
 const observer=new MutationObserver(sync);observer.observe(songTabs,{subtree:true,attributes:true,attributeFilter:['aria-selected']});observer.observe(multiTabs,{subtree:true,attributes:true,attributeFilter:['aria-selected']});observer.observe(nativeMode,{subtree:true,attributes:true,attributeFilter:['class']});
 new MutationObserver(place).observe(visu,{childList:true});window.addEventListener('resize',place);desktop.addEventListener('change',()=>{if(!wasDesktop&&shownWorkspace!==null)controlOpenByWorkspace.set(shownWorkspace,controls.open);wasDesktop=desktop.matches;restoreControls(page);place();if(!desktop.matches)switchTab(page==='training'?'training':['sequence','multi','tracks'].includes(page)?'seq':'visu');requestAnimationFrame(()=>{resizeCanvas();updateRingRadius();});});
 controls.addEventListener('toggle',()=>{rememberControls();syncTempoShortcut();requestAnimationFrame(()=>{resizeCanvas();updateRingRadius();});});
 const start=page;if(!document.getElementById('songsRoot').hidden){restoreControls(page);sync();if(!desktop.matches)switchTab('seq');}else go(start);window.addEventListener('load',()=>{sync();place();});
})();

/* Text fitting is presentation only; option names and handlers are preserved. */
(()=>{
 const selectors='.numbox-button,#workspaceNav button,#tapBtn,.btn,.multi-add,.training-mode-tabs button';
 const observed=new WeakSet(),original=new WeakMap();let frame=0;
 function fit(button){
  if(!button.isConnected||button.clientWidth===0)return;
  const label=button.matches('.numbox-button')?button.querySelector(':scope>span'):button;
  if(!label)return;
  if(!original.has(label))original.set(label,{value:label.style.getPropertyValue('font-size'),priority:label.style.getPropertyPriority('font-size')});
  const saved=original.get(label);label.style.removeProperty('font-size');if(saved.value)label.style.setProperty('font-size',saved.value,saved.priority);
  const base=parseFloat(getComputedStyle(label).fontSize),available=label.clientWidth;
  if(!available||!base)return;
  const overflow=label.scrollWidth;
  if(overflow>available+1){const size=Math.max(9,Math.min(base,base*available/overflow));label.style.setProperty('font-size',size+'px','important');}
  if(button.matches('.numbox-button'))button.title=label.textContent.trim();
 }
 const resize=new ResizeObserver(entries=>{for(const entry of entries)fit(entry.target);});
 function scan(){frame=0;for(const button of document.querySelectorAll(selectors)){if(!observed.has(button)){observed.add(button);resize.observe(button);}fit(button);}}
 function queue(){if(!frame)frame=requestAnimationFrame(scan);}
 new MutationObserver(queue).observe(document.body,{childList:true,subtree:true,characterData:true});
 window.addEventListener('resize',queue);document.fonts?.ready.then(queue);queue();
})();
