/* Live playlist sharing is independent of the metronome scheduler. */
import {firebaseConfig,appCheckSiteKey,emulator} from './firebase-config.js';
import {SHARE_ID_PATTERN,shareIdInLink,publicShareLink,
  addOrUpdateSharedPlaylist,exportSharePayload} from './playlist-sharing-core.mjs';

const api=window.RENAX_SONGS,storage=window.RENAX_STORAGE;
const version='12.16.0',base='https://www.gstatic.com/firebasejs/'+version+'/';
let sdkPromise=null,readerPromise=null;
const listeners=new Map(),pending=new Map();
let activeScope=null,publishTimer=null,importing=false;
let hydratedUid=null;

function message(text,buttons=[['Fermer',()=>{}]]) {
  const dialog=document.createElement('dialog');
  dialog.className='song-confirmation';
  dialog.setAttribute('aria-label','Partage RENAX');
  const title=document.createElement('h3');title.textContent='Partage de playlist';
  const note=document.createElement('p');note.className='song-confirm-message';note.textContent=text;
  const actions=document.createElement('div');actions.className='song-confirm-actions';
  for(const [label,action] of buttons){
    const button=document.createElement('button');button.type='button';button.className='btn';
    button.textContent=label;button.onclick=()=>{dialog.close();dialog.remove();action();};
    actions.append(button);
  }
  dialog.append(title,note,actions);
  dialog.addEventListener('cancel',()=>dialog.remove());
  document.body.append(dialog);dialog.showModal();
  return dialog;
}
async function modules() {
  if(!sdkPromise)sdkPromise=Promise.all(['firebase-app.js','firebase-auth.js','firebase-firestore.js']
    .map(path=>import(base+path))).then(([app,auth,firestore])=>({app,auth,firestore}));
  return sdkPromise;
}
async function reader() {
  if(!firebaseConfig)throw Error('Le partage en ligne n’est pas configuré.');
  if(!readerPromise)readerPromise=(async()=>{
    const sdk=await modules(),instance=sdk.app.initializeApp(firebaseConfig,'renax-playlist-reader');
    const db=sdk.firestore.initializeFirestore(instance,{localCache:sdk.firestore.memoryLocalCache()});
    if(emulator){
      if(!['localhost','127.0.0.1'].includes(location.hostname))throw Error('Émulateur interdit.');
      sdk.firestore.connectFirestoreEmulator(db,emulator.host,emulator.firestorePort);
    }else if(appCheckSiteKey){
      const check=await import(base+'firebase-app-check.js');
      check.initializeAppCheck(instance,{provider:new check.ReCaptchaEnterpriseProvider(appCheckSiteKey),isTokenAutoRefreshEnabled:true});
    }
    return {sdk,db};
  })().catch(error=>{readerPromise=null;throw error;});
  return readerPromise;
}
async function owner() {
  const uid=window.RENAX_BACKUP?.status.account;
  if(!uid)throw Error('Pour publier une playlist, connecte-toi. La réception reste possible en local.');
  const sdk=await modules(),instance=sdk.app.getApp('renax-index2');
  const auth=sdk.auth.getAuth(instance);
  await auth.authStateReady();
  if(!auth.currentUser||auth.currentUser.uid!==uid)throw Error('Connexion non confirmée. Réessaie.');
  return {sdk,db:sdk.firestore.getFirestore(instance),uid};
}
const shareRef=(sdk,db,id)=>sdk.firestore.doc(db,'playlistShares',id);
function outbound(uid) {
  try {
    const data=JSON.parse(localStorage.getItem('renax-playlist-outbound-v1:'+uid)||'{}');
    return data&&typeof data==='object'&&!Array.isArray(data)?data:{};
  }catch{return {};}
}
function putOutbound(uid,map){localStorage.setItem('renax-playlist-outbound-v1:'+uid,JSON.stringify(map));}
async function discoverOwnedShares(uid) {
  if(hydratedUid===uid)return outbound(uid);
  const {sdk,db,uid:live}=await owner();
  if(live!==uid)throw Error('La session a changé.');
  const query=sdk.firestore.query(sdk.firestore.collection(db,'playlistShares'),
    sdk.firestore.where('ownerUid','==',uid),sdk.firestore.limit(200));
  const snapshot=await sdk.firestore.getDocsFromServer(query);
  if(window.RENAX_BACKUP?.status.account!==uid)throw Error('La session a changé.');
  // The server is authoritative: drop stale/revoked mappings from other devices.
  const map={};
  for(const document of snapshot.docs){
    const share=document.data();
    if(!share.revoked && SHARE_ID_PATTERN.test(document.id)
       && typeof share.profileId==='string' && !map[share.profileId])
      map[share.profileId]=document.id;
  }
  putOutbound(uid,map);
  hydratedUid=uid;
  return map;
}
function currentProfile(id){return api.library.profiles.find(p=>p.id===id);}
function playing() {try{return isPlaying||!!api.preparing;}catch{return false;}}

