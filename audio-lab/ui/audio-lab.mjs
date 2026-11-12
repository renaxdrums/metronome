/**
 * Audio Lab | first dark HTML workspace.
 * Only original-file playback is implemented; manual markers are annotations.
 * No tempo detection, synchronized click, pitch-preserving slowdown or Warp DSP.
 */
import { decodeLocalAudio } from '../io/local-decode.mjs';
import { extractWaveformPeaks } from '../waveform/peak-client.mjs';
import { OriginalAudioPlayer } from '../transport/original-player.mjs';
import { ManualClick } from '../transport/manual-click.mjs';
import { detectOnsets } from '../analysis/onsets.mjs';
import { inferTempoFromOnsets } from '../analysis/tempo-hypotheses.mjs';

const root = document.getElementById('audioLabRoot');
if (!root) throw new Error('Audio Lab HTML view not found');
const $ = id => document.getElementById(id);
const canvas = $('alWaveCanvas'), ruler = $('alRulerCanvas'), layer = $('alMarkerLayer');
const fileInput = $('alFileInput'), openButton = $('alOpenFile');
const playButton = $('alPlay'), stopButton = $('alStop'), seekSlider = $('alSeek');
const zoomSlider = $('alZoom'), markerTime = $('alMarkerTime'), removeButton = $('alDeleteMarker');
const kinds = { cursor:'Curseur', downbeat:'Premier temps', meter:'Métrique', tempo:'Tempo', warp:'Warp (repère seul)' };
let click = null, loopA = 0, loopB = null, pulseJob = 0;
let decoded = null, player = null, pyramid = null, selected = null, kind = 'cursor';
let zoom = 1, start = 0, nextId = 1, markers = [], busy = false, job = null, frame = 0;
const canvasCtx = canvas.getContext('2d'), rulerCtx = ruler.getContext('2d');
let lastWaveSize = { width: 0, height: 0 }, lastRulerSize = { width: 0, height: 0 };

function formatTime(seconds) {
  const ms = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 1000));
  const totalSeconds = Math.floor(ms / 1000);
  return String(Math.floor(totalSeconds / 60)).padStart(2,'0') + ':' +
    String(totalSeconds % 60).padStart(2,'0') + '.' + String(ms % 1000).padStart(3,'0');
}
function setStatus(message) { $('alStatus').textContent = message; }
function totalDuration() { return decoded?.identity.durationSeconds || 0; }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function visibleDuration() { return totalDuration() / zoom; }
function playerPosition() { return player?.positionSeconds() || 0; }
function isVisible() { return !root.hidden && document.documentElement.dataset.tool !== 'tuner'; }

