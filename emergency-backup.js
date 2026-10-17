/* Secondary emergency copies only. Primary snapshots and cloud revisions stay in local-backup.js. */
(() => {
  'use strict';
  const database='renax-emergency-v1',storeName='copies';
  const tabId=globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2);
  let opening;
  function open(){
    if(!window.indexedDB)return Promise.resolve(null);
    if(!opening)opening=new Promise(resolve=>{
      let request,finished=false;try{request=indexedDB.open(database,1);}catch{resolve(null);return;}
      request.onupgradeneeded=()=>request.result.createObjectStore(storeName,{keyPath:'id'});
      request.onsuccess=()=>{const db=request.result;if(finished){db.close();return;}finished=true;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
      request.onerror=request.onblocked=()=>{finished=true;opening=null;resolve(null);};
    });
    opening.then(db=>{if(!db)opening=null;});
    return opening;
  }
  async function operation(mode,run){
    const db=await open();if(!db)return null;
    return new Promise(resolve=>{
      let result=null,transaction;
      try{transaction=db.transaction(storeName,mode);run(transaction.objectStore(storeName),value=>{result=value;});}
      catch{resolve(null);return;}
      transaction.oncomplete=()=>resolve(result);
      transaction.onerror=transaction.onabort=()=>resolve(null);
    });
  }
  /** Capture immediately; later typing must not mutate an in-flight emergency copy. */
  function save(scope,library,baseRaw){
    const copy={id:scope+':'+tabId,scope,baseRaw,capturedAt:Date.now(),library:JSON.parse(JSON.stringify(library))};
    return operation('readwrite',(store,done)=>{store.put(copy).onsuccess=()=>done(true);}).then(saved=>{if(saved)window.dispatchEvent(new Event('renax-emergency-saved'));return saved;});
  }
  function list(scope){return operation('readonly',(store,done)=>{store.getAll().onsuccess=event=>done(event.target.result.filter(copy=>copy.scope===scope).sort((a,b)=>b.capturedAt-a.capturedAt));}).then(value=>value||[]);}
  /** A successful primary save only removes a matching emergency copy, never another draft. */
  function confirm(scope,library){
    const raw=JSON.stringify(library);
    return operation('readwrite',(store,done)=>{store.getAll().onsuccess=event=>{let removed=0;for(const copy of event.target.result)if(copy.scope===scope&&JSON.stringify(copy.library)===raw){store.delete(copy.id);removed++;}done(removed);};}).then(removed=>{if(removed)window.dispatchEvent(new Event('renax-emergency-saved'));return removed;});
  }
  window.RENAX_EMERGENCY=Object.freeze({save,list,confirm});
})();