async function publishOne(id,shareId,uid,source) {
  const {sdk,db,uid:live}=await owner();
  if(live!==uid)throw Error('Le compte a changé.');
  const ref=shareRef(sdk,db,shareId);
  const payload=exportSharePayload(source,api.validateLibrary);
  await sdk.firestore.runTransaction(db,async tx=>{
    const snapshot=await tx.get(ref);
    if(!snapshot.exists())throw Error('Lien introuvable. Il faut créer un nouveau partage.');
    const old=snapshot.data();
    if(old.ownerUid!==uid||old.profileId!==id||old.revoked)throw Error('Ce lien ne peut plus être modifié.');
    if(old.payload===payload)return;
    tx.update(ref,{payload,revision:old.revision+1,updatedAt:sdk.firestore.serverTimestamp()});
  });
}
async function publishUpdates() {
  const uid=window.RENAX_BACKUP?.status.account;
  if(!uid)return;
  const map=await discoverOwnedShares(uid);
  for(const [id,token] of Object.entries(map)) {
    if(!SHARE_ID_PATTERN.test(token))continue;
    const source=currentProfile(id);
    if(!source)continue; // Deletion is never used to revoke an unrelated link implicitly.
    try{await publishOne(id,token,uid,source);}
    catch(error){console.warn('[RENAX partage] Mise à jour en attente :',error);}
  }
}
function schedulePublish(){
  clearTimeout(publishTimer);
  publishTimer=setTimeout(()=>{if(navigator.onLine)publishUpdates().catch(console.warn);},1600);
}