function refreshTransport() {
  const active = !!player && !busy;
  for(const id of ['alDetectPulse','alLoopEnabled','alLoopA','alLoopB'])$(id).disabled=!active;
  playButton.disabled = !active;
  stopButton.disabled = !active;
  seekSlider.disabled = !active;
  const playing = !!player?.playing;
  playButton.textContent = playing ? 'Ⅱ' : '▶';
  playButton.setAttribute('aria-label', playing ? 'Mettre en pause' : 'Lire l’audio original');
  $('alPlaybackState').textContent = playing ? 'LECTURE' : 'À L’ARRÊT';
}
function refreshPosition() {
  const position = playerPosition();
  const duration = totalDuration();
  $('alReadout').textContent = formatTime(position);
  $('alDuration').textContent = formatTime(duration);
  seekSlider.value = String(duration ? Math.round(position / duration * 1000) : 0);
}
function sampleToCanvasX(seconds, width) {
  return width * (seconds - start) / (visibleDuration() || 1);
}
function canvasXToSeconds(clientX) {
  const b = canvas.getBoundingClientRect();
  return clamp(start + clamp((clientX - b.left) / Math.max(b.width, 1), 0, 1) * visibleDuration(), 0, totalDuration());
}
function prepare(canvasElement, context, previous) {
  const b = canvasElement.getBoundingClientRect();
  const w = Math.max(1, Math.round(b.width)), h = Math.max(1, Math.round(b.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pxWidth = Math.round(w * dpr), pxHeight = Math.round(h * dpr);
  if (canvasElement.width !== pxWidth || canvasElement.height !== pxHeight) {
    canvasElement.width = pxWidth;
    canvasElement.height = pxHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, w, h);
  previous.width = w;previous.height = h;
  return { w, h };
}
function rulerStep(seconds) {
  const desired = seconds / 9;
  if (!desired || !Number.isFinite(desired)) return 1;
  const power = 10 ** Math.floor(Math.log10(desired));
  return [1,2,5,10].map(n=>n*power).find(n=>n>=desired) || 10*power;
}
function drawRuler() {
  const {w,h} = prepare(ruler,rulerCtx,lastRulerSize);
  rulerCtx.fillStyle = '#a6b9c4';rulerCtx.font = '10px ui-monospace,monospace';
  rulerCtx.textBaseline = 'top';
  if (!decoded) {
    rulerCtx.fillStyle = '#627988';rulerCtx.fillText('00:00',14,10);
    return;
  }
  const span = visibleDuration(),step = rulerStep(span),end = start+span;
  for(let t=Math.ceil(start/step)*step;t<=end;t+=step){
    const x=sampleToCanvasX(t,w);
    rulerCtx.strokeStyle='#425767';rulerCtx.lineWidth=1;rulerCtx.beginPath();rulerCtx.moveTo(x+.5,h-10);rulerCtx.lineTo(x+.5,h);rulerCtx.stroke();
    rulerCtx.fillText(formatTime(t).slice(0,5),x+4,8);
  }
}
function drawWave() {
  const {w,h} = prepare(canvas,canvasCtx,lastWaveSize);
  const duration = totalDuration();
  canvasCtx.strokeStyle = '#233240';canvasCtx.lineWidth=1;
  for (let y = 0.25; y < 1; y+=0.25) {
    const py = Math.round(y*h)+.5;
    canvasCtx.beginPath();canvasCtx.moveTo(0,py);canvasCtx.lineTo(w,py);canvasCtx.stroke();
  }
  if (duration) {
    const span=visibleDuration(),step=rulerStep(span);
    for(let t=Math.ceil(start/step)*step;t<=start+span;t+=step){
      const x=sampleToCanvasX(t,w);
      canvasCtx.strokeStyle='#21323d';canvasCtx.beginPath();canvasCtx.moveTo(x+.5,0);canvasCtx.lineTo(x+.5,h);canvasCtx.stroke();
    }
  }
  if (pyramid?.levels?.length && decoded) {
    const channels=Math.min(pyramid.channelCount, 2), span=visibleDuration();
    const frameRate = decoded.buffer.sampleRate, framesPerPixel = span * frameRate / w;
    const lvl = [...pyramid.levels].reverse().find(level => level.samplesPerBucket <= framesPerPixel) || pyramid.levels[0];
    const samplesPerBucket=lvl.samplesPerBucket;
    const width=Math.ceil(w);
    for(let ch=0;ch<channels;ch++){
      const y0=h*(ch+.5)/channels,half=h*(.44/channels);
      const min=lvl.minimum[ch],max=lvl.maximum[ch];
      canvasCtx.fillStyle=ch===0?'#52cddd':'#d89b70';
      for(let x=0;x<width;x++){
        const first=start+(x/w)*span,last=start+((x+1)/w)*span;
        const from=clamp(Math.floor(first*frameRate/samplesPerBucket),0,min.length-1);
        const to=clamp(Math.ceil(last*frameRate/samplesPerBucket),from+1,min.length);
        let lo=1,hi=-1;
        for(let i=from;i<to;i++){if(min[i]<lo)lo=min[i];if(max[i]>hi)hi=max[i];}
        if(lo>hi)continue;
        const upper=y0-hi*half,lower=y0-lo*half;
        canvasCtx.fillRect(x,upper,1,Math.max(1,lower-upper));
      }
      canvasCtx.strokeStyle='#50707e';canvasCtx.beginPath();canvasCtx.moveTo(0,y0+.5);canvasCtx.lineTo(w,y0+.5);canvasCtx.stroke();
    }
  } else {
    canvasCtx.strokeStyle='#30434e';canvasCtx.setLineDash([3,7]);
    canvasCtx.beginPath();canvasCtx.moveTo(0,h/2+.5);canvasCtx.lineTo(w,h/2+.5);canvasCtx.stroke();canvasCtx.setLineDash([]);
  }
  if (player) {
    const x=sampleToCanvasX(playerPosition(),w);
    if(x>=0&&x<=w){canvasCtx.fillStyle='#f6b478';canvasCtx.fillRect(Math.round(x),0,2,h);canvasCtx.fillStyle='#ffce9f';canvasCtx.fillRect(x-2,0,6,3);}
  }
}
function markerLabel(marker) {
  if(marker.kind==='downbeat')return 'Ⅰ';
  if(marker.kind==='meter')return marker.meter.numerator+'/'+marker.meter.denominator;
  if(marker.kind==='tempo')return '♩';
  return 'W';
}
function markerDescription(marker) {
  let detail=kinds[marker.kind];
  if(marker.kind==='meter')detail+=' '+marker.meter.numerator+'/'+marker.meter.denominator+
    (marker.meter.groups.length>1?' · '+marker.meter.groups.join('+'):'');
  if(marker.kind==='tempo')detail+=' · '+marker.bpm+' BPM';
  return detail;
}
function refreshInspector() {
  const current=markers.find(m=>m.id===selected);
  $('alMarkerInfo').textContent=current?markerDescription(current):'Aucun';
  markerTime.disabled=!current;
  removeButton.disabled=!current;
  markerTime.max=String(totalDuration());
  markerTime.value=current?current.seconds.toFixed(3):'0';
}
function refreshMarkerSelection(){
  for(const b of layer.querySelectorAll('.al-marker'))b.classList.toggle('is-selected',b.dataset.id===String(selected));
  refreshInspector();
}
function renderMarkers(){
  layer.replaceChildren();
  const span=visibleDuration();
  if(!span)return;
  for(const marker of markers){
    if(marker.seconds<start||marker.seconds>start+span)continue;
    const button=document.createElement('button');
    button.type='button';button.className='al-marker';
    button.dataset.id=String(marker.id);button.dataset.kind=marker.kind;
    button.style.left=((marker.seconds-start)/span*100)+'%';
    const label=document.createElement('span');label.textContent=markerLabel(marker);button.append(label);
    button.title=markerDescription(marker)+' · '+formatTime(marker.seconds)+' · déplacer ou utiliser les flèches';
    button.setAttribute('aria-label',button.title);
    if(marker.id===selected)button.classList.add('is-selected');
    layer.append(button);
  }
  refreshInspector();
}
function paint(){
  if(!isVisible())return;
  refreshTransport();refreshPosition();drawRuler();drawWave();renderMarkers();
}
function ensureCursorInView(position) {
  if(!decoded||zoom===1){start=0;return;}
  const span=visibleDuration();
  if(position<start||position>start+span)start=clamp(position-span*.3,0,totalDuration()-span);
}
function animate(){
  frame=0;
  if(!isVisible())return;
  if(player?.playing){
    const previousStart=start;ensureCursorInView(playerPosition());
    refreshPosition();drawWave();if(start!==previousStart){drawRuler();renderMarkers();}
    frame=requestAnimationFrame(animate);
  }else{paint();}
}
function restartAnimation(){if(!frame)frame=requestAnimationFrame(animate);}
function readMeter(){
  const numerator=Number($('alNumerator').value), denominator=Number($('alDenominator').value);
  if(!Number.isSafeInteger(numerator)||numerator<=0||numerator>999)throw new RangeError('Numérateur de mesure invalide.');
  if(![2,4,8,16,32].includes(denominator))throw new RangeError('Dénominateur de mesure invalide.');
  const groupsText=$('alGroups').value.trim();
  const groups=groupsText?groupsText.split('+').map(s=>Number(s.trim())):[numerator];
  if(!groups.every(n=>Number.isSafeInteger(n)&&n>0)||groups.reduce((a,b)=>a+b,0)!==numerator)
    throw new RangeError('Groupement invalide : la somme doit correspondre au numérateur.');
  return {numerator,denominator,groups};
}
function createMarker(seconds) {
  if(!decoded||kind==='cursor')return;
  const marker={id:nextId++,kind,seconds};
  if(kind==='meter')marker.meter=readMeter();
  if(kind==='tempo')marker.bpm=120; // initial placeholder only; no audio rate modification.
  markers.push(marker);
  markers.sort((a,b)=>a.seconds-b.seconds);
  selected=marker.id;
  if(kind==='downbeat')click?.configure({downbeat:seconds});
  if(kind==='meter')click?.configure(readMeter());
  renderMarkers();
  setStatus(markerDescription(marker)+' ajouté à '+formatTime(seconds)+' · le fichier source est intact.');
}
function changeMarkerPosition(id,seconds){
  const marker=markers.find(m=>m.id===id);
  if(!marker)return;
  marker.seconds=clamp(seconds,0,totalDuration());
  if(marker.kind==='downbeat')click?.configure({downbeat:marker.seconds});
  markerTime.value=marker.seconds.toFixed(3);
  $('alMarkerInfo').textContent=markerDescription(marker);
}
function unload(){
  pulseJob++;
  job?.abort();job=null;
  loopA=0;loopB=null;$('alLoopEnabled').checked=false;$('alLoopInfo').textContent='—';$('alPulseResult').textContent='';
  if(click){click.dispose();click=null;}
  $('alClickEnabled').checked=false;
  if(player){player.dispose();player=null;}
  if(decoded){decoded.context.close().catch(()=>{});decoded=null;}
  pyramid=null;markers=[];selected=null;zoom=1;start=0;zoomSlider.value='1';$('alZoomValue').textContent='×1';
  refreshInspector();paint();
}
async function loadFile(file){
  if(!file)return;
  unload();busy=true;openButton.disabled=true;fileInput.value='';
  $('alFileName').textContent=file.name||'Audio local';
  $('alFormatInfo').textContent='Lecture et décodage en cours…';
  $('alEmpty').hidden=false;
  job=new AbortController();
  const signal=job.signal;
  try{
    const imported=await decodeLocalAudio(file,{signal,onProgress:e=>{
      if(e.phase==='read')setStatus('Lecture locale · '+Math.round(100*e.loaded/Math.max(1,e.total))+' %');
      else if(e.phase==='decode')setStatus('Décodage du signal audio…');
    }});
    if(signal.aborted){await imported.context.close();return;}
    decoded=imported;
    player=new OriginalAudioPlayer({context:imported.context,buffer:imported.buffer,
      onState:()=>{click?.sync();refreshTransport();refreshPosition();restartAnimation();}});
    click=new ManualClick(player);
    click.configure({bpm:Number($('alManualBpm').value),...readMeter()});
    setStatus('Calcul de la forme d’onde sur un Worker…');
    pyramid=await extractWaveformPeaks(imported.buffer,{signal});
    if(signal.aborted)return;
    $('alEmpty').hidden=true;
    loopB=imported.buffer.duration;
    const identity=imported.identity;
    const sourceRate=identity.sourceSampleRate||identity.sampleRate;
    const sourceBits=identity.sourceBitDepth?identity.sourceBitDepth+' bits · ':'';
    $('alFormatInfo').textContent=imported.format.toUpperCase()+' · '+sourceBits+(sourceRate/1000).toLocaleString('fr-BE',{maximumFractionDigits:1})+' kHz · '+identity.channels+(identity.channels>1?' canaux':' canal');
    $('alEditorHint').textContent='Original · '+formatTime(identity.durationSeconds)+' · marqueurs modifiables';
    setStatus('Import local prêt. Lecture originale et repères manuels disponibles.');
    paint();
  }catch(error){
    if(decoded){player?.dispose();player=null;await decoded.context.close().catch(()=>{});decoded=null;}
    pyramid=null;
    $('alFileName').textContent='Échec de l’import';
    $('alFormatInfo').textContent='Codec non pris en charge ou ressources insuffisantes';
    const message=error?.code==='UNSUPPORTED_FORMAT'
      ?'Format non reconnu. WAV, MP3 et AIFF PCM acceptés ; WMA dépend du navigateur.'
      :error?.code==='CANCELLED'?'Import annulé.'
      :error?.code==='MEMORY_PRESSURE'?'Fichier trop volumineux pour la mémoire disponible.'
      :'Impossible de décoder ce fichier sur ce navigateur.';
    setStatus(message);
  }finally{
    job=null;busy=false;openButton.disabled=false;refreshTransport();paint();
  }
}
openButton.addEventListener('click',()=>fileInput.click());
fileInput.addEventListener('change',()=>loadFile(fileInput.files?.[0]));
root.addEventListener('dragover',event=>{if(!event.dataTransfer?.types.includes('Files'))return;event.preventDefault();root.classList.add('al-drop');});
root.addEventListener('dragleave',event=>{if(!root.contains(event.relatedTarget))root.classList.remove('al-drop');});
root.addEventListener('drop',event=>{event.preventDefault();root.classList.remove('al-drop');loadFile(event.dataTransfer?.files?.[0]);});
root.querySelectorAll('[data-al-tool]').forEach(button=>{
  button.addEventListener('click',()=>{
    kind=button.dataset.alTool;
    root.querySelectorAll('[data-al-tool]').forEach(b=>{
      const active=b===button;b.classList.toggle('is-active',active);
      b.setAttribute('aria-pressed',String(active));
    });
    setStatus(kind==='warp'?'Repère Warp manuel : aucun étirement audio appliqué.':
      kind==='tempo'?'Repère de tempo manuel : ne modifie pas encore la lecture.':
      kind==='cursor'?'Curseur : cliquer pour se déplacer, glisser un repère pour le corriger.':
      'Cliquer sur la waveform pour placer '+kinds[kind].toLowerCase()+'.');
  });
});
canvas.addEventListener('click',event=>{
  if(!decoded||busy)return;
  const seconds=canvasXToSeconds(event.clientX);
  try{
    if(kind==='cursor'){player.seek(seconds);click?.sync();refreshPosition();paint();}
    else createMarker(seconds);
  }catch(error){setStatus(error.message);}
});
let draggedId=null;
layer.addEventListener('pointerdown',event=>{
  const button=event.target.closest('.al-marker');
  if(!button||!event.isPrimary)return;
  event.preventDefault();event.stopPropagation();
  selected=Number(button.dataset.id);draggedId=selected;
  button.setPointerCapture(event.pointerId);refreshMarkerSelection();
});
layer.addEventListener('pointermove',event=>{
  if(draggedId===null)return;
  const button=event.target.closest('.al-marker');
  if(!button||Number(button.dataset.id)!==draggedId)return;
  changeMarkerPosition(draggedId,canvasXToSeconds(event.clientX));
  button.style.left=((markers.find(m=>m.id===draggedId).seconds-start)/visibleDuration()*100)+'%';
});
for(const eventName of ['pointerup','pointercancel','lostpointercapture']){
  layer.addEventListener(eventName,()=>{if(draggedId===null)return;draggedId=null;renderMarkers();});
}
layer.addEventListener('click',event=>{
  const button=event.target.closest('.al-marker');
  if(!button)return;event.preventDefault();event.stopPropagation();
  selected=Number(button.dataset.id);refreshMarkerSelection();
});
layer.addEventListener('keydown',event=>{
  const button=event.target.closest('.al-marker');
  if(!button||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();
  const id=Number(button.dataset.id),marker=markers.find(m=>m.id===id);
  if(!marker)return;
  const delta=(event.key==='ArrowRight'?1:-1)*(event.shiftKey?.001:.01);
  selected=id;changeMarkerPosition(id,Math.round((marker.seconds+delta)*1000)/1000);
  button.style.left=((marker.seconds-start)/visibleDuration()*100)+'%';
  refreshMarkerSelection();
});
markerTime.addEventListener('change',()=>{
  if(selected===null)return;
  const v=Number(markerTime.value);
  if(!Number.isFinite(v)){refreshInspector();return;}
  changeMarkerPosition(selected,v);renderMarkers();
});
removeButton.addEventListener('click',()=>{
  if(selected===null)return;markers=markers.filter(m=>m.id!==selected);selected=null;
  renderMarkers();setStatus('Repère supprimé. Audio original conservé.');
});
playButton.addEventListener('click',async()=>{
  if(!player||busy)return;
  try{
    if(player.playing){player.pause();click?.sync();paint();}
    else{await player.play();click?.sync();refreshTransport();restartAnimation();}
  }catch(error){setStatus('Lecture impossible : activer la sortie audio du navigateur.');}
});
stopButton.addEventListener('click',()=>{player?.stop();click?.sync();start=0;paint();});
seekSlider.addEventListener('input',()=>{
  if(!player)return;const seconds=totalDuration()*Number(seekSlider.value)/1000;
  player.seek(seconds);click?.sync();ensureCursorInView(seconds);paint();
});
zoomSlider.addEventListener('input',()=>{
  const focus=playerPosition();
  zoom=Number(zoomSlider.value);$('alZoomValue').textContent='×'+zoom;
  start=clamp(focus-visibleDuration()/2,0,Math.max(0,totalDuration()-visibleDuration()));
  paint();
});
canvas.addEventListener('wheel',event=>{
  if(!event.ctrlKey||!decoded)return;
  event.preventDefault();
  zoom=clamp(zoom+Math.sign(event.deltaY)*-1,1,24);
  zoomSlider.value=String(zoom);$('alZoomValue').textContent='×'+zoom;
  start=clamp(playerPosition()-visibleDuration()/2,0,Math.max(0,totalDuration()-visibleDuration()));
  paint();
},{passive:false});
new ResizeObserver(()=>{if(isVisible())paint();}).observe($('alWaveContainer'));
new MutationObserver(()=>{
  const visible=document.body.dataset.workspace==='audio-lab' && document.documentElement.dataset.tool!=='tuner';
  root.hidden=!visible;
  if(!visible&&player?.playing){player.pause();click?.sync();}
  if(visible)requestAnimationFrame(paint);
}).observe(document.body,{attributes:true,attributeFilter:['data-workspace']});
new MutationObserver(()=>{
  if(document.documentElement.dataset.tool==='tuner'&&player?.playing){player.pause();click?.sync();}
}).observe(document.documentElement,{attributes:true,attributeFilter:['data-tool']});
root.hidden=document.body.dataset.workspace!=='audio-lab';
refreshInspector();refreshTransport();

// Manual metronome shares the source player's AudioContext clock.
$('alClickEnabled').addEventListener('change',async event=>{
  if(!click){event.target.checked=false;return;}
  try{
    if(event.target.checked){
      click.configure({bpm:Number($('alManualBpm').value),...readMeter(),
        downbeat:markers.find(m=>m.kind==='downbeat')?.seconds??0});
      await click.enable();
      setStatus('Clic RENAX manuel activé.');
    }else click.disable();
  }catch(error){event.target.checked=false;click.disable();setStatus('Clic indisponible : '+error.message);}
});
$('alManualBpm').addEventListener('change',()=>{
  try{click?.configure({bpm:Number($('alManualBpm').value)});}
  catch(error){setStatus(error.message);}
});
$('alAudioVolume').addEventListener('input',event=>player?.setVolume(Number(event.target.value)));
$('alClickVolume').addEventListener('input',event=>click?.setVolume(Number(event.target.value)));

function refreshLoop(){
  if(!player)return;
  const a=loopA,b=loopB??totalDuration();
  $('alLoopInfo').textContent=formatTime(a)+' – '+formatTime(b);
  if($('alLoopEnabled').checked && b>a+0.02)player.setLoop(a,b);
  else { $('alLoopEnabled').checked=false;player.clearLoop(); }
  click?.sync();
}
$('alLoopA').addEventListener('click',()=>{
  if(!player)return;
  const p=playerPosition();
  if(p>=(loopB??totalDuration())-0.02){setStatus('Début A doit précéder la fin B.');return;}
  loopA=p;refreshLoop();
});
$('alLoopB').addEventListener('click',()=>{
  if(!player)return;
  const p=playerPosition();
  if(p<=loopA+0.02){setStatus('Fin B doit suivre le début A.');return;}
  loopB=p;refreshLoop();
});
$('alLoopEnabled').addEventListener('change',event=>{
  if(!player){event.target.checked=false;return;}
  refreshLoop();
});
$('alDetectPulse').addEventListener('click',async()=>{
  if(!decoded||busy)return;
  const token=++pulseJob;
  const button=$('alDetectPulse');
  button.disabled=true;
  setStatus('Analyse locale des attaques et estimation de la pulsation…');
  // Cap the analysis window for responsive use on Android. Source PCM is never modified.
  try{
    await new Promise(resolve=>setTimeout(resolve,0));
    if(token!==pulseJob||!decoded)return;
    const buffer=decoded.buffer;
    const frames=Math.min(buffer.length,Math.round(buffer.sampleRate*35));
    const channels=Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,i)=>
      buffer.getChannelData(i).subarray(0,frames));
    const result=detectOnsets(channels,buffer.sampleRate,{maxOnsets:3000});
    if(token!==pulseJob)return;
    const hypotheses=inferTempoFromOnsets(result.onsets);
    if(!hypotheses.candidates.length){
      $('alPulseResult').textContent='Pulsation indéterminée';
      setStatus('Analyse ambiguë : régler le BPM manuellement.');
      return;
    }
    const first=hypotheses.candidates[0];
    $('alManualBpm').value=String(first.bpm);
    click?.configure({bpm:first.bpm});
    $('alPulseResult').textContent='≈ '+first.bpm+' BPM · hypothèse';
    setStatus('Pulsation estimée à '+first.bpm+' BPM (non confirmée). Vérifier à l’oreille et ajuster.');
  }catch(error){
    $('alPulseResult').textContent='Analyse indisponible';
    setStatus('Analyse impossible : '+error.message);
  }finally{if(token===pulseJob)button.disabled=!player;}
});
