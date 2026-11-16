/** Audio Lab editor. Attack and tempo estimates remain hypotheses until confirmed. */
import { decodeLocalAudio } from '../io/local-decode.mjs';
import { extractWaveformPeaks } from '../waveform/peak-client.mjs';
import { OriginalAudioPlayer } from '../transport/original-player.mjs';
import { ManualClick } from '../transport/manual-click.mjs';
import { detectOnsetsInWorker } from '../analysis/onset-client.mjs';
import { inferTempoFromOnsets } from '../analysis/tempo-hypotheses.mjs';
import { inferMetricHypotheses } from '../analysis/metric-hypotheses.mjs';
import { sourceSecondsToTick, tickToSourceSeconds, TICKS_PER_QUARTER } from '../tempo-warp-core.mjs';
import { createMeterTimeline } from '../meter-timeline.mjs';
import { buildValidatedWarpMap } from '../warp/validated-map.mjs';
import { createWarpTimeline, sourceSecondsToOutputSeconds, outputSecondsToSourceSeconds } from '../warp/warp-timeline.mjs';
import { prepareWarpPlayback } from '../transport/warp-session.mjs';
import { extractWaveformPeaks as extractWarpPeaks } from '../waveform/peak-client.mjs';
import { buildMusicalGrid } from '../musical-grid.mjs';
import { createAudioLabLocalProject, serializeAudioLabLocalProject,
  readAudioLabLocalProjectFile } from '../project/local-project.mjs';

const root = document.getElementById('audioLabRoot');
if (!root) throw new Error('Audio Lab HTML view not found');
const $ = id => document.getElementById(id);
const canvas = $('alWaveCanvas'), ruler = $('alRulerCanvas'), layer = $('alMarkerLayer');
const fileInput = $('alFileInput'), openButton = $('alOpenFile');
const playButton = $('alPlay'), stopButton = $('alStop'), seekSlider = $('alSeek');
const zoomSlider = $('alZoom'), markerTime = $('alMarkerTime'), removeButton = $('alDeleteMarker');
const kinds = { cursor:'Curseur', downbeat:'Premier temps', meter:'Métrique', tempo:'Tempo', warp:'Drapeau Warp' };
let click = null, originalClickWanted = false, loopA = 0, loopB = null, pulseJob = 0, onsetJob = null;
let decoded = null, player = null, pyramid = null, selected = null, kind = 'cursor';
let warp = null, warpPeaks = null, warpMap = null, meterTimeline = null;
let warpJob = null, playbackMode = 'original', warpGeneration = 0;
let projectGeneration=0;
let onsetEvidence = [];
let detectedTempoBase = null;
let selection = null, snapEnabled = false, gesture = null;
const touchPointers=new Map();
let pinch=null,suppressCanvasClickUntil=0;
let history = [], historyIndex = -1;
let zoom = 1, start = 0, nextId = 1, markers = [], busy = false, job = null, frame = 0;
const canvasCtx = canvas.getContext('2d'), rulerCtx = ruler.getContext('2d');
let lastWaveSize = { width: 0, height: 0 }, lastRulerSize = { width: 0, height: 0 };
const color = (name, fallback) => getComputedStyle(root).getPropertyValue(name).trim() || fallback;

function formatTime(seconds) {
  const ms = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 1000));
  const totalSeconds = Math.floor(ms / 1000);
  return String(Math.floor(totalSeconds / 60)).padStart(2,'0') + ':' +
    String(totalSeconds % 60).padStart(2,'0') + '.' + String(ms % 1000).padStart(3,'0');
}
function setStatus(message) { $('alStatus').textContent = message; }
function totalDuration() { return decoded?.identity.durationSeconds || 0; }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function displayDuration() { return playbackMode === 'warp' ? warp?.buffer.duration || totalDuration() : totalDuration(); }
function visibleDuration() { return displayDuration() / zoom; }
function activePlayer() { return playbackMode === 'warp' ? warp?.session : player; }
function playerPosition() { return activePlayer()?.positionSeconds() || 0; }
function displayFromSource(seconds) { return playbackMode === 'warp' ? sourceSecondsToOutputSeconds(warp.warpTimeline,seconds) : seconds; }
function sourceFromDisplay(seconds) { return playbackMode === 'warp' ? outputSecondsToSourceSeconds(warp.warpTimeline,seconds) : seconds; }
function snappedSource(seconds){
  const source=clamp(seconds,0,totalDuration());
  if(!snapEnabled)return source;
  const radius=visibleDuration()/Math.max(1,canvas.getBoundingClientRect().width)*12;
  const candidates=[];
  if(warpMap){
    const tick=sourceSecondsToTick(warpMap,source),step=TICKS_PER_QUARTER/2;
    candidates.push(tickToSourceSeconds(warpMap,clamp(Math.round(tick/step)*step,0,warpMap.lengthTicks)));
  }
  for(const onset of onsetEvidence){
    if(Math.abs(onset.seconds-source)<=radius)candidates.push(onset.seconds);
  }
  const nearest=candidates.sort((a,b)=>Math.abs(a-source)-Math.abs(b-source))[0];
  return nearest!==undefined&&Math.abs(nearest-source)<=radius?nearest:source;
}
function historySnapshot(){
  return {markers:structuredClone(markers),nextId,loopA,loopB,loopEnabled:$('alLoopEnabled').checked};
}
function updateHistoryButtons(){
  $('alUndo').disabled=historyIndex<=0;$('alRedo').disabled=historyIndex>=history.length-1;
}
function commitHistory(){
  const snapshot=historySnapshot();
  if(historyIndex>=0&&JSON.stringify(snapshot)===JSON.stringify(history[historyIndex]))return;
  history=history.slice(0,historyIndex+1);history.push(snapshot);
  if(history.length>100)history.shift();
  historyIndex=history.length-1;updateHistoryButtons();
}
function restoreHistory(index){
  if(index<0||index>=history.length)return;
  if(warp||warpJob)invalidateWarp('Correction rétablie : préparez à nouveau Warp.');
  const snapshot=history[index];
  markers=structuredClone(snapshot.markers);nextId=snapshot.nextId;
  loopA=snapshot.loopA;loopB=snapshot.loopB;
  $('alLoopEnabled').checked=snapshot.loopEnabled;
  selected=markers.some(m=>m.id===selected)?selected:null;
  historyIndex=index;updateHistoryButtons();
  const downbeat=markers.find(m=>m.kind==='downbeat');
  try{click?.configure({downbeat:downbeat?.seconds??0});}catch{}
  refreshOriginalGrid();refreshLoop();paint();
}
function isVisible() { return document.body.dataset.workspace === 'audio-lab' && !root.hidden && document.documentElement.dataset.tool !== 'tuner'; }

