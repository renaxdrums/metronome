/** Explicit local Audio Lab project exchange. Source PCM is never serialized. */
import { buildValidatedWarpMap } from '../warp/validated-map.mjs';
const SCHEMA = 'renax.audio-lab.local-project';
const VERSION = 1;
const MAX_MARKERS = 10000;
const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
const KINDS = new Set(['cursor','selection','hand','downbeat','meter','tempo','warp','loop','zoom']);
const MARKER_KINDS = new Set(['downbeat','meter','tempo','warp']);

function fail(message) { throw new RangeError(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label+' must be an object');
  return value;
}
function onlyKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(label+' contains unsupported field '+key);
}
function number(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    fail(label+' is outside its valid range');
  return value;
}
function integer(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(label+' must be an integer');
  return value;
}
function bool(value, label) {
  if (typeof value !== 'boolean') fail(label+' must be a boolean');
  return value;
}
function string(value, label, maxLength) {
  if (typeof value !== 'string' || !value.length || value.length > maxLength) fail(label+' must be text');
  return value;
}

function sourceIdentity(identity) {
  object(identity,'source identity');
  onlyKeys(identity,['name','sizeBytes','mimeType','sha256','sampleRate','sourceSampleRate',
    'sourceBitDepth','sourceChannels','channels','durationSeconds'],'source identity');
  const source = {
    name:string(identity.name,'source name',512),
    sizeBytes:integer(identity.sizeBytes,'source size',12,Number.MAX_SAFE_INTEGER),
    mimeType:typeof identity.mimeType === 'string' && identity.mimeType.length <= 128 ? identity.mimeType : fail('source MIME type invalid'),
    sampleRate:number(identity.sampleRate,'decoded sample rate',8000,192000),
    channels:integer(identity.channels,'decoded channel count',1,32),
    durationSeconds:number(identity.durationSeconds,'source duration',Number.EPSILON,24*3600),
  };
  if (identity.sha256 !== undefined) {
    if (typeof identity.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(identity.sha256)) fail('source SHA-256 invalid');
    source.sha256 = identity.sha256.toLowerCase();
  }
  for (const key of ['sourceSampleRate','sourceBitDepth','sourceChannels']) {
    if (identity[key] !== undefined) {
      const limit = key === 'sourceBitDepth' ? 64 : key === 'sourceChannels' ? 32 : 192000;
      source[key] = integer(identity[key],key,1,limit);
    }
  }
  return source;
}
function assertSourceMatch(saved, current) {
  // Web Audio may resample a decoded buffer between devices. Use source metadata
  // when available, and allow one audio frame of duration rounding.
  if (saved.name !== current.name || saved.sizeBytes !== current.sizeBytes ||
      saved.channels !== current.channels ||
      Math.abs(saved.durationSeconds-current.durationSeconds) >
        Math.max(1/saved.sampleRate,1/current.sampleRate,.002))
    fail('Selected audio file does not match the saved project source');
  for (const key of ['sourceSampleRate','sourceBitDepth','sourceChannels'])
    if (saved[key] !== undefined && current[key] !== undefined && saved[key] !== current[key])
      fail('Selected audio file does not match the saved project source');
  if (saved.sha256 && (!current.sha256 || saved.sha256 !== current.sha256))
    fail('Selected audio file SHA-256 does not match the saved project');
}

