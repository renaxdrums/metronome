/* Presentation only: never starts audio or changes musical data. */
(()=>{
 const overlay=document.getElementById('renaxArrival');if(!overlay)return;
 const preference='renax.arrival.enabled.v1',reduce=matchMedia('(prefers-reduced-motion:reduce)');
 let enabled=true,timer=null,previous=null;
 try{enabled=localStorage.getItem(preference)!=='false';}catch{}
 const skip=overlay.querySelector('button'),word=overlay.querySelector('.console-arrival-word');
 function label(){const en=window.RENAX_I18N?.language==='en';skip.textContent=en?'Skip':'Passer';skip.setAttribute('aria-label',en?'Skip introduction':'Passer l’animation d’arrivée');overlay.setAttribute('aria-label',en?'Metronome introduction':'Animation d’arrivée Métronome');const letters=[...(en?'Metronome':'Métronome')];word.replaceChildren(...letters.map((letter,i)=>{const span=document.createElement('span');span.textContent=letter;span.style.setProperty('--n',i);return span;}));}
 function finish(){clearTimeout(timer);overlay.hidden=true;overlay.classList.remove('is-skipping');if(overlay.contains(document.activeElement))previous?.focus();}
 function play(){clearTimeout(timer);previous=document.activeElement;label();overlay.hidden=false;overlay.classList.remove('is-skipping');[overlay,...overlay.querySelectorAll('*')].forEach(e=>e.getAnimations().forEach(a=>{a.cancel();a.play();}));skip.focus({preventScroll:true});timer=setTimeout(finish,reduce.matches?150:2700);}
 skip.onclick=finish;overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();finish();}else if(e.key==='Tab'){e.preventDefault();skip.focus();}});
 overlay.addEventListener('animationend',e=>{if(e.target===overlay)finish();});
 const replay=document.createElement('button');replay.type='button';replay.className='console-intro-replay';replay.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg>';replay.onclick=play;
 function replayLabel(){const text=window.RENAX_I18N?.language==='en'?'Replay introduction':'Rejouer l’animation d’arrivée';replay.title=text;replay.setAttribute('aria-label',text);}
 document.querySelector('.index2-header-actions')?.prepend(replay);replayLabel();
 const settings=document.querySelector('#index2SettingsPanel .index2-settings-section');
 if(settings){const row=document.createElement('label');row.className='console-arrival-setting';const caption=document.createElement('span'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=enabled;row.append(caption,toggle);settings.append(row);function translate(){caption.textContent=window.RENAX_I18N?.language==='en'?'Intro animation':'Animation d’arrivée';}translate();window.addEventListener('renax-language-changed',translate);toggle.onchange=()=>{enabled=toggle.checked;try{localStorage.setItem(preference,String(enabled));}catch{}};}
 window.addEventListener('renax-language-changed',()=>{replayLabel();if(!overlay.hidden)label();});
 if(enabled&&!reduce.matches){label();previous=document.activeElement;skip.focus({preventScroll:true});timer=setTimeout(finish,2700);}else finish();
})();