async function revokeShare(profileId,shareId,uid) {
  const {sdk,db,uid:live}=await owner();
  if(uid!==live)throw Error('Le compte a changé.');
  const ref=shareRef(sdk,db,shareId);
  await sdk.firestore.runTransaction(db,async transaction=>{
    const snapshot=await transaction.get(ref);
    if(!snapshot.exists())throw Error('Lien déjà désactivé ou introuvable.');
    const old=snapshot.data();
    if(old.ownerUid!==uid||old.profileId!==profileId||old.revoked)throw Error('Ce lien ne peut pas être désactivé.');
    transaction.update(ref,{revoked:true,revision:old.revision+1,updatedAt:sdk.firestore.serverTimestamp()});
  });
  const map=outbound(uid);
  if(map[profileId]===shareId){delete map[profileId];putOutbound(uid,map);}
}
function linkDialog(url,name,profileId,shareId,uid) {
  const dialog=message('Lien créé. Tu peux le partager par SMS, e-mail, WhatsApp ou une autre application.',[]);
  const input=document.createElement('input');input.type='text';input.readOnly=true;
  input.className='song-name-input';input.value=url;input.setAttribute('aria-label','Lien de la playlist');
  const actions=dialog.querySelector('.song-confirm-actions');
  const linkButton=(label,fn)=>{
    const button=document.createElement('button');button.className='btn';button.type='button';button.textContent=label;
    button.onclick=fn;actions.append(button);
  };
  dialog.querySelector('.song-confirm-message').after(input);
  linkButton('Partager',async()=>{
    try{if(navigator.share)await navigator.share({title:name,url});else throw Error('Partage système indisponible');}
    catch(error){if(error.name!=='AbortError')input.select();}
  });
  linkButton('Copier le lien',async()=>{
    try{await navigator.clipboard.writeText(url);dialog.querySelector('.song-confirm-message').textContent='Lien copié.';}
    catch{input.focus();input.select();dialog.querySelector('.song-confirm-message').textContent='Sélectionne et copie le lien.';}
  });
  linkButton('Désactiver ce lien',()=>{
    message('Ce lien ne pourra plus être ouvert et les abonnés ne recevront plus de mises à jour. Leurs copies locales resteront intactes.',[
      ['Désactiver',()=>revokeShare(profileId,shareId,uid)
        .then(()=>{dialog.close();dialog.remove();message('Lien désactivé.');})
        .catch(showError)],
      ['Annuler',()=>{}]
    ]);
  });
  linkButton('Fermer',()=>{dialog.close();dialog.remove();});
}
async function share(profileId) {
  const profile=currentProfile(profileId);
  if(!profile)throw Error('Playlist introuvable.');
  if(profileId.startsWith('shared_'))throw Error('Une playlist reçue ne peut pas être republiée comme originale.');
  if(!window.RENAX_BACKUP?.status.account) {
    message('Pour créer un lien avec mises à jour automatiques, connecte-toi à ton compte. Les musiciens qui reçoivent le lien peuvent rester en local.',
      [['Connexion',()=>window.RENAX_BACKUP?.openChoices()],['Annuler',()=>{}]]);
    return;
  }
  const {sdk,db,uid}=await owner();
  const scope=storage.scope;
  const map=await discoverOwnedShares(uid);
  let shareId=map[profileId];
  const payload=exportSharePayload(profile,api.validateLibrary);
  if(shareId&&SHARE_ID_PATTERN.test(shareId)){
    await publishOne(profileId,shareId,uid,profile);
  }else{
    shareId=crypto.randomUUID().replace(/-/g,'');
    await sdk.firestore.setDoc(shareRef(sdk,db,shareId),{
      schema:1,ownerUid:uid,profileId,revision:1,payload,revoked:false,
      createdAt:sdk.firestore.serverTimestamp(),updatedAt:sdk.firestore.serverTimestamp()
    });
    if(scope!==storage.scope||uid!==window.RENAX_BACKUP?.status.account)throw Error('Compte changé pendant le partage.');
    map[profileId]=shareId;
    putOutbound(uid,map);
  }
  linkDialog(publicShareLink(location.href,shareId),profile.name,profileId,shareId,uid);
}

