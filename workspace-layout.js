/* Presentation only: reuse the existing mode, song and multitrack controls. */
(()=>{
 const nativeMode=document.getElementById('modeSwitch'),songTabs=document.querySelector('.song-tabs'),multiTabs=document.querySelector('.multi-mode-tabs'),visu=document.querySelector('.panel-visu'),footer=document.querySelector('footer');
 const nav=document.createElement('nav');nav.id='workspaceNav';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Espaces de travail');
 const items=[['metronome','Métronome',nativeMode.querySelector('[data-mode="metronome"] svg').outerHTML],['polyrhythm','Polyrythmie',nativeMode.querySelector('[data-mode="polyrhythm"] svg').outerHTML],['sequence','Séquenceur',multiTabs.querySelector('button:first-child svg').outerHTML],['multi','Multipiste',multiTabs.querySelector('button:last-child svg').outerHTML],['tracks','Track',document.querySelector('.song-tabs [data-pane="songs"] svg')?.outerHTML||'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/></svg>']];
 let page='metronome',changing=false;try{const stored=localStorage.getItem('renax.workspace.v1');if(items.some(i=>i[0]===stored))page=stored;}catch{}
 const buttons=new Map();
 for(const [id,label,icon] of items){const b=document.createElement('button');b.type='button';b.dataset.workspace=id;b.setAttribute('role','tab');b.setAttribute('aria-controls',id==='tracks'?'songsRoot':id==='sequence'||id==='multi'?'sequencePane':'sequencerContainer');b.innerHTML=icon+'<span>'+label+'</span>';b.onclick=()=>go(id);nav.append(b);buttons.set(id,b);}
 document.querySelector('header').after(nav);
 const countRow=document.getElementById('measureCount').closest('.seq-count-row');countRow.classList.add('sequence-count-row');
 const add=document.createElement('button');add.id='sequenceAddMeasure';add.type='button';add.className='multi-add sequence-add';add.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Nouvelle mesure</span>';
 countRow.before(add);
 function syncAdd(){add.disabled=playbackStarting||measures.length>=8;}
 add.onclick=()=>{if(playbackStarting||appMode!=='metronome'||window.RENAX_MULTI?.active||measures.length>=8)return;stopMetronome();measureCountSel.value=String(measures.length+1);measureCountSel.dispatchEvent(new Event('change',{bubbles:true}));activeMeasureIndex=measures.length-1;renderSequencerList();renderActiveMeasure();syncAdd();};
 measureCountSel.addEventListener('change',syncAdd);new MutationObserver(syncAdd).observe(playBtn,{attributes:true,attributeFilter:['disabled','class']});syncAdd();
 const home=document.createElement('button');home.id='workspaceHome';home.type='button';home.setAttribute('aria-label','Retour au métronome');home.title='Retour au métronome';home.innerHTML=items[0][2];home.onclick=()=>go('metronome');footer.querySelector('.footer-left').append(home);
 const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='workspace-layout.css?v=20261012-workspaces2';document.head.append(sheet);
 const desktop=matchMedia('(min-width:1101px)');
 function placeTransport(){const group=document.querySelector('.visu-bottom');if(desktop.matches&&group&&group.parentNode!==footer)footer.insertBefore(group,footer.querySelector('.footer-right'));}
 function sync(){if(changing)return;if(window.RENAX_MULTI?.active)page='multi';else if(!document.getElementById('songsRoot').hidden)page='tracks';else if(appMode==='polyrhythm')page='polyrhythm';else if(page!=='metronome'&&page!=='sequence')page='sequence';document.body.dataset.workspace=page;
 for(const [id,b] of buttons)b.setAttribute('aria-selected',String(id===page));try{localStorage.setItem('renax.workspace.v1',page);}catch{}placeTransport();}
 function go(next){changing=true;try{
  if(next==='tracks'){if(appMode!=='metronome')nativeMode.querySelector('[data-mode="metronome"]').click();songTabs.querySelector('[data-pane="songs"]').click();}
  else{
   if(window.RENAX_MULTI?.active&&next!=='multi')multiTabs.querySelector('button:first-child').click();
   if(!document.getElementById('songsRoot').hidden)songTabs.querySelector('[data-pane="sequence"]').click();
   if(next==='multi'){if(!window.RENAX_MULTI?.active)multiTabs.querySelector('button:last-child').click();}
   else if(appMode!==(next==='polyrhythm'?'polyrhythm':'metronome'))nativeMode.querySelector('[data-mode="'+(next==='polyrhythm'?'polyrhythm':'metronome')+'"]').click();
  }
  page=next;
 }finally{changing=false;sync();requestAnimationFrame(()=>{resizeCanvas();updateRingRadius();});}}
 const observer=new MutationObserver(sync);observer.observe(songTabs,{subtree:true,attributes:true,attributeFilter:['aria-selected']});observer.observe(multiTabs,{subtree:true,attributes:true,attributeFilter:['aria-selected']});observer.observe(nativeMode,{subtree:true,attributes:true,attributeFilter:['class']});
 new MutationObserver(placeTransport).observe(visu,{childList:true});desktop.addEventListener('change',()=>{placeTransport();requestAnimationFrame(()=>{resizeCanvas();updateRingRadius();});});
 const start=page;if(!document.getElementById('songsRoot').hidden)sync();else go(start);window.addEventListener('load',()=>{sync();placeTransport();});
})();