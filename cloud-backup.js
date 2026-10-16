import * as core from './sync-core.js?v=20261008-auto-sync';
import {firebaseConfig,providers,appCheckSiteKey,emulator} from './firebase-config.js';
const storage=window.RENAX_STORAGE,api=window.RENAX_SONGS;
await storage.ready;
let account=null,remote=null,sdk=null,auth=null,db=null,unsubscribe=null,generation=0,running=false,retry=0,timer=null,deferred=false,message='Sauvegardé dans ce navigateur',failure='',confirmed=false;
let pendingLocalChoice=null;
const rememberKey='renax-index2-remember-auth';
const guestAutoOwnerKey='renax-index2-guest-auto-owner-v1';
let remember=false;try{remember=localStorage.getItem(rememberKey)==='1';}catch{}
const deviceKey='renax-index2-device';
let device;try{device=localStorage.getItem(deviceKey);}catch{}
if(!device){device=crypto.randomUUID();try{localStorage.setItem(deviceKey,device);}catch{/* Keep the recovery interface usable when local storage is full. */}}
const blank=()=>({version:1,activeProfile:'default',profiles:[{id:'default',name:'Mon profil',songs:[]}]});
const say=(state,error='')=>{message=state;failure=error;renderPanel();};
const queue=()=>{confirmed=false;if(!account)return;clearTimeout(timer);say(navigator.onLine?'Modifications locales en attente':'Hors connexion');timer=setTimeout(sync,900);};
function validatedLibrary(state){const value=core.materialize(core.visibleRecords(state),state.library);api.validateLibrary(value);return value;}
// Audio variables are lexical globals; do not enqueue anything into the scheduler.
function playing(){try{return isPlaying;}catch{return false;}}
function deferApply(state){state.library=validatedLibrary(state);storage.update(state);if(playing()){deferred=true;return;}if(core.canonical(api.library)!==core.canonical(state.library))storage.reconcile();deferred=false;}
function decode(document){const value=document.data();if(value.schema!==1||!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.deleted!=='boolean'||typeof value.payload!=='string'||typeof value.operationId!=='string')throw Error('Données distantes incompatibles. Aucune bibliothèque remplacée.');if(!value.deleted)JSON.parse(value.payload);return {revision:value.revision,payload:value.deleted?null:value.payload,deleted:value.deleted,operationId:value.operationId,device:value.device,modifiedAt:core.operationTime(value.operationId)||value.updatedAt?.toMillis?.()||0,updatedAt:value.updatedAt?.toMillis?.()??null};}
function recordRef(uid,id){return sdk.firestore.doc(db,'users',uid,'records',id);}
async function writeAtomic(uid,id,pending){
  return sdk.firestore.runTransaction(db,async transaction=>{
    const ref=recordRef(uid,id),snapshot=await transaction.get(ref),current=snapshot.exists()?decode(snapshot):null;
    if(current?.operationId===pending.operationId)return {record:current};
    if((current?.revision??0)!==pending.expected)return {conflict:current??{revision:0,payload:null,deleted:true,operationId:'',device:'',updatedAt:null}};
    const revision=(current?.revision??0)+1;
    const data={schema:1,revision,payload:pending.payload??'',deleted:pending.deleted,operationId:pending.operationId,device,updatedAt:sdk.firestore.serverTimestamp()};
    transaction.set(ref,data);
    // Immutable revision snapshots. No history purge without a retention decision.
    transaction.set(sdk.firestore.doc(ref,'history',String(revision)),data);
    return {record:{...data,payload:pending.payload,updatedAt:null}};
  });
}
async function sync(){
  if(!account||!sdk||!storage.healthy||running)return;
  if(!navigator.onLine){say('Hors connexion');return;}
  const uid=account.uid,token=generation;running=true;say('Synchronisation en cours');
  try{
    const snapshot=await sdk.firestore.getDocsFromServer(sdk.firestore.collection(db,'users',uid,'records'));
    if(token!==generation)return;
    const records={};snapshot.forEach(doc=>records[doc.id]=decode(doc));
    deferApply(core.mergeRemote(storage.state,records));
    for(const id of Object.keys(storage.state.pending)){
      if(token!==generation)return;
      const pending=storage.state.pending[id];if(!pending)continue;
      const result=await writeAtomic(uid,id,pending);if(token!==generation)return;
      let next=storage.state;
      if(result.conflict){next=core.mergeRemote(next,{[id]:result.conflict});}
      else{
        // A newer local edit during the write is rebased on the confirmed revision.
        next.base[id]=result.record;
        if(next.pending[id]?.operationId===pending.operationId)delete next.pending[id];
        else if(next.pending[id])next.pending[id].expected=result.record.revision;
      }
      if(playing())storage.update(next);else deferApply(next);
    }
    retry=0;confirmed=!Object.keys(storage.state.conflicts).length&&!Object.keys(storage.state.pending).length;
    if(Object.keys(storage.state.conflicts).length)say('Conflit à résoudre');
    else if(Object.keys(storage.state.pending).length)queue();
    else say('Synchronisé');
  }catch(error){if(token!==generation)return;confirmed=false;say(navigator.onLine?'Modifications locales en attente':'Hors connexion',friendly(error));clearTimeout(timer);timer=setTimeout(sync,Math.min(60000,1500*2**Math.min(retry++,6)));}
  finally{running=false;}
}
function friendly(error){const code=error.code||'';if(code.includes('popup-closed')||code.includes('cancelled-popup'))return 'Connexion annulée. Les morceaux locaux sont conservés.';if(code.includes('account-exists-with-different-credential'))return 'Cette adresse utilise déjà une autre méthode. Connectez-vous avec cette méthode, puis utilisez « Lier une méthode ».';if(code.includes('credential-already-in-use'))return 'Cette méthode est liée à un autre compte. Aucune fusion automatique effectuée.';if(code.includes('resource-exhausted'))return 'Quota Firebase atteint. Données locales conservées ; réessayez plus tard.';if(code.includes('permission-denied'))return 'Accès refusé par les règles Firebase. Données locales conservées.';if(code.includes('network')||code.includes('unavailable'))return 'Service indisponible. Le travail local reste disponible.';if(code.includes('requires-recent-login'))return 'Reconnectez-vous avant de lier cette méthode.';if(code.includes('operation-not-allowed'))return 'Cette méthode de connexion n’est pas activée dans Firebase.';return error.message||'Opération impossible.';}
async function ensureFirebase(){
  if(sdk)return;
  if(!firebaseConfig)throw Error('Firebase n’est pas configuré. Aucun morceau n’a été transmis.');
  const version='12.16.0',base='https://www.gstatic.com/firebasejs/'+version+'/';
  const [app,authModule,firestore]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);
  sdk={app,auth:authModule,firestore};const instance=app.initializeApp(firebaseConfig,'renax-index2');
  auth=authModule.initializeAuth(instance,{persistence:remember?authModule.browserLocalPersistence:authModule.browserSessionPersistence,popupRedirectResolver:authModule.browserPopupRedirectResolver});
  // Memory cache plus persistent business outbox: no cross-account disk cache.
  db=firestore.initializeFirestore(instance,{localCache:firestore.memoryLocalCache()});
  if(emulator){if(!['localhost','127.0.0.1'].includes(location.hostname))throw Error('Émulateurs interdits sur le site public.');authModule.connectAuthEmulator(auth,'http://'+emulator.host+':'+emulator.authPort,{disableWarnings:true});firestore.connectFirestoreEmulator(db,emulator.host,emulator.firestorePort);}
  if(appCheckSiteKey&&!emulator){const check=await import(base+'firebase-app-check.js');check.initializeAppCheck(instance,{provider:new check.ReCaptchaEnterpriseProvider(appCheckSiteKey),isTokenAutoRefreshEnabled:true});}
  authModule.onAuthStateChanged(auth,async user=>{
    const token=++generation;unsubscribe?.();unsubscribe=null;remote=null;confirmed=false;clearTimeout(timer);account=user;
    try{
      // Preserve the anonymous library before switching to the account scope.
      // A song created before sign-in must follow the user into the account automatically.
      const guestBeforeSignIn=user?storage.guestLibrary():null;
      const otherAccountCopies=user&&Object.keys(localStorage).some(key=>key.startsWith('renax-index2-store-v1:user:')&&key!=='renax-index2-store-v1:user:'+user.uid);
      await storage.switchScope(user?'user:'+user.uid:'guest',blank());
      if(token!==generation)return;
      if(!user){say('Sauvegardé dans ce navigateur');return;}
      // Anonymous recovery belongs to the first account that claims this browser.
      // Other accounts can still choose the explicit, confirmed import action.
      const guestAutoOwner=user?localStorage.getItem(guestAutoOwnerKey):null;
      if(guestBeforeSignIn&&(guestAutoOwner===user.uid||!guestAutoOwner&&!otherAccountCopies)){
        api.validateLibrary(guestBeforeSignIn);
        if(!guestAutoOwner)localStorage.setItem(guestAutoOwnerKey,user.uid);
        const accountState=storage.state;
        let next=core.mergeLibraries(api.library,guestBeforeSignIn);
        api.validateLibrary(next);
        storage.write(next);
        // Retain guest edit dates rather than treating login as a new edit.
        const guest=storage.guestState(),state=storage.state;
        for(const [id,record] of Object.entries(guest?.pending||{})){
          const existing=accountState.pending[id]||accountState.base[id];
          if(id.startsWith('song_')&&core.flatten(next)[id]!==undefined&&(!existing||(record.modifiedAt||core.operationTime(record.operationId)||0)>(existing.modifiedAt||core.operationTime(existing.operationId)||existing.updatedAt||0))){
            state.pending[id]={...record,expected:state.base[id]?.revision||0};
          }
        }
        state.library=core.materialize(core.visibleRecords(state),state.library);
        storage.update(state);storage.reconcile();
      }
      const uid=user.uid;
      // A new empty account waits for server data; it never uploads a default
      // catalog over an existing remote library at the first connection.
      unsubscribe=firestore.onSnapshot(firestore.collection(db,'users',uid,'records'),{includeMetadataChanges:true},snapshot=>{
        if(token!==generation||snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
        remote=snapshot;queue();
      },error=>{confirmed=false;say('Modifications locales en attente',friendly(error));});
      queue();renderPanel();
    }catch(error){say('Sauvegarde locale indisponible',friendly(error));}
  });
}
async function authenticate(method,creating=false){
  const email=document.getElementById('backupEmail')?.value.trim(),password=document.getElementById('backupPassword')?.value;
  try{await ensureFirebase();await sdk.auth.setPersistence(auth,remember?sdk.auth.browserLocalPersistence:sdk.auth.browserSessionPersistence);localStorage.setItem(rememberKey,remember?'1':'0');sessionStorage.setItem('renax-index2-auth-enabled','1');
    if(method==='email'){const result=await (creating?sdk.auth.createUserWithEmailAndPassword:sdk.auth.signInWithEmailAndPassword)(auth,email,password);if(creating)await sdk.auth.sendEmailVerification(result.user);}
    else if(method==='google'){const provider=new sdk.auth.GoogleAuthProvider();if(account)await sdk.auth.linkWithPopup(account,provider);else await sdk.auth.signInWithPopup(auth,provider);}
  }catch(error){say(message,friendly(error));}
}
function putSong(library,payload){const next=core.copy(library);let profile=next.profiles.find(p=>p.id===payload.profileId);if(!profile){profile={id:payload.profileId,name:'Profil restauré',songs:[]};next.profiles.push(profile);}const index=profile.songs.findIndex(s=>s.id===payload.song.id);if(index<0)profile.songs.push(core.copy(payload.song));else profile.songs[index]=core.copy(payload.song);return next;}
async function resolve(id,choice){try{const conflict=storage.state.conflicts[id];let next=core.resolveConflict(storage.state,id,choice,()=>crypto.randomUUID());
  if(choice==='local'&&!conflict.local.deleted){const payload=JSON.parse(conflict.local.payload);if(payload.type==='song'){next.library=putSong(next.library,payload);next=core.stage(next,next.library,()=>crypto.randomUUID());}}
  deferApply(next);queue();}catch(error){say('Conflit à résoudre',friendly(error));}}
