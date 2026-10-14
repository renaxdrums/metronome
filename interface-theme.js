/* Additional presentation preference; no music, storage model or translations changed. */
(()=>{
  'use strict';
  const key='renax.interfaceTheme.v1';
  const panel=document.getElementById('index2SettingsPanel');
  const languages=panel?.querySelector('.interface-language-buttons');
  const section=languages?.closest('.index2-settings-section');
  if(!section)return;
  const row=document.createElement('div');
  row.className='index2-setting-row interface-theme-row';
  const label=document.createElement('span');
  const group=document.createElement('div');
  group.className='interface-theme-switch';
  group.setAttribute('role','group');
  const buttons={};
  for(const theme of ['light','dark']){
    const button=document.createElement('button');
    button.type='button';
    button.dataset.interfaceTheme=theme;
    button.dataset.noTranslate='';
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>setTheme(theme));
    group.append(button);
    buttons[theme]=button;
  }
  row.append(label,group);
  section.append(row);
  const meta=document.querySelector('meta[name="theme-color"]');
  function localize(){
    const en=document.documentElement.lang==='en';
    label.textContent=en?'Appearance':'Apparence';
    group.setAttribute('aria-label',en?'Interface appearance':'Apparence de l’interface');
    for(const theme of ['light','dark']){
      const value=theme==='light'?(en?'Light':'Clair'):(en?'Dark':'Sombre');
      buttons[theme].textContent=value;
      buttons[theme].setAttribute('aria-label',value);
      buttons[theme].title=value;
    }
  }
  function setTheme(value){
    const selected=value==='light'?'light':'dark';
    document.documentElement.dataset.theme=selected;
    for(const theme of ['light','dark']) buttons[theme].setAttribute('aria-pressed',String(theme===selected));
    if(meta)meta.content=selected==='light'?'#e9eef2':'#1c2127';
    try{localStorage.setItem(key,selected);}catch{}
    window.dispatchEvent(new CustomEvent('renax-theme-changed',{detail:{theme:selected}}));
  }
  window.addEventListener('renax-language-changed',localize);
  localize();
  setTheme(document.documentElement.dataset.theme);
  window.RENAX_THEME={get value(){return document.documentElement.dataset.theme;},setTheme};
})();