/* KERN introduction → black → real application. Presentation only; no audio calls. */
(() => {
  const overlay=document.getElementById('renaxArrival');if(!overlay)return;
  const preference='renax.arrival.enabled.v1',reduce=matchMedia('(prefers-reduced-motion:reduce)');
  let enabled=true,finished=false,timeline=null,waves=null,presentation=null,sceneCanvas=null,waveCanvas=null,context=null,scene=null,previous=null,fallbackTimer=null;
  try{enabled=localStorage.getItem(preference)!=='false';}catch{}
  overlay.dataset.introVariant='kern';
  function finish(){
    if(finished)return;finished=true;clearTimeout(fallbackTimer);timeline?.kill();waves?.destroy();waves=null;
    overlay.hidden=true;overlay.dataset.introPhase='done';presentation?.remove();
    overlay.style.removeProperty('opacity');if(overlay.contains(document.activeElement))previous?.focus();
  }
  const settings=document.querySelector('#index2SettingsPanel .index2-settings-section');
  if(settings){
    const row=document.createElement('label');row.className='console-arrival-setting';
    const caption=document.createElement('span'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=enabled;row.append(caption,toggle);settings.append(row);
    const translate=()=>{caption.textContent=window.RENAX_I18N?.language==='en'?'Intro animation':'Animation d’arrivée';};
    translate();window.addEventListener('renax-language-changed',translate);
    toggle.onchange=()=>{enabled=toggle.checked;try{localStorage.setItem(preference,String(enabled));}catch{}if(!enabled)finish();};
  }
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden){event.preventDefault();finish();}},true);
  window.addEventListener('pagehide',finish,{once:true});reduce.addEventListener('change',()=>{if(reduce.matches)finish();});
  if(!enabled||reduce.matches){finish();return;}
  const renderer=window.RENAX_KERN,g=window.gsap;if(!renderer||!g){finish();return;}
  const logo=overlay.querySelector('.console-arrival-logo');
  function resize(){
    if(finished||!sceneCanvas)return;const d=Math.min(devicePixelRatio||1,1.5),width=Math.max(1,Math.round(innerWidth*d)),height=Math.max(1,Math.round(innerHeight*d));
    sceneCanvas.width=waveCanvas.width=width;sceneCanvas.height=waveCanvas.height=height;paint();
  }
  function paint(){
    if(finished||!scene||!context)return;
    presentation.style.opacity=String(scene.fade.scene);
    overlay.style.opacity=String(1-scene.fade.app);
    const t=scene.time;overlay.dataset.introPhase=t>=renderer.FADE_IN?'fade-in':t>=renderer.BLACK?'black':t>=renderer.TRANSITION?'fade-out':'presentation';
    if(scene.fade.scene>0){
      if(waves){waves.render(scene.time,scene.light);renderer.draw(context,sceneCanvas.width,sceneCanvas.height,0,scene,logo,{skipWaves:true,transparent:true});}
      else renderer.draw(context,sceneCanvas.width,sceneCanvas.height,0,scene,logo);
    }
  }
  window.addEventListener('resize',resize);document.addEventListener('fullscreenchange',resize);
  async function launch(){
    await Promise.race([Promise.all([document.fonts?.ready,logo?.decode?.().catch(()=>{})]),new Promise(resolve=>setTimeout(resolve,1200))]);
    if(finished)return;if(!logo?.complete||!logo.naturalWidth){finish();return;}
    previous=document.activeElement;presentation=document.createElement('div');presentation.className='kern-intro-presentation';presentation.setAttribute('aria-hidden','true');
    waveCanvas=document.createElement('canvas');waveCanvas.className='kern-intro-wave';sceneCanvas=document.createElement('canvas');sceneCanvas.className='kern-intro-scene';
    presentation.append(waveCanvas,sceneCanvas);overlay.append(presentation);context=sceneCanvas.getContext('2d');if(!context){finish();return;}
    try{waves=new renderer.RenaxWaves(waveCanvas);}catch{waveCanvas.hidden=true;}
    scene=renderer.state();timeline=renderer.timeline(g,scene,0);timeline.eventCallback('onUpdate',paint);timeline.eventCallback('onComplete',finish);resize();
    overlay.dataset.introReady='true';timeline.play();fallbackTimer=setTimeout(finish,16000);
  }
  launch().catch(error=>{console.warn('[RENAX intro] Opening unavailable:',error);finish();});
})();