function refreshTransport() {
  const active = !!activePlayer() && !busy;
  $('alExportProject').disabled=!decoded||busy;
  $('alImportProject').disabled=!decoded||busy;
  for(const id of ['alDetectPulse','alLoopEnabled','alLoopA','alLoopB'])$(id).disabled=!active;
  playButton.disabled = !active;
  stopButton.disabled = !active;
  seekSlider.disabled = !active;
  const playing = !!activePlayer()?.playing;
  playButton.textContent = playing ? 'Ⅱ' : '▶';
  playButton.setAttribute('aria-label', playing ? 'Mettre en pause' : playbackMode==='warp'?'Lire l’audio Warp':'Lire l’audio original');
  $('alPlaybackState').textContent = playing ? 'LECTURE' : 'À L’ARRÊT';
}
function refreshPosition() {
  const position = playerPosition();
  const duration = displayDuration();
  $('alReadout').textContent = formatTime(position);
  $('alDuration').textContent = formatTime(duration);
  seekSlider.value = String(duration ? Math.round(position / duration * 1000) : 0);
}
function sampleToCanvasX(seconds, width) {
  return width * (seconds - start) / (visibleDuration() || 1);
}
function canvasXToSeconds(clientX) {
  const b = canvas.getBoundingClientRect();
  return clamp(start + clamp((clientX - b.left) / Math.max(b.width, 1), 0, 1) * visibleDuration(), 0, displayDuration());
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
  rulerCtx.fillStyle = color('--al-ruler-ink','#a6b9c4');rulerCtx.font = '10px ui-monospace,monospace';
  rulerCtx.textBaseline = 'top';
  if (!decoded) {
    rulerCtx.fillStyle = color('--al-ruler-muted','#627988');rulerCtx.fillText('00:00',14,10);
    return;
  }
  const span = visibleDuration(),step = rulerStep(span),end = start+span;
  for(let t=Math.ceil(start/step)*step;t<=end;t+=step){
    const x=sampleToCanvasX(t,w);
    rulerCtx.strokeStyle=color('--al-ruler-tick','#425767');rulerCtx.lineWidth=1;rulerCtx.beginPath();rulerCtx.moveTo(x+.5,h-10);rulerCtx.lineTo(x+.5,h);rulerCtx.stroke();
    rulerCtx.fillText(formatTime(t).slice(0,5),x+4,8);
  }
}
function drawWave() {
  const {w,h} = prepare(canvas,canvasCtx,lastWaveSize);
  const duration = displayDuration();
  canvasCtx.strokeStyle = color('--al-wave-horizontal','#233240');canvasCtx.lineWidth=1;
  for (let y = 0.25; y < 1; y+=0.25) {
    const py = Math.round(y*h)+.5;
    canvasCtx.beginPath();canvasCtx.moveTo(0,py);canvasCtx.lineTo(w,py);canvasCtx.stroke();
  }
  if (duration) {
    const span=visibleDuration(),step=rulerStep(span);
    for(let t=Math.ceil(start/step)*step;t<=start+span;t+=step){
      const x=sampleToCanvasX(t,w);
      canvasCtx.strokeStyle=color('--al-wave-vertical','#21323d');canvasCtx.beginPath();canvasCtx.moveTo(x+.5,0);canvasCtx.lineTo(x+.5,h);canvasCtx.stroke();
    }
  }
  const peaks=playbackMode==='warp'?warpPeaks:pyramid;
  const audioBuffer=playbackMode==='warp'?warp?.buffer:decoded?.buffer;
  if (peaks?.levels?.length && audioBuffer) {
    const channels=Math.min(peaks.channelCount, 2), span=visibleDuration();
    const frameRate = audioBuffer.sampleRate, framesPerPixel = span * frameRate / w;
    const lvl = [...peaks.levels].reverse().find(level => level.samplesPerBucket <= framesPerPixel) || peaks.levels[0];
    const samplesPerBucket=lvl.samplesPerBucket;
    const width=Math.ceil(w);
    for(let ch=0;ch<channels;ch++){
      const y0=h*(ch+.5)/channels,half=h*(.44/channels);
      const min=lvl.minimum[ch],max=lvl.maximum[ch];
      canvasCtx.fillStyle=ch===0?color('--al-wave-primary','#52cddd'):color('--al-wave-secondary','#d89b70');
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
      canvasCtx.strokeStyle=color('--al-wave-center','#50707e');canvasCtx.beginPath();canvasCtx.moveTo(0,y0+.5);canvasCtx.lineTo(w,y0+.5);canvasCtx.stroke();
    }
  } else {
    canvasCtx.strokeStyle=color('--al-wave-empty','#30434e');canvasCtx.setLineDash([3,7]);
    canvasCtx.beginPath();canvasCtx.moveTo(0,h/2+.5);canvasCtx.lineTo(w,h/2+.5);canvasCtx.stroke();canvasCtx.setLineDash([]);
  }
  if(warpMap&&meterTimeline){
    const grid=buildMusicalGrid({mode:playbackMode,meterTimeline,warpMap,warpTimeline:warp?.warpTimeline,
      viewportStartSeconds:start,viewportEndSeconds:start+visibleDuration(),widthPixels:w,
      subdivisionCount:2,minSpacingPixels:12});
    for(const line of grid.lines){
      canvasCtx.strokeStyle=color('--al-grid-'+line.kind,'#607786');
      canvasCtx.lineWidth=line.kind==='measure'?2:1;
      canvasCtx.beginPath();canvasCtx.moveTo(Math.round(line.x)+.5,0);canvasCtx.lineTo(Math.round(line.x)+.5,h);canvasCtx.stroke();
      if(line.label){canvasCtx.fillStyle=color('--al-grid-label','#c4d6de');canvasCtx.font='11px ui-monospace,monospace';canvasCtx.fillText(line.label,line.x+4,15);}
    }
  }
  if (player) {
    const x=sampleToCanvasX(playerPosition(),w);
    if(x>=0&&x<=w){canvasCtx.fillStyle=color('--al-playhead','#f6b478');canvasCtx.fillRect(Math.round(x),0,2,h);canvasCtx.fillRect(x-2,0,6,3);}
  }
}
function markerLabel(marker) {
  if(marker.kind==='downbeat')return '⚑';
  if(marker.kind==='meter')return marker.meter.numerator+'/'+marker.meter.denominator;
  if(marker.kind==='tempo')return '♩';
  return 'W';
}
function markerDescription(marker) {
  let detail=kinds[marker.kind];
  if(marker.kind==='downbeat'){
    const meter=readMeter();detail+=' · '+meter.numerator+'/'+meter.denominator;
  }
  if(marker.kind==='meter')detail+=' '+marker.meter.numerator+'/'+marker.meter.denominator+
    (marker.meter.groups.length>1?' · '+marker.meter.groups.join('+'):'');
  if(marker.kind==='tempo')detail+=' · '+marker.bpm+' BPM'+(marker.validated?' · validé':' · à vérifier');
  if(marker.kind==='warp')detail+=' · noire '+marker.beat+(marker.validated?' · validé':' · à vérifier');
  return detail;
}
function refreshInspector() {
  const current=markers.find(m=>m.id===selected);
  $('alMarkerInfo').textContent=current?markerDescription(current):'Aucun';
  markerTime.disabled=!current;
  removeButton.disabled=!current;
  markerTime.max=String(totalDuration());
  markerTime.value=current?current.seconds.toFixed(3):'0';
  $('alWarpMarkerEditor').hidden=current?.kind!=='warp';
  $('alTempoMarkerEditor').hidden=current?.kind!=='tempo';
  $('alDownbeatMarkerEditor').hidden=current?.kind!=='downbeat';
  if(current?.kind==='downbeat'){
    const meter=readMeter(),preset=meter.numerator+'/'+meter.denominator;
    $('alDownbeatMeter').value=[2,3,4,6,9,12].includes(meter.numerator)&&
      ['2/4','3/4','4/4','6/8','9/8','12/8'].includes(preset)?preset:'custom';
  }
  if(current?.kind==='warp'){
    $('alWarpMarkerBeat').value=String(current.beat);
    $('alWarpMarkerValidated').checked=current.validated===true;
  }
  if(current?.kind==='tempo'){
    $('alTempoMarkerBpm').value=String(current.bpm);
    $('alTempoMarkerValidated').checked=current.validated===true;
  }
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
    const displaySeconds=displayFromSource(marker.seconds);
    if(displaySeconds<start||displaySeconds>start+span)continue;
    const button=document.createElement('button');
    button.type='button';button.className='al-marker';
    button.dataset.id=String(marker.id);button.dataset.kind=marker.kind;
    if(['warp','tempo'].includes(marker.kind))button.dataset.validated=String(marker.validated===true);
    button.style.left=((displaySeconds-start)/span*100)+'%';
    const label=document.createElement('span');label.textContent=markerLabel(marker);button.append(label);
    button.title=markerDescription(marker)+' · '+formatTime(marker.seconds)+' · déplacer ou utiliser les flèches';
    button.setAttribute('aria-label',button.title);
    if(marker.id===selected)button.classList.add('is-selected');
    layer.append(button);
  }
  refreshInspector();
}
function renderRegions(){
  const span=visibleDuration();
  for(const [id,range] of [['alSelectionRegion',selection],['alLoopRegion',
    $('alLoopEnabled').checked&&loopB!==null?{a:loopA,b:loopB}:null]]){
    const element=$(id);
    if(!range||!span){element.hidden=true;continue;}
    const a=displayFromSource(range.a),b=displayFromSource(range.b);
    const left=Math.max(0,(a-start)/span),right=Math.min(1,(b-start)/span);
    if(right<=left){element.hidden=true;continue;}
    element.hidden=false;element.style.left=(left*100)+'%';element.style.width=((right-left)*100)+'%';
    if(id==='alLoopRegion'){
      element.querySelector('[data-loop-edge=start]').hidden=a<start;
      element.querySelector('[data-loop-edge=end]').hidden=b>start+span;
      for(const edge of ['start','end']){
        const handle=element.querySelector('[data-loop-edge='+edge+']');
        handle.setAttribute('aria-valuemax',String(totalDuration()));
        handle.setAttribute('aria-valuenow',String(edge==='start'?loopA:loopB));
        handle.setAttribute('aria-valuetext',formatTime(edge==='start'?loopA:loopB));
      }
    }
  }
}
function paint(){
  if(!isVisible())return;
  refreshTransport();refreshPosition();drawRuler();drawWave();renderMarkers();renderRegions();
}
function ensureCursorInView(position) {
  if(!decoded||zoom===1){start=0;return;}
  const span=visibleDuration();
  if(position<start||position>start+span)start=clamp(position-span*.3,0,displayDuration()-span);
}
function animate(){
  frame=0;
  if(!isVisible())return;
  if(activePlayer()?.playing){
    const previousStart=start;ensureCursorInView(playerPosition());
    refreshPosition();drawWave();if(start!==previousStart){drawRuler();renderMarkers();renderRegions();}
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
function invalidateWarp(message='Les réglages ont changé : préparez un nouveau rendu Warp.'){
  ++warpGeneration;
  warpJob?.abort();warpJob=null;
  busy=false;
  if(playbackMode==='warp')setPlaybackMode('original');
  warp?.session.dispose();warp=null;warpPeaks=null;warpMap=null;meterTimeline=null;
  refreshOriginalGrid();
  $('alWarpMode').disabled=true;$('alWarpProgress').hidden=true;$('alCancelWarp').hidden=true;
  $('alWarpStatus').textContent=message;
  refreshWarpControls();refreshTransport();paint();
}
function refreshWarpControls(){
  const source=Number($('alWarpSourceBpm').value),target=Number($('alWarpTargetBpm').value);
  $('alPrepareWarp').disabled=!decoded||busy||!!warpJob||!$('alWarpConfirmed').checked||
    !Number.isFinite(source)||source<20||source>400||!Number.isFinite(target)||target<20||target>400;
  $('alWarpMode').disabled=!warp;
  $('alOriginalMode').setAttribute('aria-pressed',String(playbackMode==='original'));
  $('alWarpMode').setAttribute('aria-pressed',String(playbackMode==='warp'));
}
function makeWarpMetricMap(sourceBpm){
  const map=buildValidatedWarpMap({durationSeconds:totalDuration(),sourceBpm,
    markers:markers.filter(m=>['warp','tempo'].includes(m.kind)&&m.validated).map(m=>({
      kind:m.kind,seconds:m.seconds,beat:m.kind==='warp'?m.beat:undefined,
      bpm:m.kind==='tempo'?m.bpm:undefined,validated:true,locked:false,
    }))});
  const endTick=map.lengthTicks;
  const base=readMeter();
  const byTick=new Map([[0,{tick:0,...base}]]);
  const downbeat=markers.find(m=>m.kind==='downbeat'&&m.seconds<totalDuration());
  const firstDownbeatTick=downbeat?Math.min(endTick-1,Math.max(0,Math.round(sourceSecondsToTick(map,downbeat.seconds)))):0;
  for(const marker of markers.filter(m=>m.kind==='meter'&&m.seconds<totalDuration())){
    const tick=Math.round(sourceSecondsToTick(map,marker.seconds));
    if(tick>=firstDownbeatTick&&tick<endTick)byTick.set(tick,{tick,...marker.meter});
  }
  const timeline=createMeterTimeline([...byTick.values()].sort((a,b)=>a.tick-b.tick),endTick,{firstDownbeatTick});
  return {map,timeline};
}
function refreshOriginalGrid(){
  if(warp||!decoded||!$('alWarpConfirmed').checked){
    if(!warp){warpMap=null;meterTimeline=null;}
    return;
  }
  const sourceBpm=Number($('alWarpSourceBpm').value);
  try{
    if(!Number.isFinite(sourceBpm)||sourceBpm<20||sourceBpm>400)throw new RangeError('BPM source entre 20 et 400 requis.');
    const metric=makeWarpMetricMap(sourceBpm);
    warpMap=metric.map;meterTimeline=metric.timeline;
  }catch(error){
    warpMap=null;meterTimeline=null;
    $('alWarpStatus').textContent='Grille indisponible : '+error.message;
  }
}
function setPlaybackMode(next){
  if(next==='warp'&&!warp)return;
  if(next===playbackMode)return;
  const sourceSeconds=sourceFromDisplay(activePlayer()?.positionSeconds()||0);
  activePlayer()?.pause();
  playbackMode=next;
  if(next==='warp'){
    click?.disable();$('alClickEnabled').checked=false;$('alClickEnabled').disabled=true;
  }else{
    $('alClickEnabled').disabled=false;
    $('alClickEnabled').checked=originalClickWanted;
    if(originalClickWanted)click?.enable().catch(error=>{
      originalClickWanted=false;$('alClickEnabled').checked=false;
      setStatus('Clic Original indisponible : '+error.message);
    });
  }
  activePlayer()?.seek(clamp(displayFromSource(sourceSeconds),0,displayDuration()));
  start=0;refreshLoop();refreshWarpControls();paint();
}
async function prepareWarp(){
  if(!decoded||busy||!$('alWarpConfirmed').checked)return;
  const sourceBpm=Number($('alWarpSourceBpm').value),targetBpm=Number($('alWarpTargetBpm').value);
  if(![sourceBpm,targetBpm].every(n=>Number.isFinite(n)&&n>=20&&n<=400)){
    $('alWarpStatus').textContent='Saisissez des BPM source et cible entre 20 et 400.';return;
  }
  invalidateWarp('Préparation du Warp…');
  const generation=++warpGeneration,controller=new AbortController();warpJob=controller;
  activePlayer()?.pause();click?.disable();
  busy=true;$('alWarpProgress').hidden=false;$('alWarpProgress').value=0;
  $('alCancelWarp').hidden=false;refreshTransport();refreshWarpControls();
  try{
    const {map,timeline}=makeWarpMetricMap(sourceBpm);
    const warpTimeline=createWarpTimeline(map,[{tick:0,bpm:targetBpm,pulse:{count:1,denominator:4}}]);
    const useClick=$('alClickEnabled').checked;
    const prepared=await prepareWarpPlayback({context:decoded.context,sourceBuffer:decoded.buffer,
      warpTimeline,meterTimeline:timeline,clickEnabled:useClick,bank:'clic',signal:controller.signal,
      onsets:onsetEvidence,
      onProgress:({phase,fraction})=>{
        if(generation!==warpGeneration)return;
        $('alWarpProgress').value=fraction;
        $('alWarpStatus').textContent=(phase==='clicks'?'Chargement du clic RENAX':'Rendu Warp')+' · '+Math.round(fraction*100)+' %';
      },onState:()=>{refreshTransport();refreshPosition();restartAnimation();}});
    if(controller.signal.aborted||generation!==warpGeneration){prepared.session.dispose();return;}
    $('alWarpStatus').textContent='Construction de la forme d’onde Warp…';
    const peaks=await extractWarpPeaks(prepared.buffer,{signal:controller.signal});
    if(controller.signal.aborted||generation!==warpGeneration){prepared.session.dispose();return;}
    warp=prepared;warpPeaks=peaks;warpMap=map;meterTimeline=timeline;
    $('alWarpStatus').textContent='Warp prêt : '+sourceBpm+' → '+targetBpm+' BPM · hauteur préservée · '+formatTime(prepared.buffer.duration)+'.'+
      (useClick?' Clic RENAX synchronisé.':' Clic désactivé.');
    setStatus('Warp rendu hors du thread graphique. Source audio conservée.');
    setPlaybackMode('warp');
  }catch(error){
    if(generation!==warpGeneration)return;
    $('alWarpStatus').textContent=controller.signal.aborted?'Rendu Warp annulé.':
      error?.code==='MEMORY_PRESSURE'?'Warp dépasse le budget mémoire de lecture. La lecture Original reste disponible ; le Warp des fichiers longs est indisponible dans cet éditeur.':
      'Warp impossible : '+error.message;
  }finally{
    if(generation===warpGeneration){warpJob=null;busy=false;$('alWarpProgress').hidden=true;$('alCancelWarp').hidden=true;refreshTransport();refreshWarpControls();paint();}
  }
}
function createMarker(seconds) {
  if(!decoded||kind==='cursor')return;
  if((warp||warpJob)&&['meter','downbeat','warp','tempo'].includes(kind))invalidateWarp();
  const marker={id:nextId++,kind,seconds};
  if(kind==='meter')marker.meter=readMeter();
  if(kind==='tempo'){marker.bpm=Number($('alWarpSourceBpm').value)||120;marker.validated=false;}
  if(kind==='warp'){
    marker.beat=Math.round(seconds*Number($('alWarpSourceBpm').value)/60*4)/4;
    marker.validated=false;
  }
  markers.push(marker);
  markers.sort((a,b)=>a.seconds-b.seconds);
  selected=marker.id;
  if(kind==='downbeat')click?.configure({downbeat:markers.find(m=>m.kind==='downbeat')?.seconds??0});
  if(kind==='meter')click?.configure(readMeter());
  refreshOriginalGrid();paint();
  setStatus(markerDescription(marker)+' ajouté à '+formatTime(seconds)+' · le fichier source est intact.');
  commitHistory();
}
function changeMarkerPosition(id,seconds){
  const marker=markers.find(m=>m.id===id);
  if(!marker)return;
  if((warp||warpJob)&&['meter','downbeat','warp','tempo'].includes(marker.kind))invalidateWarp();
  marker.seconds=snappedSource(seconds);
  markers.sort((a,b)=>a.seconds-b.seconds||a.id-b.id);
  if(marker.kind==='warp')marker.validated=false;
  if(marker.kind==='tempo')marker.validated=false;
  if(marker.kind==='downbeat')click?.configure({downbeat:markers.find(m=>m.kind==='downbeat')?.seconds??0});
  markerTime.value=marker.seconds.toFixed(3);
  $('alMarkerInfo').textContent=markerDescription(marker);
  if(marker.kind==='warp')$('alWarpMarkerValidated').checked=false;
  if(marker.kind==='tempo')$('alTempoMarkerValidated').checked=false;
  refreshOriginalGrid();
}
function unload(){
  pulseJob++;
  onsetJob?.abort();onsetJob=null;
  projectGeneration++;
  job?.abort();job=null;
  ++warpGeneration;warpJob?.abort();warpJob=null;
  if(warp){warp.session.dispose();warp=null;}warpPeaks=null;warpMap=null;meterTimeline=null;playbackMode='original';
  $('alWarpConfirmed').checked=false;$('alWarpProgress').hidden=true;$('alCancelWarp').hidden=true;
  $('alWarpStatus').textContent='Validez le tempo source pour préparer Warp.';
  onsetEvidence=[];detectedTempoBase=null;$('alTempoLevel').hidden=true;
  $('alTempoAlternatives').hidden=true;$('alTempoAlternatives').replaceChildren();
  loopA=0;loopB=null;$('alLoopEnabled').checked=false;$('alLoopInfo').textContent='—';$('alPulseResult').textContent='';
  if(click){click.dispose();click=null;}
  originalClickWanted=false;$('alClickEnabled').checked=false;$('alClickEnabled').disabled=false;
  if(player){player.dispose();player=null;}
  if(decoded){decoded.context.close().catch(()=>{});decoded=null;}
  pyramid=null;markers=[];selected=null;selection=null;gesture=null;touchPointers.clear();pinch=null;
  zoom=1;start=0;zoomSlider.value='1';$('alZoomValue').textContent='×1';
  history=[];historyIndex=-1;updateHistoryButtons();
  refreshInspector();refreshWarpControls();paint();
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
    commitHistory();
    const identity=imported.identity;
    const sourceRate=identity.sourceSampleRate||identity.sampleRate;
    const sourceBits=identity.sourceBitDepth?identity.sourceBitDepth+' bits · ':'';
    $('alFormatInfo').textContent=imported.format.toUpperCase()+' · '+sourceBits+(sourceRate/1000).toLocaleString('fr-BE',{maximumFractionDigits:1})+' kHz · '+identity.channels+(identity.channels>1?' canaux':' canal');
    $('alEditorHint').textContent='Original · '+formatTime(identity.durationSeconds)+' · marqueurs modifiables';
    setStatus('Import local prêt. Lecture originale et repères manuels disponibles.');
    refreshWarpControls();
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
    root.dataset.alTool=kind;
    root.querySelectorAll('[data-al-tool]').forEach(b=>{
      const active=b===button;b.classList.toggle('is-active',active);
      b.setAttribute('aria-pressed',String(active));
    });
    setStatus(kind==='warp'?'Drapeau Warp manuel : associez-le à un temps, puis validez l’ancrage.':
      kind==='tempo'?'Repère de tempo local : réglez son BPM puis validez-le pour corriger la carte Warp.':
      kind==='cursor'?'Curseur : cliquer pour se déplacer, glisser un repère pour le corriger.':
      kind==='selection'?'Glisser sur la forme d’onde pour sélectionner une région.':
      kind==='hand'?'Glisser horizontalement pour déplacer la vue zoomée.':
      kind==='loop'?'Glisser sur la forme d’onde pour définir et activer une boucle.':
      kind==='zoom'?'Glisser sur la zone à agrandir.':
      'Cliquer sur la waveform pour placer '+kinds[kind].toLowerCase()+'.');
  });
});
canvas.addEventListener('click',event=>{
  if(!decoded||busy||(performance.now()<suppressCanvasClickUntil&&event.sourceCapabilities?.firesTouchEvents)||
    ['selection','hand','loop','zoom'].includes(kind))return;
  const seconds=canvasXToSeconds(event.clientX);
  try{
    if(kind==='cursor'){activePlayer().seek(seconds);if(playbackMode==='original')click?.sync();refreshPosition();paint();}
    else createMarker(snappedSource(sourceFromDisplay(seconds)));
  }catch(error){setStatus(error.message);}
});
canvas.addEventListener('pointerdown',event=>{
  if(!decoded||busy)return;
  if(event.pointerType==='touch'){
    touchPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    canvas.setPointerCapture(event.pointerId);
    if(touchPointers.size===2){
      const [a,b]=[...touchPointers.values()];
      const rect=canvas.getBoundingClientRect(),midX=(a.x+b.x)/2;
      pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),initialZoom:zoom,
        focusDisplay:start+clamp((midX-rect.left)/Math.max(1,rect.width),0,1)*visibleDuration()};
      gesture=null;selection=null;suppressCanvasClickUntil=performance.now()+500;
      event.preventDefault();renderRegions();return;
    }
    if(touchPointers.size>2||pinch)return;
  }
  if(!event.isPrimary||event.button!==0||!['selection','hand','loop','zoom'].includes(kind))return;
  event.preventDefault();
  gesture={tool:kind,pointerId:event.pointerId,x:event.clientX,viewStart:start,
    display0:canvasXToSeconds(event.clientX),source0:snappedSource(sourceFromDisplay(canvasXToSeconds(event.clientX)))};
  canvas.setPointerCapture(event.pointerId);
  if(kind!=='hand'){selection={a:gesture.source0,b:gesture.source0};renderRegions();}
});
canvas.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch'&&touchPointers.has(event.pointerId)){
    touchPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pinch&&touchPointers.size>=2){
      const [a,b]=[...touchPointers.values()];
      const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
      const rect=canvas.getBoundingClientRect(),midX=(a.x+b.x)/2;
      zoom=clamp(Math.round(pinch.initialZoom*distance/pinch.distance),1,24);
      zoomSlider.value=String(zoom);$('alZoomValue').textContent='×'+zoom;
      const ratio=clamp((midX-rect.left)/Math.max(1,rect.width),0,1);
      start=clamp(pinch.focusDisplay-ratio*visibleDuration(),0,Math.max(0,displayDuration()-visibleDuration()));
      event.preventDefault();paint();return;
    }
  }
  if(!gesture||event.pointerId!==gesture.pointerId)return;
  const width=Math.max(1,canvas.getBoundingClientRect().width);
  if(gesture.tool==='hand'){
    start=clamp(gesture.viewStart-(event.clientX-gesture.x)/width*visibleDuration(),0,Math.max(0,displayDuration()-visibleDuration()));
    paint();return;
  }
  const source=snappedSource(sourceFromDisplay(canvasXToSeconds(event.clientX)));
  selection={a:Math.min(gesture.source0,source),b:Math.max(gesture.source0,source)};
  renderRegions();
});
function finishCanvasGesture(event){
  if(event.pointerType==='touch'){
    touchPointers.delete(event.pointerId);
    if(pinch){
      pinch=null;gesture=null;selection=null;
      suppressCanvasClickUntil=performance.now()+500;paint();return;
    }
  }
  if(!gesture||event.pointerId!==gesture.pointerId)return;
  const tool=gesture.tool,range=selection;
  gesture=null;
  if(tool==='hand'){setStatus('Vue déplacée : début à '+formatTime(start)+'.');paint();return;}
  if(!range||range.b-range.a<.01){selection=null;paint();return;}
  if(tool==='loop'){
    loopA=range.a;loopB=range.b;$('alLoopEnabled').checked=true;
    refreshLoop();commitHistory();
    setStatus('Boucle A/B définie depuis la région sélectionnée.');
  }else if(tool==='zoom'){
    const displayA=displayFromSource(range.a),displayB=displayFromSource(range.b);
    zoom=clamp(Math.round(displayDuration()/Math.max(.001,displayB-displayA)),1,24);
    zoomSlider.value=String(zoom);$('alZoomValue').textContent='×'+zoom;
    start=clamp(displayA,0,Math.max(0,displayDuration()-visibleDuration()));
    selection=null;setStatus('Vue agrandie sur la zone choisie.');
  }else setStatus('Région sélectionnée : '+formatTime(range.a)+' – '+formatTime(range.b)+'.');
  paint();
}
canvas.addEventListener('pointerup',finishCanvasGesture);
canvas.addEventListener('pointercancel',event=>{
  touchPointers.delete(event.pointerId);
  if(pinch||gesture?.pointerId===event.pointerId){pinch=null;gesture=null;selection=null;paint();}
});
let draggedLoopEdge=null;
$('alLoopRegion').addEventListener('pointerdown',event=>{
  const handle=event.target.closest('[data-loop-edge]');
  if(!handle||!event.isPrimary||event.button!==0)return;
  event.preventDefault();draggedLoopEdge=handle.dataset.loopEdge;
  handle.setPointerCapture(event.pointerId);
});
$('alLoopRegion').addEventListener('pointermove',event=>{
  if(!draggedLoopEdge)return;
  const seconds=snappedSource(sourceFromDisplay(canvasXToSeconds(event.clientX)));
  if(draggedLoopEdge==='start')loopA=clamp(seconds,0,(loopB??totalDuration())-.05);
  else loopB=clamp(seconds,loopA+.05,totalDuration());
  refreshLoop();renderRegions();
});
for(const eventName of ['pointerup','pointercancel','lostpointercapture']){
  $('alLoopRegion').addEventListener(eventName,()=>{
    if(!draggedLoopEdge)return;draggedLoopEdge=null;commitHistory();paint();
  });
}
$('alLoopRegion').addEventListener('keydown',event=>{
  const handle=event.target.closest('[data-loop-edge]');
  if(!handle||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();
  const delta=(event.key==='ArrowRight'?1:-1)*(event.shiftKey?.001:.01);
  if(handle.dataset.loopEdge==='start')loopA=clamp(loopA+delta,0,(loopB??totalDuration())-.05);
  else loopB=clamp((loopB??totalDuration())+delta,loopA+.05,totalDuration());
  refreshLoop();commitHistory();paint();
});
$('alSnap').addEventListener('click',event=>{
  snapEnabled=!snapEnabled;event.currentTarget.setAttribute('aria-pressed',String(snapEnabled));
  setStatus(snapEnabled?'Snap activé : grille validée ou attaque proche.':'Snap désactivé : placement libre.');
});
$('alUndo').addEventListener('click',()=>restoreHistory(historyIndex-1));
$('alRedo').addEventListener('click',()=>restoreHistory(historyIndex+1));
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
  changeMarkerPosition(draggedId,sourceFromDisplay(canvasXToSeconds(event.clientX)));
  button.style.left=((displayFromSource(markers.find(m=>m.id===draggedId).seconds)-start)/visibleDuration()*100)+'%';
});
for(const eventName of ['pointerup','pointercancel','lostpointercapture']){
  layer.addEventListener(eventName,()=>{if(draggedId===null)return;draggedId=null;commitHistory();renderMarkers();});
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
  button.style.left=((displayFromSource(marker.seconds)-start)/visibleDuration()*100)+'%';
  refreshMarkerSelection();
  commitHistory();
});
markerTime.addEventListener('change',()=>{
  if(selected===null)return;
  const v=Number(markerTime.value);
  if(!Number.isFinite(v)){refreshInspector();return;}
  changeMarkerPosition(selected,v);renderMarkers();commitHistory();
});
$('alWarpMarkerBeat').addEventListener('change',event=>{
  const marker=markers.find(m=>m.id===selected&&m.kind==='warp');if(!marker)return;
  const beat=Number(event.target.value);
  if(!Number.isFinite(beat)||beat<0||!Number.isSafeInteger(Math.round(beat*TICKS_PER_QUARTER))){
    setStatus('Temps musical du repère Warp invalide.');refreshInspector();return;
  }
  if(warp||warpJob)invalidateWarp();
  marker.beat=beat;marker.validated=false;renderMarkers();
  refreshOriginalGrid();paint();
  commitHistory();
  setStatus('Temps musical mis à jour. Validez cet ancrage après vérification.');
});
$('alWarpMarkerValidated').addEventListener('change',event=>{
  const marker=markers.find(m=>m.id===selected&&m.kind==='warp');if(!marker)return;
  if(event.target.checked&&(marker.seconds<=0||marker.seconds>=totalDuration())){
    event.target.checked=false;marker.validated=false;
    setStatus('Un ancrage Warp doit être strictement entre le début et la fin du fichier.');return;
  }
  if(warp||warpJob)invalidateWarp();
  marker.validated=event.target.checked;
  refreshOriginalGrid();paint();
  commitHistory();
  setStatus(marker.validated?'Ancrage Warp validé. Préparez le rendu pour appliquer cette correction.':'Ancrage Warp non validé.');
});
$('alTempoMarkerBpm').addEventListener('change',event=>{
  const marker=markers.find(m=>m.id===selected&&m.kind==='tempo');if(!marker)return;
  const bpm=Number(event.target.value);
  if(!Number.isFinite(bpm)||bpm<20||bpm>400){
    setStatus('BPM local entre 20 et 400 requis.');refreshInspector();return;
  }
  if(warp||warpJob)invalidateWarp();
  marker.bpm=bpm;marker.validated=false;
  refreshOriginalGrid();paint();commitHistory();
  setStatus('Tempo local mis à jour. Validez ce changement après vérification.');
});
$('alTempoMarkerValidated').addEventListener('change',event=>{
  const marker=markers.find(m=>m.id===selected&&m.kind==='tempo');if(!marker)return;
  if(event.target.checked&&(marker.seconds<=0||marker.seconds>=totalDuration())){
    event.target.checked=false;marker.validated=false;
    setStatus('Un changement de tempo doit être strictement entre le début et la fin du fichier.');return;
  }
  if(warp||warpJob)invalidateWarp();
  marker.validated=event.target.checked;
  refreshOriginalGrid();paint();commitHistory();
  setStatus(marker.validated?'Tempo local validé : la carte musicale est mise à jour.':'Tempo local non validé.');
});
removeButton.addEventListener('click',()=>{
  if(selected===null)return;markers=markers.filter(m=>m.id!==selected);selected=null;
  click?.configure({downbeat:markers.find(m=>m.kind==='downbeat')?.seconds??0});
  if(warp||warpJob)invalidateWarp();
  refreshOriginalGrid();paint();commitHistory();setStatus('Repère supprimé. Audio original conservé.');
});
playButton.addEventListener('click',async()=>{
  const transport=activePlayer();if(!transport||busy)return;
  try{
    if(transport.playing){transport.pause();if(playbackMode==='original')click?.sync();paint();}
    else{await transport.play();if(playbackMode==='original')click?.sync();refreshTransport();restartAnimation();}
  }catch(error){setStatus('Lecture impossible : activer la sortie audio du navigateur.');}
});
window.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || event.defaultPrevented || !isVisible() || playButton.disabled) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target;
  if (target instanceof Element && (target.closest('input, textarea, select, button, a, summary, [contenteditable], [role="dialog"], dialog[open]') || target.isContentEditable)) return;
  if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  playButton.click();
}, true);
window.addEventListener('keydown',event=>{
  if(!isVisible()||event.defaultPrevented||!event.ctrlKey||event.altKey||event.metaKey||event.code!=='KeyZ')return;
  const target=event.target;
  if(target instanceof Element&&(target.closest('input, textarea, select, [contenteditable], dialog[open]')||target.isContentEditable))return;
  event.preventDefault();event.stopImmediatePropagation();
  restoreHistory(historyIndex+(event.shiftKey?1:-1));
},true);
stopButton.addEventListener('click',()=>{activePlayer()?.stop();if(playbackMode==='original')click?.sync();start=0;paint();});
seekSlider.addEventListener('input',()=>{
  const transport=activePlayer();if(!transport)return;const seconds=displayDuration()*Number(seekSlider.value)/1000;
  transport.seek(seconds);if(playbackMode==='original')click?.sync();ensureCursorInView(seconds);paint();
});
zoomSlider.addEventListener('input',()=>{
  const focus=playerPosition();
  zoom=Number(zoomSlider.value);$('alZoomValue').textContent='×'+zoom;
  start=clamp(focus-visibleDuration()/2,0,Math.max(0,displayDuration()-visibleDuration()));
  paint();
});
canvas.addEventListener('wheel',event=>{
  if(!event.ctrlKey||!decoded)return;
  event.preventDefault();
  zoom=clamp(zoom+Math.sign(event.deltaY)*-1,1,24);
  zoomSlider.value=String(zoom);$('alZoomValue').textContent='×'+zoom;
  start=clamp(playerPosition()-visibleDuration()/2,0,Math.max(0,displayDuration()-visibleDuration()));
  paint();
},{passive:false});
new ResizeObserver(()=>{if(isVisible())paint();}).observe($('alWaveContainer'));
new MutationObserver(()=>{
  const visible=document.body.dataset.workspace==='audio-lab' && document.documentElement.dataset.tool!=='tuner';
  root.hidden=!visible;
  if(!visible&&activePlayer()?.playing){activePlayer().pause();if(playbackMode==='original')click?.sync();}
  if(visible)requestAnimationFrame(paint);
}).observe(document.body,{attributes:true,attributeFilter:['data-workspace']});
new MutationObserver(()=>{
  if(document.documentElement.dataset.tool==='tuner'&&activePlayer()?.playing){activePlayer().pause();if(playbackMode==='original')click?.sync();}
}).observe(document.documentElement,{attributes:true,attributeFilter:['data-tool']});
new MutationObserver(()=>{if(isVisible())requestAnimationFrame(paint);})
  .observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
