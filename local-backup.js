/* Atomic local snapshots and persistent outbox, isolated from index.html. */
(() => {
  const LEGACY='renax-drums-songs-v1',PREFIX='renax-index2-store-v1:',SESSION='renax-index2-scope';
  let scope=sessionStorage.getItem(SESSION)||'guest',state=null,core=null,healthy=true,readOnly=false,lastRaw=null;
  if(!/^(guest|user:[A-Za-z0-9_-]+)$/.test(scope))scope='guest';
  const clone=v=>JSON.parse(JSON.stringify(v));
  function notify(){window.dispatchEvent(new CustomEvent('renax-storage',{detail:{scope,healthy}}));}
  function save(next){if(readOnly)throw Error('Source locale illisible : sauvegarde automatique suspendue pour la préserver.');if(localStorage.getItem(PREFIX+scope)!==lastRaw)throw Error('Un autre onglet a modifié cette bibliothèque. Exportez votre copie puis rechargez.');const raw=JSON.stringify(next);localStorage.setItem(PREFIX+scope,raw);if(localStorage.getItem(PREFIX+scope)!==raw)throw Error('La copie locale ne peut pas être vérifiée.');lastRaw=raw;state=next;healthy=true;notify();}
  function read(){
    try{const raw=localStorage.getItem(PREFIX+scope);lastRaw=raw;if(raw){state=JSON.parse(raw);if(state.version!==1||!state.library)throw Error('Format de sauvegarde local incorrect.');return JSON.stringify(state.library);}
      // Preserve the old source, even after the verified copy has been made.
      return scope==='guest'?localStorage.getItem(LEGACY):null;
    }catch(e){healthy=false;readOnly=true;notify();throw e;}
  }
  const ready=import('./sync-core.js?v=20261008-auto-sync').then(module=>{core=module;});
  window.RENAX_STORAGE={ready,read,
    write(library){try{const initial=state||{version:1,library:clone(library),base:{},pending:{},conflicts:{},importDecisions:{}};const next=core?core.stage(initial,library,()=>crypto.randomUUID()):{...initial,library:clone(library)};save(next);return true;}catch(e){healthy=false;notify();throw e;}},
    get scope(){return scope;},get healthy(){return healthy;},get state(){return clone(state);},
    update(next){save(clone(next));},
    async switchScope(nextScope,empty){await ready;if(!/^(guest|user:[A-Za-z0-9_-]+)$/.test(nextScope))throw Error('Identité de stockage incorrecte.');const preserveNavigation=scope===nextScope;scope=nextScope;sessionStorage.setItem(SESSION,scope);state=null;readOnly=false;lastRaw=null;const raw=read();const library=raw?JSON.parse(raw):clone(empty);try{RENAX_SONGS.validateLibrary(library);}catch(e){readOnly=true;healthy=false;throw e;}if(!state)save(core.blankState(library));RENAX_SONGS.replaceLibrary(library,preserveNavigation);window.dispatchEvent(new Event('renax-navigation-restored'));notify();},
    guestState(){const raw=localStorage.getItem(PREFIX+'guest');return raw?JSON.parse(raw):null;},
    guestLibrary(){const raw=localStorage.getItem(PREFIX+'guest');return raw?JSON.parse(raw).library:JSON.parse(localStorage.getItem(LEGACY)||'null');},
    reconcile(){RENAX_SONGS.replaceLibrary(state.library,true);},
    markCorrupt(){readOnly=true;healthy=false;notify();},
    recoverSource(){return localStorage.getItem(PREFIX+scope)||localStorage.getItem(LEGACY);}
  };
  // Each tab keeps its own account scope; Firebase auth uses session persistence as well.
  window.addEventListener('storage',e=>{if(e.key!==PREFIX+scope||!e.newValue)return;window.dispatchEvent(new CustomEvent('renax-other-tab'));});
})();