function element(tag,text,parent){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(parent)parent.append(node);return node;}
function button(text,parent,action,disabled=false){const node=element('button',text,parent);node.type='button';node.className='btn';node.disabled=disabled;node.onclick=async()=>{node.disabled=true;try{await action();}catch(error){say(message,friendly(error));}finally{if(node.isConnected)node.disabled=disabled;}};return node;}
async function importGuest(){
  const guest=storage.guestLibrary();if(!guest)return;api.validateLibrary(guest);
  // Preview and confirmation are required before copying anonymous data to an account.
  if(!confirm('Importer les '+guest.profiles.reduce((n,p)=>n+p.songs.length,0)+' morceaux sans compte dans '+account.email+' ? Aucun morceau existant ne sera remplacé.'))return;
  const signature=({id,...song})=>core.canonical({...song,sections:song.sections.map(({id,...section})=>section)});
  const next=core.copy(api.library),known=new Set(next.profiles.flatMap(p=>p.songs.map(signature))),mapping=core.copy(storage.state.importDecisions.guestProfiles||{});
  for(const p of guest.profiles){const songs=p.songs.filter(s=>!known.has(signature(s))).map(core.copy);for(const song of songs){if(next.profiles.some(profile=>profile.songs.some(existing=>existing.id===song.id&&core.canonical(existing)!==core.canonical(song)))){
      if(!confirm('« '+song.name+' » utilise un identifiant déjà présent avec une autre version. Importer explicitement comme copie séparée, sans remplacer l’autre version ?'))throw Error('Import annulé : aucune donnée modifiée.');song.id=crypto.randomUUID();
    }}
    let profile=next.profiles.find(existing=>existing.id===mapping[p.id]);
    if(!profile){profile=core.copy(p);if(next.profiles.some(existing=>existing.id===profile.id))profile.id=crypto.randomUUID();profile.songs=[];next.profiles.push(profile);mapping[p.id]=profile.id;}
    profile.songs.push(...core.copy(songs));songs.forEach(s=>known.add(signature(s)));
  }
  api.validateLibrary(next);storage.write(next);const receipt=storage.state;receipt.importDecisions.guestProfiles=mapping;storage.update(receipt);storage.reconcile();queue();
}
let backupView='';
const backupIcons={
 google:'<path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.3 2.9-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-4V7.4H3a10 10 0 0 0 0 9.2Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.4L6.4 10A6 6 0 0 1 12 5.9Z"/>',
 login:'<path d="M14 3h7v18h-7M3 12h13m-4-4 4 4-4 4"/>',
 account:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M19 7v6m-3-3h6"/>',
 local:'<path d="M4 3h13l4 4v14H3V3h1Zm3 0v6h10V3M7 21v-8h10v8"/>',
 export:'<path d="M12 16V3m-4 4 4-4 4 4M4 14v7h16v-7"/>',
 import:'<path d="M12 3v13m-4-4 4 4 4-4M4 14v7h16v-7"/>'
};
function backupIcon(node,name){
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
 icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('width','20');icon.setAttribute('height','20');icon.setAttribute('aria-hidden','true');
 icon.style.cssText='flex-shrink:0;vertical-align:middle;margin-right:8px';
 if(name!=='google'){icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.8');icon.setAttribute('stroke-linecap','round');icon.setAttribute('stroke-linejoin','round');}
 icon.innerHTML=backupIcons[name];node.prepend(icon);
}
function renderPanel(){
  const pane=document.getElementById('profilePane');if(!pane)return;
  let root=document.getElementById('backupAccount');if(!root){root=element('section');root.id='backupAccount';const back=pane.querySelector('.song-back');if(back)back.after(root);else pane.prepend(root);}
  const optionsOpen=root.querySelector('details')?.open||false;
  // Preserve existing controls and listeners before rebuilding account presentation.
  const json=pane.querySelector('.backup-json');if(json)pane.append(json);
  const emailValue=root.querySelector('#backupEmail')?.value||'',passwordValue=root.querySelector('#backupPassword')?.value||'';
  root.replaceChildren();element('h3','Sauvegarde',root);
  const choices=element('div',undefined,root);choices.className='backup-choices';choices.style.cssText='display:flex;flex-direction:column;gap:8px';
  const choose=(label,icon,view,action,disabled=false)=>{
    const control=button(label,choices,action,disabled);backupIcon(control,icon);
    control.style.cssText='display:flex;align-items:center;justify-content:center;width:100%';
    if(view){control.setAttribute('aria-expanded',String(backupView===view));control.setAttribute('aria-controls','backup-'+view);if(backupView===view)control.style.borderColor='var(--cyan)';}
    return control;
  };
  if(!account){
    const rememberLabel=element('label',undefined,choices);rememberLabel.style.cssText='display:flex;align-items:center;gap:8px;text-transform:none';const rememberBox=element('input',undefined,rememberLabel);rememberBox.type='checkbox';rememberBox.id='backupRemember';rememberBox.checked=remember;rememberBox.onchange=()=>{remember=rememberBox.checked;};element('span','Rester connecté',rememberLabel);
    choose('Se connecter avec Google','google',null,()=>authenticate('google'),!firebaseConfig||!providers.google);
    choose('Se connecter','login','login',()=>{backupView=backupView==='login'?'':'login';renderPanel();});
    choose('Créer un compte','account','account',()=>{backupView=backupView==='account'?'':'account';renderPanel();});
  }
  const localControl=choose('Sauvegarde locale','local','local',()=>{if(pendingLocalChoice){const action=pendingLocalChoice;pendingLocalChoice=null;if(accountDialog.open)accountDialog.close();queueMicrotask(action);return;}backupView=backupView==='local'?'':'local';renderPanel();});localControl.style.borderColor='var(--cyan)';localControl.querySelector('svg').style.color='var(--orange)';
  if(json){json.id='backup-local';json.style.display=backupView==='local'?'flex':'none';root.append(json);const title=json.querySelector('h3');if(title)title.textContent='Sauvegarde locale';json.querySelectorAll('button').forEach((control,index)=>{if(!control.querySelector('svg'))backupIcon(control,index===0?'export':'import');});}

  const state=element('p',storage.healthy?message:'Sauvegarde locale impossible : exportez une copie JSON.',root);state.className='backup-status';state.classList.toggle('is-confirmed',confirmed);state.setAttribute('role','status');state.setAttribute('aria-live','polite');
  if(failure)element('p',failure,root).className='backup-error';
  if(!storage.healthy)button('Exporter la source locale préservée',root,()=>{const raw=storage.recoverSource();if(!raw)throw Error('Aucune source trouvée.');const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),link=element('a');link.href=url;link.download='renax-source-preservee.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  if(!account){
    element('p','Copie locale automatique. Connectez-vous pour retrouver vos morceaux sur vos appareils.',root).className='backup-hint';
    if(!firebaseConfig)element('p','Connexion en ligne indisponible : projet Firebase non configuré.',root);
    const form=element('div',undefined,root);form.className='backup-auth';form.id=backupView==='login'?'backup-login':'backup-account';form.style.display=['login','account'].includes(backupView)?'grid':'none';
    const emailLabel=element('label','E-mail',form),email=element('input',undefined,emailLabel);email.type='email';email.id='backupEmail';email.autocomplete='email';email.value=emailValue;
    const passwordLabel=element('label','Mot de passe',form),password=element('input',undefined,passwordLabel);password.type='password';password.id='backupPassword';password.autocomplete=backupView==='account'?'new-password':'current-password';password.minLength=6;password.value=passwordValue;
    if(backupView==='account')button('Créer un compte',form,()=>authenticate('email',true),!firebaseConfig||!providers.email);
    else button('Se connecter',form,()=>authenticate('email'),!firebaseConfig||!providers.email);
    button('Mot de passe oublié',form,async()=>{await ensureFirebase();await sdk.auth.sendPasswordResetEmail(auth,email.value.trim());say(message,'Si cette adresse dispose d’un compte, un message de réinitialisation lui sera envoyé.');},!firebaseConfig||!providers.email);

  }else{
    element('p',account.email||account.uid,root).className='backup-identity';
    if(!account.emailVerified&&account.email)button('Vérifier mon adresse',root,()=>sdk.auth.sendEmailVerification(account));
    const options=element('details',undefined,root);options.className='backup-options';options.open=optionsOpen;element('summary','Options du compte',options);
    const optionActions=element('div',undefined,options);optionActions.className='backup-option-actions';
    const syncButton=button(failure?'Réessayer la synchronisation':'Actualiser la synchronisation',optionActions,sync);syncButton.setAttribute('aria-label','Réessayer la synchronisation');
    const importButton=button('Importer les morceaux locaux',optionActions,importGuest);importButton.setAttribute('aria-label','Importer les morceaux sans compte');
    button('Lier Google à ce compte',optionActions,()=>authenticate('google'),!providers.google);
    const signout=button('Se déconnecter',root,async()=>{await sdk.auth.signOut(auth);sessionStorage.removeItem('renax-index2-auth-enabled');localStorage.removeItem(rememberKey);remember=false;});signout.classList.add('backup-signout');signout.style.borderColor='var(--cyan)';backupIcon(signout,'login');signout.querySelector('svg').style.color='var(--orange)';signout.querySelector('svg').style.transform='rotate(180deg)';
    // JSON controls stay in the dedicated local backup view.
    for(const [id,conflict] of Object.entries(storage.state?.conflicts||{})){
      const row=element('div',undefined,root);row.className='backup-conflict';let name=id;try{name=JSON.parse(conflict.local.payload??conflict.remote.payload)?.song?.name||id;}catch{}
      element('p','Conflit : '+name+' · en ligne : '+(conflict.remote.updatedAt?new Date(conflict.remote.updatedAt).toLocaleString():'date non disponible')+' · appareil '+conflict.remote.device, row);
      element('p',conflict.remote.deleted?'La version en ligne a été supprimée.':'Les deux versions sont conservées jusqu’à votre choix.',row);
      button('Conserver cet appareil',row,()=>resolve(id,'local'));button('Conserver en ligne',row,()=>resolve(id,'remote'));
    }
  }
}
// Install account UI after songs.js rebuilds its panes; keep local profiles/import/export.
const backupPane=document.getElementById('profilePane');
let backupVisible=!backupPane.hidden&&!backupPane.parentElement.hidden;
const backupNavigationObserver=new MutationObserver(()=>{
  const visible=!backupPane.hidden&&!backupPane.parentElement.hidden;
  if(visible!==backupVisible){
    backupVisible=visible;
    backupView='';
    renderPanel();
  }else if(!document.getElementById('backupAccount'))renderPanel();
});
backupNavigationObserver.observe(backupPane,{childList:true,attributes:true,attributeFilter:['hidden']});
backupNavigationObserver.observe(backupPane.parentElement,{attributes:true,attributeFilter:['hidden']});
window.addEventListener('renax-storage',()=>{renderPanel();});
window.addEventListener('renax-other-tab',()=>say('Conflit local à résoudre','Un autre onglet a modifié cette bibliothèque. Exportez votre copie puis rechargez pour récupérer l’autre version.'));
window.addEventListener('online',queue);window.addEventListener('offline',()=>{if(account)say('Hors connexion');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&account)queue();});
setInterval(()=>{if(deferred&&!playing()){storage.reconcile();deferred=false;}},1500);
window.addEventListener('renax-library-edited',queue);
renderPanel();
if(firebaseConfig&&(remember||sessionStorage.getItem('renax-index2-auth-enabled')==='1'))ensureFirebase().catch(error=>say('Sauvegardé dans ce navigateur',friendly(error)));
window.RENAX_BACKUP={sync,resolve,importGuest,get status(){return {message,failure,account:account?.uid??null,confirmed};},openChoices(onLocal){pendingLocalChoice=typeof onLocal==='function'?onLocal:null;backupView='';renderPanel();accountDialog.append(document.getElementById('backupAccount'));if(!accountDialog.open)accountDialog.showModal();positionAccount();}};