root.hidden=document.body.dataset.workspace!=='audio-lab';
refreshInspector();refreshTransport();refreshWarpControls();

$('alWarpConfirmed').addEventListener('change',()=>{
  if((warp||warpJob)&&!$('alWarpConfirmed').checked)invalidateWarp();else refreshWarpControls();
  refreshOriginalGrid();paint();
});
for(const id of ['alWarpSourceBpm','alWarpTargetBpm']){
  $(id).addEventListener('input',()=>{if(warp||warpJob)invalidateWarp();else refreshWarpControls();refreshOriginalGrid();paint();});
}
for(const id of ['alNumerator','alDenominator','alGroups']){
  $(id).addEventListener('change',()=>{if(warp||warpJob)invalidateWarp();refreshOriginalGrid();paint();});
}
$('alDownbeatMeter').addEventListener('change',event=>{
  if(event.target.value==='custom')return;
  const [numerator,denominator]=event.target.value.split('/').map(Number);
  $('alNumerator').value=String(numerator);$('alDenominator').value=String(denominator);
  $('alGroups').value=denominator===8&&numerator%3===0?
    Array.from({length:numerator/3},()=>3).join('+'):'';
  if(warp||warpJob)invalidateWarp();
  click?.configure(readMeter());refreshOriginalGrid();refreshInspector();paint();
  $('alDetectPulse').textContent='Recalculer la pulsation';
  setStatus('Métrique du drapeau modifiée. Relancez manuellement l’analyse guidée.');
});
for(const input of root.querySelectorAll('input[name=alPulseFeel]'))input.addEventListener('change',()=>{
  if($('alPulseResult').textContent&&$('alPulseResult').textContent!=='Aucune analyse'){
    $('alDetectPulse').textContent='Recalculer la pulsation';
    $('alPulseResult').textContent='Indications modifiées · résultat à recalculer';
  }
});
$('alPrepareWarp').addEventListener('click',prepareWarp);
$('alCancelWarp').addEventListener('click',()=>warpJob?.abort());
$('alOriginalMode').addEventListener('click',()=>setPlaybackMode('original'));
$('alWarpMode').addEventListener('click',()=>setPlaybackMode('warp'));
$('alExportProject').addEventListener('click',()=>{
  if(!decoded||busy)return;
  try{
    const state={markers:structuredClone(markers),baseMeter:readMeter(),loopA,loopB,
      loopEnabled:$('alLoopEnabled').checked,
      manualBpm:Number($('alManualBpm').value),
      sourceBpm:Number($('alWarpSourceBpm').value),targetBpm:Number($('alWarpTargetBpm').value),
      confirmed:$('alWarpConfirmed').checked,zoom,
      start:sourceFromDisplay(start),selected,kind,snap:snapEnabled,playbackMode,
      clickEnabled:originalClickWanted,
      audioVolume:Number($('alAudioVolume').value),clickVolume:Number($('alClickVolume').value),
      selection:selection?{...selection}:null};
    const snapshot=createAudioLabLocalProject({source:decoded.identity,state});
    const blob=new Blob([serializeAudioLabLocalProject(snapshot)],{type:'application/json'});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=decoded.identity.name.replace(/\.[^.]+$/,'').replace(/[^\w-]/g,'_')+'.renax-audio-lab.json';
    anchor.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
    $('alProjectStatus').textContent='Projet JSON exporté sans audio. Conservez le fichier source correspondant.';
    setStatus('Projet JSON exporté sans données audio.');
  }catch(error){$('alProjectStatus').textContent='Export impossible : '+error.message;setStatus('Export du projet impossible : '+error.message);}
});
$('alImportProject').addEventListener('click',()=>{if(decoded&&!busy)$('alProjectInput').click();});
$('alProjectInput').addEventListener('change',async event=>{
  const file=event.target.files?.[0];event.target.value='';
  if(!file||!decoded||busy)return;
  const source=decoded,generation=++projectGeneration;
  try{
    const restored=await readAudioLabLocalProjectFile(file,source.identity);
    if(decoded!==source||generation!==projectGeneration||busy)return;
    if(warp||warpJob)invalidateWarp('Projet restauré : préparez à nouveau Warp.');
    markers=restored.markers;nextId=Math.max(0,...markers.map(marker=>marker.id))+1;
    $('alNumerator').value=String(restored.baseMeter.numerator);
    $('alDenominator').value=String(restored.baseMeter.denominator);
    $('alGroups').value=restored.baseMeter.groups.length>1?restored.baseMeter.groups.join('+'):'';
    $('alManualBpm').value=String(restored.manualBpm);
    loopA=restored.loopA;loopB=restored.loopB;
    $('alLoopEnabled').checked=restored.loopEnabled;
    $('alWarpSourceBpm').value=String(restored.sourceBpm);
    $('alWarpTargetBpm').value=String(restored.targetBpm);
    $('alWarpConfirmed').checked=restored.confirmed;
    zoom=restored.zoom;zoomSlider.value=String(zoom);$('alZoomValue').textContent='×'+zoom;
    start=clamp(restored.start,0,Math.max(0,totalDuration()-visibleDuration()));
    selected=restored.selected;selection=restored.selection;
    root.querySelector('[data-al-tool="'+restored.kind+'"]').click();
    snapEnabled=restored.snap;$('alSnap').setAttribute('aria-pressed',String(snapEnabled));
    $('alAudioVolume').value=String(restored.audioVolume);
    $('alClickVolume').value=String(restored.clickVolume);
    player?.setVolume(restored.audioVolume);click?.setVolume(restored.clickVolume);
    const downbeat=markers.find(marker=>marker.kind==='downbeat');
    click?.configure({bpm:restored.manualBpm,...restored.baseMeter,downbeat:downbeat?.seconds??0});
    originalClickWanted=restored.clickEnabled;
    $('alClickEnabled').checked=originalClickWanted;
    let clickError=null;
    if(originalClickWanted){
      try{await click?.enable();}
      catch(error){clickError=error;originalClickWanted=false;$('alClickEnabled').checked=false;click?.disable();}
    }else click?.disable();
    if(decoded!==source||generation!==projectGeneration||busy)return;
    refreshOriginalGrid();refreshLoop();refreshWarpControls();
    history=[];historyIndex=-1;commitHistory();paint();
    $('alProjectStatus').textContent='Métadonnées source concordantes ; contenu audio non vérifié.'+
      (clickError?' Clic à réactiver.':'');
    setStatus('Projet restauré avec sa source locale. '+
      (restored.playbackMode==='warp'?'Préparez Warp pour retrouver ce mode.':'Lecture Original prête.'));
  }catch(error){
    if(decoded!==source||generation!==projectGeneration)return;
    $('alProjectStatus').textContent='Restauration refusée : '+error.message;
    setStatus('Restauration refusée : '+error.message);
  }
});

