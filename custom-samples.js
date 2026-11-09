/* User audio one-shots: the bytes never leave this browser's IndexedDB. */
(()=>{
 'use strict';
 const KEY='renax.local.samples.v1',STORE='samples',ACTION='addLocalSamples',PREFIX='localSample:';
 const select=document.getElementById('soundBank');
 if(!select||typeof indexedDB==='undefined')return;
 const action=document.createElement('option');action.value=ACTION;action.textContent='+ Ajouter ses samples';action.title='Choisir un ou plusieurs fichiers audio stockés uniquement sur cet appareil';select.append(action);
 const picker=document.createElement('input');picker.type='file';picker.multiple=true;picker.accept='audio/*,.wav,.wave,.mp3,.ogg,.flac,.aif,.aiff,.m4a,.aac,.opus';picker.hidden=true;picker.setAttribute('aria-label','Choisir des samples audio locaux');document.body.append(picker);
 const dbReady=new Promise((resolve,reject)=>{
  const request=indexedDB.open(KEY,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Stockage local indisponible'));
  request.onblocked=()=>reject(Error('Fermez les autres onglets utilisant la banque locale.'));
 });
 async function read(id){
  const db=await dbReady;
  return new Promise((resolve,reject)=>{
   const request=db.transaction(STORE,'readonly').objectStore(STORE).get(id);
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||Error('Lecture du sample impossible'));
  });
 }
 async function list(){
  const db=await dbReady;
  return new Promise((resolve,reject)=>{
   const request=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
   request.onsuccess=()=>resolve(request.result||[]);
   request.onerror=()=>reject(request.error||Error('Liste des samples inaccessible'));
  });
 }
 async function put(record){
  const db=await dbReady;
  return new Promise((resolve,reject)=>{
   const transaction=db.transaction(STORE,'readwrite');
   transaction.objectStore(STORE).put(record);
   transaction.oncomplete=resolve;
   transaction.onerror=()=>reject(transaction.error||Error('Sauvegarde locale du sample impossible'));
   transaction.onabort=()=>reject(transaction.error||Error('Sauvegarde locale annulée'));
  });
 }
 function prepareOneShot(buffer){
  const prepared=prepareInstrumentSample(buffer,Infinity);
  const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  const rate=buffer.sampleRate,window=Math.max(1,Math.round(rate*.005));
  const first=Math.round(prepared.offset*rate);
  let peak=0,quiet=0,end=buffer.length;
  for(let start=first;start<buffer.length;start+=window){
   let energy=0;
   const last=Math.min(buffer.length,start+window);
   for(let i=start;i<last;i++)for(const channel of channels)energy+=channel[i]*channel[i];
   const rms=Math.sqrt(energy/((last-start)*channels.length));
   peak=Math.max(peak,rms);
   quiet=rms<peak*.025?quiet+(last-start):0;
   if(start-first>rate*.025&&quiet>=rate*.04){end=last;break;}
  }
  return {...prepared,duration:Math.max(.015,Math.min(prepared.duration,(end-first)/rate))};
 }
 const recordBanks=new Set();
 function register(meta){
  if(recordBanks.has(meta.id)||!meta.id?.startsWith(PREFIX))return;
  recordBanks.add(meta.id);
  const loaded=new WeakMap(),loads=new WeakMap();
  SOUND_BANKS[meta.id]={
   name:meta.name,tail:1,
   async prepare(context){
    if(loaded.has(context))return;
    let pending=loads.get(context);
    if(!pending){
     pending=(async()=>{
      const saved=await read(meta.id);
      if(!saved?.data)throw Error('Sample local introuvable sur cet appareil : '+meta.name);
      const buffer=await context.decodeAudioData(saved.data.slice(0));
      const prepared=prepareOneShot(buffer);
      loaded.set(context,prepared);
      this.tail=Math.max(1,prepared.duration);
     })();
     loads.set(context,pending);
    }
    try{await pending;}finally{loads.delete(context);}
   },
   play(dest,time,state,isFirst){
    if(!state)return;
    const context=dest.context,prepared=loaded.get(context);
    if(!prepared)return;
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=prepared.buffer;
    source.loop=false;
    const level=state===3?1:state===2?.91:.78;
    gain.gain.setValueAtTime(prepared.gain*level*(isFirst?1.12:1),time);
    source.connect(gain);gain.connect(dest);
    scheduledVoiceSources.add(source);
    source.onended=()=>{scheduledVoiceSources.delete(source);source.disconnect();gain.disconnect();};
    const duration=prepared.duration,fade=Math.min(.005,duration/4);
    gain.gain.setValueAtTime(prepared.gain*level*(isFirst?1.12:1),time+duration-fade);
    gain.gain.linearRampToValueAtTime(0,time+duration);
    source.start(time,prepared.offset,duration);
    source.stop(time+duration);
   }
  };
  BANK_GAINS[meta.id]=.52;
  const option=document.createElement('option');
  option.value=meta.id;option.textContent=meta.name;option.title='Sample personnel · stockage local sur cet appareil';
  select.insertBefore(option,action);
  numboxWidgets.get(select)?.rebuild();
  if(currentBank===meta.id){select.value=currentBank;syncNumbox(select);}
 }
 const ready=list().then(records=>{
  for(const record of records){
   if(typeof record?.id==='string'&&typeof record.name==='string')register({id:record.id,name:record.name});
  }
  return true;
 }).catch(error=>{
  console.warn('Les samples locaux ne sont pas accessibles',error);
  window.RENAX_FEEDBACK?.error('Les samples locaux ne peuvent pas être restaurés sur cet appareil.',error);
  return false;
 });
 select.addEventListener('change',event=>{
  if(select.value!==ACTION)return;
  event.stopImmediatePropagation();
  const previous=event.detail?.previousValue;
  select.value=previous&&SOUND_BANKS[previous]?previous:currentBank;
  queueMicrotask(()=>syncNumbox(select));
  picker.click();
 },true);
 picker.addEventListener('change',async()=>{
  const files=Array.from(picker.files||[]);picker.value='';
  if(!files.length)return;
  if(!await ready){window.RENAX_FEEDBACK?.error('Stockage local indisponible : aucun sample n’a été importé.');return;}
  let last=null;
  for(const file of files){
   try{
    if(!file.size||file.size>30*1024*1024)throw Error('Le fichier doit être non vide et inférieur à 30 Mo.');
    const raw=await file.arrayBuffer();
    const context=ensureAudioContextForDecode();
    const decoded=await context.decodeAudioData(raw.slice(0));
    prepareInstrumentSample(decoded,Infinity); // Reject silence and undecodable data before writing.
    const id=PREFIX+crypto.randomUUID();
    const name=file.name.slice(0,100);
    await put({id,name,data:raw,uploadedAt:Date.now(),size:file.size});
    register({id,name});last=id;
   }catch(error){
    console.warn('Import de sample refusé',file.name,error);
    window.RENAX_FEEDBACK?.error('Impossible d’importer '+file.name+'. Vérifiez le format audio et l’espace disponible.',error);
   }
  }
  if(last){select.value=last;select.dispatchEvent(new Event('change',{bubbles:true}));}
 });
 window.RENAX_CUSTOM_SAMPLES=Object.freeze({ready,openPicker:()=>picker.click(),isLocalBank:id=>typeof id==='string'&&id.startsWith(PREFIX)});
})();
