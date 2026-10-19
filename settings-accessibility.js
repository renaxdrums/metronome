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
  panel.setAttribute('role','dialog');
  function sync(){
    const open=panel.classList.contains('open')||panel.classList.contains('mobile-active');
    if(open===active)return;
    active=open;
    panel.setAttribute('aria-modal',String(open));
    trigger.setAttribute('aria-expanded',String(open));
    document.documentElement.classList.toggle('renax-settings-open',open);
    if(open){
      returnFocus=document.activeElement;
      function isolate(parent){for(const child of parent.children){
        if(child===panel||child===trigger||child.id==='index2SettingsBackdrop'||['SCRIPT','STYLE','LINK'].includes(child.tagName))continue;
        if(child.contains(panel)||child.contains(trigger)){isolate(child);continue;}
        previousInert.set(child,child.inert);child.inert=true;
      }}
      isolate(document.body);
      close.focus();
    }else{
      for(const [element,inert]of previousInert)element.inert=inert;
      previousInert.clear();if(returnFocus?.isConnected)returnFocus.focus();
    }
  }
  function keydown(event){
    if(!active)return;
    event.stopPropagation();
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
  panel.addEventListener('keydown',keydown);trigger.addEventListener('keydown',keydown);
  new MutationObserver(sync).observe(panel,{attributes:true,attributeFilter:['class']});sync();
})();