// Manual metronome shares the source player's AudioContext clock.
$('alClickEnabled').addEventListener('change',async event=>{
  if(!click){event.target.checked=false;return;}
  originalClickWanted=event.target.checked;
  try{
    if(event.target.checked){
      click.configure({bpm:Number($('alManualBpm').value),...readMeter(),
        downbeat:markers.find(m=>m.kind==='downbeat')?.seconds??0});
      await click.enable();
      setStatus('Clic RENAX manuel activé.');
    }else click.disable();
    if(warp)invalidateWarp('Le choix du clic a changé : préparez à nouveau Warp.');
  }catch(error){originalClickWanted=false;event.target.checked=false;click.disable();setStatus('Clic indisponible : '+error.message);}
});
$('alManualBpm').addEventListener('change',()=>{
  try{click?.configure({bpm:Number($('alManualBpm').value)});}
  catch(error){setStatus(error.message);}
});
$('alAudioVolume').addEventListener('input',event=>{
  const volume=Number(event.target.value);player?.setVolume(volume);warp?.session.setLevels({audio:volume});
});
$('alClickVolume').addEventListener('input',event=>{
  const volume=Number(event.target.value);click?.setVolume(volume);warp?.session.setLevels({click:volume});
});

function refreshLoop(){
  if(!player)return;
  const a=loopA,b=loopB??totalDuration();
  $('alLoopInfo').textContent=formatTime(a)+' – '+formatTime(b);
  if($('alLoopEnabled').checked && b>a+0.04){
    player.setLoop(a,b);
    if(warp)warp.session.setLoop(sourceSecondsToOutputSeconds(warp.warpTimeline,a),
      sourceSecondsToOutputSeconds(warp.warpTimeline,b));
  }else{
    $('alLoopEnabled').checked=false;player.clearLoop();warp?.session.clearLoop();
  }
  if(playbackMode==='original')click?.sync();
  renderRegions();
}
$('alLoopA').addEventListener('click',()=>{
  if(!player)return;
  const p=sourceFromDisplay(playerPosition());
  if(p>=(loopB??totalDuration())-0.02){setStatus('Début A doit précéder la fin B.');return;}
  loopA=snappedSource(p);refreshLoop();commitHistory();
});
$('alLoopB').addEventListener('click',()=>{
  if(!player)return;
  const p=sourceFromDisplay(playerPosition());
  if(p<=loopA+0.02){setStatus('Fin B doit suivre le début A.');return;}
  loopB=snappedSource(p);refreshLoop();commitHistory();
});
$('alLoopEnabled').addEventListener('change',event=>{
  if(!player){event.target.checked=false;return;}
  refreshLoop();commitHistory();
});
function chooseDetectedTempo(ratio){
  if(!Number.isFinite(detectedTempoBase))return;
  const bpm=Math.round(detectedTempoBase*ratio*10)/10;
  if(bpm<20||bpm>400)return;
  $('alManualBpm').value=String(bpm);$('alWarpSourceBpm').value=String(bpm);
  $('alWarpConfirmed').checked=false;
  if(warp||warpJob)invalidateWarp('Le niveau du tempo a changé : préparez un nouveau rendu Warp.');
  else refreshWarpControls();
  click?.configure({bpm});refreshOriginalGrid();paint();
  for(const [id,value] of [['alTempoHalf',.5],['alTempoBase',1],['alTempoDouble',2]])
    $(id).setAttribute('aria-pressed',String(value===ratio));
  $('alPulseResult').textContent='Tempo retenu : '+bpm+' BPM · '+
    (ratio===.5?'moitié du tempo détecté':ratio===2?'double du tempo détecté':'hypothèse détectée');
  setStatus('Pulsation réglée à '+bpm+' BPM, toujours à vérifier à l’oreille.');
}
for(const [id,ratio] of [['alTempoHalf',.5],['alTempoBase',1],['alTempoDouble',2]])
  $(id).addEventListener('click',()=>chooseDetectedTempo(ratio));
