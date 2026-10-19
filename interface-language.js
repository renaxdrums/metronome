/* Interface language only: musical data, user labels and audio stay unchanged. */
(()=>{
 const storageKey='renax.interfaceLanguage.v1';let language='fr';try{const saved=localStorage.getItem(storageKey);if(['fr','en','es','de','it'].includes(saved))language=saved;}catch{}
 const languageData=window.RENAX_TRANSLATIONS;
 const translations=Object.assign(Object.create(null),languageData?.legacy||{});
 const messages=languageData?.messages||{fr:{},en:{}};
 if(!languageData)language='fr';
 const locales=window.RENAX_LOCALES||{};
 const available=languageData&&window.i18next&&Object.keys(locales).length===3;
 const resources={};for(const code of ['fr','en','es','de','it'])resources[code]={translation:code==='fr'?{}:code==='en'?Object.fromEntries(Object.values(translations).map(value=>[value,value])):locales[code]||{}};
 const engine=available?window.i18next.createInstance():null;
 engine?.init({lng:language,supportedLngs:['fr','en','es','de','it'],fallbackLng:'en',resources,initImmediate:false,keySeparator:false,nsSeparator:false,interpolation:{escapeValue:false}});
 if(!available&&language!=='en')language='fr';
 function target(text,code=language){return code==='en'||code==='fr'?text:engine?.t(text,{lng:code,defaultValue:text})??text;}
 const keyedText=key=>{const en=messages.en?.[key];return language==='fr'?messages.fr?.[key]:en===undefined?undefined:target(en);};
 const reverse=new Map();for(const [fr,en] of Object.entries(translations)){reverse.set(en,fr);for(const code of ['es','de','it'])if(locales[code]?.[en])reverse.set(locales[code][en],fr);}
 const toSource=text=>reverse.get(text.trim())?text.replace(text.trim(),reverse.get(text.trim())):text;

 
 
 
 
 
 
 const upper={},lower={};for(const [fr,en] of Object.entries(translations)){upper[fr.toLocaleUpperCase('fr')]=en.toUpperCase();lower[fr.toLocaleLowerCase('fr')]=en;}
 function english(text,element){const raw=text.trim();const dotted=raw.match(/^(Ronde|Blanche|Noire|Croche|Double|Triple) pointée$/);if(dotted)return text.replace(raw,'Dotted '+translations[dotted[1]].toLowerCase());let value=translations[raw]??upper[raw]??lower[raw.toLocaleLowerCase('fr')];if((raw==='Temps'||raw==='TEMPS')&&element?.closest('.training-section,.panel-training,#trainingFields'))value=raw==='TEMPS'?'DURATION':'Duration';if((raw==='Silence'||raw==='SILENCE')&&element?.closest('#silentSettings'))value=raw==='SILENCE'?'SILENT BARS':'Silent bars';if(value!==undefined)return text.replace(raw,value);
  const patterns=[[/^Connexion et compte · (.+)$/,(_,status)=>"Sign in and account · "+english(status)],[/^Écouter (.+) en boucle$/,'Loop $1'],[/^Options de (.+)$/,'$1 options'],[/^Banque de sons · /,'Sound bank · '],[/^Division du temps (\u005cd+) · /,'Beat $1 subdivision · '],[/^Remplacer le preset /,'Replace preset '],[/^Supprimer le preset /,'Delete preset '],[/^Groupe (\d+)/,'Group $1'],[/^Taille du groupe (\d+)/,'Group $1 size'],[/^(Note|Silence) (\d+) · durée (.+) unité\(s\)$/,(_whole,type,n,d)=> (type==='Silence'?'Rest':'Note')+' '+n+' · duration '+d+' unit(s)'],[/^MESURE (\d+\s*\/\s*\d+)$/,'BAR $1'],[/^(\d+) mesures?\b/,'$1 bars'],[/^(\d+) sections?\b/,'$1 sections'],[/^Régler le temps (\d+)/,'Edit beat $1'],[/^Tempo mesure (\d+)/,'Bar $1 tempo'],[/^Écouter la mesure (\d+) en boucle/,'Loop bar $1'],[/^Options de la mesure (\d+)/,'Bar $1 options'],[/^Écouter uniquement le bloc /,'Play section only: '],[/^Lire le morceau /,'Play song: '],[/^Ouvrir la playlist /,'Open playlist: '],[/^Actions de la playlist /,'Playlist actions: '],[/^Actions du bloc /,'Section actions: '],[/^Actions pour /,'Actions for '],[/^Ouvrir /,'Open '],[/^Supprimer la playlist /,'Delete playlist '],[/^Supprimer /,'Delete '],[/^Préparation du guide vocal…$/,'Preparing voice cues…'],[/^Guide vocal prêt · (\d+) mesures de décompte\.$/,'Voice cues ready · $1 count-in bars.'],[/^Appuyer et glisser pour déplacer · Alt \+ flèche pour réordonner$/,'Press and drag to move · Alt + arrow to reorder'],[/^Appuyer et glisser pour déplacer$/,'Press and drag to move'],[/^Sample fourni par Renax$/,'Sample supplied by Renax'],[/^Sample acoustique · CC0 · /,'Acoustic sample · CC0 · '],[/^Sample de métronome · CC0 · /,'Metronome sample · CC0 · '],[/^Durée totale en /,'Total duration in ']];
  if(/^\d+ pistes?$/.test(raw))return text.replace(raw,raw.replace(/pistes?$/,Number(raw.split(' ')[0])===1?'track':'tracks'));
  let result=raw.replace(/^(\d+) morceaux?$/i,(_,n)=>n+' '+(Number(n)===1?'song':'songs'));for(const [pattern,replacement] of patterns)result=result.replace(pattern,replacement);result=result.replace(/\b1 bars\b/g,'1 bar').replace(/\bmesures\b/g,'bars').replace(/\bmesure\b/g,'bar').replace(/Durée totale :/g,'Total duration:').replace(/arrêt à la fin du morceau/g,'stops at the end of the song').replace(/tempo du premier bloc/g,'first section tempo').replace(/\bmorceau\(x\)/g,'song(s)').replace(/\bmesures de décompte\b/g,'count-in bars').replace(/ BPM atteinte — entraînement arrêté\./g,' BPM reached — practice stopped.');
  return result===raw?text:text.replace(raw,result);
 }
 function interpolate(key,values){let result=target(key);for(const [name,value] of Object.entries(values))result=result.replaceAll('{'+name+'}',value);return result;}
 function translatedEnglish(text){
  const raw=text.trim(),direct=target(raw);if(direct!==raw)return text.replace(raw,direct);
  // Uppercase presentation is separate from catalog lookup.
  const canonical=Object.keys(locales[language]||{}).find(key=>key.toUpperCase()===raw);
  if(canonical)return text.replace(raw,target(canonical).toLocaleUpperCase(language));
  const patterns=[
   [/^Sign in and account · (.+)$/,m=>target('Sign in and account')+' · '+translatedEnglish(m[1])],
   [/^Group (\d+) size$/,m=>interpolate('Group {n} size',{n:m[1]})],
   [/^Group (\d+)$/,m=>interpolate('Group {n}',{n:m[1]})],
   [/^BAR (.+)$/,m=>interpolate('Bar {n}',{n:m[1]}).toLocaleUpperCase(language)],
   [/^(\d+) (bars?|sections|songs?|tracks?)$/,m=>interpolate('{n} '+m[2],{n:m[1]})],
   [/^Loop bar (\d+)$/,m=>interpolate('Loop bar {n}',{n:m[1]})],
   [/^Bar (\d+) tempo$/,m=>interpolate('Bar {n} tempo',{n:m[1]})],
   [/^Bar (\d+) options$/,m=>interpolate('Bar {n} options',{n:m[1]})],
   [/^Edit beat (\d+)$/,m=>interpolate('Edit beat {n}',{n:m[1]})],
   [/^Beat (\d+) subdivision · (.+)$/,m=>interpolate('Beat {n} subdivision · {name}',{n:m[1],name:translatedEnglish(m[2])})],
   [/^Voice cues ready · (\d+) count-in bars\.$/,m=>interpolate('Voice cues ready · {n} count-in bars.',{n:m[1]})],
   [/^(Note|Rest) (\d+) · duration (.+) unit\(s\)$/,m=>interpolate(m[1]+' {n} · duration {d} unit(s)',{n:m[2],d:m[3]})],
   [/^(.+) options$/,m=>interpolate('{name} options',{name:m[1]})]
  ];
  for(const [pattern,replace] of patterns){const match=raw.match(pattern);if(match)return text.replace(raw,replace(match));}
  for(const prefix of ['Sound bank · ','Replace preset ','Delete preset ','Play section only: ','Play song: ','Open playlist: ','Playlist actions: ','Section actions: ','Actions for ','Open ','Delete playlist ','Delete ','Acoustic sample · CC0 · ','Metronome sample · CC0 · '])if(raw.startsWith(prefix))return text.replace(raw,interpolate(prefix+'{name}',{name:raw.slice(prefix.length)}));
  const loop=raw.match(/^Loop (.+)$/);if(loop)return text.replace(raw,interpolate('Loop {name}',{name:loop[1]}));
  return text;
 }
 function localized(text,element){if(language==='fr')return productWords(text);const en=english(text,element);return language==='en'?productWords(en):translatedEnglish(en);}
 const textRecords=new WeakMap(),attributeRecords=new WeakMap();
 const protectedText='script,style,textarea,input,[data-i18n-key],[contenteditable=true],.song-open .measure-num,.song-block-header .measure-num,.playlist-choice-name,.playlist-heading-name,.song-title,[data-no-translate]';
 function productWords(text){return text.replace(/^(\s*)Play(\s*)$/,(_,a,b)=>a+(language==='fr'?'Lire':'Play')+b).replace(/^(\s*)STOP(\s*)$/,(_,a,b)=>a+(language==='fr'?'Arrêter':'Stop')+b).replace(/MultiMétro/gi,'Multipiste').replace(/MORCEAUX/g,'TRACKS').replace(/Morceaux/g,'Tracks').replace(/morceaux/g,'tracks').replace(/MORCEAU/g,'TRACK').replace(/Morceau/g,'Track').replace(/morceau/g,'track').replace(/SONGS/g,'TRACKS').replace(/Songs/g,'Tracks').replace(/songs/g,'tracks').replace(/SONG/g,'TRACK').replace(/Song/g,'Track').replace(/song/g,'track');}
 function translateText(node){if(!node.parentElement||node.parentElement.closest(protectedText)||!node.data.trim())return;let record=textRecords.get(node);if(!record||node.data!==record.last){let source=language==='fr'?node.data:toSource(node.data);if(node.parentElement.closest('option,.numbox-option,.numbox-button')){const key=Object.keys(translations).find(key=>translations[key]===source.trim());if(key)source=source.replace(source.trim(),key);}record={fr:source,last:node.data};textRecords.set(node,record);}const next=localized(record.fr,node.parentElement);if(node.data!==next)node.data=next;record.last=next;}
 function translateElement(element){if(element.dataset.i18nKey){const next=keyedText(element.dataset.i18nKey);if(next!==undefined&&element.textContent!==next)element.textContent=next;}let records=attributeRecords.get(element);if(!records){records={};attributeRecords.set(element,records);}for(const attr of ['aria-label','title','placeholder','data-transport-label']){if(attr==='aria-label'&&element.dataset.i18nLabel){const template=element.dataset.i18nLabel;const next=localized(template,element).replace('{user}',element.dataset.i18nUserValue);if(element.getAttribute(attr)!==next)element.setAttribute(attr,next);continue;}if(attr==='aria-label'&&element.matches('.song-open'))continue;const current=element.getAttribute(attr);if(current===null)continue;let record=records[attr];if(!record||current!==record.last){let source=language==='fr'?current:toSource(current);if(element.matches('.numbox-option')){const key=Object.keys(translations).find(key=>translations[key]===current.trim());if(key)source=source.replace(source.trim(),key);}record=records[attr]={fr:source,last:current};}const next=localized(record.fr,element);if(current!==next)element.setAttribute(attr,next);record.last=next;}}
 function translate(root){if(root.nodeType===3){translateText(root);return;}if(root.nodeType!==1)return;translateElement(root);const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){if(node.nodeType===3)translateText(node);else translateElement(node);}}
 const panel=document.getElementById('index2SettingsPanel'),section=document.createElement('section');section.className='index2-settings-section';section.innerHTML='<h3>Interface</h3><div class="index2-setting-row"><span>Langue</span><div class="interface-language-buttons" role="group" aria-label="Langue de l’interface"><button type="button" data-language="fr" aria-label="Français" title="Français" data-no-translate><svg aria-hidden="true" viewBox="0 0 30 20" width="26" height="18"><path fill="#fff" d="M0 0h30v20H0z"/><path fill="#002654" d="M0 0h10v20H0z"/><path fill="#ed2939" d="M20 0h10v20H20z"/></svg></button><button type="button" data-language="en" aria-label="English" title="English" data-no-translate><svg aria-hidden="true" viewBox="0 0 60 40" width="26" height="18"><path fill="#012169" d="M0 0h60v40H0z"/><path stroke="#fff" stroke-width="8" d="m0 0 60 40M60 0 0 40"/><path stroke="#c8102e" stroke-width="3" d="m0 0 60 40M60 0 0 40"/><path stroke="#fff" stroke-width="13" d="M30 0v40M0 20h60"/><path stroke="#c8102e" stroke-width="7" d="M30 0v40M0 20h60"/></svg></button></div></div>';

 section.querySelector('.index2-setting-row').classList.add('interface-language-row');
 for(const [code,label] of [['es','Español'],['de','Deutsch'],['it','Italiano']]){const button=document.createElement('button');button.type='button';button.dataset.language=code;button.dataset.noTranslate='';const flags={es:'<path fill="#aa151b" d="M0 0h30v20H0z"/><path fill="#f1bf00" d="M0 5h30v10H0z"/>',de:'<path fill="#000" d="M0 0h30v20H0z"/><path fill="#d00" d="M0 6.667h30v13.333H0z"/><path fill="#ffce00" d="M0 13.333h30v6.667H0z"/>',it:'<path fill="#fff" d="M0 0h30v20H0z"/><path fill="#009246" d="M0 0h10v20H0z"/><path fill="#ce2b37" d="M20 0h10v20H20z"/>'};button.innerHTML='<svg aria-hidden="true" viewBox="0 0 30 20" width="26" height="18">'+flags[code]+'</svg>';button.title=label;button.setAttribute('aria-label',label);section.querySelector('.interface-language-buttons').append(button);}
 panel.querySelector('.index2-settings-title').after(section);const languageButtons=section.querySelectorAll('[data-language]');if(!available){const warning=document.createElement('p');warning.textContent='Traductions indisponibles. Interface conservée en français.';warning.setAttribute('role','status');section.append(warning);for(const button of languageButtons)if(button.dataset.language!=='fr')button.disabled=true;}
 function setLanguage(next,{persist=true}={}){language=languageData&&['fr','en','es','de','it'].includes(next)&&(next==='fr'||next==='en'||available)?next:'fr';engine?.changeLanguage(language);for(const button of languageButtons)button.setAttribute('aria-pressed',String(button.dataset.language===language));document.documentElement.lang=language;document.title='RENAX DRUMS — Métronome';if(persist)try{localStorage.setItem(storageKey,language);}catch{}translate(document.body);window.dispatchEvent(new CustomEvent('renax-language-changed',{detail:{language}}));}
 for(const button of languageButtons)button.addEventListener('click',()=>setLanguage(button.dataset.language));
 const pending=new Set();let frame=0;new MutationObserver(changes=>{for(const change of changes){if(change.type==='childList'){for(const node of change.addedNodes)pending.add(node);}else pending.add(change.target);}if(!frame)frame=requestAnimationFrame(()=>{frame=0;for(const node of pending){if(node.isConnected)translate(node);}pending.clear();});}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','data-transport-label']});
 for(const name of ['alert','confirm','prompt']){const original=window[name].bind(window);window[name]=function(message,...args){return original(localized(String(message)),...args);};}
 window.RENAX_I18N={get language(){return language;},t:text=>keyedText(text)??localized(text),setLanguage,supportedLanguages:Object.freeze(['fr','en','es','de','it'])};setLanguage(language,{persist:false});
})();


