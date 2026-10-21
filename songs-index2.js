// Local song library. Storage is scoped to this browser origin; exports are portable.
(() => {
  const id=()=>crypto.randomUUID();
  const clone=value=>JSON.parse(JSON.stringify(value));
  const collapsedCountIns=new Set();
  const countInBars=song=>song.countIn?.count||0;
  function playbackSections(song){
    if(!song.countIn)return song.sections;
    const c=song.countIn,m=createMeasure(c.numerator,c.denominator,song.sections[0].measure.tempo);
    m.countIn=true;m.beatSubdivisions=Array(c.numerator).fill(1);m.beatStates=Array.from({length:c.numerator},()=>[1]);
    return [{id:'count-in:'+song.id,label:'Décompte',count:c.count,measure:m},...song.sections];
  }
  function durationText(song){const seconds=Math.round(playbackSections(song).reduce((total,section)=>total+RENAX_SONG_TEMPO.duration(section),0));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
  const tempoDescription=section=>RENAX_SONG_TEMPO.active(section)?section.measure.tempo+' → '+section.tempoRamp.endTempo:String(section.measure.tempo);
  const blankSection=()=>({id:id(),label:'Couplet 1',count:4,measure:createMeasure(4,4,120)});
  const blankSong=()=>({id:id(),name:'Nouveau track',sections:[blankSection()]});
  const defaultLibrary=()=>({version:1,activeProfile:null,profiles:[{id:id(),name:'Mon profil',songs:[]}]});
  let persistTimer=null,persistFailed=false,songReloadDepth=0;
  let library,selectedSong=null,loaded=null,endTimer=null,songView='home',openSectionId=null,storageStatus='Enregistrement automatique';
  // Session-only preferences, not part of the saved library.
  let lastTrackSelection=null;
  const chainedPlaylists=new Set();
  try { library=JSON.parse(RENAX_STORAGE.read())||defaultLibrary();validateLibrary(library); }
  catch (_error) { RENAX_STORAGE.markCorrupt();library=defaultLibrary();storageStatus='Sauvegarde locale illisible : la source a été conservée. Exportez vos données avant de continuer.'; }
  if(!library.profiles.some(p=>p.id===library.activeProfile))library.activeProfile=library.profiles[0].id;
  function validateLibrary(data) {
    if(data.version!==1||!Array.isArray(data.profiles)||!data.profiles.length)throw Error('Format de bibliothèque incorrect.');
    const ids=new Set();
    for(const p of data.profiles) {
      if(typeof p.id!=='string'||ids.has(p.id)||typeof p.name!=='string'||!Array.isArray(p.songs))throw Error('Profil incorrect.');ids.add(p.id);
      const songIds=new Set();
      for(const song of p.songs) {
        if(typeof song.id!=='string'||typeof song.name!=='string'||!Array.isArray(song.sections)||!song.sections.length)throw Error('Morceau incorrect.');
        if(songIds.has(song.id))throw Error('Identifiant de morceau dupliqué.');songIds.add(song.id);
        const sectionIds=new Set();
        for(const language of [song.amorceDefaultLanguage,...song.sections.map(section=>section.amorceLanguage)])if(language!==undefined&&!['fr','en'].includes(language))throw Error('Langue du guide vocal incorrecte.');
        if(song.countIn){const c=song.countIn;if(!Number.isSafeInteger(c.count)||c.count<1||!Number.isInteger(c.numerator)||c.numerator<1||c.numerator>20||![2,4,8,16,32].includes(c.denominator))throw Error('Décompte incorrect.');}
        let total=countInBars(song);
        for(const section of song.sections) {
          if(typeof section.id!=='string'||sectionIds.has(section.id))throw Error('Identifiant de section incorrect ou dupliqué.');sectionIds.add(section.id);
          const m=section.measure;
          if(typeof section.label!=='string'||!Number.isSafeInteger(section.count)||section.count<1||!m||!Number.isInteger(m.numerator)||m.numerator<1||m.numerator>20||![2,4,8,16,32].includes(m.denominator)||!Number.isFinite(m.tempo)||m.tempo<2||m.tempo>999)throw Error('Section incorrecte.');
          if(section.tempoRamp?.enabled&&(!Number.isFinite(section.tempoRamp.endTempo)||section.tempoRamp.endTempo<=m.tempo||section.tempoRamp.endTempo>999))throw Error('Accélération du bloc incorrecte.');
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
  function tab(name) {if(name==='songs'&&songsRoot.hidden)stopMetronome();songsRoot.hidden=name!=='songs';sequencePane.hidden=name!=='sequence';tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.pane===name)));if(name==='sequence')unload();else selectOpenBlock();syncSongTransport();panel.scrollTop=0;}
  for(const [name,title] of [['sequence','Séquenceur'],['songs','Tracks']]) {const b=document.createElement('button');b.textContent=title;b.dataset.pane=name;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(name==='sequence'));b.onclick=()=>tab(name);tabs.append(b);}
  function navigate(view){if(view==='home'||view==='playlists'||view==='playlist'){unload();selectedSong=view==='playlist'&&lastTrackSelection?.playlistId===profile().id?lastTrackSelection.songId:null;}songView=view;render();panel.scrollTop=0;}
  function el(tag,text,parent,cls) {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;if(parent)parent.append(e);return e;}
  function splitTitle(parent,white,orange){parent.replaceChildren();el('span',white,parent).style.color='#fff';el('span',orange,parent).style.color='var(--orange)';}
  function labelWithValue(element,template,value){element.dataset.i18nLabel=template;element.dataset.i18nUserValue=value;element.setAttribute('aria-label',template.replace('{user}',value));}
  function button(text,parent,fn) {const b=el('button',text,parent,'btn');b.type='button';b.onclick=fn;return b;}

  function askSongConfirmation(message,acceptLabel='Supprimer'){
    return new Promise(resolve=>{
      const modal=document.createElement('dialog');modal.className='song-confirmation';modal.setAttribute('aria-labelledby','songConfirmTitle');
      const title=el('h3','Confirmation',modal);title.id='songConfirmTitle';
      el('p',message,modal,'song-confirm-message');
      const actions=el('div',undefined,modal,'song-confirm-actions');
      const previous=document.activeElement,returnFocus=previous?.closest('.song-more-wrap')?.querySelector('.song-more')||previous;
      let settled=false;
      const finish=accepted=>{if(settled)return;settled=true;modal.close();modal.remove();if(returnFocus?.isConnected)returnFocus.focus();resolve(accepted);};
      const cancel=button('Annuler',actions,()=>finish(false)),accept=button(acceptLabel,actions,()=>finish(true));accept.classList.add('song-confirm-accept');cancel.autofocus=true;
      modal.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
      modal.addEventListener('keydown',event=>event.stopPropagation());
      (document.fullscreenElement||document.body).append(modal);modal.showModal();cancel.focus();
    });
  }
  function askSongValue({title,label,initial='',accept='Valider',type='text',options=null,description='',valid=value=>!!value.trim()}){
    return new Promise(resolve=>{
      const modal=document.createElement('dialog');modal.className='song-confirmation song-name-dialog';modal.setAttribute('aria-labelledby','songInputTitle');
      el('h3',title,modal).id='songInputTitle';
      if(description)el('p',description,modal,'song-note').dataset.noTranslate='';
      const form=el('form',undefined,modal),fieldLabel=el('label',label,form,'song-name-label');
      const input=el(options?'select':'input',undefined,fieldLabel,'song-name-input');
      if(options)input.dataset.noTranslate='';
      if(options)for(const [value,text]of options){const option=el('option',text,input);option.value=value;}
      else{input.type=type;input.maxLength=120;input.autocomplete='off';if(type==='number')input.step='any';}
      input.value=initial;input.required=true;
      const actions=el('div',undefined,form,'song-confirm-actions');
      const previous=document.activeElement,returnFocus=previous?.closest('.song-more-wrap')?.querySelector('.song-more')||previous;
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;modal.close();modal.remove();if(returnFocus?.isConnected)returnFocus.focus();resolve(value);};
      button('Annuler',actions,()=>finish(null));
      const confirm=button(accept,actions,()=>{});confirm.type='submit';confirm.classList.add('song-confirm-accept');
      const allowed=()=>input.checkValidity()&&valid(input.value.trim());
      const validate=()=>{confirm.disabled=!allowed();};input.addEventListener('input',validate);input.addEventListener('change',validate);validate();
      form.addEventListener('submit',event=>{event.preventDefault();if(allowed())finish(input.value.trim());});
      modal.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
      modal.addEventListener('keydown',event=>event.stopPropagation());
      (document.fullscreenElement||document.body).append(modal);modal.showModal();input.focus();input.select?.();
    });
  }
  function askPlaylistName(initial='',creating=false){
    return askSongValue({title:creating?'Nouvelle playlist':'Renommer la playlist',label:'Nom de la playlist',initial,accept:creating?'Créer':'Renommer'});
  }
  function field(text,parent,value,change,options) {const label=el('label',text,parent),input=el(options?'select':'input',undefined,label);if(options)for(const v of options){const o=el('option',String(v),input);o.value=v;}else input.type=typeof value==='number'?'number':'text';input.setAttribute('aria-label',text);input.value=value;input.onchange=event=>change(input.value,input,event);return input;}
  function songNumbox(label,parent,value,commit,values){
    const options=[...new Set([...values,value])].sort((a,b)=>a-b);
    const deferred=options.length>100;
    const select=field(label,parent,value,async(raw,control,event)=>{
      if(raw==='custom'){
        const previousValue=event?.detail?.previousValue??value;
        const owner=library;
        const entry=await askSongValue({title:'Valeur personnalisée',label,initial:String(previousValue),type:'number',valid:raw=>{const n=Number(raw);return label.includes('BPM')?Number.isFinite(n)&&n>=2&&n<=999:label==='Unité'?[2,4,8,16,32].includes(n):Number.isSafeInteger(n)&&n>=1&&(label!=='Temps'||n<=20);}});
        if(owner!==library)return;
        if(entry===null){control.value=String(previousValue);syncNumbox(control);return;}
        raw=entry;
      }
      commit(raw,control);
      syncNumbox(control);
    },deferred?[value]:options);
    const custom=el('option','Autre…',select);custom.value='custom';
    const row=select.parentElement;row.className='song-inline-field';
    enhanceNumboxSelect(select);
    row.querySelector('.numbox-button').setAttribute('aria-label',label+' : '+value);
    if(deferred){
      let prepared=false;
      const prepare=()=>{
        if(prepared)return;prepared=true;
        const current=select.value;
        const all=[...new Set([...options,Number(current)])].filter(Number.isFinite).sort((a,b)=>a-b);
        const fragment=document.createDocumentFragment();
        for(const v of all){const option=document.createElement('option');option.value=String(v);option.textContent=String(v);fragment.append(option);}
        const custom=document.createElement('option');custom.value='custom';custom.textContent='Autre…';fragment.append(custom);
        select.replaceChildren(fragment);select.value=current;numboxWidgets.get(select)?.rebuild();
      };
      select.closest('.numbox-custom').addEventListener('click',event=>{if(event.target.closest('.numbox-button'))prepare();},true);
      select.addEventListener('focus',prepare,{once:true});
      select.addEventListener('renax-options-request',prepare,{once:true});
    }
    return select;
  }
  function profile(){return library.profiles.find(p=>p.id===library.activeProfile);}
  function song(){return profile().songs.find(s=>s.id===selectedSong);}
  function transportSong(){
    if(songsRoot.hidden)return null;
    if(['playlist','detail'].includes(songView))return song()||(songView==='playlist'?profile().songs[0]||null:null);
    const lastProfile=library.profiles.find(p=>p.id===lastTrackSelection?.playlistId);
    return lastProfile?.songs.find(item=>item.id===lastTrackSelection.songId)||library.profiles.find(p=>p.songs.length)?.songs[0]||null;
  }
  function selectPlaylistSong(item){
    if(selectedSong!==item.id){unload();if(isPlaying||preparingAmorce)stopMetronome();selectedSong=item.id;openSectionId=null;}
    lastTrackSelection={playlistId:profile().id,songId:item.id};updatePosition();syncSongTransport();
  }
  function status(message){storageStatus=message;const e=document.getElementById('songStatus');if(e)e.textContent=message;}
  function persist(){
    clearTimeout(persistTimer);persistTimer=null;
    if(RENAX_STORAGE.matches(library)){persistFailed=false;return true;}
    try{RENAX_STORAGE.write(library);persistFailed=false;window.RENAX_EMERGENCY?.confirm(RENAX_STORAGE.scope,library);window.dispatchEvent(new Event('renax-library-edited'));status('Sauvegardé dans ce navigateur');return true;}
    catch(error){
      persistFailed=true;status('Sauvegarde locale impossible : '+error.message);
      if(!RENAX_STORAGE.readOnly){const owner=library,scope=RENAX_STORAGE.scope;window.RENAX_EMERGENCY?.save(scope,library,RENAX_STORAGE.rawToken).then(saved=>{if(saved&&persistFailed&&library===owner&&RENAX_STORAGE.scope===scope)status('Copie de secours enregistrée dans ce navigateur. Exportez aussi votre bibliothèque.');});}
      return false;
    }
  }
  function schedulePersist(){clearTimeout(persistTimer);persistTimer=setTimeout(persist,400);}
  function flushPending(){return persistTimer===null&&!persistFailed||persist();}

  function changed(){unload();resetCustomizationTimer();persist();render();}
  function unload(){if(!loaded)return;saveLoadedPattern();stopMetronome();clearTimeout(endTimer);const previous=loaded.previous;loaded=null;measures=previous;metronomeMeasures=previous;activeMeasureIndex=0;playingMeasureIndex=0;currentStepInMeasure=0;measureCountSel.value=String(measures.length);renderSequencerList();renderActiveMeasure();updatePosition();}
  function locate(index){let start=0;for(let i=0;i<loaded.song.sections.length;i++){const s=loaded.song.sections[i];if(index<start+s.count)return {section:s,index:i,start,bar:index-start+1};start+=s.count;}return null;}
  RENAX_SONG_TEMPO.liveStep=(measureIndex,beat,subIndex,subdivisions)=>{
    if(!loaded)return null;
    const position=locate(measureIndex),section=position?.section;
    if(!section||!RENAX_SONG_TEMPO.active(section))return null;
    const bar=position.bar-1,pulse=bar*section.measure.numerator+beat;
    return {tempo:RENAX_SONG_TEMPO.tempoAt(section,pulse+subIndex/subdivisions),
      seconds:RENAX_SONG_TEMPO.stepDuration(section,bar,beat,subIndex,subdivisions),
      beatSeconds:RENAX_SONG_TEMPO.stepDuration(section,bar,beat,0,1)};
  };
  function loadSong(sectionId=null,amorcePlan=null){const s=song();if(!s||sectionId&&!s.sections.some(section=>section.id===sectionId))return;songReloadDepth++;try{unload();stopMetronome();endTraining();if(appMode!=='metronome')setAppMode('metronome');setSilentMode(false);resetCustomizationTimer();const previous=metronomeMeasures;const snapshot=clone(s);snapshot.sections=sectionId?snapshot.sections.filter(section=>section.id===sectionId):(amorcePlan?amorcePlan.sections:playbackSections(snapshot));loaded={song:snapshot,previous,preview:!!sectionId,total:snapshot.sections.reduce((n,s)=>n+s.count,0)};
    // Repeat section templates lazily: no array of every bar and no eight-bar limit.
    measures=new Proxy([], {get(target,key){if(key==='length')return loaded.total;if(key==='indexOf')return m=>{if(locate(activeMeasureIndex)?.section.measure===m)return activeMeasureIndex;let n=0;for(const s of loaded.song.sections){if(s.measure===m)return n;n+=s.count;}return -1;};if(typeof key==='string'&&/^\d+$/.test(key))return locate(Number(key))?.section.measure;return Reflect.get(target,key);}});
    metronomeMeasures=measures;activeMeasureIndex=0;playingMeasureIndex=0;currentStepInMeasure=0;renderSequencerList();renderActiveMeasure();updatePosition();
    }finally{songReloadDepth--;}
  }
  window.songAtEnd=()=>{
    if(!loaded||playingMeasureIndex!==0||currentStepInMeasure!==0)return false;
    const finishedId=loaded.song.id,preview=loaded.preview;
    const owner=library.profiles.find(p=>p.songs.some(item=>item.id===finishedId));
    const index=owner?.songs.findIndex(item=>item.id===finishedId)??-1;
    const next=(!preview&&owner&&chainedPlaylists.has(owner.id))?owner.songs[index+1]:null;
    clearTimeout(endTimer);
    endTimer=setTimeout(async()=>{
      if(!isPlaying||loaded?.song.id!==finishedId)return;
      stopMetronome();
      if(next&&owner.songs.includes(next)&&chainedPlaylists.has(owner.id)&&!songsRoot.hidden&&library.activeProfile===owner.id){
        unload();selectedSong=next.id;lastTrackSelection={playlistId:owner.id,songId:next.id};openSectionId=null;songView='playlist';
        render();
        try{await startMetronome();}catch(error){status('Lecture impossible : '+error.message);}
      }else status(preview?'Bloc terminé.':'Morceau terminé.');
    },Math.max(0,(nextNoteTime-audioCtx.currentTime)*1000));
    return true;
  };
  function syncDirectSongPlay(){
    songPane.querySelectorAll('.song-direct-play').forEach(button=>{
      const active=!!(isPlaying&&loaded?.song.id===button.dataset.playSongId);
      button.setAttribute('aria-pressed',String(active));
    });
    songPane.querySelectorAll('.playlist-direct-play').forEach(button=>{
      const p=library.profiles.find(p=>p.id===button.dataset.playPlaylistId);
      button.setAttribute('aria-pressed',String(!!(isPlaying&&p?.songs[0]?.id===loaded?.song.id)));
    });
    updatePosition();
  }
  function syncSongTransport(){
    syncDirectSongPlay();
    const songContext=!!(loaded||!songsRoot.hidden);
    playBtn.dataset.songTransport=String(songContext);
    if(!isPlaying)playBtn.textContent=songContext?'Lire le morceau':'Start';
  }
  let songStartEpoch=0,preparingAmorce=false;
  const originalStart=startMetronome;startMetronome=async function(){
    if(preparingAmorce)return;
    const target=transportSong();
    if(!isPlaying&&!loaded&&!songsRoot.hidden){
      if(!target){status('Aucun morceau disponible dans les playlists.');return;}
      const owner=library.profiles.find(p=>p.songs.includes(target));
      if(owner){
        library.activeProfile=owner.id;selectedSong=target.id;
        lastTrackSelection={playlistId:owner.id,songId:target.id};
        if(!['playlist','detail'].includes(songView)){songView='playlist';render();panel.scrollTop=0;}
        else updatePosition();
      }
    }
    const current=loaded?.song?.amorce?song()||loaded.song:target;
    if(!isPlaying&&current?.amorce){
      const epoch=++songStartEpoch;preparingAmorce=true;updateTrainButton();playBtn.textContent='Préparation…';
      try{await initAudio();if(epoch!==songStartEpoch)return;const plan=await RENAX_AMORCE.prepare(current);await prepareAllVoiceAudio();if(epoch!==songStartEpoch)return;loadSong(null,plan);RENAX_AMORCE.install(plan);preparingAmorce=false;const result=await originalStart();syncDirectSongPlay();return result;}
      catch(error){if(epoch!==songStartEpoch)return;loadSong();preparingAmorce=false;await originalStart();status('Lecture sans guide vocal : '+error.message);const note=songPane.querySelector('.song-note');if(note)note.textContent='Le morceau joue sans guide vocal. Réessaie le guide après la lecture.';syncDirectSongPlay();return;}finally{if(epoch===songStartEpoch){preparingAmorce=false;updateTrainButton();syncSongTransport();}}
    }
    if(!isPlaying&&loaded?.preview)loadSong();
    if(!isPlaying&&!loaded&&transportSong())loadSong();
    const result=await originalStart();syncDirectSongPlay();return result;
  };
  const originalStop=stopMetronome;stopMetronome=function(...args){if(!songReloadDepth&&!args[0]?.startupFailure){songStartEpoch++;preparingAmorce=false;}window.RENAX_AMORCE?.stop();clearTimeout(endTimer);const result=originalStop(...args);syncSongTransport();return result;};
  const originalMode=setAppMode;setAppMode=function(mode){unload();return originalMode(mode);};
  function resetSelectedSongBlock(){
    const current=song();
    if(!loaded||songView!=='detail'||!current||appMode!=='metronome'||training.engaged)return false;
    const position=locate(activeMeasureIndex);
    const section=current.sections.find(block=>block.id===openSectionId)||current.sections.find(block=>block.id===position?.section.id);
    if(!section)return false;
    // Save the last edit before unloading its snapshot; then reset the saved block.
    unload();
    section.measure.beatSubdivisions=Array(section.measure.numerator).fill(1);
    section.measure.beatStates=Array.from({length:section.measure.numerator},()=>[1]);
    openSectionId=section.id;
    persist();render();resetCustomizationTimer();
    particles.length=0;pulses.length=0;clearProgressTrail();
    return true;
  }
  panicBtn.addEventListener('click',event=>{
    if(resetSelectedSongBlock()){event.preventDefault();event.stopImmediatePropagation();}
    else unload();
  },true);
  let followedSongBlock=null;
  function followPlayingBlock(card,section){
    if(!isPlaying||songView!=='detail'||songsRoot.hidden){followedSongBlock=null;return;}
    const key=loaded.song.id+':'+section.id;
    if(followedSongBlock===key)return;
    followedSongBlock=key;
    card.style.setProperty('--song-playing-pulse',Math.max(.85,Math.min(2.4,120/getEffectiveTempo(section.measure)))+'s');
    const bounds=panel.getBoundingClientRect(),rect=card.getBoundingClientRect(),padding=16;
    if(!bounds.height||panel.scrollHeight<=panel.clientHeight)return;
    const top=bounds.top+padding,bottom=bounds.bottom-padding;
    let delta=0;
    if(rect.top<top||rect.height>bottom-top)delta=rect.top-top;
    else if(rect.bottom>bottom)delta=rect.bottom-bottom;
    if(Math.abs(delta)>1)panel.scrollTo({top:Math.max(0,panel.scrollTop+delta),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  function updatePosition(){
    const cards=songPane.querySelectorAll('.song-section,.song-count-in');
    if(!isPlaying||songView!=='detail'||songsRoot.hidden)followedSongBlock=null;
    if(songView==='playlist'){
      cards.forEach(card=>{const selected=card.dataset.songId===selectedSong;card.classList.toggle('active',selected);card.classList.toggle('playing',!!(isPlaying&&loaded?.song.id===card.dataset.songId));card.querySelector('.song-open')?.setAttribute('aria-pressed',String(selected));const edit=card.querySelector('.song-selected-open');if(edit)edit.hidden=!selected;});return;
    }
    if(!loaded){cards.forEach(card=>card.classList.remove('active','playing'));return;}
    const position=locate(activeMeasureIndex);if(!position)return;
    let playingCard=null;
    cards.forEach((card,_index)=>{const current=(card.dataset.sectionId||card.dataset.countInId)===position.section.id;card.classList.toggle('playing',isPlaying&&current);card.classList.toggle('active',current);if(current)playingCard=card;});
    if(playingCard)followPlayingBlock(playingCard,position.section);
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
    loadSong();activeMeasureIndex=countInBars(current)+current.sections.slice(0,index).reduce((n,section)=>n+section.count,0);renderActiveMeasure();
  }
  function refreshSongCards(){
    const current=song();if(!current)return;
    const duration=document.getElementById('songDuration');if(duration)duration.textContent=current.sections.reduce((n,section)=>n+section.count,0)+' mesures · Durée totale : '+durationText(current)+' · arrêt à la fin du morceau';
    const countInTempo=songPane.querySelector('.song-count-in-tempo');if(countInTempo)countInTempo.textContent=current.sections[0].measure.tempo+' BPM · tempo du premier bloc';
    if(loaded?.song.sections[0].measure.countIn)loaded.song.sections[0].measure.tempo=current.sections[0].measure.tempo;
    songPane.querySelectorAll('[data-section-id]').forEach(card=>{
      const section=current.sections.find(s=>s.id===card.dataset.sectionId);if(!section)return;
      card.querySelector('.measure-sig').textContent=section.measure.numerator+'/'+section.measure.denominator;
      const countLabel=card.querySelector('.song-block-count');if(countLabel){countLabel.textContent=section.count+' M';countLabel.setAttribute('aria-label',section.count+' mesures');}
      card.querySelector('.song-block-summary').firstChild.textContent=section.count+' mesures · '+section.measure.numerator+'/'+section.measure.denominator+' · '+tempoDescription(section)+' BPM';
      const preview=card.querySelector('.measure-preview'),previewKey=JSON.stringify(section.measure.beatStates);
      if(preview.dataset.pattern!==previewKey){preview.dataset.pattern=previewKey;preview.replaceChildren();
        for(const states of section.measure.beatStates){const group=el('div',undefined,preview,'preview-beat');for(const state of states)el('span',undefined,group,'preview-dot').dataset.state=state;}
      }
      const bpm=card.querySelector('select[aria-label="Tempo (BPM)"]');if(document.activeElement!==bpm&&Number(bpm.value)!==section.measure.tempo){if(![...bpm.options].some(o=>Number(o.value)===section.measure.tempo)){const option=el('option',String(section.measure.tempo),bpm);option.value=section.measure.tempo;numboxWidgets.get(bpm)?.rebuild();}bpm.value=section.measure.tempo;syncNumbox(bpm);bpm.closest('.numbox-custom').querySelector('.numbox-button').setAttribute('aria-label','Tempo (BPM) : '+section.measure.tempo);}
    });
  }
  document.addEventListener('input',e=>{if(loaded&&e.target.matches('#bpmSlider,.measure-tempo-input'))queueMicrotask(()=>{saveLoadedPattern();refreshSongCards();});});
  function saveLoadedPattern(){
    if(!loaded)return false;
    const source=profile().songs.find(s=>s.id===loaded.song.id),position=locate(activeMeasureIndex);
    const section=source?.sections.find(s=>s.id===position?.section.id);
    if(section&&JSON.stringify(section.measure)!==JSON.stringify(position.section.measure)){section.measure=clone(position.section.measure);persist();return true;}
    return false;
  }
  const originalTempoFields=refreshTempoFields;refreshTempoFields=function(){originalTempoFields();if(saveLoadedPattern())refreshSongCards();};
  const originalPreviews=refreshMeasurePreviews;refreshMeasurePreviews=function(){originalPreviews();saveLoadedPattern();refreshSongCards();};
  const originalActive=renderActiveMeasure;renderActiveMeasure=function(){originalActive();if(saveLoadedPattern())refreshSongCards();updatePosition();};
  let suppressSongClickUntil=0;
  songPane.addEventListener('click',e=>{if(performance.now()<suppressSongClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
  function enableSongDrag(row,item,p,isBlock=false){
    row.dataset.songId=item.id;row.addEventListener('dragstart',e=>e.preventDefault());
    let gesture=null,holdTimer=null,scrollFrame=null,placeholder=null,originalStyle=null;
    const shifts=new Map();
    function clearMarks(){songPane.querySelectorAll('.drop-before,.drop-after').forEach(e=>e.classList.remove('drop-before','drop-after'));}
    function markDrop(){
      if(!gesture?.active)return;
      row.style.top=(gesture.y-gesture.offsetY)+'px';
      row.style.left=(gesture.x-gesture.offsetX)+'px';
      const rect=panel.getBoundingClientRect();gesture.valid=gesture.x>=rect.left&&gesture.x<=rect.right;
      const others=[...songPane.querySelectorAll(isBlock?'[data-section-id]':'.song-playlist-card')].filter(e=>e!==row);
      const gap=placeholder.getBoundingClientRect(),gapStyle=getComputedStyle(placeholder),gapHeight=gap.height+parseFloat(gapStyle.marginTop)+parseFloat(gapStyle.marginBottom);
      const before=others.findIndex(e=>{const r=e.getBoundingClientRect();
        const transform=shifts.has(e)?getComputedStyle(e).transform:'none';
        const values=transform&&transform!=='none'?transform.slice(transform.indexOf('(')+1,-1).split(',').map(Number):[];
        const visualOffset=values.length===16?values[13]:values.length===6?values[5]:0;
        const layoutTop=r.top-visualOffset,top=layoutTop>=gap.bottom?layoutTop-gapHeight:layoutTop;return gesture.y<top+r.height/2;});
      gesture.index=before<0?others.length:before;
      const target=others[gesture.index];
      if(gesture.lastDropIndex!==gesture.index){
        const positions=isBlock?others.map(card=>[card,card.getBoundingClientRect().top]):[];
        shifts.forEach(animation=>animation.cancel());shifts.clear();
        if(target)target.before(placeholder);else if(others.length)others.at(-1).after(placeholder);
        gesture.lastDropIndex=gesture.index;
        for(const [card,top] of positions){const delta=top-card.getBoundingClientRect().top;
          if(Math.abs(delta)>.5&&typeof card.animate==='function'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
            const animation=card.animate([{transform:'translateY('+delta+'px)'},{transform:'translateY(0)'}],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)'});shifts.set(card,animation);
          }
        }
      }
      placeholder.style.opacity=gesture.valid?'1':'.35';
    }
    function autoScroll(){
      if(!gesture?.active)return;
      const rect=panel.getBoundingClientRect(),speed=gesture.y<rect.top+28?-9:gesture.y>rect.bottom-28?9:0;
      if(speed){panel.scrollTop+=speed;markDrop();}
      scrollFrame=requestAnimationFrame(autoScroll);
    }
    function activate(){
      if(!gesture||gesture.scrolling)return;
      gesture.active=true;clearTimeout(holdTimer);
      const rect=row.getBoundingClientRect(),rowStyle=getComputedStyle(row);gesture.offsetX=gesture.startX-rect.left;gesture.offsetY=gesture.startY-rect.top;
      originalStyle=row.getAttribute('style');
      placeholder=document.createElement('div');placeholder.className='song-drag-placeholder';
      Object.assign(placeholder.style,{height:rect.height+'px',flexShrink:'0',boxSizing:'border-box',border:'1px dashed var(--orange)',borderRadius:'8px',background:'rgba(255,107,0,.06)',marginTop:rowStyle.marginTop,marginBottom:rowStyle.marginBottom});
      row.before(placeholder);
      Object.assign(row.style,{position:'fixed',transition:'none',width:rect.width+'px',height:rect.height+'px',boxSizing:'border-box',margin:'0',zIndex:'1000',userSelect:'none',opacity:'.92',boxShadow:'0 12px 32px rgba(0,0,0,.5)',borderColor:'var(--orange)'});
      row.classList.add('dragging');row.setPointerCapture(gesture.id);markDrop();scrollFrame=requestAnimationFrame(autoScroll);
    }
    row.addEventListener('pointerdown',e=>{
      if(e.button!==0||!e.isPrimary||e.target.closest('.song-more-wrap')||(isBlock&&e.target.closest('input,select,label,button:not(.song-block-header)')))return;
      if(gesture)return;
      gesture={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,scrollTop:panel.scrollTop,active:false,scrolling:false,index:0,valid:false};
      row.setPointerCapture(e.pointerId);
      if(e.pointerType==='mouse')e.preventDefault();
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
      shifts.forEach(animation=>animation.cancel());shifts.clear();
      const done=gesture;gesture=null;
      if(done.active){placeholder?.remove();placeholder=null;if(originalStyle===null)row.removeAttribute('style');else row.setAttribute('style',originalStyle);originalStyle=null;}
      if(done.active||done.scrolling)suppressSongClickUntil=performance.now()+150;
      if(row.hasPointerCapture(e.pointerId))row.releasePointerCapture(e.pointerId);
      if(done.active&&done.valid&&!cancelled){const items=isBlock?p.sections:p.songs,previous=items.indexOf(item);items.splice(previous,1);items.splice(done.index,0,item);if(isBlock)changed();else{persist();render();}}
    }
    row.addEventListener('pointerup',e=>finish(e));row.addEventListener('pointercancel',e=>finish(e,true));row.addEventListener('lostpointercapture',e=>finish(e,true));
  }
  function duplicateSongTo(source,target,rename=true){const copy=clone(source);copy.id=id();copy.sections.forEach(section=>section.id=id());if(rename)copy.name+=' (copie)';target.songs.push(copy);return copy;}
  async function choosePlaylist(source,mode){
    const p=profile();
    const targets=library.profiles.filter(candidate=>mode==='move'?candidate.id!==p.id:true);
    if(!targets.length){status('Aucune autre playlist disponible.');return;}
    const owner=library;
    const targetId=await askSongValue({title:mode==='move'?'Déplacer le track':'Copier le track',description:source.name,label:'Playlist de destination',initial:targets[0].id,accept:mode==='move'?'Déplacer':'Copier',options:targets.map(candidate=>[candidate.id,candidate.name==='Mon profil'?'Tracks':candidate.name])});
    if(targetId===null||owner!==library)return;
    const target=library.profiles.find(candidate=>candidate.id===targetId);
    if(!target||!p.songs.includes(source)){status('Playlist non reconnue.');return;}
    if(mode==='copy'){duplicateSongTo(source,target,false);persist();status('Morceau copié dans '+(target.name==='Mon profil'?'Tracks':target.name)+'.');}
    else{unload();p.songs=p.songs.filter(song=>song!==source);target.songs.push(source);selectedSong=null;persist();render();status('Morceau déplacé dans '+(target.name==='Mon profil'?'Tracks':target.name)+'.');}
  }
  function addSongMenu(row,item,openSong){
    const p=profile();
    const wrap=el('div',undefined,row,'song-more-wrap');
    wrap.style.display='inline-flex';wrap.style.gap='6px';
    const edit=button('',wrap,openSong);edit.className='song-more song-selected-open';edit.hidden=selectedSong!==item.id;edit.title='Ouvrir ce track pour le modifier';labelWithValue(edit,'Ouvrir le track {user}',item.name);edit.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></svg>';
    const directPlay=button('',wrap,async()=>{
      if(preparingAmorce||isPlaying){stopMetronome();}
      selectedSong=item.id;lastTrackSelection={playlistId:p.id,songId:item.id};openSectionId=null;
      loadSong();
      try{await startMetronome();}catch(error){status(error.message);}
      syncDirectSongPlay();
    });
    directPlay.className='song-more song-direct-play';
    directPlay.dataset.playSongId=item.id;
    directPlay.title='Lire uniquement ce morceau';
    labelWithValue(directPlay,'Lire le morceau {user}',item.name);
    directPlay.innerHTML='<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>';
    const trigger=button('⋯',wrap,()=>{const opening=menu.hidden;songPane.querySelectorAll('.song-more-menu').forEach(other=>other.hidden=true);songPane.querySelectorAll('.song-more').forEach(other=>other.setAttribute('aria-expanded','false'));menu.hidden=!opening;trigger.setAttribute('aria-expanded',String(opening));});
    trigger.className='song-more';labelWithValue(trigger,'Actions pour {user}',item.name);trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
    const menu=el('div',undefined,wrap,'song-more-menu');menu.hidden=true;menu.setAttribute('role','menu');
    const action=(label,fn)=>{const b=button(label,menu,e=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');fn(e);});b.setAttribute('role','menuitem');return b;};
    action('Renommer',async()=>{const owner=library,name=await askSongValue({title:'Renommer le track',label:'Titre du track',initial:item.name,accept:'Renommer'});if(owner===library&&p.songs.includes(item)&&name){item.name=name;changed();}});
    action('Dupliquer',()=>{duplicateSongTo(item,p,true);persist();render();});
    action('Déplacer vers…',()=>choosePlaylist(item,'move'));
    action('Copier vers…',()=>choosePlaylist(item,'copy'));
    action('Supprimer',async()=>{if(!await askSongConfirmation('Supprimer « '+item.name+' » ?'))return;const currentProfile=library.profiles.find(candidate=>candidate.id===p.id);if(!currentProfile?.songs.some(candidate=>candidate.id===item.id))return;unload();currentProfile.songs=currentProfile.songs.filter(candidate=>candidate.id!==item.id);if(selectedSong===item.id)selectedSong=null;persist();render();});
    wrap.addEventListener('click',e=>e.stopPropagation());
    wrap.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();}});
  }
  let rendering=false;
  function render(){
    // Removing a focused field can synchronously dispatch change and request another render.
    if(rendering)return;
    rendering=true;
    try{renderContent();}finally{rendering=false;}
  }
  function renderContent(){songPane.replaceChildren();profilePane.replaceChildren();songsHome.replaceChildren();
    songsHome.hidden=songView!=='home';profilePane.hidden=songView!=='profile';songPane.hidden=!['playlists','playlist','detail'].includes(songView);
    button('Sauvegarde',songsHome,()=>navigate('profile')).classList.add('song-entry');
    button('Playlist',songsHome,()=>navigate('playlists')).classList.add('song-entry');
    const backProfile=button('Retour',profilePane,()=>navigate('home'));backProfile.classList.add('song-back');backProfile.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 5-7 7 7 7M5 12h15"/></svg>';backProfile.setAttribute('aria-label','Retour aux morceaux');
    const backSong=button('Retour',songPane,()=>navigate(songView==='detail'?'playlist':songView==='playlist'?'playlists':'home'));backSong.classList.add('song-back');backSong.textContent='';backSong.setAttribute('aria-label',songView==='detail'?'Retour à la playlist':songView==='playlist'?'Retour aux playlists':'Retour aux morceaux');
const p=profile();if(!p.songs.some(s=>s.id===selectedSong))selectedSong=null;
    const createPlaylist=async()=>{const name=await askPlaylistName('',true);if(!name)return;unload();const created={id:id(),name:name.trim(),songs:[]};library.profiles.push(created);library.activeProfile=created.id;selectedSong=null;songView='playlist';persist();render();};
    const openPlaylist=item=>{unload();library.activeProfile=item.id;selectedSong=item.id===lastTrackSelection?.playlistId&&item.songs.some(song=>song.id===lastTrackSelection.songId)?lastTrackSelection.songId:null;songView='playlist';persist();render();panel.scrollTop=0;};
    if(songView==='playlists'){
      const overview=el('section',undefined,songPane,'playlist-overview');
      const heading=el('div',undefined,overview,'playlist-overview-head playlist-heading');heading.append(backSong);const title=el('strong',undefined,heading,'playlist-heading-name');splitTitle(title,'Play','lists');
      button('Nouvelle playlist',heading,createPlaylist).classList.add('playlist-create');
      const list=el('div',undefined,overview,'playlist-list');
      for(const item of library.profiles){
        const entry=el('div',undefined,list);entry.style.position='relative';
        const choice=button('',entry,()=>openPlaylist(item));choice.style.paddingRight='96px';choice.classList.add('playlist-choice');labelWithValue(choice,'Ouvrir la playlist {user}',item.name==='Mon profil'?'Tracks':item.name);
        const name=el('strong',item.name==='Mon profil'?'Tracks':item.name,choice,'playlist-choice-name');name.dataset.noTranslate='';if(item.name==='Mon profil')name.textContent='Tracks';
        el('span',item.songs.length+' morceau'+(item.songs.length===1?'':'x'),choice,'playlist-choice-count');
        const controls=el('div',undefined,entry,'song-more-wrap');controls.style.top='8px';controls.style.bottom='auto';controls.style.display='inline-flex';controls.style.gap='6px';
        const direct=button('',controls,async()=>{
          if(!item.songs.length)return;
          if((isPlaying||preparingAmorce)&&loaded?.song.id===item.songs[0].id){stopMetronome();return;}
          direct.disabled=true;unload();if(isPlaying||preparingAmorce)stopMetronome();library.activeProfile=item.id;selectedSong=item.songs[0].id;lastTrackSelection={playlistId:item.id,songId:selectedSong};openSectionId=null;loadSong();
          try{await startMetronome();}catch(error){status(error.message);}finally{direct.disabled=!item.songs.length;syncSongTransport();}
        });
        direct.className='song-more playlist-direct-play';direct.dataset.playPlaylistId=item.id;direct.disabled=!item.songs.length;
        labelWithValue(direct,'Lire le premier track de {user}',item.name==='Mon profil'?'Tracks':item.name);direct.setAttribute('aria-pressed','false');direct.title=item.songs.length?'Lire le premier track':'Playlist vide';
        direct.innerHTML='<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>';
        const trigger=button('⋯',controls,()=>{const opening=menu.hidden;songPane.querySelectorAll('.song-more-menu').forEach(other=>other.hidden=true);songPane.querySelectorAll('.song-more').forEach(other=>other.setAttribute('aria-expanded','false'));menu.hidden=!opening;trigger.setAttribute('aria-expanded',String(opening));});
        trigger.className='song-more';labelWithValue(trigger,'Actions de la playlist {user}',item.name==='Mon profil'?'Tracks':item.name);trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
        const menu=el('div',undefined,controls,'song-more-menu');menu.hidden=true;menu.setAttribute('role','menu');menu.style.top='36px';menu.style.bottom='auto';
        const rename=button('Renommer',menu,async()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');const name=await askPlaylistName(item.name==='Mon profil'?'Tracks':item.name);if(name){const current=library.profiles.find(candidate=>candidate.id===item.id);if(!current)return;current.name=name;persist();render();}});rename.setAttribute('role','menuitem');
        const remove=button('Supprimer',menu,async()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(!await askSongConfirmation('Supprimer la playlist « '+(item.name==='Mon profil'?'Tracks':item.name)+' » et ses '+item.songs.length+' track(s) ?'))return;
          if(library.activeProfile===item.id)unload();library.profiles=library.profiles.filter(candidate=>candidate.id!==item.id);
          if(!library.profiles.length)library.profiles=defaultLibrary().profiles;
          if(!library.profiles.some(candidate=>candidate.id===library.activeProfile)){library.activeProfile=library.profiles[0].id;selectedSong=null;openSectionId=null;}
          persist();render();});remove.setAttribute('role','menuitem');
        controls.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();}});
      }
    }
    const localProfiles=el('section',undefined,songPane,'playlist-manager');localProfiles.hidden=songView!=='playlist';
    const playlistHeading=el('div',undefined,localProfiles,'playlist-heading');
    const playlistTitle=el('strong',p.name==='Mon profil'?'Tracks':p.name,playlistHeading,'playlist-heading-name');playlistTitle.dataset.noTranslate='';if(p.name==='Mon profil')playlistTitle.textContent='Tracks';
    if(songView==='playlist'){
      playlistHeading.prepend(backSong);
      const toggle=el('button',undefined,playlistHeading,'song-chain-toggle');toggle.type='button';
      toggle.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h12M4 12h12M4 17h12"/><path d="m14 4 4 3-4 3M14 14l4 3-4 3"/></svg>';
      const hint=el('span',undefined,playlistHeading,'song-chain-hint');hint.hidden=true;hint.setAttribute('role','status');let hintTimer=null;
      const syncToggle=()=>{const active=chainedPlaylists.has(p.id),title=active?'Désactiver « Enchaîner les morceaux »':'Activer « Enchaîner les morceaux »';toggle.setAttribute('aria-pressed',String(active));toggle.setAttribute('aria-label',title);toggle.title=title;};
      toggle.addEventListener('click',()=>{
        const active=!chainedPlaylists.has(p.id);
        if(active)chainedPlaylists.add(p.id);else chainedPlaylists.delete(p.id);
        syncToggle();
        if(window.matchMedia('(hover: none)').matches){
          hint.textContent='Enchaîner les morceaux : '+(active?'activé':'désactivé');hint.hidden=false;
          clearTimeout(hintTimer);hintTimer=setTimeout(()=>{hint.hidden=true;},2200);
        }
      });
      syncToggle();
    }
    const actions=songView==='playlists'?null:el('div',undefined,songPane,'song-actions');
    const s=songView==='detail'?song():null;
    if(songView==='playlist'){
      button('Nouveau morceau',actions,()=>{unload();const s=blankSong();p.songs.push(s);selectedSong=s.id;openSectionId=null;songView='detail';persist();render();panel.scrollTop=0;}).classList.add('track-create');
      if(!p.songs.length)el('p','Crée ton premier morceau pour construire sa structure.',songPane,'song-note');
      for(const item of p.songs){
        const row=el('div',undefined,songPane,'song-section measure-card song-playlist-card');enableSongDrag(row,item,p);
        const openSong=()=>{stopMetronome();selectedSong=item.id;openSectionId=null;songView='detail';render();panel.scrollTop=0;};
        row.tabIndex=0;labelWithValue(row,'Sélectionner {user} · double-clic ou Entrée pour ouvrir',item.name);row.title='Un clic pour sélectionner · double-clic pour modifier';
        row.addEventListener('click',e=>{if(!e.target.closest('.song-open,.song-more-wrap'))selectPlaylistSong(item);});
        row.addEventListener('dblclick',e=>{if(!e.target.closest('.song-more-wrap'))openSong();});
        row.addEventListener('keydown',e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();if(e.key==='Enter')openSong();else selectPlaylistSong(item);}});
        const open=button('',row,()=>selectPlaylistSong(item));open.className='song-open measure-head';labelWithValue(open,'Sélectionner {user}',item.name);open.setAttribute('aria-pressed',String(selectedSong===item.id));
        el('span',item.name,open,'measure-num').dataset.noTranslate='';open.append(document.createTextNode(' '));
        const meters=[...new Set(item.sections.map(s=>s.measure.numerator+'/'+s.measure.denominator))];
        const signature=el('span',meters.length===1?meters[0]:'Mixte',open,'measure-sig');signature.title=meters.join(' · ');labelWithValue(open,'Sélectionner {user} '+signature.textContent,item.name);
        const tempos=item.sections.flatMap(s=>RENAX_SONG_TEMPO.active(s)?[s.measure.tempo,s.tempoRamp.endTempo]:[s.measure.tempo]),min=Math.min(...tempos),max=Math.max(...tempos);
        const tempoRow=el('div',undefined,row,'measure-tempo-row');el('span','TEMPO',tempoRow,'measure-tempo-label');el('span',min===max?String(min):min+'–'+max,tempoRow,'song-tempo-value');el('span','BPM',tempoRow,'measure-tempo-unit');
        el('p',item.sections.length+' sections · '+item.sections.reduce((n,s)=>n+s.count,0)+' mesures · '+durationText(item),row,'song-playlist-summary');
        const preview=el('div',undefined,row,'measure-preview');preview.title='Début du morceau';for(const states of item.sections[0].measure.beatStates){const group=el('div',undefined,preview,'preview-beat');for(const state of states)el('span',undefined,group,'preview-dot').dataset.state=state;}
        addSongMenu(row,item,openSong);

      }
    }
    if(s){
      if(openSectionId!==null&&!s.sections.some(section=>section.id===openSectionId))openSectionId=s.sections[0].id;
      const songTitle=field('Titre du morceau',songPane,s.name,value=>{s.name=value.trim()||'Sans titre';changed();});songTitle.addEventListener('input',()=>{s.name=songTitle.value.trim()||'Sans titre';schedulePersist();});
      el('p','Sélectionne un bloc pour le régler dans le métronome.',songPane,'song-note');
      const amorce=button('Guide Vocal',actions,()=>{s.amorce=!s.amorce;changed();if(s.amorce)RENAX_AMORCE.prepare(s).catch(error=>status(error.message));});amorce.id='songAmorceBtn';amorce.className='song-count-in-button';amorce.setAttribute('aria-pressed',String(!!s.amorce));if(s.amorce){amorce.style.borderColor='var(--orange)';amorce.style.color='var(--orange)';}amorce.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--orange)" aria-hidden="true"><path d="M4 21v-4a5 5 0 0 1-2-4V9a6 6 0 0 1 12 0v1l2 3h-2v3h-4v5M18 9a5 5 0 0 1 0 6M21 6a9 9 0 0 1 0 12"/></svg><span>Guide Vocal</span>';
      if(s.amorce){const ready=el('p','Préparation du guide vocal…',songPane,'song-note');RENAX_AMORCE.prepare(s).then(plan=>{if(ready.isConnected)ready.textContent='Guide vocal prêt · '+plan.countInMeasures+' mesures de décompte.';}).catch(error=>{if(ready.isConnected)ready.textContent=error.message;});}
      const addCountIn=button('Décompte',actions,()=>{if(s.countIn)return;s.countIn={count:1,numerator:s.sections[0].measure.numerator,denominator:s.sections[0].measure.denominator};changed();});
      addCountIn.className='song-count-in-button';addCountIn.disabled=!!s.countIn;addCountIn.setAttribute('aria-label','Ajouter un décompte');
      const icon=el('span',undefined,addCountIn,'song-count-in-icon');icon.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 2h6M12 2v3m6 1 2-2M12 9v5l3 2"/><circle cx="12" cy="14" r="8"/></svg>';icon.setAttribute('aria-hidden','true');addCountIn.prepend(icon);
      // Keep the vocal toggle immediately to the right of the count-in control.
      addCountIn.after(amorce);
      actions.prepend(backSong);actions.classList.add('song-detail-toolbar');
      if(s.countIn){
        const c=s.countIn,card=el('div',undefined,songPane,'song-count-in measure-card');card.dataset.countInId='count-in:'+s.id;
        const head=el('button','⏱ Décompte',card,'measure-head song-block-header');head.type='button';
        el('p',c.count+' mesures · '+c.numerator+'/'+c.denominator,card,'song-count-in-summary');
        el('p',s.sections[0].measure.tempo+' BPM · tempo du premier bloc',card,'song-count-in-tempo');
        const body=el('div',undefined,card,'song-count-in-body');body.id='song-count-in-'+s.id;head.setAttribute('aria-controls',body.id);
        const updateExpanded=()=>{const expanded=!collapsedCountIns.has(s.id);body.style.display=expanded?'':'none';head.setAttribute('aria-expanded',String(expanded));};
        const toggle=()=>{if(collapsedCountIns.has(s.id))collapsedCountIns.delete(s.id);else collapsedCountIns.add(s.id);updateExpanded();};
        head.addEventListener('click',e=>{e.stopPropagation();toggle();});
        card.addEventListener('click',e=>{if(!e.target.closest('input,select,button,label,.numbox-custom,.song-more-wrap'))toggle();});
        updateExpanded();
        const fields=el('div',undefined,body,'song-block-controls');
        songNumbox('Mesures',fields,c.count,(v,input)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1||!Number.isSafeInteger(n+s.sections.reduce((total,x)=>total+x.count,0))){input.value=c.count;return;}c.count=n;changed();},Array.from({length:64},(_,i)=>i+1));
        songNumbox('Temps',fields,c.numerator,(v,input)=>{const n=Number(v);if(!Number.isInteger(n)||n<1||n>20){input.value=c.numerator;return;}c.numerator=n;changed();},Array.from({length:20},(_,i)=>i+1));
        songNumbox('Unité',fields,c.denominator,(v,input)=>{const n=Number(v);if(![2,4,8,16,32].includes(n)){input.value=c.denominator;return;}c.denominator=n;changed();},[2,4,8,16,32]);
        const wrap=el('div',undefined,card,'song-more-wrap'),trigger=button('⋯',wrap,()=>{menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));});trigger.className='song-more';trigger.setAttribute('aria-label','Actions du décompte');trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
        const menu=el('div',undefined,wrap,'song-more-menu');menu.hidden=true;menu.setAttribute('role','menu');button('Supprimer',menu,()=>{delete s.countIn;changed();}).setAttribute('role','menuitem');
        wrap.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();}});
      }
      s.sections.forEach((section,i)=>{const card=el('div',undefined,songPane,'song-section measure-card');card.dataset.sectionId=section.id;enableSongDrag(card,section,s,true);card.style.touchAction='none';card.tabIndex=0;card.setAttribute('role','group');
        const head=el('button',undefined,card,'measure-head song-block-header');head.type='button';
        const title=el('span',section.label||'Bloc '+(i+1),head,'measure-num');title.dataset.noTranslate='';
        const countLabel=el('span',section.count+' M',head,'song-block-count');countLabel.style.cssText='margin-left:auto;white-space:nowrap;font-size:11px;color:var(--muted)';countLabel.setAttribute('aria-label',section.count+' mesures');
        el('span',section.measure.numerator+'/'+section.measure.denominator,head,'measure-sig');
        const summary=el('div',section.count+' mesures · '+section.measure.numerator+'/'+section.measure.denominator+' · '+tempoDescription(section)+' BPM',card,'song-block-summary');
        const body=el('div',undefined,card,'song-block-body');body.id='song-block-'+section.id;head.setAttribute('aria-controls',body.id);
        const choose=(showVisualizer=true)=>{setSectionOpen(section.id);loadSong();activeMeasureIndex=countInBars(s)+s.sections.slice(0,i).reduce((n,s)=>n+s.count,0);renderActiveMeasure();if(showVisualizer&&window.innerWidth<=1100)switchTab('visu');};
        head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')e.stopPropagation();});
        head.addEventListener('click',e=>{e.stopPropagation();if(openSectionId===section.id)setSectionOpen(null);else choose(false);});
        card.addEventListener('click',e=>{if(!e.target.closest('input,select,button,label')){if(openSectionId===section.id)setSectionOpen(null);else choose(false);}});card.addEventListener('keydown',e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();choose();}});
        const label=field('Libellé',body,section.label,value=>{section.label=value.trim()||'Section '+(i+1);changed();if(s.amorce)RENAX_AMORCE.prepare(s).catch(error=>status(error.message));});label.setAttribute('list','songLabels');
        if(s.amorce){const langs=el('div',undefined,body,'amorce-languages');for(const language of ['fr','en']){const b=button(language.toUpperCase(),langs,()=>{if(i===0){const previous=s.amorceDefaultLanguage||'fr';s.amorceDefaultLanguage=language;s.amorceLanguageChosen=true;for(const block of s.sections){if(block===section||(!block.amorceLanguageOverride&&(!block.amorceLanguage||block.amorceLanguage===previous)))block.amorceLanguage=language;}}else{section.amorceLanguage=language;section.amorceLanguageOverride=true;}changed();RENAX_AMORCE.prepare(s).catch(error=>status(error.message));});b.setAttribute('aria-pressed',String((section.amorceLanguage||'fr')===language));if((section.amorceLanguage||'fr')===language){b.style.color='var(--orange)';b.style.borderColor='var(--orange)';}b.setAttribute('aria-label',language.toUpperCase()+' pour '+section.label);}}label.addEventListener('input',()=>{section.label=label.value.trim()||'Bloc '+(i+1);title.textContent=section.label;schedulePersist();});
        const fields=el('div',undefined,body,'song-block-controls');songNumbox('Mesures',fields,section.count,(value,input)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1){input.value=section.count;return;}const total=s.sections.reduce((n,x)=>n+(x===section?0:x.count),0)+n;if(!Number.isSafeInteger(total)){input.value=section.count;return;}section.count=n;changed();},Array.from({length:64},(_,i)=>i+1));
        const bpm=songNumbox('Tempo (BPM)',fields,section.measure.tempo,(v,input)=>{const n=Number(v);if(!Number.isFinite(n)||n<2||n>999||section.tempoRamp?.enabled&&n>=section.tempoRamp.endTempo){input.value=section.measure.tempo;if(section.tempoRamp?.enabled&&n>=section.tempoRamp.endTempo)status('Le tempo de départ doit rester inférieur au tempo d’arrivée.');return;}if(section.measure.tempo===n){input.value=String(n);return;}unload();section.measure.tempo=n;resetCustomizationTimer();persist();refreshSongCards();selectOpenBlock();syncSongTransport();},Array.from({length:998},(_,i)=>i+2));const bpmRow=bpm.closest('label');bpmRow.firstChild.textContent='Tempo';
        const rampControls=el('div',undefined,body,'song-ramp-controls');
        const rampLabel=el('label',undefined,rampControls,'song-ramp-toggle');
        const rampToggle=el('input',undefined,rampLabel);rampToggle.type='checkbox';rampToggle.checked=!!section.tempoRamp?.enabled;rampToggle.disabled=section.measure.tempo>=999;
        el('span','Accélération progressive',rampLabel);
        rampToggle.addEventListener('change',()=>{
          if(rampToggle.checked){const previous=section.tempoRamp?.endTempo;section.tempoRamp={enabled:true,endTempo:previous>section.measure.tempo?previous:Math.min(999,section.measure.tempo+20)};}
          else section.tempoRamp={...section.tempoRamp,enabled:false};
          changed();
        });
        if(section.tempoRamp?.enabled){
          const arrival=songNumbox('Arrivée (BPM)',rampControls,section.tempoRamp.endTempo,(v,input)=>{
            const n=Number(v);
            if(!Number.isFinite(n)||n<=section.measure.tempo||n>999){input.value=section.tempoRamp.endTempo;status('Le tempo d’arrivée doit être supérieur au tempo de départ.');return;}
            section.tempoRamp.endTempo=n;changed();
          },Array.from({length:998},(_,i)=>i+2));
          arrival.closest('label').classList.add('song-ramp-target');
        }
        const preview=el('div',undefined,body,'measure-preview');
        for(let b=0;b<section.measure.numerator;b++){const group=el('div',undefined,preview,'preview-beat');for(const state of section.measure.beatStates[b])el('span',undefined,group,'preview-dot').dataset.state=state;}
        preview.dataset.pattern=JSON.stringify(section.measure.beatStates);
        const controls=el('div',undefined,summary,'song-more-wrap');
        Object.assign(controls.style,{position:'relative',float:'right',top:'auto',bottom:'auto',right:'auto',marginLeft:'8px',display:'inline-flex',gap:'6px'});
        const blockPlay=button('',controls,()=>{setSectionOpen(section.id);loadSong(section.id);originalStart();});
        blockPlay.className='song-more song-block-play';blockPlay.title='Écouter uniquement ce bloc';blockPlay.setAttribute('aria-label','Écouter uniquement le bloc '+(section.label||i+1));
        blockPlay.innerHTML='<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>';
        const trigger=button('⋯',controls,()=>{const opening=menu.hidden;songPane.querySelectorAll('.song-more-menu').forEach(other=>other.hidden=true);songPane.querySelectorAll('.song-more').forEach(other=>other.setAttribute('aria-expanded','false'));menu.hidden=!opening;trigger.setAttribute('aria-expanded',String(opening));});
        trigger.className='song-more';trigger.setAttribute('aria-label','Actions du bloc '+(section.label||i+1));trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
        const menu=el('div',undefined,controls,'song-more-menu');menu.hidden=true;menu.setAttribute('role','menu');menu.style.top='36px';menu.style.bottom='auto';
        const action=(name,fn)=>{const b=button(name,menu,()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');fn();});b.setAttribute('role','menuitem');return b;};
        action('Dupliquer',()=>{const copy=clone(section);copy.id=id();s.sections.splice(i+1,0,copy);openSectionId=copy.id;changed();});
        const remove=action('Supprimer',()=>{if(s.sections.length<=1)return;s.sections.splice(i,1);changed();});remove.disabled=s.sections.length<=1;
        head.after(controls);controls.classList.add('song-block-header-actions');controls.addEventListener('click',e=>e.stopPropagation());
        controls.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();menu.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();}});
      });button('+ Ajouter une section',songPane,()=>{const section=blankSection();section.amorceLanguage=s.amorceDefaultLanguage||'fr';s.sections.push(section);openSectionId=section.id;changed();}).classList.add('track-add-section');
      el('p',s.sections.reduce((n,s)=>n+s.count,0)+' mesures · Durée totale : '+durationText(s)+' · arrêt à la fin du morceau',songPane,'song-note').id='songDuration';
    }
    const labels=el('datalist',undefined,songPane);labels.id='songLabels';for(const name of ['Intro','Couplet 1','Couplet 2','Refrain 1','Refrain 2','Bridge','Solo','Outro'])el('option',name,labels).value=name;
    const transferPane=el('section',undefined,profilePane,'backup-json');el('h3','Copie JSON',transferPane);
    const transfers=el('div',undefined,transferPane,'song-actions');button('Exporter',transfers,()=>{const blob=new Blob([JSON.stringify(library,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='renax-morceaux.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});const importer=el('input',undefined,transferPane);importer.type='file';importer.accept='.json,application/json';importer.hidden=true;button('Importer',transfers,()=>importer.click());importer.onchange=async()=>{try{if(importer.files[0].size>5000000)throw Error('Fichier JSON trop volumineux.');const data=JSON.parse(await importer.files[0].text());validateLibrary(data);if(!await askSongConfirmation('Importer '+data.profiles.length+' profils et '+data.profiles.reduce((n,p)=>n+p.songs.length,0)+' tracks ? Ils seront ajoutés sans remplacer les tracks existants.','Importer'))return;unload();for(const imported of data.profiles){const p=clone(imported);p.id=id();p.name+=' (importé)';p.songs.forEach(s=>s.id=id());library.profiles.push(p);}library.activeProfile=library.profiles.at(-1).id;selectedSong=null;persist();render();status('Bibliothèque importée sans remplacer les morceaux existants.');}catch(e){status('Import refusé : '+e.message);}};
    el('p','Gardez une copie indépendante. Effacer les données du navigateur peut supprimer la sauvegarde locale.',transferPane,'song-note');el('div',storageStatus,transferPane).id='songStatus';setSectionOpen(openSectionId);selectOpenBlock();updatePosition();syncSongTransport();
  }
  // Song playback uses a snapshot; editing the saved arrangement stops its playback.
  // Keep ordinary sequencer and polyrhythm behavior untouched when no song is loaded.
  document.addEventListener('pointerdown',event=>{
    if(event.target.closest('.song-more-wrap'))return;
    songPane.querySelectorAll('.song-more-menu').forEach(menu=>menu.hidden=true);
    songPane.querySelectorAll('.song-more').forEach(trigger=>trigger.setAttribute('aria-expanded','false'));
  },true);
  // Keep menus inside the scrollable panel, including short landscape screens.
  function positionSongMenus(){
    const bounds=panel.getBoundingClientRect(),left=Math.max(8,bounds.left+8),right=Math.min(innerWidth-8,bounds.right-8),top=Math.max(8,bounds.top+8),bottom=Math.min(innerHeight-8,bounds.bottom-8);
    for(const menu of songPane.querySelectorAll('.song-more-menu:not([hidden])')){
      const anchor=menu.parentElement.getBoundingClientRect();
      menu.style.width=Math.max(80,Math.min(176,right-left))+'px';menu.style.boxSizing='border-box';
      menu.style.maxHeight=Math.max(40,bottom-top)+'px';menu.style.overflowY='auto';menu.style.bottom='auto';
      const rect=menu.getBoundingClientRect(),x=Math.max(left,Math.min(anchor.right-rect.width,right-rect.width));
      const y=anchor.bottom+4+rect.height<=bottom?anchor.bottom+4:Math.max(top,Math.min(anchor.top-rect.height-4,bottom-rect.height));
      menu.style.left=(x-anchor.left)+'px';menu.style.right='auto';menu.style.top=(y-anchor.top)+'px';
    }
  }
  new MutationObserver(positionSongMenus).observe(songPane,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  panel.addEventListener('scroll',positionSongMenus,{passive:true});window.addEventListener('resize',positionSongMenus);
  const actionStyle=document.createElement('style');
  actionStyle.textContent='#songPane .song-playlist-card{position:relative;}\n#songPane .song-more-wrap{position:absolute;bottom:8px;right:8px;z-index:12;}\n#songPane .song-more{width:32px;height:32px;padding:0;border:1px solid #363640;border-radius:6px;background:#15151b;color:var(--text-muted);font:700 18px/1 var(--font);cursor:pointer;}\n#songPane .song-more:hover,#songPane .song-more[aria-expanded=true]{border-color:#a45427;color:var(--orange);background:#211a16;}\n#songPane .song-more-menu{position:absolute;bottom:36px;right:0;width:176px;padding:5px;border:1px solid #363640;border-radius:7px;background:#101116;box-shadow:0 10px 28px rgba(0,0,0,.38);}\n#songPane .song-more-menu[hidden]{display:none;}\n#songPane .song-more-menu .btn{display:block;width:100%;min-height:40px;padding:7px 9px;border:0;border-radius:5px;background:transparent;color:var(--text);font:600 11px/1.25 var(--font);text-align:left;text-transform:none;letter-spacing:0;}\n#songPane .song-more-menu .btn:hover{background:#211a16;color:var(--orange);}\n';
  actionStyle.textContent+='#songPane .song-direct-play[aria-pressed="true"]{border-color:#a45427;color:var(--orange);background:#211a16;}';
  actionStyle.textContent+='#songPane .song-detail-toolbar{display:flex;align-items:stretch;flex-wrap:nowrap;gap:6px;}#songPane .song-detail-toolbar > button{height:36px;min-height:36px;box-sizing:border-box;}#songPane .song-detail-toolbar .song-back{margin:0;flex:0 0 auto;}#songPane .song-detail-toolbar .song-count-in-button{min-width:0;padding:6px 8px;}';
  actionStyle.textContent+='#songPane .song-actions.song-detail-toolbar > .btn.song-back,#songPane > .btn.song-back{display:inline-flex;align-items:center;justify-content:center;flex:0 0 36px!important;width:36px!important;min-width:36px!important;max-width:36px;height:36px;min-height:36px;padding:0!important;border:1px solid var(--border);background:rgba(255,255,255,.025)!important;color:var(--orange)!important;border-radius:6px;}#songPane .song-back svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}#songPane .song-back:hover{border-color:var(--orange);background:rgba(255,111,0,.08);}';
  actionStyle.textContent+='.song-confirmation{position:fixed;inset:0;margin:auto!important;height:fit-content;padding:20px;width:min(420px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;}.song-confirmation::backdrop{background:#0008;}.song-confirmation h3{margin:0 0 12px;font:600 15px/1.4 var(--font);}.song-confirm-message{margin:0 0 20px;font:500 12px/1.5 var(--font);overflow-wrap:anywhere;}.song-confirm-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:10px;}.song-confirm-actions .btn{min-height:40px;padding:9px 16px;border:1px solid #505b69;border-radius:6px;background:#343b45;color:var(--text);font:600 11px/1.4 var(--font);text-transform:none;letter-spacing:0;}.song-confirm-actions .song-confirm-accept{border-color:var(--orange);color:var(--orange);}.song-confirm-actions .btn:focus-visible{outline:2px solid var(--cyan);outline-offset:2px;}';
  actionStyle.textContent+='.song-name-label{display:flex;flex-direction:column;gap:8px;margin-bottom:20px;color:var(--text-muted);font:500 12px/1.4 var(--font);}.song-name-input{width:100%;min-width:0;box-sizing:border-box;min-height:44px;padding:10px 12px;border:1px solid #505b69;border-radius:6px;background:#343b45;color:var(--text);font:500 14px/1.4 var(--font);}.song-name-input:focus{outline:2px solid var(--cyan);outline-offset:2px;}.song-name-dialog .btn:disabled{opacity:.4;cursor:not-allowed;}';
  document.head.append(actionStyle);
  render();
  window.RENAX_SONGS={flushPending,playbackSections,validateLibrary,loadSong,unload,locate,
    replaceLibrary(value,preserveNavigation=false){validateLibrary(value);clearTimeout(persistTimer);persistTimer=null;persistFailed=false;unload();library=clone(value);chainedPlaylists.clear();lastTrackSelection=null;if(!preserveNavigation){selectedSong=null;openSectionId=null;songView='home';}else if(!profile().songs.some(s=>s.id===selectedSong)){selectedSong=null;openSectionId=null;if(songView==='detail')songView='playlist';}render();},
    get navigation(){return {pane:songsRoot.hidden?'sequence':'songs',view:songView,song:selectedSong,profile:library.activeProfile};},
    restoreNavigation(state){
      const target=library.profiles.find(p=>p.id===state.profile)||profile();
      const targetSong=target.songs.find(s=>s.id===state.song);
      if(library.activeProfile!==target.id||selectedSong!==(targetSong?.id||null)||songView!==state.view)unload();
      library.activeProfile=target.id;selectedSong=targetSong?.id||null;
       if(targetSong)lastTrackSelection={playlistId:target.id,songId:targetSong.id};
      songView=['home','profile','playlists','playlist','detail'].includes(state.view)?state.view:'home';
      if(songView==='detail'&&!targetSong)songView='playlist';
      openSectionId=null;render();tab(state.pane==='songs'?'songs':'sequence');
    },
    get preparing(){return preparingAmorce;},get library(){return library;},get loaded(){return loaded;}};
  // Restore only against the same primary snapshot and untouched model. A newer tab/account always wins.
  const recoveryScope=RENAX_STORAGE.scope,recoveryRaw=RENAX_STORAGE.rawToken,recoveryModel=JSON.stringify(library);
  RENAX_STORAGE.ready.then(()=>window.RENAX_EMERGENCY?.list(recoveryScope)).then(copies=>{
    if(!copies)return;
    if(RENAX_STORAGE.readOnly||RENAX_STORAGE.scope!==recoveryScope||RENAX_STORAGE.rawToken!==recoveryRaw||JSON.stringify(library)!==recoveryModel)return;
    const copy=copies.find(copy=>copy.baseRaw===recoveryRaw&&JSON.stringify(copy.library)!==recoveryModel);if(!copy)return;
    try{validateLibrary(copy.library);RENAX_SONGS.replaceLibrary(copy.library,true);persist();status('Copie de secours récupérée. Vos dernières modifications sont disponibles.');}catch(error){console.warn('Copie de secours non appliquée',error);}
  }).catch(error=>console.warn('Récupération de secours indisponible',error));
  window.addEventListener('pagehide',()=>{saveLoadedPattern();persist();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flushPending();});
  try{RENAX_STORAGE.write(library);}catch{status('Sauvegarde locale impossible : exporte ta bibliothèque.');}
})();