$('alDetectPulse').addEventListener('click',async()=>{
  if(!decoded||busy)return;
  const token=++pulseJob;
  onsetJob?.abort();onsetJob=new AbortController();
  const signal=onsetJob.signal;
  const button=$('alDetectPulse');
  button.disabled=true;
  setStatus('Analyse locale des attaques et estimation de la pulsation…');
  // The Worker analyzes a bounded source window without blocking the editor.
  try{
    const buffer=decoded.buffer;
    const result=await detectOnsetsInWorker({buffer,maxSeconds:35,maxOnsets:3000,signal});
    if(token!==pulseJob||signal.aborted)return;
    onsetEvidence=result.onsets.filter(onset=>onset.seconds>0&&onset.seconds<buffer.duration);
    const subdivision=root.querySelector('input[name=alPulseFeel]:checked')?.value||'auto';
    const assisted=subdivision!=='auto';
    const guidedDownbeat=assisted?markers.find(marker=>marker.kind==='downbeat'):null;
    const hypotheses=inferTempoFromOnsets(result.onsets,{subdivision,
      originSeconds:guidedDownbeat?.seconds??null});
    const alternatives=$('alTempoAlternatives');alternatives.replaceChildren();
    if(!hypotheses.candidates.length){
      $('alPulseResult').textContent='Pulsation indéterminée';
      alternatives.textContent='Indices insuffisants : aucun BPM fiable. Vérifiez le tempo à l’oreille.';
      alternatives.hidden=false;
      setStatus('Analyse ambiguë : régler le BPM manuellement.');
      return;
    }
    const first=hypotheses.candidates[0];
    detectedTempoBase=first.bpm;
    const levels=[[.5,$('alTempoHalf')],[1,$('alTempoBase')],[2,$('alTempoDouble')]];
    for(const [ratio,button] of levels){
      const value=Math.round(first.bpm*ratio*10)/10;
      button.querySelector('output').textContent=String(value);
      button.disabled=value<20||value>400;
      button.setAttribute('aria-pressed',String(ratio===1));
    }
    $('alTempoLevel').hidden=false;
    $('alManualBpm').value=String(first.bpm);
    $('alWarpSourceBpm').value=String(first.bpm);
    $('alWarpConfirmed').checked=false;
    if(warp)invalidateWarp('La nouvelle analyse demande une nouvelle validation du BPM source.');
    const heading=document.createElement('strong');heading.textContent='Hypothèses de tempo · '+
      (hypotheses.ambiguous?'ambiguës':'à vérifier')+' · confiance '+Math.round(hypotheses.confidence*100)+' %';
    alternatives.append(heading);
    for(const candidate of hypotheses.candidates){
      const item=document.createElement('span');
      item.textContent=candidate.bpm+' BPM · '+
        ({primary:'principale',half:'demi-tempo',double:'double tempo',alternative:'alternative'}[candidate.relation]||'alternative')+
        ' · '+Math.round(candidate.confidence*100)+' % d’indice';
      alternatives.append(item);
    }
    if(hypotheses.localTempo.length){
      const local=document.createElement('span');
      local.textContent='Tempo local variable : '+hypotheses.localTempo.length+' fenêtres mesurées.';
      alternatives.append(local);
    }
    const downbeat=guidedDownbeat;
    const metricOptions={tempoBpm:first.bpm,
      originSeconds:downbeat?.seconds??0,durationSeconds:buffer.duration,
      pulse:subdivision==='ternary'?{count:3,denominator:8}:{count:1,denominator:4},
      confirmedTempo:false,confirmedOrigin:!!downbeat};
    if(downbeat)metricOptions.candidateMeters=[readMeter()];
    const metric=inferMetricHypotheses(result.onsets,metricOptions);
    if(metric.candidates.length){
      const label=document.createElement('strong');
      label.textContent=(downbeat?'Métrique du drapeau':'Métriques possibles')+
        ' · indice non validé'+(metric.ambiguous?' · ambigu':'');
      alternatives.append(label);
      for(const candidate of metric.candidates.slice(0,3)){
        const item=document.createElement('span');
        item.textContent=candidate.numerator+'/'+candidate.denominator+' ('+candidate.groups.join('+')+') · '+
          Math.round(candidate.confidence*100)+' % d’indice';
        alternatives.append(item);
      }
    }
    alternatives.hidden=false;refreshWarpControls();
    click?.configure({bpm:first.bpm});
    $('alPulseResult').textContent='≈ '+first.bpm+' BPM · hypothèse';
    button.textContent='Recalculer la pulsation';
    setStatus((assisted?'Analyse guidée':'Analyse automatique seule')+' : pulsation estimée à '+first.bpm+' BPM (non confirmée).');
  }catch(error){
    if(token!==pulseJob||signal.aborted)return;
    $('alPulseResult').textContent='Analyse indisponible';
    setStatus('Analyse impossible : '+error.message);
  }finally{if(token===pulseJob){onsetJob=null;button.disabled=!player;}}
});
