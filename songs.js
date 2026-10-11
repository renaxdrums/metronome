// Local song library. Storage is scoped to this browser origin; exports are portable.
(() => {
  const KEY='renax-drums-songs-v1';
  const id=()=>crypto.randomUUID();
  const clone=value=>JSON.parse(JSON.stringify(value));
  const blankSection=()=>({id:id(),label:'Couplet 1',count:4,measure:createMeasure(4,4,120)});
  const blankSong=()=>({id:id(),name:'Nouveau morceau',sections:[blankSection()]});
  const defaultLibrary=()=>({version:1,activeProfile:null,profiles:[{id:id(),name:'Mon profil',songs:[]}]});
  let library,selectedSong=null,loaded=null,endTimer=null,songView='home',openSectionId=null,storageStatus='Enregistrement automatique';
  try { library=JSON.parse(localStorage.getItem(KEY))||defaultLibrary();validateLibrary(library); }
  catch { library=defaultLibrary(); }
  if(!library.profiles.some(p=>p.id===library.activeProfile))library.activeProfile=library.profiles[0].id;
  function validateLibrary(data) {
    if(data.version!==1||!Array.isArray(data.profiles)||!data.profiles.length)throw Error('Format de bibliothèque incorrect.');
    const ids=new Set();
    for(const p of data.profiles) {
      if(typeof p.id!=='string'||ids.has(p.id)||typeof p.name!=='string'||!Array.isArray(p.songs))throw Error('Profil incorrect.');ids.add(p.id);
      for(const song of p.songs) {
        if(typeof song.id!=='string'||typeof song.name!=='string'||!Array.isArray(song.sections)||!song.sections.length)throw Error('Morceau incorrect.');
        let total=0;
        for(const section of song.sections) {
          const m=section.measure;
          if(typeof section.label!=='string'||!Number.isSafeInteger(section.count)||section.count<1||!m||!Number.isInteger(m.numerator)||m.numerator<1||m.numerator>20||![2,4,8,16,32].includes(m.denominator)||!Number.isFinite(m.tempo)||m.tempo<2||m.tempo>999)throw Error('Section incorrecte.');
          if(!Array.isArray(m.beatSubdivisions)||m.beatSubdivisions.length!==m.numerator||!Array.isArray(m.beatStates)||m.beatStates.length!==m.numerator)throw Error('Subdivisions incorrectes.');
          m.beatSubdivisions.forEach((n,b)=>{if(!allowedSubdivisions(m.denominator).includes(n)||!Array.isArray(m.beatStates[b])||m.beatStates[b].length!==n||m.beatStates[b].some(s=>![0,1,2,3].includes(s)))throw Error('Clic incorrect.');});
          total+=section.count;if(!Number.isSafeInteger(total))throw Error('Nombre de mesures trop grand.');
        }
      }
    }
  }
  const panel=document.querySelector('.panel-seq');
  const sequencePane=document.createElement('div');sequencePane.id='sequencePane';
  while(panel.firstChild)sequencePane.appendChild(panel.firstChild);
  const tabs=document.createElement('div');tabs.className='song-tabs';tabs.setAttribute('role','tablist');
  const songPane=document.createElement('div');songPane.id='songPane';songPane.hidden=true;
  const profilePane=document.createElement('div');profilePane.id='profilePane';profilePane.hidden=true;
  const songsHome=document.createElement('div');songsHome.id='songsHome';
  const songsRoot=document.createElement('div');songsRoot.id='songsRoot';songsRoot.hidden=true;
  songsRoot.append(songsHome,profilePane,songPane);panel.append(tabs,sequencePane,songsRoot);
  function tab(name) {songsRoot.hidden=name!=='songs';sequencePane.hidden=name!=='sequence';tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.pane===name)));if(name==='sequence')unload();else selectOpenBlock();syncSongTransport();panel.scrollTop=0;}
  for(const [name,title] of [['sequence','Séquenceur'],['songs','Morceaux']]) {const b=document.createElement('button');b.textContent=title;b.dataset.pane=name;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(name==='sequence'));b.onclick=()=>tab(name);tabs.append(b);}
  function navigate(view){if(view==='home'||view==='playlist'){unload();selectedSong=null;}songView=view;render();panel.scrollTop=0;}
  function el(tag,text,parent,cls) {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;if(parent)parent.append(e);return e;}
  function button(text,parent,fn) {const b=el('button',text,parent,'btn');b.type='button';b.onclick=fn;return b;}
  function field(text,parent,value,change,options) {const label=el('label',text,parent),input=el(options?'select':'input',undefined,label);if(options)for(const v of options){const o=el('option',String(v),input);o.value=v;}else input.type=typeof value==='number'?'number':'text';input.setAttribute('aria-label',text);input.value=value;input.onchange=()=>change(input.value,input);return input;}
  function songNumbox(label,parent,value,commit,values){
    const options=[...new Set([...values,value])].sort((a,b)=>a-b);
    const select=field(label,parent,value,(raw,control)=>{
      if(raw==='custom'){
        const entry=prompt(label+' : saisir une valeur',String(value));
        if(entry===null){control.value=String(value);syncNumbox(control);return;}
        raw=entry;
      }
      commit(raw,control);
      syncNumbox(control);
    },options);
    const custom=el('option','Autre…',select);custom.value='custom';
    const row=select.parentElement;row.className='song-inline-field';
    enhanceNumboxSelect(select);
    row.querySelector('.numbox-button').setAttribute('aria-label',label+' : '+value);
    return select;
  }
  function profile(){return library.profiles.find(p=>p.id===library.activeProfile);}
  function song(){return profile().songs.find(s=>s.id===selectedSong);}
  function status(message){storageStatus=message;const e=document.getElementById('songStatus');if(e)e.textContent=message;}
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(library));status('Enregistré dans ce navigateur.');return true;}catch{status('Sauvegarde impossible : exporte ta bibliothèque.');return false;}}
  function changed(){unload();resetCustomizationTimer();persist();render();}
  function unload(){if(!loaded)return;stopMetronome();clearTimeout(endTimer);const previous=loaded.previous;loaded=null;measures=previous;metronomeMeasures=previous;activeMeasureIndex=0;playingMeasureIndex=0;currentStepInMeasure=0;measureCountSel.value=String(measures.length);renderSequencerList();renderActiveMeasure();updatePosition();}
  function locate(index){let start=0;for(let i=0;i<loaded.song.sections.length;i++){const s=loaded.song.sections[i];if(index<start+s.count)return {section:s,index:i,start,bar:index-start+1};start+=s.count;}return null;}
  function loadSong(){const s=song();if(!s)return;unload();stopMetronome();endTraining();if(appMode!=='metronome')setAppMode('metronome');setSilentMode(false);resetCustomizationTimer();const previous=metronomeMeasures;const snapshot=clone(s);loaded={song:snapshot,previous,total:snapshot.sections.reduce((n,s)=>n+s.count,0)};
    // Repeat section templates lazily: no array of every bar and no eight-bar limit.
    measures=new Proxy([], {get(target,key){if(key==='length')return loaded.total;if(key==='indexOf')return m=>{if(locate(activeMeasureIndex)?.section.measure===m)return activeMeasureIndex;let n=0;for(const s of loaded.song.sections){if(s.measure===m)return n;n+=s.count;}return -1;};if(typeof key==='string'&&/^\d+$/.test(key))return locate(Number(key))?.section.measure;return Reflect.get(target,key);}});
    metronomeMeasures=measures;activeMeasureIndex=0;playingMeasureIndex=0;currentStepInMeasure=0;renderSequencerList();renderActiveMeasure();updatePosition();
  }
  window.songAtEnd=()=>{if(!loaded||playingMeasureIndex!==0||currentStepInMeasure!==0)return false;clearTimeout(endTimer);endTimer=setTimeout(()=>{stopMetronome();status('Morceau terminé.');},Math.max(0,(nextNoteTime-audioCtx.currentTime)*1000));return true;};
  function syncSongTransport(){
    const songContext=!!(loaded||(!songsRoot.hidden&&songView==='detail'&&song()));
    playBtn.dataset.songTransport=String(songContext);
    if(!isPlaying)playBtn.textContent=songContext?'Lire le morceau':'Start';
  }
  const originalStart=startMetronome;startMetronome=function(){
    if(!isPlaying&&!loaded&&!songsRoot.hidden&&songView==='detail'&&song())loadSong();
    return originalStart();
  };
  const originalStop=stopMetronome;stopMetronome=function(){clearTimeout(endTimer);const result=originalStop();syncSongTransport();return result;};
  const originalMode=setAppMode;setAppMode=function(mode){unload();return originalMode(mode);};
  panicBtn.addEventListener('click',unload,true);
  function updatePosition(){
    const cards=songPane.querySelectorAll('.song-section');
    if(!loaded){cards.forEach(card=>card.classList.remove('active','playing'));return;}
    const position=locate(activeMeasureIndex);if(!position)return;
    cards.forEach((card,index)=>{card.classList.toggle('playing',isPlaying&&index===position.index);card.classList.toggle('active',index===position.index);});refreshSongCards();
  }

  const originalRender=renderSequencerList;renderSequencerList=function(){if(!loaded)return originalRender();measureListEl.replaceChildren();el('p','Morceau chargé : '+loaded.song.name,measureListEl,'song-note');};
  function setSectionOpen(sectionId){
    openSectionId=sectionId;
    songPane.querySelectorAll('[data-section-id]').forEach(card=>{
      const expanded=card.dataset.sectionId===sectionId;
      card.classList.toggle('collapsed',!expanded);
      card.querySelector('.song-block-header').setAttribute('aria-expanded',String(expanded));
    });
  }
  function selectOpenBlock(){
    const current=song();if(isPlaying||songsRoot.hidden||songView!=='detail'||!current)return;
    const index=current.sections.findIndex(section=>section.id===openSectionId);if(index<0)return;
    if(loaded&&loaded.song.id===current.id&&locate(activeMeasureIndex)?.section.id===openSectionId)return;
    loadSong();activeMeasureIndex=current.sections.slice(0,index).reduce((n,section)=>n+section.count,0);renderActiveMeasure();
  }
  function refreshSongCards(){
    const current=song();if(!current)return;
    songPane.querySelectorAll('[data-section-id]').forEach(card=>{
      const section=current.sections.find(s=>s.id===card.dataset.sectionId);if(!section)return;
      card.querySelector('.measure-sig').textContent=section.measure.numerator+'/'+section.measure.denominator;
      card.querySelector('.song-block-summary').textContent=section.count+' mesures · '+section.measure.numerator+'/'+section.measure.denominator+' · '+section.measure.tempo+' BPM';
      const preview=card.querySelector('.measure-preview');preview.replaceChildren();
      for(const states of section.measure.beatStates){const group=el('div',undefined,preview,'preview-beat');for(const state of states)el('span',undefined,group,'preview-dot').dataset.state=state;}
      const bpm=card.querySelector('select[aria-label="Tempo (BPM)"]');if(document.activeElement!==bpm){if(![...bpm.options].some(o=>Number(o.value)===section.measure.tempo)){const option=el('option',String(section.measure.tempo),bpm);option.value=section.measure.tempo;numboxWidgets.get(bpm)?.rebuild();}bpm.value=section.measure.tempo;syncNumbox(bpm);bpm.closest('.numbox-custom').querySelector('.numbox-button').setAttribute('aria-label','Tempo (BPM) : '+section.measure.tempo);}
    });
  }
  document.addEventListener('input',e=>{if(loaded&&e.target.matches('#bpmSlider,.measure-tempo-input'))queueMicrotask(()=>{saveLoadedPattern();refreshSongCards();});});
  function saveLoadedPattern(){
    if(!loaded)return;
    const source=profile().songs.find(s=>s.id===loaded.song.id),position=locate(activeMeasureIndex);
    const section=source?.sections.find(s=>s.id===position?.section.id);
    if(section&&JSON.stringify(section.measure)!==JSON.stringify(position.section.measure)){section.measure=clone(position.section.measure);persist();}
  }
  const originalPreviews=refreshMeasurePreviews;refreshMeasurePreviews=function(){originalPreviews();saveLoadedPattern();refreshSongCards();};
  const originalActive=renderActiveMeasure;renderActiveMeasure=function(){originalActive();saveLoadedPattern();updatePosition();};
  let suppressSongClickUntil=0;
  songPane.addEventListener('click',e=>{if(performance.now()<suppressSongClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
  function enableSongDrag(row,item,p){
    row.dataset.songId=item.id;
    let gesture=null,holdTimer=null,scrollFrame=null;
    function clearMarks(){songPane.querySelectorAll('.drop-before,.drop-after').forEach(e=>e.classList.remove('drop-before','drop-after'));}
    function markDrop(){
      clearMarks();if(!gesture)return;
      const rect=panel.getBoundingClientRect();gesture.valid=gesture.x>=rect.left&&gesture.x<=rect.right;
      const others=[...songPane.querySelectorAll('.song-playlist-card')].filter(e=>e!==row);
      const before=others.findIndex(e=>{const r=e.getBoundingClientRect();return gesture.y<r.top+r.height/2;});
      gesture.index=before<0?others.length:before;
      const target=others[gesture.index]||others.at(-1);
      if(target&&gesture.valid)target.classList.add(before<0?'drop-after':'drop-before');
    }
    function autoScroll(){
      if(!gesture?.active)return;
      const rect=panel.getBoundingClientRect(),speed=gesture.y<rect.top+28?-9:gesture.y>rect.bottom-28?9:0;
      if(speed){panel.scrollTop+=speed;markDrop();}
      scrollFrame=requestAnimationFrame(autoScroll);
    }
    function activate(){if(!gesture||gesture.scrolling)return;gesture.active=true;clearTimeout(holdTimer);row.classList.add('dragging');row.setPointerCapture(gesture.id);markDrop();scrollFrame=requestAnimationFrame(autoScroll);}
    row.addEventListener('pointerdown',e=>{
      if(e.button!==0||!e.isPrimary)return;
      gesture={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,scrollTop:panel.scrollTop,active:false,scrolling:false,index:0,valid:false};
      holdTimer=setTimeout(activate,250);
    });
    row.addEventListener('pointermove',e=>{
      if(!gesture||gesture.id!==e.pointerId)return;gesture.x=e.clientX;gesture.y=e.clientY;
      const moved=Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>8;
      if(!gesture.active&&moved){if(e.pointerType==='touch'){gesture.scrolling=true;clearTimeout(holdTimer);}else activate();}
      if(gesture.scrolling){panel.scrollTop=gesture.scrollTop+gesture.startY-e.clientY;e.preventDefault();return;}
      if(gesture.active){e.preventDefault();markDrop();}
    });
    function finish(e,cancelled=false){
      if(!gesture||gesture.id!==e.pointerId)return;
      clearTimeout(holdTimer);cancelAnimationFrame(scrollFrame);row.classList.remove('dragging');clearMarks();
      const done=gesture;gesture=null;
      if(done.active||done.scrolling)suppressSongClickUntil=performance.now()+150;
      if(row.hasPointerCapture(e.pointerId))row.releasePointerCapture(e.pointerId);
      if(done.active&&done.valid&&!cancelled){const previous=p.songs.indexOf(item);p.songs.splice(previous,1);p.songs.splice(done.index,0,item);persist();render();}
    }
    row.addEventListener('pointerup',e=>finish(e));row.addEventListener('pointercancel',e=>finish(e,true));row.addEventListener('lostpointercapture',e=>finish(e,true));
  }
  function render(){songPane.replaceChildren();profilePane.replaceChildren();songsHome.replaceChildren();
    songsHome.hidden=songView!=='home';profilePane.hidden=songView!=='profile';songPane.hidden=!['playlist','detail'].includes(songView);
    button('Profil',songsHome,()=>navigate('profile')).classList.add('song-entry');
    button('Playlist',songsHome,()=>navigate('playlist')).classList.add('song-entry');
    const backProfile=button('←',profilePane,()=>navigate('home'));backProfile.classList.add('song-back');backProfile.setAttribute('aria-label','Retour aux morceaux');
    const backSong=button('←',songPane,()=>navigate(songView==='detail'?'playlist':'home'));backSong.classList.add('song-back');backSong.setAttribute('aria-label',songView==='detail'?'Retour à la playlist':'Retour aux morceaux');
const p=profile();if(!p.songs.some(s=>s.id===selectedSong))selectedSong=null;
    const profileSelect=field('Profil local',profilePane,p.id,value=>{unload();library.activeProfile=value;selectedSong=null;songView=songView==='detail'?'playlist':songView;persist();render();},[]);for(const item of library.profiles){const o=el('option',item.name,profileSelect);o.value=item.id;}profileSelect.value=p.id;
    const profiles=el('div',undefined,profilePane,'song-actions');button('Nouveau profil',profiles,()=>{const name=prompt('Nom du profil');if(!name?.trim())return;unload();const p={id:id(),name:name.trim(),songs:[]};library.profiles.push(p);library.activeProfile=p.id;selectedSong=null;persist();render();});button('Renommer',profiles,()=>{const name=prompt('Nom du profil',p.name);if(name?.trim()){p.name=name.trim();persist();render();}});
    const actions=el('div',undefined,songPane,'song-actions');
    const s=song();
    if(!s){
      el('strong','Playlist',songPane);button('Nouveau morceau',actions,()=>{unload();const s=blankSong();p.songs.push(s);selectedSong=s.id;openSectionId=s.sections[0].id;songView='detail';persist();render();panel.scrollTop=0;});
      if(!p.songs.length)el('p','Crée ton premier morceau pour construire sa structure.',songPane,'song-note');
      for(const item of p.songs){
        const row=el('div',undefined,songPane,'song-section measure-card song-playlist-card');enableSongDrag(row,item,p);
        const openSong=()=>{selectedSong=item.id;openSectionId=item.sections[0].id;songView='detail';render();panel.scrollTop=0;};
        row.tabIndex=0;row.setAttribute('aria-label','Ouvrir '+item.name);
        row.addEventListener('click',e=>{if(!e.target.closest('.song-open'))openSong();});
        row.addEventListener('keydown',e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();openSong();}});
        const open=button('',row,openSong);open.className='song-open measure-head';open.setAttribute('aria-label',item.name);
        el('span',item.name,open,'measure-num');
        const meters=[...new Set(item.sections.map(s=>s.measure.numerator+'/'+s.measure.denominator))];
        const signature=el('span',meters.length===1?meters[0]:'Mixte',open,'measure-sig');signature.title=meters.join(' · ');
        const tempos=item.sections.map(s=>s.measure.tempo),min=Math.min(...tempos),max=Math.max(...tempos);
        const tempoRow=el('div',undefined,row,'measure-tempo-row');el('span','TEMPO',tempoRow,'measure-tempo-label');el('span',min===max?String(min):min+'–'+max,tempoRow,'song-tempo-value');el('span','BPM',tempoRow,'measure-tempo-unit');
        el('p',item.sections.length+' sections · '+item.sections.reduce((n,s)=>n+s.count,0)+' mesures',row,'song-playlist-summary');
        const preview=el('div',undefined,row,'measure-preview');preview.title='Début du morceau';for(const states of item.sections[0].measure.beatStates){const group=el('div',undefined,preview,'preview-beat');for(const state of states)el('span',undefined,group,'preview-dot').dataset.state=state;}

      }
    }
    if(s){
      if(openSectionId!==null&&!s.sections.some(section=>section.id===openSectionId))openSectionId=s.sections[0].id;
      button('Dupliquer',actions,()=>{const copy=clone(s);copy.id=id();copy.name+=' (copie)';p.songs.push(copy);selectedSong=copy.id;changed();});button('Supprimer',actions,()=>{if(!confirm('Supprimer « '+s.name+' » ?'))return;unload();p.songs=p.songs.filter(x=>x!==s);selectedSong=null;persist();render();});
      field('Titre du morceau',songPane,s.name,value=>{s.name=value.trim()||'Sans titre';changed();});
      el('p','Sélectionne un bloc pour le régler dans le métronome.',songPane,'song-note');
      el('p',s.sections.reduce((n,s)=>n+s.count,0)+' mesures · arrêt à la fin du morceau',songPane,'song-note');
      s.sections.forEach((section,i)=>{const card=el('div',undefined,songPane,'song-section measure-card');card.dataset.sectionId=section.id;card.tabIndex=0;card.setAttribute('role','group');
        const head=el('button',undefined,card,'measure-head song-block-header');head.type='button';
        const title=el('span',section.label||'Bloc '+(i+1),head,'measure-num');
        el('span',section.measure.numerator+'/'+section.measure.denominator,head,'measure-sig');
        const summary=el('div',section.count+' mesures · '+section.measure.numerator+'/'+section.measure.denominator+' · '+section.measure.tempo+' BPM',card,'song-block-summary');
        const body=el('div',undefined,card,'song-block-body');body.id='song-block-'+section.id;head.setAttribute('aria-controls',body.id);
        const choose=(showVisualizer=true)=>{setSectionOpen(section.id);loadSong();activeMeasureIndex=s.sections.slice(0,i).reduce((n,s)=>n+s.count,0);renderActiveMeasure();if(showVisualizer&&window.innerWidth<=1100)switchTab('visu');};
        head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')e.stopPropagation();});
        head.addEventListener('click',e=>{e.stopPropagation();if(openSectionId===section.id)setSectionOpen(null);else choose(false);});
        card.addEventListener('click',e=>{if(!e.target.closest('input,select,button,label')){if(openSectionId===section.id)setSectionOpen(null);else choose(false);}});card.addEventListener('keydown',e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();choose();}});
        const label=field('Libellé',body,section.label,value=>{section.label=value.trim()||'Section '+(i+1);changed();});label.setAttribute('list','songLabels');label.addEventListener('input',()=>{title.textContent=label.value.trim()||'Bloc '+(i+1);});
        const fields=el('div',undefined,body,'song-block-controls');const count=songNumbox('Mesures',fields,section.count,(value,input)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1){input.value=section.count;return;}const total=s.sections.reduce((n,x)=>n+(x===section?0:x.count),0)+n;if(!Number.isSafeInteger(total)){input.value=section.count;return;}section.count=n;changed();},Array.from({length:64},(_,i)=>i+1));
        const bpm=songNumbox('Tempo (BPM)',fields,section.measure.tempo,(v,input)=>{const n=Number(v);if(!Number.isFinite(n)||n<2||n>999){input.value=section.measure.tempo;return;}section.measure.tempo=n;changed();},Array.from({length:998},(_,i)=>i+2));const bpmRow=bpm.closest('label');bpmRow.firstChild.textContent='Tempo';el('span','BPM',bpmRow,'measure-tempo-unit');
        const preview=el('div',undefined,body,'measure-preview');
        for(let b=0;b<section.measure.numerator;b++){const group=el('div',undefined,preview,'preview-beat');for(const state of section.measure.beatStates[b])el('span',undefined,group,'preview-dot').dataset.state=state;}
        const controls=el('div',undefined,body,'song-actions');if(s.sections.length>1)button('Supprimer',controls,()=>{s.sections.splice(i,1);changed();});
      });button('+ Ajouter une section',songPane,()=>{const section=blankSection();s.sections.push(section);openSectionId=section.id;changed();});
    }
    const labels=el('datalist',undefined,songPane);labels.id='songLabels';for(const name of ['Intro','Couplet 1','Couplet 2','Refrain 1','Refrain 2','Bridge','Solo','Outro'])el('option',name,labels).value=name;
    el('strong','Sauvegarde de la bibliothèque',profilePane);
    const transfers=el('div',undefined,profilePane,'song-actions');button('Exporter',transfers,()=>{const blob=new Blob([JSON.stringify(library,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='renax-morceaux.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});const importer=el('input',undefined,profilePane);importer.type='file';importer.accept='.json,application/json';importer.hidden=true;button('Importer',transfers,()=>importer.click());importer.onchange=async()=>{try{const data=JSON.parse(await importer.files[0].text());validateLibrary(data);unload();for(const imported of data.profiles){const p=clone(imported);p.id=id();p.name+=' (importé)';p.songs.forEach(s=>s.id=id());library.profiles.push(p);}library.activeProfile=library.profiles.at(-1).id;selectedSong=null;persist();render();status('Bibliothèque importée sans remplacer les morceaux existants.');}catch(e){status('Import refusé : '+e.message);}};
    el('p','Profils et morceaux conservés dans ce navigateur. Exporte une copie pour les transférer ou les sauvegarder.',profilePane,'song-note');el('div',storageStatus,profilePane).id='songStatus';setSectionOpen(openSectionId);selectOpenBlock();updatePosition();syncSongTransport();
  }
  // Song playback uses a snapshot; editing the saved arrangement stops its playback.
  // Keep ordinary sequencer and polyrhythm behavior untouched when no song is loaded.
  render();
  window.RENAX_SONGS={validateLibrary,loadSong,unload,locate,get library(){return library;},get loaded(){return loaded;}};
})();
