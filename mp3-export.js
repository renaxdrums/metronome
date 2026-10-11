/* Isolated MP3 export. The live scheduler, library and sound banks are untouched. */
(() => {
  'use strict';
  const RATE=48000, TARGET=Math.pow(10,-1.15/20);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const filename=name=>(name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'')||'Morceau')+'.mp3';
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  async function renderPCM(song,bank,volume) {
    RENAX_SONGS.validateLibrary({version:1,profiles:[{id:'export',name:'Export',songs:[song]}]});
    if(!SOUND_BANKS[bank]||!Number.isFinite(volume)||volume<0||volume>1)throw Error('Réglages audio incorrects.');
    const voice=!!SOUND_BANKS[bank].isVoice;
    if(voice)await prepareAllVoiceAudio();else if(allVoiceAudioPromise)await allVoiceAudioPromise;
    if(audioCtx)await audioCtx.close();
    let duration=0;const sections=[];
    for(const section of song.sections){
      const m=section.measure,barDuration=(60/m.tempo)*(4/m.denominator)*m.numerator;
      sections.push({label:section.label,count:section.count,start:duration,barDuration,tempo:m.tempo,numerator:m.numerator,denominator:m.denominator});
      duration+=barDuration*section.count;
    }
    const lead=voice?VOICE_MAX_ATTACK_SECONDS:0;
    // Oscillator tails are allowed to finish, just as in finite live playback.
    const tail=voice?0:(SOUND_BANKS[bank].tail??(bank==='cloche'?.44:bank==='clic808'?.22:bank==='claves'?.075:bank==='beep'?.075:.055));
    const length=Math.ceil((lead+duration+tail)*RATE);
    if(!Number.isSafeInteger(length)||length>2147483647)throw Error('Morceau trop long pour le rendu audio de ce navigateur.');
    audioCtx=new OfflineAudioContext(1,length,RATE);currentBank=bank;masterVolume=volume;
    let time=lead,events=0,steps=0;
    for(const section of song.sections){
      const m=section.measure,beatDuration=getStepDurationMs(m.tempo,m.denominator,1)/1000;
      const group=voice&&m.denominator>=16?m.denominator/4:1;
      for(let bar=0;bar<section.count;bar++) {
        for(let beat=0;beat<m.numerator;beat++){
          const subdivisions=m.beatSubdivisions[beat];
          for(let sub=0;sub<subdivisions;sub++){
            const state=m.beatStates[beat][sub];
            if(state){playClick(state,time,beat===0&&sub===0,{mode:'metronome',beatNumber:beat%group===0?Math.floor(beat/group)+1:0,subIndex:sub,beatDurationSec:beatDuration*group});events++;}
            time+=getStepDurationMs(m.tempo,m.denominator,subdivisions)/1000;
            if(++steps%4096===0)await pause();
          }
        }
      }
    }
    if(voice)for(const source of scheduledVoiceSources)source.stop(lead+duration);
    const buffer=await audioCtx.startRendering();
    return {pcm:buffer.getChannelData(0).slice(),rate:RATE,score:{name:song.name,duration,lead,tail,events,steps,sections}};
  }
  if(new URLSearchParams(location.search).has('mp3-render')){
    window.RENAX_MP3_RENDER={renderPCM};return;
  }
  function workerClient(){
    const worker=new Worker(new URL('mp3-export-worker.js',document.baseURI));
    let busy=false;
    return {close:()=>worker.terminate(),call:(message,transfer=[])=>new Promise((resolve,reject)=>{
      if(busy){reject(Error('Analyse audio déjà en cours.'));return;}busy=true;
      worker.onmessage=e=>{busy=false;e.data.error?reject(Error(e.data.error)):resolve(e.data);};
      worker.onerror=e=>{busy=false;reject(Error(e.message||'Encodeur MP3 indisponible.'));};
      worker.postMessage(message,transfer);
    })};
  }
  async function isolatedRender(song,bank,volume){
    const frame=document.createElement('iframe');frame.hidden=true;frame.title='Rendu MP3';
    const url=new URL(location.href);url.searchParams.set('mp3-render','1');frame.src=url.href;
    try{
      await new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=()=>reject(Error('Rendu audio indisponible.'));document.body.append(frame);});
      if(!frame.contentWindow.RENAX_MP3_RENDER)throw Error('Module de rendu audio indisponible.');
      return await frame.contentWindow.RENAX_MP3_RENDER.renderPCM(song,bank,volume);
    }finally{frame.remove();}
  }
  async function exportSong(song,bank,volume,progress=()=>{}){
    progress('Rendu du morceau complet…');
    const rendered=await isolatedRender(clone(song),bank,volume),client=workerClient();
    try{
      progress('Gain global, limiteur et encodage MP3…');
      let result=await client.call({op:'prepare',pcm:rendered.pcm,rate:rendered.rate},[rendered.pcm.buffer]);
      let decodedPeak=0,decodedDuration=0;
      for(let attempt=0;attempt<5;attempt++){
        progress('Vérification du niveau du MP3…');
        const decoder=new OfflineAudioContext(1,1,RATE);
        const decoded=await decoder.decodeAudioData(result.bytes.buffer.slice(0));
        decodedDuration=decoded.duration;
        const pcm=decoded.getChannelData(0).slice();
        decodedPeak=(await client.call({op:'peak',pcm},[pcm.buffer])).peak;
        if(decodedPeak<=TARGET)break;
        if(attempt===4)throw Error('Le niveau du MP3 ne peut pas être validé. Aucun fichier écrit.');
        result=await client.call({op:'encode',correction:TARGET/decodedPeak*.995});
      }
      return {blob:new Blob([result.bytes],{type:'audio/mpeg'}),report:{...result.report,decodedTruePeak:decodedPeak,decodedDuration,score:rendered.score,bank,volume,bitrateKbps:320,rate:RATE}};
    }finally{client.close();}
  }
  function playlistSongs(){const library=RENAX_SONGS.library;return library.profiles.find(p=>p.id===library.activeProfile)?.songs||[];}
  let dialog=null;
  function openExport(){
    if(dialog){dialog.showModal();return;}
    dialog=document.createElement('dialog');dialog.id='mp3ExportDialog';
    dialog.addEventListener('keydown',e=>e.stopPropagation());
    const title=document.createElement('h2');title.textContent='EXPORT MP3';
    const label=document.createElement('label');label.htmlFor='mp3ExportSong';label.textContent='Morceau de la playlist';
    const select=document.createElement('select');select.id='mp3ExportSong';
    for(const song of playlistSongs()){const option=document.createElement('option');option.value=song.id;option.textContent=song.name;select.append(option);}
    const actions=document.createElement('div');actions.className='mp3-actions';
    const save=document.createElement('button');save.id='mp3ExportSave';save.className='btn';save.textContent='Choisir l’emplacement et exporter';save.type='button';
    const close=document.createElement('button');close.className='btn';close.textContent='Fermer';close.type='button';close.onclick=()=>dialog.close();
    const status=document.createElement('p');status.id='mp3ExportStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const credit=document.createElement('div');credit.className='mp3-credit';credit.append('MP3 : ');
    for(const [text,href] of [['LAME','https://lame.sourceforge.net/'],['lamejs','https://github.com/zhuker/lamejs']]){const a=document.createElement('a');a.textContent=text;a.href=href;a.target='_blank';a.rel='noopener';credit.append(a,' ');}
    const songs=playlistSongs();save.disabled=!songs.length;
    if(!songs.length)status.textContent='La playlist ne contient aucun morceau.';
    else if(!window.showSaveFilePicker){save.disabled=true;status.textContent='Pour choisir le dossier de destination, ouvre cet export dans Chrome ou Edge sur ordinateur.';}
    let busy=false;
    save.onclick=async()=>{
      const song=playlistSongs().find(s=>s.id===select.value);if(!song||busy)return;
      const snapshot=clone(song),bank=currentBank,volume=masterVolume;
      busy=true;select.disabled=true;save.disabled=true;close.disabled=true;
      try{
        // Picker first: it must retain the activation from this button click.
        const handle=await window.showSaveFilePicker({id:'renax-mp3',startIn:'music',suggestedName:filename(song.name),types:[{description:'Audio MP3',accept:{'audio/mpeg':['.mp3']}}],excludeAcceptAllOption:true});
        const result=await exportSong(snapshot,bank,volume,message=>status.textContent=message);
        const writable=await handle.createWritable();
        try{await writable.write(result.blob);await writable.close();}catch(e){await writable.abort().catch(()=>{});throw e;}
        status.textContent='MP3 enregistré : '+handle.name;
      }catch(e){status.textContent=e.name==='AbortError'?'Export annulé.':e.message;}
      finally{busy=false;select.disabled=false;save.disabled=false;close.disabled=false;}
    };
    dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    dialog.addEventListener('close',()=>{dialog.remove();dialog=null;});
    actions.append(save,close);dialog.append(title,label,select,actions,status,credit);document.body.append(dialog);dialog.showModal();
  }
  function install(){
    const pane=document.getElementById('songPane');if(!pane||pane.hidden||document.getElementById('mp3ExportOpen'))return;
    const isPlaylist=[...pane.children].some(e=>e.tagName==='STRONG'&&e.textContent==='Playlist');
    if(!isPlaylist)return;
    const actions=pane.querySelector('.song-actions');if(!actions)return;
    const button=document.createElement('button');button.id='mp3ExportOpen';button.className='btn';button.type='button';button.textContent='EXPORT MP3';button.onclick=openExport;actions.append(button);
  }
  const observer=new MutationObserver(install);observer.observe(document.getElementById('songsRoot'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});install();
  window.RENAX_MP3_EXPORT={exportSong,filename,isolatedRender,workerClient};
})();