const accountDialog=document.createElement('dialog');accountDialog.id='directAccountDialog';accountDialog.setAttribute('aria-label','Connexion et compte');accountDialog.style.cssText='width:min(390px,calc(100vw - 28px));max-height:85vh;overflow:auto;background:#111116;color:var(--text);border:1px solid #30303a;border-radius:10px;padding:18px;';
const closeAccount=document.createElement('button');closeAccount.type='button';closeAccount.className='btn';closeAccount.setAttribute('aria-label','Fermer');closeAccount.title='Fermer';closeAccount.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';closeAccount.style.cssText='width:28px;height:28px;min-height:28px;padding:0;display:flex;align-items:center;justify-content:center;margin-left:auto;';closeAccount.onclick=()=>accountDialog.close();accountDialog.append(closeAccount);document.body.append(accountDialog);
accountDialog.addEventListener('close',()=>{pendingLocalChoice=null;const root=document.getElementById('backupAccount');if(root){const back=backupPane.querySelector('.song-back');if(back)back.after(root);else backupPane.prepend(root);}renderPanel();});
const accountButton=document.createElement('button');accountButton.type='button';accountButton.id='directAccountBtn';accountButton.className='index2-header-btn';accountButton.title='Connexion et compte';accountButton.setAttribute('aria-label','Connexion et compte');accountButton.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 3h7v18h-7M3 12h13m-4-4 4 4-4 4"/></svg>';
accountButton.onclick=()=>{pendingLocalChoice=null;backupView=account?'':'login';renderPanel();accountDialog.append(document.getElementById('backupAccount'));accountDialog.showModal();positionAccount();};
document.querySelector('.index2-header-actions').prepend(accountButton);

function positionAccount(){
 if(!accountDialog.open)return;
 Object.assign(accountDialog.style,{position:'fixed',margin:'0',right:'auto',bottom:'auto'});
 if(innerWidth<=1100){
  Object.assign(accountDialog.style,{left:'50%',top:'50%',transform:'translate(-50%,-50%)',maxHeight:'85vh'});
 }else{
  const anchor=accountButton.getBoundingClientRect(),width=accountDialog.getBoundingClientRect().width;
  const top=Math.min(innerHeight-120,anchor.bottom+8);
  Object.assign(accountDialog.style,{left:Math.max(8,Math.min(innerWidth-width-8,anchor.right-width))+'px',top:top+'px',transform:'none',maxHeight:Math.max(100,innerHeight-top-16)+'px'});
 }
}
window.addEventListener('resize',positionAccount);
