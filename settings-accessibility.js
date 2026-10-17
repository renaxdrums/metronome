/* Modal semantics for the existing preferences panel; layout and navigation stay owned by their modules. */
(() => {
  'use strict';
  const panel=document.getElementById('index2SettingsPanel'),close=document.getElementById('index2SettingsClose');
  const previousInert=new Map();
  let active=false,returnFocus;
  panel.setAttribute('role','dialog');
  function sync(){
    const open=panel.classList.contains('open')||panel.classList.contains('mobile-active');
    if(open===active)return;
    active=open;
    panel.setAttribute('aria-modal',String(open));
    if(open){
      returnFocus=document.activeElement;
      for(const child of document.body.children){
        if(child===panel||child.id==='index2SettingsBackdrop'||['SCRIPT','STYLE','LINK'].includes(child.tagName))continue;
        previousInert.set(child,child.inert);child.inert=true;
      }
      close.focus();
    }else{
      for(const [element,inert]of previousInert)element.inert=inert;
      previousInert.clear();if(returnFocus?.isConnected)returnFocus.focus();
    }
  }
  panel.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();close.click();return;}
    if(event.key!=='Tab')return;
    const elements=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(element=>{const box=element.getBoundingClientRect();return box.width>0&&box.height>0&&getComputedStyle(element).visibility!=='hidden'});
    const first=elements[0],last=elements.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  new MutationObserver(sync).observe(panel,{attributes:true,attributeFilter:['class']});sync();
})();
