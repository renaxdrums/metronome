/* Workspace presentation: original musical controls and engines are reused. */
(()=>{
 const nativeMode=document.getElementById('modeSwitch'),songTabs=document.querySelector('.song-tabs'),multiTabs=document.querySelector('.multi-mode-tabs'),visu=document.querySelector('.panel-visu'),footer=document.querySelector('footer'),params=document.querySelector('.panel-params'),trainPanel=document.querySelector('.panel-training'),trainHost=document.getElementById('mobileTrainingHost'),seqPanel=document.querySelector('.panel-seq');
 const desktop=matchMedia('(min-width:1101px)');
 const controls=document.createElement('details');controls.id='workspaceControls';controls.open=true;
 controls.innerHTML='<summary>Réglages musicaux</summary><div class="workspace-controls-grid"></div>';
 controls.querySelector('div').append(...params.querySelectorAll(':scope > .control-group'));
 visu.querySelector('.visu-toolbar').after(controls);
 const silent=document.querySelector('.silent-section'),silentHome=document.createComment('silent-controls-home');silent.before(silentHome);
 const nav=document.createElement('nav');nav.id='workspaceNav';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Espaces de travail');
 const trainIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5V2M12 9v4l3 2"/></svg>';
 const items=[['metronome','Métronome',nativeMode.querySelector('[data-mode="metronome"] svg').outerHTML],['polyrhythm','Polyrythmie',nativeMode.querySelector('[data-mode="polyrhythm"] svg').outerHTML],['training','Entraînement',trainIcon],['sequence','Séquenceur',multiTabs.querySelector('button:first-child svg').outerHTML],['multi','Multipiste',multiTabs.querySelector('button:last-child svg').outerHTML],['tracks','Track',document.querySelector('.song-tabs [data-pane="songs"] svg')?.outerHTML||'<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/></svg>']];
 let page='metronome',changing=false;try{const stored=localStorage.getItem('renax.workspace.v1');if(items.some(i=>i[0]===stored))page=stored;}catch{}
 const buttons=new Map();
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
 add.onclick=()=>{if(playbackStarting||appMode!=='metronome'||window.RENAX_MULTI?.active||measures.length>=8)return;stopMetronome();measureCountSel.value=String(measures.length+1);measureCountSel.dispatchEvent(new Event('change',{bubbles:true}));activeMeasureIndex=measures.length-1;renderSequencerList();renderActiveMeasure();syncAdd();};
 measureCountSel.addEventListener('change',syncAdd);new MutationObserver(syncAdd).observe(playBtn,{attributes:true,attributeFilter:['disabled','class']});syncAdd();
 function place(){const group=document.querySelector('.visu-bottom');if(group&&group.parentNode!==footer)footer.insertBefore(group,footer.querySelector('.footer-right'));
  if(trainingSection&&trainingSection.parentNode!==trainHost)trainHost.append(trainingSection);
  const target=!desktop.matches&&page==='training'&&document.body.dataset.mobilePane==='training'?trainPanel:visu;
  if(desktop.matches){const toolbar=visu.querySelector('.visu-toolbar');if(controls.parentNode!==toolbar)toolbar.insertBefore(controls,document.getElementById('trainTimer'));}
  else if(controls.parentNode!==target){if(target===visu)visu.querySelector('.visu-toolbar').after(controls);else trainPanel.querySelector('.panel-title').after(controls);}
  if(page==='training'){if(silent.parentNode!==trainPanel||trainPanel.querySelector('.panel-title').nextElementSibling!==silent)trainPanel.querySelector('.panel-title').after(silent);}else if(silent.parentNode!==silentHome.parentNode)silentHome.after(silent);
 }
 function sync(){if(changing)return;if(window.RENAX_MULTI?.active)page='multi';else if(!document.getElementById('songsRoot').hidden)page='tracks';else if(appMode==='polyrhythm')page='polyrhythm';else if(!['metronome','sequence','training'].includes(page))page='sequence';document.body.dataset.workspace=page;
  for(const [id,b] of buttons){const selected=id===page;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}try{localStorage.setItem('renax.workspace.v1',page);}catch{}place();
 }
 function go(next){changing=true;try{
  if(next==='tracks'){if(appMode!=='metronome')nativeMode.querySelector('[data-mode="metronome"]').click();songTabs.querySelector('[data-pane="songs"]').click();}
  else{if(window.RENAX_MULTI?.active&&next!=='multi')multiTabs.querySelector('button:first-child').click();
   if(!document.getElementById('songsRoot').hidden)songTabs.querySelector('[data-pane="sequence"]').click();
   if(next==='multi'){if(!window.RENAX_MULTI?.active)multiTabs.querySelector('button:last-child').click();}
   else if(appMode!==(next==='polyrhythm'?'polyrhythm':'metronome'))nativeMode.querySelector('[data-mode="'+(next==='polyrhythm'?'polyrhythm':'metronome')+'"]').click();
  }page=next;controls.open=desktop.matches||next==='metronome';
  if(!desktop.matches)switchTab(next==='training'?'training':['sequence','multi','tracks'].includes(next)?'seq':'visu');
 }finally{changing=false;sync();requestAnimationFrame(()=>{resizeCanvas();updateRingRadius();});}}
 const observer=new MutationObserver(sync);observer.observe(songTabs,{subtree:true,attributes:true,attributeFilter:['aria-selected']});observer.observe(multiTabs,{subtree:true,attributes:true,attributeFilter:['aria-selected']});observer.observe(nativeMode,{subtree:true,attributes:true,attributeFilter:['class']});
 new MutationObserver(place).observe(visu,{childList:true});window.addEventListener('resize',place);desktop.addEventListener('change',()=>{controls.open=desktop.matches||page==='metronome';place();if(!desktop.matches)switchTab(page==='training'?'training':['sequence','multi','tracks'].includes(page)?'seq':'visu');requestAnimationFrame(()=>{resizeCanvas();updateRingRadius();});});
 controls.addEventListener('toggle',()=>requestAnimationFrame(()=>{resizeCanvas();updateRingRadius();}));
 const start=page;if(!document.getElementById('songsRoot').hidden){sync();if(!desktop.matches)switchTab('seq');}else go(start);window.addEventListener('load',()=>{sync();place();});
})();
