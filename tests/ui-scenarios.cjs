const assert=require('node:assert/strict'),fs=require('node:fs');const {start,save,openTracks,openPlaylist,newTrack,showMeasures,openControls}=require('./audio-harness.cjs');
const measure=(n=4,d=4,t=120)=>({numerator:n,denominator:d,tempo:t,beatSubdivisions:Array(n).fill(1),beatStates:Array.from({length:n},(_,i)=>[i?1:2])});
const library=(count=1)=>({version:1,activeProfile:'qa',profiles:[{id:'qa',name:'QA playlist',songs:Array.from({length:count},(_,i)=>({id:'s'+i,name:'QA '+(i+1),sections:[{id:'a'+i,label:'Intro',count:1,measure:measure()}]}))}]});
async function seed(p,n=1){await p.evaluate(l=>RENAX_SONGS.replaceLibrary(l),library(n));}
async function detail(p){await openPlaylist(p);await p.locator('.song-playlist-card').first().dblclick();}
async function run(name){const h=await start(),p=await h.browser.newPage({viewport:{width:1440,height:1000}}),errors=[],observations={};p.on('pageerror',e=>errors.push(e.message));try{await p.goto(h.url);await p.waitForFunction(()=>window.RENAX_SONGS&&allVoiceAudioReady);await seed(p,3);
switch(name){
case 'account-back-regression':{
 await openTracks(p);await p.locator('#songsHome').getByRole('button',{name:'Playlist',exact:true}).click();await p.waitForFunction(()=>RENAX_SONGS.navigation.view==='playlists');await p.reload();await p.waitForFunction(()=>window.RENAX_SONGS);await openTracks(p);await p.locator('#songPane .song-back').click();await p.waitForFunction(()=>RENAX_SONGS.navigation.view==='home');
 const before=await p.evaluate(()=>JSON.stringify(RENAX_SONGS.library));await p.locator('#directAccountBtn').click();assert(await p.locator('#backupEmail').isVisible());assert(await p.locator('#backupPassword').isVisible());await p.locator('#directAccountDialog').getByRole('button',{name:'Fermer',exact:true}).click();assert.equal(await p.evaluate(()=>JSON.stringify(RENAX_SONGS.library)),before);break;
}
case 'song-back-regression':{
 await openPlaylist(p);await p.locator('.song-playlist-card').first().dblclick();await p.locator('#songPane .song-back').click();await p.waitForFunction(()=>RENAX_SONGS.navigation.view==='playlist');await p.locator('#songPane .song-back').click();await p.waitForFunction(()=>RENAX_SONGS.navigation.view==='playlists');await p.locator('#songPane .song-back').click();await p.waitForFunction(()=>RENAX_SONGS.navigation.view==='home');assert(await p.locator('#songsHome').isVisible());break;
}
case 'song-navigation':{
 await openPlaylist(p);await p.locator('.song-playlist-card').first().dblclick();await p.locator('#songPane input[type=text]').first().fill('QA persisted');await p.locator('#songPane input[type=text]').first().press('Tab');const before=await p.evaluate(()=>JSON.stringify(RENAX_SONGS.library));await p.reload();await p.waitForFunction(()=>window.RENAX_SONGS);assert.equal(await p.evaluate(()=>JSON.stringify(RENAX_SONGS.library)),before);await p.setViewportSize({width:390,height:844});await openTracks(p);assert(await p.locator('#songsRoot').isVisible());assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);break;
}
case 'songs':{
 await newTrack(p);const title=p.locator('#songPane input[type=text]').first();await title.fill('QA structure');await title.press('Tab');await p.locator('.track-add-section:not(#mp3ExportOpen)').click();assert.equal(await p.locator('[data-section-id]').count(),2);const before=await p.evaluate(()=>JSON.stringify(RENAX_SONGS.library));await p.reload();await p.waitForFunction(()=>window.RENAX_SONGS);assert.equal(await p.evaluate(()=>JSON.stringify(RENAX_SONGS.library)),before);await openTracks(p);await p.evaluate(()=>RENAX_SONGS.restoreNavigation({pane:'songs',view:'profile'}));await p.getByRole('button',{name:'Sauvegarde locale',exact:true}).click();const pending=p.waitForEvent('download');await p.locator('.backup-json').getByRole('button',{name:'Exporter',exact:true}).click();const d=await pending,bytes=fs.readFileSync(await d.path());assert.deepEqual(JSON.parse(bytes),JSON.parse(before));await p.locator('.backup-json input[type=file]').setInputFiles({name:'qa.json',mimeType:'application/json',buffer:bytes});await p.getByRole('dialog').getByRole('button',{name:'Importer',exact:true}).click();await p.waitForFunction(()=>RENAX_SONGS.library.profiles.length===2);break;
}
case 'songs-playback':case 'song-block-preview':{
 await p.evaluate(()=>{const l=RENAX_SONGS.library;const s=l.profiles[0].songs[0];s.sections[0].measure.tempo=300;s.sections.push({id:'b',label:'Fin',count:1,measure:{numerator:3,denominator:8,tempo:300,beatSubdivisions:[1,1,1],beatStates:[[2],[1],[1]]}});RENAX_SONGS.replaceLibrary(l);});await detail(p);
 if(name==='song-block-preview'){await p.getByRole('button',{name:'Écouter uniquement le bloc Intro',exact:true}).click();await p.waitForFunction(()=>isPlaying);assert(await p.evaluate(()=>RENAX_SONGS.loaded.preview));assert.equal(await p.evaluate(()=>measures.length),1);}else{await p.locator('#playBtn').click();await p.waitForFunction(()=>isPlaying);assert.equal(await p.evaluate(()=>measures.length),2);}
 await p.waitForFunction(()=>!isPlaying,null,{timeout:10000});assert.equal(await p.locator('#trainTimer').innerText(),'0:00');break;
}
case 'playlist-card-click':{
 await openPlaylist(p);const card=p.locator('.song-playlist-card').first();await card.locator('.measure-tempo-row').click();assert.equal(await p.evaluate(()=>RENAX_SONGS.navigation.view),'playlist');assert.equal(await p.evaluate(()=>RENAX_SONGS.navigation.song),'s0');await card.dblclick();assert.equal(await p.evaluate(()=>RENAX_SONGS.navigation.view),'detail');await p.locator('#songPane .song-back').click();await card.focus();await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>RENAX_SONGS.navigation.view),'detail');break;
}
case 'playlist-drag':{
 await openPlaylist(p);const cards=p.locator('.song-playlist-card'),a=await cards.nth(0).boundingBox(),b=await cards.nth(2).boundingBox();await p.mouse.move(a.x+30,a.y+20);await p.mouse.down();await p.waitForTimeout(350);await p.mouse.move(b.x+30,b.y+b.height-8,{steps:15});await p.waitForTimeout(100);await p.mouse.up();await p.waitForTimeout(200);const order=await p.evaluate(()=>RENAX_SONGS.library.profiles[0].songs.map(s=>s.id));assert.notDeepEqual(order,['s0','s1','s2'],'Drag must reorder the library');observations.order=order;break;
}
case 'song-folded-blocks':case 'song-block-area-toggle':{
 await detail(p);await p.locator('.track-add-section:not(#mp3ExportOpen)').click();const cards=p.locator('[data-section-id]'),second=cards.nth(1);assert.equal(await second.locator('.song-block-header').getAttribute('aria-expanded'),'true');assert.equal(await cards.first().locator('.song-block-header').getAttribute('aria-expanded'),'false');await second.locator('.song-block-summary').click();assert.equal(await second.locator('.song-block-header').getAttribute('aria-expanded'),'false');await second.locator('.song-block-header').click();assert(await second.getByLabel('Libellé',{exact:true}).isVisible());await second.getByLabel('Libellé',{exact:true}).fill('Final QA');await second.getByLabel('Libellé',{exact:true}).press('Tab');assert.equal(await second.locator('.measure-num').textContent(),'Final QA');break;
}
case 'song-card-style':{
 await detail(p);const card=p.locator('[data-section-id]').first();assert(await card.isVisible());assert(await p.locator('#playBtn').isVisible());assert.equal(await p.locator('#playBtn').count(),1);const data=await card.evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));assert(data.rect.width>200&&data.rect.height>40);assert.notEqual(data.color,data.bg);observations.card=data;break;
}
case 'song-numbox':{
 await detail(p);await p.locator('[data-section-id] .song-block-header').click();const card=p.locator('[data-section-id]').first();await card.getByLabel('Mesures',{exact:true}).selectOption('3',{force:true});assert.equal(await p.evaluate(()=>RENAX_SONGS.library.profiles[0].songs[0].sections[0].count),3);await p.locator('#activeNumerator').selectOption('7',{force:true});await p.locator('#activeDenominator').selectOption('8',{force:true});assert.equal(await p.evaluate(()=>RENAX_SONGS.library.profiles[0].songs[0].sections[0].measure.numerator),7);break;
}
case 'rename-menu':{
 await openPlaylist(p);await p.getByRole('button',{name:'Actions pour QA 1',exact:true}).click();await p.getByRole('menuitem',{name:'Renommer',exact:true}).click();await p.getByRole('dialog').locator('input').fill('QA renamed');await p.getByRole('dialog').getByRole('button',{name:'Renommer',exact:true}).click();assert.equal(await p.evaluate(()=>RENAX_SONGS.library.profiles[0].songs[0].name),'QA renamed');await p.getByRole('button',{name:'Actions pour QA renamed',exact:true}).click();await p.keyboard.press('Escape');assert.equal(await p.getByRole('menuitem').count(),0);break;
}
case 'transport-timer':case 'customization-timer':{
 await p.getByRole('tab',{name:'Métronome',exact:true}).click();for(let i=0;i<2;i++){await p.locator('#playBtn').click();await p.waitForFunction(()=>isPlaying);await p.waitForTimeout(1150);assert.notEqual(await p.locator('#trainTimer').textContent(),'0:00');await p.locator('#playBtn').click();assert.equal(await p.locator('#trainTimer').textContent(),'0:00');}
 if(name==='customization-timer'){await p.locator('#tempoIncrease').click();assert.equal(await p.locator('#trainTimer').textContent(),'0:00');}break;
}
case 'export-presentation':{
 await openPlaylist(p);for(const [width,height]of [[1440,1000],[390,844],[667,320]]){await p.setViewportSize({width,height});await showMeasures(p);await p.locator('#mp3ExportOpen').click();const dialog=p.locator('#mp3ExportDialog'),rect=await dialog.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width&&rect.y>=0&&rect.y+rect.height<=height);await p.locator('#songExportFormat').selectOption('midi');assert(await dialog.getByText('MIDI : clics',{exact:false}).isVisible());await dialog.getByRole('button',{name:'Fermer',exact:true}).click();await dialog.waitFor({state:'detached'});}break;
}
case 'mobile-landscape':{
 for(const [width,height]of [[390,844],[667,320],[844,390],[768,355],[1440,1000]]){await p.setViewportSize({width,height});for(const name of ['Métronome','Polyrythmie','Entraînement','Séquenceur','Multipiste','Track']){await p.getByRole('tab',{name,exact:true}).click();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}await p.locator('#index2SettingsBtn').click();assert(await p.locator('#index2SettingsPanel').isVisible());await p.locator('#index2SettingsClose').click();}break;
}
case 'training-modes':{
 await p.getByRole('tab',{name:'Entraînement',exact:true}).click();await p.locator('#trainDurationUnit').selectOption('seconds',{force:true});await p.locator('#trainDuration').evaluate(e=>{e.value='1';e.dispatchEvent(new Event('change',{bubbles:true}))});
 const curves=await p.locator('.training-curve-menu button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));for(const label of curves){await p.locator('.training-curve-select > summary').click();await p.getByRole('button',{name:label,exact:true}).click();await p.locator('#trainBtn').click();await p.waitForFunction(()=>training.engaged);await p.waitForFunction(()=>!training.engaged,null,{timeout:5000});}
 await p.getByRole('tab',{name:'Par paliers',exact:true}).click();await p.locator('#trainInterval').evaluate(e=>{e.value='1';e.dispatchEvent(new Event('change',{bubbles:true}))});await p.locator('#trainBtn').click();await p.waitForFunction(()=>isPlaying);const before=await p.evaluate(()=>tempo);await p.waitForTimeout(1200);assert((await p.evaluate(()=>tempo))>before);await p.locator('#trainBtn').click();assert(!await p.evaluate(()=>training.engaged));observations.curves=curves.length;break;
}
default:throw Error('Unknown current UI scenario '+name);
}
 assert.deepEqual(errors,[]);save(name+'-current-results.json',{passed:true,...observations,errors});console.log('PASS current UI scenario '+name,observations);
 }finally{await h.browser.close();h.server?.close();}}
exports.run=run;
