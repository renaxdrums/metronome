/* Offline availability is optional. Updates never reload an active metronome. */
(() => {
  'use strict';
  let ready=false,registration;
  const section=document.createElement('section');section.className='index2-settings-section';
  const title=document.createElement('h3');title.textContent='Hors connexion';
  const note=document.createElement('p');note.className='index2-settings-note';note.setAttribute('role','status');
  section.append(title,note);document.getElementById('index2SettingsPanel').append(section);
  const say=text=>{note.textContent=text;};
  async function cacheVoices(){
    if(!registration?.active||!allVoiceAudioReady||!window.MessageChannel)return;
    const urls=[];for(const folder of Object.values(VOICE_METRONOME_FILES))for(let n=1;n<=20;n++)urls.push(folder+'/'+String(n).padStart(2,'0')+'.wav?v='+VOICE_AUDIO_REVISION);
    const channel=new MessageChannel();channel.port1.onmessage=event=>{if(event.data.saved===40&&!registration.waiting)say('Application et voix téléchargées disponibles hors connexion.');channel.port1.close();};
    registration.active.postMessage({type:'CACHE_VOICES',urls},[channel.port2]);
  }
  async function register(){
    try{
      registration=await navigator.serviceWorker.getRegistration('./')||await navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'});
      registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)say('Nouvelle version prête. Fermez les onglets du métronome puis rouvrez le site pour l’utiliser.');});});
      if(registration.active&&navigator.onLine)registration.update().catch(error=>console.warn('Recherche de mise à jour hors connexion',error));
      await new Promise((resolve,reject)=>{navigator.serviceWorker.ready.then(resolve,reject);const installing=registration.installing;if(installing)installing.addEventListener('statechange',()=>{if(installing.state==='redundant')reject(new Error('Installation du cache impossible'));});else if(!registration.active&&!registration.waiting)reject(new Error('Cache indisponible'));});ready=true;
      say('Application disponible hors connexion. Les sons déjà téléchargés restent disponibles.');cacheVoices();
    }catch(error){say('Cache hors connexion indisponible. Le site et la sauvegarde locale restent utilisables en ligne.');console.warn('Cache hors connexion',error);}
  }
  window.addEventListener('renax-voices-ready',cacheVoices);
  if(!('serviceWorker'in navigator)||!isSecureContext){say('Ce navigateur ne permet pas l’ouverture hors connexion. La copie JSON reste disponible.');}
  else{say('Préparation de l’ouverture hors connexion…');const start=()=>{if(window.requestIdleCallback)requestIdleCallback(register,{timeout:3000});else setTimeout(register,500)};if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});}
  window.RENAX_OFFLINE=Object.freeze({get ready(){return ready;},get status(){return note.textContent;}});
})();
