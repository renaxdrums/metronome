// Keep existing select elements and their change handlers; customize their presentation.
(() => {
  const style=document.createElement('style');style.textContent=`
  .numbox-menu{background:#29292f;border-color:#45454e;border-radius:6px;scrollbar-width:thin;scrollbar-color:#00c6d9 #29292f;max-height:220px;}
  .numbox-menu::-webkit-scrollbar{width:5px;}.numbox-menu::-webkit-scrollbar-thumb{background:#00c6d9;border-radius:6px;}.numbox-menu::-webkit-scrollbar-track{background:#29292f;}
  .numbox-option{min-height:var(--compact-option-height,32px);height:var(--compact-option-height,32px);box-sizing:border-box;padding:2px 9px;font-size:12px;line-height:18px;}.numbox-option.active{background:#00c6d922;color:#00c6d9;}
  .compact-select{min-width:0;}.compact-select .numbox-button{width:100%;color:var(--text);font-family:var(--font);font-size:12px;font-weight:600;}
  .numbox-menu.compact-floating{position:fixed;z-index:5000;box-sizing:border-box;box-shadow:0 8px 24px #0007;}
  `;document.head.append(style);
  function enhance(select){
    if(select.closest('.console-arrival-replica')||numboxWidgets.has(select))return;
    const rect=select.getBoundingClientRect(),computed=getComputedStyle(select);
    const numeric=/^\d+$/.test(select.options[0]?.textContent.trim()||'');
    enhanceNumboxSelect(select);
    const wrap=select.parentElement,button=wrap.querySelector('.numbox-button');
    if(!numeric||!['activeNumerator','activeDenominator','polyNumerator','polyDenominator'].includes(select.id)){
      wrap.classList.add('compact-select');wrap.style.width=rect.width?rect.width+'px':'100%';wrap.style.flex='1 1 auto';
      button.style.height=Math.max(30,rect.height||32)+'px';
    }
    const label=select.getAttribute('aria-label')||document.querySelector('label[for="'+select.id+'"]')?.textContent||select.closest('label')?.firstChild?.textContent||select.id;
    if(label)button.setAttribute('aria-label',label.trim());button.disabled=select.disabled;
  }
  document.querySelectorAll('select').forEach(enhance);
  const observer=new MutationObserver(records=>{
    const rebuilds=new Set();
    for(const record of records){
      if(record.target.closest?.('.console-arrival-replica'))continue;
      if(record.type==='attributes'){
        if(record.target.tagName!=='SELECT')continue;
        const widget=record.target.parentElement?.querySelector('.numbox-button');
        if(widget&&widget.disabled!==record.target.disabled)widget.disabled=record.target.disabled;
        continue;
      }
      if(record.target.tagName==='SELECT'&&record.target.isConnected)rebuilds.add(record.target);
      for(const node of record.addedNodes){
        if(node.nodeType!==1||!node.isConnected||node.closest('.console-arrival-replica'))continue;
        if(node.matches('select'))enhance(node);
        node.querySelectorAll('select').forEach(enhance);
      }
    }
    // Hundreds of option insertions arrive together when a song is rendered.
    // Rebuild each connected select once, rather than once per option.
    for(const select of rebuilds)numboxWidgets.get(select)?.rebuild();
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  document.addEventListener('click',event=>{const button=event.target.closest('.numbox-button');if(!button)return;setTimeout(()=>{const wrap=button.closest('.numbox-custom');if(!wrap?.classList.contains('open'))return;const menu=wrap.querySelector('.numbox-menu'),rect=button.getBoundingClientRect(),optionCount=menu.querySelectorAll('.numbox-option').length;menu.classList.add('compact-floating');const below=Math.max(0,innerHeight-rect.bottom-12),above=Math.max(0,rect.top-12),available=Math.max(below,above),shortMenu=optionCount<=8;menu.style.setProperty('--compact-option-height',shortMenu?Math.max(18,Math.min(32,Math.floor((available-8)/Math.max(1,optionCount))))+'px':'32px');const height=Math.min(menu.scrollHeight,shortMenu?available:Math.min(220,available));menu.style.width=Math.min(innerWidth-16,Math.max(rect.width,wrap.classList.contains('compact-select')?140:64))+'px';menu.style.left=Math.max(8,Math.min(rect.left,innerWidth-parseFloat(menu.style.width)-8))+'px';menu.style.top=(innerHeight-rect.bottom-8>=height?rect.bottom+4:Math.max(8,rect.top-height-4))+'px';menu.style.maxHeight=height+'px';},0);},true);
  window.addEventListener('resize',()=>closeAllNumboxes());
  const fullscreen=document.createElement('button');fullscreen.type='button';fullscreen.className='index2-header-btn';fullscreen.id='fullscreenBtn';fullscreen.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';Object.assign(fullscreen.style,{width:'32px',height:'32px',minHeight:'32px',padding:'0',display:'flex',alignItems:'center',justifyContent:'center'});fullscreen.setAttribute('aria-label','Plein écran');fullscreen.title='Plein écran';document.querySelector('.index2-header-actions').prepend(fullscreen);
  const settings=document.getElementById('index2SettingsBtn');settings.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m10 3-.6 2.4-2 .9-2.2-.7-2 3.4 1.7 1.7v2.6L3.2 15l2 3.4 2.2-.7 2 .9L10 21h4l.6-2.4 2-.9 2.2.7 2-3.4-1.7-1.7v-2.6L20.8 9l-2-3.4-2.2.7-2-.9L14 3Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const iconStyle=document.createElement('style');iconStyle.textContent='header :is(#fullscreenBtn,#index2SettingsBtn,#directAccountBtn){width:32px;height:32px;min-height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;color:var(--orange);}header :is(#fullscreenBtn,#index2SettingsBtn,#directAccountBtn) svg{width:18px;height:18px;}#directAccountDialog::backdrop{background:rgba(0,0,0,.55);}';document.head.append(iconStyle);
  if(!document.fullscreenEnabled||!document.documentElement.requestFullscreen){fullscreen.hidden=true;fullscreen.style.display='none';return;}
  fullscreen.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{fullscreen.title='Plein écran indisponible dans ce navigateur';}});
  document.addEventListener('fullscreenchange',()=>{const active=!!document.fullscreenElement;fullscreen.setAttribute('aria-label',active?'Quitter le plein écran':'Plein écran');fullscreen.title=active?'Quitter le plein écran':'Plein écran';fullscreen.setAttribute('aria-pressed',String(active));window.dispatchEvent(new Event('resize'));});
})();