function meter(value) {
  object(value,'meter');onlyKeys(value,['numerator','denominator','groups'],'meter');
  const numerator=integer(value.numerator,'meter numerator',1,999);
  const denominator=integer(value.denominator,'meter denominator',2,32);
  if (![2,4,8,16,32].includes(denominator) || !Array.isArray(value.groups) ||
      !value.groups.length || value.groups.length > numerator) fail('meter groups invalid');
  const groups=value.groups.map(group=>integer(group,'meter group',1,numerator));
  if (groups.reduce((a,b)=>a+b,0)!==numerator) fail('meter groups do not sum to numerator');
  return {numerator,denominator,groups};
}
function marker(value, duration) {
  object(value,'marker');onlyKeys(value,['id','kind','seconds','meter','bpm','beat','validated','locked'],'marker');
  const kind=string(value.kind,'marker kind',16);
  if (!MARKER_KINDS.has(kind)) fail('marker kind invalid');
  const result={id:integer(value.id,'marker id',1,Number.MAX_SAFE_INTEGER),kind,
    seconds:number(value.seconds,'marker position',0,duration)};
  if (kind==='meter') result.meter=meter(value.meter);
  else if (value.meter!==undefined) fail('meter data belongs only to a meter marker');
  if (kind==='tempo') result.bpm=number(value.bpm,'tempo marker BPM',20,400);
  else if (value.bpm!==undefined) fail('BPM belongs only to a tempo marker');
  if (kind==='warp') {
    const beat=number(value.beat,'Warp marker beat',0,Number.MAX_SAFE_INTEGER/3840);
    if (Math.abs(beat*3840-Math.round(beat*3840))>1e-6) fail('Warp beat is not representable in ticks');
    result.beat=beat;
  } else if (value.beat!==undefined) fail('beat belongs only to a Warp marker');
  if (value.validated!==undefined) {
    if (!['tempo','warp'].includes(kind)) fail('validation belongs only to tempo/Warp markers');
    result.validated=bool(value.validated,'marker validation');
  }
  if (value.locked!==undefined) result.locked=bool(value.locked,'marker lock');
  return result;
}
function state(value,duration) {
  object(value,'project state');
  onlyKeys(value,['markers','baseMeter','loopA','loopB','loopEnabled','manualBpm','sourceBpm','targetBpm','confirmed',
    'zoom','start','selected','kind','snap','playbackMode','clickEnabled','audioVolume','clickVolume','selection'],'project state');
  if (!Array.isArray(value.markers) || value.markers.length>MAX_MARKERS) fail('marker list invalid');
  const markers=value.markers.map(item=>marker(item,duration));
  const ids=new Set(markers.map(item=>item.id));
  if (ids.size!==markers.length) fail('marker IDs must be unique');
  const loopA=number(value.loopA,'loop A',0,duration);
  const loopB=value.loopB===null?null:number(value.loopB,'loop B',0,duration);
  if (loopB!==null && loopB<=loopA) fail('loop B must follow A');
  const selected=value.selected===null?null:integer(value.selected,'selected marker ID',1,Number.MAX_SAFE_INTEGER);
  if (selected!==null&&!ids.has(selected)) fail('selected marker does not exist');
  const kind=string(value.kind,'tool kind',16);
  if (!KINDS.has(kind)) fail('tool kind invalid');
  const playbackMode=string(value.playbackMode,'playback mode',16);
  if (!['original','warp'].includes(playbackMode)) fail('playback mode invalid');
  const zoom=number(value.zoom,'zoom',1,24);
  const start=number(value.start,'viewport start',0,duration);
  const selection=value.selection===null||value.selection===undefined?null:(()=>{
    object(value.selection,'selection');onlyKeys(value.selection,['a','b'],'selection');
    const a=number(value.selection.a,'selection start',0,duration);
    const b=number(value.selection.b,'selection end',a,duration);
    return {a,b};
  })();
  const sourceBpm=number(value.sourceBpm,'source BPM',20,400);
  buildValidatedWarpMap({durationSeconds:duration,sourceBpm,
    markers:markers.filter(item=>item.validated===true && ['warp','tempo'].includes(item.kind))
      .map(item=>({kind:item.kind,seconds:item.seconds,beat:item.beat,bpm:item.bpm,
        validated:true,locked:item.locked===true}))});
  return {markers,baseMeter:meter(value.baseMeter),loopA,loopB,loopEnabled:bool(value.loopEnabled,'loop enabled'),
    manualBpm:number(value.manualBpm,'manual click BPM',1,500),
    sourceBpm,
    targetBpm:number(value.targetBpm,'target BPM',20,400),
    confirmed:bool(value.confirmed,'source tempo confirmation'),zoom,start,selected,kind,
    snap:bool(value.snap,'snap'),playbackMode,
    clickEnabled:bool(value.clickEnabled,'click enabled'),
    audioVolume:number(value.audioVolume,'audio volume',0,1),
    clickVolume:number(value.clickVolume,'click volume',0,1),selection};
}
function project(value) {
  object(value,'project');onlyKeys(value,['schema','version','source','state'],'project');
  if (value.schema!==SCHEMA || value.version!==VERSION) fail('Unsupported Audio Lab project version');
  const source=sourceIdentity(value.source);
  return {schema:SCHEMA,version:VERSION,source,state:state(value.state,source.durationSeconds)};
}

/** Build a serializable snapshot from explicit UI state and decoded source identity. */
export function createAudioLabLocalProject({source,state:uiState}) {
  return project({schema:SCHEMA,version:VERSION,source,state:uiState});
}
export function serializeAudioLabLocalProject(snapshot) {
  const json=JSON.stringify(project(snapshot));
  if (new TextEncoder().encode(json).length>MAX_PROJECT_BYTES) fail('Audio Lab project exceeds JSON budget');
  return json;
}
/** Parse and match a user-selected project against an already imported audio file. */
export function restoreAudioLabLocalProject(jsonOrSnapshot,currentIdentity) {
  if (typeof jsonOrSnapshot==='string' && new TextEncoder().encode(jsonOrSnapshot).length>MAX_PROJECT_BYTES)
    fail('Audio Lab project exceeds JSON budget');
  let parsed;
  try { parsed=typeof jsonOrSnapshot==='string'?JSON.parse(jsonOrSnapshot):jsonOrSnapshot; }
  catch { fail('Audio Lab project JSON is invalid'); }
  const snapshot=project(parsed);
  assertSourceMatch(snapshot.source,sourceIdentity(currentIdentity));
  return snapshot.state;
}
/** File reading is explicit; no IndexedDB, localStorage, or source-audio writes. */
export async function readAudioLabLocalProjectFile(file,currentIdentity) {
  if (!file || !Number.isSafeInteger(file.size) || file.size<1 || file.size>MAX_PROJECT_BYTES ||
      typeof file.text!=='function') fail('Audio Lab project file size/type invalid');
  return restoreAudioLabLocalProject(await file.text(),currentIdentity);
}