async function apply(document,id,navigate=false) {
  if(storage.readOnly)throw Error('Sauvegarde locale en lecture seule.');
  const editing=document.activeElement?.closest?.('#songPane') &&
    document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]');
  if(playing()||editing){pending.set(id,{document,navigate});return;}
  if(!api.flushPending())throw Error('Une sauvegarde locale est en attente. Mise à jour différée.');
  await storage.ready;
  const scope=storage.scope,token=storage.rawToken;
  const result=addOrUpdateSharedPlaylist(api.library,document,id,api.validateLibrary);
  if(!result.changed){
    if(navigate)api.restoreNavigation({pane:'songs',view:'playlists',profile:api.library.activeProfile});
    return false;
  }
  if(scope!==storage.scope||token!==storage.rawToken)throw Error('La session a changé pendant l’importation.');
  storage.write(result.library); // Durable write first; no in-memory replacement on failure.
  api.replaceLibrary(result.library,true);
  if(navigate)api.restoreNavigation({pane:'songs',view:'playlists',profile:result.library.activeProfile});
  window.dispatchEvent(new CustomEvent('renax-share-updated',{detail:{shareId:id,added:result.added}}));
  return true;
}
async function pullLink(id) {
  const {sdk,db}=await reader();
  const snapshot=await sdk.firestore.getDocFromServer(shareRef(sdk,db,id));
  if(!snapshot.exists())throw Error('Lien de playlist introuvable ou désactivé.');
  return snapshot.data();
}
async function importLink(id) {
  if(importing)return;
  importing=true;
  try{
    const document=await pullLink(id);
    const localSession=storage.scope==='guest' &&
      api.library.profiles.some(profile=>profile.songs.length>0 || profile.name!=='Mon profil');
    if(localSession){
      const changed=await apply(document,id,true);
      history.replaceState(null,'',location.pathname+location.search);
      if(!changed)message('Cette playlist est déjà présente dans tes playlists.');
      await refreshSubscriptions();
    }else if(storage.scope==='guest') {
      message('Comment veux-tu recevoir cette playlist ?',[
        ['Utiliser en local',()=>apply(document,id,true).then(()=>{history.replaceState(null,'',location.pathname+location.search);refreshSubscriptions();}).catch(showError)],
        ['Se connecter',()=>{sessionStorage.setItem('renax-share-pending-v1',id);window.RENAX_BACKUP?.openChoices();}]
      ]);
    }else{
      const changed=await apply(document,id,true);
      history.replaceState(null,'',location.pathname+location.search);
      message(changed?'Playlist ajoutée à tes playlists.':'Cette playlist est déjà présente dans tes playlists.');
      refreshSubscriptions();
    }
  }catch(error){showError(error);}
  finally{importing=false;}
}
function showError(error){message('Partage indisponible : '+(error?.message||String(error)));}
async function refreshSubscriptions() {
  const scope=storage.scope;
  if(scope!==activeScope){for(const unsub of listeners.values())unsub();listeners.clear();pending.clear();activeScope=scope;}
  const ids=new Set(api.library.profiles.map(p=>p.id).filter(id=>/^shared_[0-9a-f]{32}$/.test(id)).map(id=>id.slice(7)));
  for(const [id,unsub]of listeners)if(!ids.has(id)){unsub();listeners.delete(id);}
  if(!ids.size||!navigator.onLine)return;
  try{
    const {sdk,db}=await reader();
    if(storage.scope!==scope)return;
    for(const id of ids)if(!listeners.has(id)){
      const unsubscribe=sdk.firestore.onSnapshot(shareRef(sdk,db,id),snapshot=>{
        if(snapshot.metadata.fromCache||!snapshot.exists())return;
        if(storage.scope!==scope)return;
        apply(snapshot.data(),id).catch(error=>console.warn('[RENAX partage]',error));
      },error=>console.warn('[RENAX partage] Lecture indisponible',error));
      listeners.set(id,unsubscribe);
    }
  }catch(error){console.warn('[RENAX partage] Abonnement indisponible',error);}
}
function flushPending(){
  if(playing()||(document.activeElement?.closest?.('#songPane') && document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]')))return;
  for(const [id,value]of pending){
    pending.delete(id);
    apply(value.document,id,value.navigate).catch(showError);
  }
}
window.RENAX_PLAYLIST_SHARING={share(profileId){share(profileId).catch(showError);}};
window.addEventListener('renax-library-edited',()=>{schedulePublish();refreshSubscriptions().catch(console.warn);});
window.addEventListener('renax-storage',()=>{
  refreshSubscriptions().catch(console.warn);
  if(storage.scope.startsWith('user:')&&!importing){
    if(hydratedUid!==window.RENAX_BACKUP?.status.account)schedulePublish();
    let queued=null;
    try{queued=sessionStorage.getItem('renax-share-pending-v1');}catch{}
    if(queued&&SHARE_ID_PATTERN.test(queued)){
      try{sessionStorage.removeItem('renax-share-pending-v1');}catch{}
      setTimeout(()=>importLink(queued).catch(showError),500);
    }
  }
});
window.addEventListener('online',()=>{refreshSubscriptions().catch(console.warn);publishUpdates().catch(console.warn);});
setInterval(flushPending,1200);
await storage.ready;
await refreshSubscriptions();
let incoming=shareIdInLink(location.hash);
if(!incoming){try{incoming=sessionStorage.getItem('renax-share-pending-v1');}catch{}}
if(incoming&&SHARE_ID_PATTERN.test(incoming)){
  const pendingAfterLogin=storage.scope!=='guest';
  if(pendingAfterLogin){try{sessionStorage.removeItem('renax-share-pending-v1');}catch{}}
  if(!pendingAfterLogin||shareIdInLink(location.hash))importLink(incoming).catch(showError);
}
