/* Presentation only: never starts audio or changes musical data. */
(()=>{
 const overlay=document.getElementById('renaxArrival');if(!overlay)return;
 const preference='renax.arrival.enabled.v1',reduce=matchMedia('(prefers-reduced-motion:reduce)');
 let enabled=true,timer=null,previous=null;
 try{enabled=localStorage.getItem(preference)!=='false';}catch{}
 const word=overlay.querySelector('.console-arrival-word');
 function label(){const en=window.RENAX_I18N?.language==='en';overlay.setAttribute('aria-label',en?'Metronome introduction':'Animation d’arrivée Métronome');const letters=[...(en?'Metronome':'Métronome')];word.replaceChildren(...letters.map((letter,i)=>{const span=document.createElement('span');span.textContent=letter;span.style.setProperty('--n',i);return span;}));}
 function finish(){clearTimeout(timer);overlay.hidden=true;overlay.classList.remove('is-skipping');if(overlay.contains(document.activeElement))previous?.focus();}
 function play(){clearTimeout(timer);previous=document.activeElement;label();overlay.hidden=false;overlay.classList.remove('is-skipping');[overlay,...overlay.querySelectorAll('*')].forEach(e=>e.getAnimations().forEach(a=>{a.cancel();a.play();}));timer=setTimeout(finish,reduce.matches?150:2700);}
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden){e.preventDefault();finish();}},true);
 overlay.addEventListener('animationend',e=>{if(e.target===overlay)finish();});
 const settings=document.querySelector('#index2SettingsPanel .index2-settings-section');
 if(settings){const row=document.createElement('label');row.className='console-arrival-setting';const caption=document.createElement('span'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=enabled;row.append(caption,toggle);settings.append(row);function translate(){caption.textContent=window.RENAX_I18N?.language==='en'?'Intro animation':'Animation d’arrivée';}translate();window.addEventListener('renax-language-changed',translate);toggle.onchange=()=>{enabled=toggle.checked;try{localStorage.setItem(preference,String(enabled));}catch{}};}
 window.addEventListener('renax-language-changed',()=>{if(!overlay.hidden)label();});
 if(enabled&&!reduce.matches){label();previous=document.activeElement;timer=setTimeout(finish,2700);}else finish();
})();
