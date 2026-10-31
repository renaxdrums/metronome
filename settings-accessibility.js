/* Modal semantics for the existing preferences panel; layout and navigation stay owned by their modules. */
(() => {
  'use strict';
  const panel=document.getElementById('index2SettingsPanel'),close=document.getElementById('index2SettingsClose');
  const previousInert=new Map();
  const trigger=document.getElementById('index2SettingsBtn');
  trigger.setAttribute('aria-controls',panel.id);
  trigger.setAttribute('aria-expanded','false');
  panel.setAttribute('aria-owns',trigger.id);
  let active=false,returnFocus;
  const isMeixs=()=>document.documentElement.dataset.theme==='avant';
  let nonModal=false;
  panel.setAttribute('role','dialog');
  function sync(){
    const open=panel.classList.contains('open')||panel.classList.contains('mobile-active');
    const nextNonModal=open&&isMeixs();
    if(open===active&&nextNonModal===nonModal)return;
    for(const [element,inert]of previousInert)element.inert=inert;previousInert.clear();
    const wasOpen=active;
    nonModal=nextNonModal;
    active=open;
    panel.setAttribute('aria-modal',String(open&&!nonModal));
    trigger.setAttribute('aria-expanded',String(open));
    document.documentElement.classList.toggle('renax-settings-open',open);
    if(open){
      if(!wasOpen)returnFocus=document.activeElement;
      function isolate(parent){for(const child of parent.children){
        if(child===panel||child===trigger||child.id==='index2SettingsBackdrop'||['SCRIPT','STYLE','LINK'].includes(child.tagName))continue;
        if(child.contains(panel)||child.contains(trigger)){isolate(child);continue;}
        previousInert.set(child,child.inert);child.inert=true;
      }}
      if(!nonModal)isolate(document.body);
      if(!wasOpen)close.focus();
    }else{
      for(const [element,inert]of previousInert)element.inert=inert;
      previousInert.clear();if(returnFocus?.isConnected)returnFocus.focus();
    }
  }
  function keydown(event){
    if(!active)return;
    event.stopPropagation();
    if(nonModal&&event.key!=='Escape')return;
    if(event.key==='Escape'){event.preventDefault();close.click();return;}
    if(event.key!=='Tab')return;
    const elements=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0&&getComputedStyle(element).visibility!=='hidden'});
    elements.push(trigger);
    const first=elements[0],last=elements.at(-1);
    if(!event.shiftKey&&document.activeElement===elements.at(-2)){event.preventDefault();last.focus();return;}
    if(event.shiftKey&&document.activeElement===trigger){event.preventDefault();elements.at(-2)?.focus();return;}
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  const originalEditingField=isEditingField;
  isEditingField=()=>active&&panel.contains(document.activeElement)||originalEditingField();
  panel.addEventListener('keydown',keydown);trigger.addEventListener('keydown',keydown);
  // Shared native-dialog focus contract, also used by cloud confirmations.
  window.RENAX_DIALOG_FOCUS=Object.freeze({show(dialog,initial){
    const previous=document.activeElement,previousId=previous?.id,previousLabel=previous?.getAttribute('aria-label');
    dialog.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key!=='Tab')return;
      const items=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(element=>element.getClientRects().length);
      if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0]?.focus();}
    });
    dialog.addEventListener('close',()=>setTimeout(()=>{
      const restored=previous?.isConnected?previous:previousId?document.getElementById(previousId):previousLabel?[...document.querySelectorAll('button[aria-label]')].find(button=>button.getAttribute('aria-label')===previousLabel):null;
      const target=restored&&!restored.disabled&&restored.getClientRects().length?restored:document.querySelector('dialog[open] button:not(:disabled)')||trigger;
      target?.focus();
    },0),{once:true});
    dialog.showModal();(initial||dialog.querySelector('button'))?.focus();
  }});
  window.RENAX_DIALOGS=Object.freeze({confirm({messageKey,parameters={}}){
    if(document.getElementById('renaxCloudConfirm'))return Promise.resolve(false);
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.id='renaxCloudConfirm';dialog.className='song-confirmation';dialog.setAttribute('aria-labelledby','renaxCloudConfirmTitle');dialog.setAttribute('aria-describedby','renaxCloudConfirmMessage');
      const title=document.createElement('h3');title.id='renaxCloudConfirmTitle';
      const message=document.createElement('p');message.id='renaxCloudConfirmMessage';message.className='song-confirm-message';message.dataset.noTranslate='';
      const actions=document.createElement('div');actions.className='song-confirm-actions';
      const cancel=document.createElement('button'),accept=document.createElement('button');
      for(const button of [cancel,accept]){button.type='button';button.className='btn';}
      accept.classList.add('song-confirm-accept');
      const render=()=>{
        title.textContent=RENAX_I18N.t('cloud.confirmTitle');cancel.textContent=RENAX_I18N.t('cloud.cancel');accept.textContent=RENAX_I18N.t('cloud.accept');
        let text=RENAX_I18N.t(messageKey);for(const [key,value]of Object.entries(parameters))text=text.replaceAll('{'+key+'}',String(value));message.textContent=text;
      };
      render();window.addEventListener('renax-language-changed',render);
      cancel.onclick=()=>dialog.close('cancel');accept.onclick=()=>dialog.close('accept');
      dialog.addEventListener('close',()=>{window.removeEventListener('renax-language-changed',render);const accepted=dialog.returnValue==='accept';dialog.remove();resolve(accepted);},{once:true});
      actions.append(cancel,accept);dialog.append(title,message,actions);document.body.append(dialog);
      try{window.RENAX_DIALOG_FOCUS.show(dialog,cancel);}catch(error){dialog.remove();window.removeEventListener('renax-language-changed',render);resolve(false);console.warn('Confirmation unavailable',error);}
    });
  }});
  document.addEventListener('click',event=>{
    if(!active||!isMeixs()||panel.contains(event.target)||trigger.contains(event.target)||event.target.closest('dialog'))return;
    panel.classList.remove('open','mobile-active');document.getElementById('index2SettingsBackdrop').classList.remove('open');
    if(innerWidth<=1100&&document.body.dataset.mobilePane==='settings')switchTab('visu');
    sync();
  },true);
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  new MutationObserver(sync).observe(panel,{attributes:true,attributeFilter:['class']});sync();
})();
