// Browser Back follows screen navigation. The first entry retains normal exit behavior.
(() => {
  const key='renaxNavigation';
  let restoring=false,pending=null,semanticBack=false;
  const settings=document.getElementById('index2SettingsPanel');
  const backdrop=document.getElementById('index2SettingsBackdrop');
  function capture(){return {
    tab:document.querySelector('#mobileTabs button.active')?.dataset.tab||'visu',
    settings:settings.classList.contains('open'),
    songs:window.RENAX_SONGS.navigation
  };}
  let current=capture();
  function restore(state){
    restoring=true;clearTimeout(pending);
    window.RENAX_SONGS.restoreNavigation(state.songs);
    switchTab(state.tab||'visu');
    settings.classList.toggle('open',!!state.settings);
    backdrop.classList.toggle('open',!!state.settings);
    current=capture();restoring=false;
  }
  const previous=history.state?.[key];
  if(previous?.screen){const screen=previous.version===2?previous.screen:{...previous.screen,songs:{...previous.screen.songs,view:'home',song:null}};restore(screen);}
  history.replaceState({...history.state,[key]:{...previous,version:2,screen:current,depth:previous?.depth||0}},'');
  window.addEventListener('renax-navigation-restored',()=>{
    if(restoring)return;
    clearTimeout(pending);current=capture();const entry=history.state?.[key];
    history.replaceState({...history.state,[key]:{...entry,version:2,screen:current}},'');
  });
  function record(){
    if(restoring)return;
    const next=capture();
    if(JSON.stringify(next)===JSON.stringify(current))return;
    // Editing or duplicating a song changes its identity, not the screen.
    // Keep the playlist as the preceding entry instead of adding another detail entry.
    const sameScreen=next.tab===current.tab&&next.settings===current.settings&&
      next.songs.pane===current.songs.pane&&next.songs.view===current.songs.view;
    const replace=sameScreen||semanticBack;semanticBack=false;
    const entry=history.state?.[key];
    const depth=(entry?.depth||0)+(replace?0:1);
    const parent=replace?entry?.parent:current;
    history[replace?'replaceState':'pushState']({...history.state,[key]:{version:2,screen:next,depth,parent}},'');current=next;
  }
  document.addEventListener('click',event=>{
    const back=event.target.closest('.song-back,#index2SettingsClose,#index2SettingsBackdrop');
    const entry=history.state?.[key];
    const parentView={detail:'playlist',playlist:'playlists',playlists:'home',profile:'home'}[current.songs.view];
    const songBack=back?.matches('.song-back');
    const parentMatches=entry?.parent?.songs?.pane==='songs'&&entry.parent.songs.view===parentView&&
      entry.parent.tab===current.tab&&entry.parent.songs.profile===current.songs.profile;
    // Interface Retour has a fixed destination, even after a reload or an old history entry.
    // Use browser Back only when its preceding entry is that destination.
    if(songBack&&!parentMatches)semanticBack=true;
    if(back&&(!songBack||parentMatches)&&(entry?.depth||0)>0){event.preventDefault();event.stopImmediatePropagation();history.back();return;}
    clearTimeout(pending);pending=setTimeout(record,0);
  },true);
  document.addEventListener('keyup',event=>{
    if(event.key==='Enter'||event.key===' '){clearTimeout(pending);pending=setTimeout(record,0);}
  },true);
  window.addEventListener('popstate',event=>{const state=event.state?.[key];if(state?.screen)restore(state.screen);});
})();
