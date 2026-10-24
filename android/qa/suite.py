"""Functional checks inside the real Android release WebView, with native gestures/SAF."""
from pathlib import Path
import json, socket, subprocess, time, traceback, sys, re, hashlib
from voice_checks import run_voice_checks, check_guide
from control_checks import run_control_checks
from media_checks import midi_summary

root=Path(__file__).resolve().parents[2]; out=root/'android/build/native-qa/output'
results=[]; process=None; log=None; api='unknown'
TARGET='com.renaxdrums.metronome'
def adb(*args,check=True):
 return subprocess.run(['adb',*map(str,args)],capture_output=True,check=check,timeout=60)
def request(action,**values):
 with socket.create_connection(('127.0.0.1',18765),timeout=35) as s:
  s.settimeout(40);s.sendall((json.dumps({'action':action,**values})+'\n').encode())
  response=json.loads(s.makefile('rb').readline())
 if 'error' in response:raise RuntimeError(response['error'])
 return response.get('value')
def js(expression):
 script="(()=>{try{return JSON.stringify({ok:true,value:("+expression+")})}catch(e){return JSON.stringify({ok:false,error:String(e.stack)})}})()"
 data=json.loads(request('eval',script=script))
 if not data['ok']:raise RuntimeError(data['error'])
 return data.get('value')
def wait(expression,predicate=bool,timeout=20):
 deadline=time.monotonic()+timeout;last=None
 while time.monotonic()<deadline:
  last=js(expression)
  if predicate(last):return last
  time.sleep(.2)
 raise AssertionError('Timed out: '+expression+'; last='+str(last)[:400])
def tap(selector):request('tapCss',selector=selector)
def click(selector):return js('(()=>{const e=document.querySelector('+json.dumps(selector)+');if(!e)throw Error("Missing control");e.click();return true})()')
def set_value(selector,value,event='change'):
 return js('(()=>{const e=document.querySelector('+json.dumps(selector)+');if(!e)throw Error("Missing input");e.value='+json.dumps(str(value))+';e.dispatchEvent(new Event('+json.dumps(event)+',{bubbles:true}));return e.value})()')
def nav(mode):
 if js('document.querySelector("#beatEditor")?.hidden===false'):
  tap('#beatEditor [aria-label="Fermer"]');wait('document.querySelector("#beatEditor").hidden')
 tap('#workspaceNav [data-workspace="'+mode+'"]');wait('document.body.dataset.workspace',lambda x:x==mode)
def save_report():
 report={'android_api':api,'instrumentation_separate_from_release_apk':True,'physical_device_tested':False,'audible_output_and_bluetooth_tested':False,'tests':results}
 (out/'native-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
 return report
def check(name,fn):
 started=time.monotonic()
 try:
  detail=fn();status='unsupported' if isinstance(detail,dict) and detail.get('unsupported') else 'passed';results.append({'name':name,'status':status,'details':detail,'seconds':round(time.monotonic()-started,2)});print(status.upper()+' '+name,flush=True)
 except Exception as e:
  item={'name':name,'status':'failed','error':str(e),'seconds':round(time.monotonic()-started,2)}
  try:
   item['shared_files']=adb('shell','find','/sdcard/','-type','f',check=False).stdout.decode(errors='replace')
   item['native_nodes']=nodes();(out/(name+'.png')).write_bytes(adb('exec-out','screencap','-p',check=False).stdout)
  except Exception:pass
  try:item['web_state']=js('({workspace:document.body.dataset.workspace,pane:document.body.dataset.mobilePane,bank:currentBank,volume:masterVolume,audio:audioCtx?.state,text:document.body.innerText.slice(0,1800),url:location.href,bridge:!!window.__renaxNativeSave,bridgePort:!!window.__renaxNativeSave?.port})')
  except Exception as nested:item['diagnostic_error']=str(nested)
  results.append(item);print('FAIL '+name+': '+str(e),flush=True)
  try:js('(()=>{document.querySelectorAll("dialog[open]").forEach(d=>d.close());if(typeof stopMetronome==="function")stopMetronome();return true})()')
  except Exception:pass
  for _ in range(4):
   if not any('documentsui' in n.get('package','') for n in nodes()):break
   adb('shell','input','keyevent','BACK',check=False);time.sleep(.3)
 save_report()
def require(value,message):
 if not value:raise AssertionError(message)
 return value
def ready():
 wait('!!(window.RENAX_SONGS&&window.RENAX_I18N&&window.RENAX_WORKSPACE&&document.querySelector("#playBtn"))',timeout=45)
 wait('!document.querySelector("#renaxArrival")||document.querySelector("#renaxArrival").hidden',timeout=25)
 state=js('({url:location.href,title:document.title,workspace:document.body.dataset.workspace,viewport:{width:innerWidth,height:innerHeight,scale:devicePixelRatio},body:document.body.innerText.slice(0,800)})')
 require(state['url']=='https://appassets.androidplatform.net/app/index.html','Unexpected startup URL')
 require('ERR_HTTP_RESPONSE_CODE_FAILURE' not in state['body'],'Startup HTTP error')
 return state
def start_probe(suffix):
 global process,log
 adb('shell','am','force-stop',TARGET)
 adb('forward','tcp:18765','tcp:8765')
 log=(out/('instrumentation-'+suffix+'.txt')).open('wb')
 process=subprocess.Popen(['adb','shell','am','instrument','-w','com.renaxdrums.metronome.qa/.Probe'],stdout=log,stderr=subprocess.STDOUT)
 deadline=time.monotonic()+120
 while time.monotonic()<deadline:
  if process.poll() is not None:raise RuntimeError('Instrumentation exited: '+(out/('instrumentation-'+suffix+'.txt')).read_text())
  try:return ready()
  except (OSError,ValueError,TypeError):time.sleep(.5)
 raise TimeoutError('Native QA probe did not become ready')
def stop_probe():
 global process,log
 try:request('finish')
 except Exception:pass
 if process:
  try:process.wait(timeout=15)
  except subprocess.TimeoutExpired:process.terminate()
 if log:log.close()
def nodes():return request('nodes')
def native_click_text(texts):
 choices=nodes(); wanted={x.casefold() for x in texts}
 found=[n for n in choices if n['text'].strip().casefold() in wanted or n['desc'].strip().casefold() in wanted or any(n['desc'].strip().casefold()=='preview the file '+w for w in wanted)]
 if not found:raise AssertionError('Native control missing: '+str(texts)+'; available='+str([(n['text'],n['desc']) for n in choices])[:1600])
 n=next((n for n in found if n['clickable']),found[-1]);request('tap',x=n['x'],y=n['y'])
def wait_native_file(filename):
 deadline=time.monotonic()+10
 while time.monotonic()<deadline:
  if any(filename.casefold() in (n['text']+' '+n['desc']).casefold() for n in nodes()):return
  time.sleep(.3)
 raise AssertionError('Native file is not visible: '+filename)
def save_picker(filename,persist=True):
 deadline=time.monotonic()+15;current=[]
 while time.monotonic()<deadline:
  current=nodes()
  if any('documentsui' in n.get('package','') for n in current):break
  time.sleep(.3)
 else:raise AssertionError('Native Android save picker did not open')
 # Android normally opens Downloads directly; choose that root when needed.
 try:native_click_text(['Save','Enregistrer'])
 except AssertionError:
  native_click_text(['Show roots','Open navigation drawer']);native_click_text(['Downloads','Téléchargements']);native_click_text(['Save','Enregistrer'])
 deadline=time.monotonic()+10
 while time.monotonic()<deadline:
  current=nodes()
  if any(n.get('package')==TARGET for n in current):break
  time.sleep(.3)
 else:
  native_click_text(['Show roots','Open navigation drawer']);native_click_text(['Downloads','Téléchargements']);native_click_text(['Save','Enregistrer']);time.sleep(.5)
 wait('!window.__renaxNativeSave.busy',timeout=90)
 path='/sdcard/Download/'+filename; deadline=time.monotonic()+10;data=b''
 while time.monotonic()<deadline:
  candidates=[filename]
  for candidate in candidates:
   data=adb('exec-out','cat','/sdcard/Download/'+candidate,check=False).stdout
   if data and b'No such file' not in data and b'Permission denied' not in data:break
  if data and b'No such file' not in data and b'Permission denied' not in data:break
  time.sleep(.3)
 require(bool(data) and b'No such file' not in data,'Saved file missing: '+path)
 if persist:(out/filename).write_bytes(data)
 return data

def play_stop():
 nav('metronome');tap('#playBtn');wait('typeof isPlaying!=="undefined"&&isPlaying');state=wait('typeof audioCtx!=="undefined"&&audioCtx?audioCtx.state:null',lambda s:s=='running')
 tap('#playBtn');wait('!isPlaying');return {'audio_context':state,'stopped':True}
def mode_play_stop(mode):
 nav(mode)
 if mode=='training':
  selector=js('(()=>{for(const id of ["trainBtn","trainingVisualBtn"]){const e=document.getElementById(id);if(e&&e.getBoundingClientRect().height>0)return "#"+id}throw Error("Training transport hidden")})()')
 else:selector='#playBtn'
 tap(selector);wait('isPlaying')
 if mode=='training':selector=js('(()=>{for(const id of ["trainBtn","trainingVisualBtn"]){const e=document.getElementById(id);if(e&&e.getBoundingClientRect().height>0)return "#"+id}throw Error("Training stop hidden")})()')
 tap(selector);wait('!isPlaying');return {'mode':mode,'start_stop':True}

def tempo_and_metric():
 nav('metronome')
 if not js('document.querySelector("#workspaceControls").open'):tap('#workspaceControls summary')
 set_value('#bpmSlider',137,'input');wait('Number(bpmSlider.value)',lambda x:x==137)
 tap('#tempoIncrease');wait('Number(bpmSlider.value)',lambda x:x==138)
 tap('#tempoDecrease');wait('Number(bpmSlider.value)',lambda x:x==137)
 set_value('#activeNumerator',7);set_value('#activeDenominator',8)
 wait('({n:metronomeMeasures[activeMeasureIndex].numerator,d:metronomeMeasures[activeMeasureIndex].denominator})',lambda x:x=={'n':7,'d':8})
 set_value('#activeNumerator',4);set_value('#activeDenominator',4);set_value('#bpmSlider',120,'input')
 return {'tempo_steps':'137 → 138 → 137','metric':'7/8 → 4/4'}
def banks():
 nav('metronome'); choices=js('Array.from(document.querySelector("#soundBank").options).map(o=>({value:o.value,text:o.textContent}))'); tested=[]
 set_value('#volumeSlider',80,'input')
 tap('#playBtn');wait('isPlaying')
 js('(()=>{window.__qaBankAnalyser=audioCtx.createAnalyser();__qaBankAnalyser.fftSize=4096;getAudioMixDestination(audioCtx).connect(__qaBankAnalyser);window.__qaBankCalls=[];window.__qaOriginalPlayClick=playClick;playClick=function(...args){__qaBankCalls.push(currentBank);return __qaOriginalPlayClick(...args)};return true})()')
 try:
  for option in choices:
   set_value('#soundBank',option['value']);wait('String(currentBank)',lambda x:x==option['value'])
   js('(()=>{window.__qaBankCalls=[];window.__qaBankSignal={pending:true};const samples=new Float32Array(__qaBankAnalyser.fftSize),start=performance.now();let peak=0;const timer=setInterval(()=>{__qaBankAnalyser.getFloatTimeDomainData(samples);if(performance.now()-start>350)for(const x of samples)peak=Math.max(peak,Math.abs(x));if(performance.now()-start>1400){clearInterval(timer);window.__qaBankSignal={peak,calls:__qaBankCalls.slice()}}},20);return true})()')
   signal=wait('window.__qaBankSignal',lambda x:not x.get('pending'))
   require(signal['peak']>1e-6 and option['value'] in signal['calls'],'No scheduled audible signal for '+option['value'])
   tested.append(dict(option,output_peak=signal['peak'],scheduled_events=len(signal['calls'])))
 finally:
  js('(()=>{playClick=__qaOriginalPlayClick;getAudioMixDestination(audioCtx).disconnect(__qaBankAnalyser);return true})()')
  if js('isPlaying'):tap('#playBtn')
  set_value('#soundBank',choices[0]['value'])
 return tested

def modes(landscape):
 request('rotate',landscape=landscape)
 wait('innerWidth>innerHeight',lambda x:x==landscape)
 visited=[]
 for mode in ['metronome','polyrhythm','training','sequence','multi','tracks']:
  nav(mode);selected=js('document.querySelector("#workspaceNav [aria-selected=true]").dataset.workspace');require(selected==mode,'Wrong selected tab');visited.append(mode)
  (out/(('landscape-' if landscape else 'portrait-')+mode+'.png')).write_bytes(adb('exec-out','screencap','-p').stdout)
 return visited

def preferences():
 nav('metronome');tap('#index2SettingsBtn')
 for theme in ['dark','light','ivory']:
  click('[data-appearance="'+theme+'"]');wait('document.documentElement.dataset.theme',lambda x:x==theme)
 for language in ['fr','en','es','de','it']:
  click('[data-language="'+language+'"]');wait('document.documentElement.lang',lambda x:x==language)
 click('[data-language="fr"]');tap('#index2SettingsBtn');return {'themes':3,'languages':5}
def add_sequence():
 nav('sequence');before=js('Number(document.querySelector("#measureCount").value)');tap('#sequenceAddMeasure');wait('Number(document.querySelector("#measureCount").value)',lambda x:x==before+1)
 set_value('#measureCount',before);return {'before':before,'after_add':before+1,'restored':before}
def add_multitrack():
 nav('multi');tap('#multiPresetLibrary > button');before=js('document.querySelector("#multiTracks").children.length');tap('#multiControls .multi-add');after=wait('document.querySelector("#multiTracks").children.length',lambda x:x>before)
 return {'before':before,'after':after,'mode_active':js('RENAX_MULTI.active')}
def create_track():
 nav('tracks');profile=js('RENAX_SONGS.library.activeProfile')
 js('RENAX_SONGS.restoreNavigation({pane:"songs",view:"playlist",profile:'+json.dumps(profile)+',song:null})')
 before=js('RENAX_SONGS.library.profiles.find(p=>p.id===RENAX_SONGS.library.activeProfile).songs.length');tap('.track-create')
 wait('RENAX_SONGS.library.profiles.find(p=>p.id===RENAX_SONGS.library.activeProfile).songs.length',lambda x:x==before+1)
 # A short fixture for the native MP3 export; storage and validation remain real.
 js('(()=>{const l=JSON.parse(JSON.stringify(RENAX_SONGS.library));const s=l.profiles.find(p=>p.id===l.activeProfile).songs.at(-1);s.name="QA Android";s.countIn=null;s.sections=s.sections.slice(0,1);s.sections[0].count=1;s.sections[0].measure.tempo=120;RENAX_SONGS.replaceLibrary(l,true);RENAX_STORAGE.write(l);RENAX_SONGS.restoreNavigation({pane:"songs",view:"detail",profile:l.activeProfile,song:s.id});return s.id})()')
 before_sections=js('RENAX_SONGS.library.profiles.find(p=>p.id===RENAX_SONGS.library.activeProfile).songs.at(-1).sections.length');tap('.track-add-section');after=js('RENAX_SONGS.library.profiles.find(p=>p.id===RENAX_SONGS.library.activeProfile).songs.at(-1).sections.length')
 require(after==before_sections+1,'Section addition failed')
 js('(()=>{const l=JSON.parse(JSON.stringify(RENAX_SONGS.library));const s=l.profiles.find(p=>p.id===l.activeProfile).songs.at(-1);s.sections=s.sections.slice(0,1);RENAX_SONGS.replaceLibrary(l,true);RENAX_STORAGE.write(l);return true})()')
 return {'track_created':True,'section_added':True}
def track_play():
 nav('tracks');tap('#playBtn');wait('isPlaying');wait('!isPlaying',timeout=15);return {'automatic_stop_at_end':True}
def export_json():
 nav('tracks');js('RENAX_SONGS.restoreNavigation({pane:"songs",view:"profile",profile:RENAX_SONGS.library.activeProfile,song:null})')
 wait('!!document.querySelector("#backup-local .song-actions button")')
 control=js('!!document.querySelector("#backupAccount [aria-controls=backup-local]")')
 if control:click('#backupAccount [aria-controls=backup-local]')
 request('refreshPort');request('refreshPort');time.sleep(.3)
 expected=js('RENAX_SONGS.library');click('#backup-local .song-actions button')
 data=save_picker('renax-morceaux.json');require(json.loads(data)==expected,'JSON content changed through native export');return {'bytes':len(data),'native_picker':True}
def import_json():
 before=js('RENAX_SONGS.library.profiles.length')
 exported=json.loads((out/'renax-morceaux.json').read_text())
 tap('#backup-local .song-actions button:nth-child(2)')
 deadline=time.monotonic()+15
 while time.monotonic()<deadline:
  current=nodes()
  if any('documentsui' in n.get('package','') for n in current):break
  time.sleep(.3)
 else:raise AssertionError('Native Android import picker did not open')
 wait_native_file('renax-morceaux.json')
 try:require(request('nativeFile',filename='renax-morceaux.json'),'Native file selection failed')
 except AssertionError:
  native_click_text(['Show roots','Open navigation drawer']);native_click_text(['Downloads','Téléchargements']);native_click_text(['renax-morceaux.json'])
 wait('!!document.querySelector("dialog.song-confirmation[open] .song-confirm-accept")')
 tap('dialog.song-confirmation[open] .song-confirm-accept')
 after=wait('RENAX_SONGS.library.profiles.length',lambda n:n==before+len(exported['profiles']))
 return {'native_picker':True,'profiles_before':before,'profiles_after':after,'original_profiles_preserved':True}

def export_cancel():
 js('(()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["cancel"],{type:"application/json"}));a.download="renax-cancel.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);return true})()')
 deadline=time.monotonic()+15
 while time.monotonic()<deadline:
  if any('documentsui' in n.get('package','') for n in nodes()):break
  time.sleep(.2)
 else:raise AssertionError('Cancellation test picker did not open')
 adb('shell','input','keyevent','BACK')
 wait('!window.__renaxNativeSave.busy')
 require(request('exportCacheCount')==0,'Cancelled export left a private temporary file')
 return {'native_picker_cancelled':True,'bridge_released':True,'temporary_files_remaining':0}

def export_large():
 size=25*1024*1024
 js('(()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(['+json.dumps('{"payload":"')+',"A".repeat('+str(size)+'),'+json.dumps('"}')+'],{type:"application/json"}));a.download="renax-large-native-test.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);return true})()')
 data=save_picker('renax-large-native-test.json',persist=False)
 expected=b'{"payload":"'+b'A'*size+b'"}'
 require(hashlib.sha256(data).digest()==hashlib.sha256(expected).digest(),'Large export bytes changed')
 require(request('exportCacheCount')==0,'Completed export left a private temporary file')
 adb('shell','rm','/sdcard/Download/renax-large-native-test.json')
 return {'native_picker':True,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'greater_than_previous_20_MiB_limit':True,'temporary_files_remaining':0}

def export_midi():
 nav('tracks');js('RENAX_SONGS.restoreNavigation({pane:"songs",view:"playlist",profile:RENAX_SONGS.library.activeProfile,song:null})')
 tap('#mp3ExportOpen');set_value('#songExportFormat','midi');tap('#mp3ExportSave')
 wait('!!document.querySelector("#mp3ExportDownload")&&!document.querySelector("#mp3ExportDownload").hidden')
 name=js('document.querySelector("#mp3ExportDownload").download');tap('#mp3ExportDownload');time.sleep(1)
 if any('documentsui' in n.get('package','') for n in nodes()):
  data=save_picker(name);summary=midi_summary(data);click('#mp3ExportDialog .mp3-actions button:last-child');return {'native_picker':True,'file':name,'bytes':len(data),'musical_events':summary}
 click('#mp3ExportDialog .mp3-actions button:last-child')
 raise AssertionError('Native MIDI save picker did not open')

def export_mp3():
 nav('tracks');js('RENAX_SONGS.restoreNavigation({pane:"songs",view:"playlist",profile:RENAX_SONGS.library.activeProfile,song:null})')
 set_value('#volumeSlider',80,'input')
 tap('#mp3ExportOpen');tap('#mp3ExportSave');wait('!!document.querySelector("#mp3ExportDownload")&&!document.querySelector("#mp3ExportDownload").hidden',timeout=120)
 name=js('document.querySelector("#mp3ExportDownload").download');tap('#mp3ExportDownload');data=save_picker(name)
 require(len(data)>100 and (data.startswith(b'ID3') or data[0]==255),'Invalid MP3 output')
 decoded=subprocess.run(['ffmpeg','-v','error','-i',str(out/name),'-f','f32le','-ac','1','-ar','48000','-'],capture_output=True,check=True,timeout=30).stdout
 import array,math
 samples=array.array('f');samples.frombytes(decoded)
 require(len(samples)>48000 and all(math.isfinite(x) for x in samples),'MP3 cannot be decoded as finite audio')
 peak=max(abs(x) for x in samples);require(peak>1e-5,'Silent MP3')
 click('#mp3ExportDialog .mp3-actions button:last-child');return {'file':name,'bytes':len(data),'native_picker':True,'decoded_samples':len(samples),'peak':peak}
def background():
 nav('metronome');set_value('#bpmSlider',120,'input');tap('#playBtn');wait('isPlaying')
 js('(()=>{window.__qaBackgroundTimes=[];window.__qaBackgroundClick=playClick;playClick=function(...args){__qaBackgroundTimes.push(args[1]);return __qaBackgroundClick(...args)};return true})()')
 try:
  request('home')
  for _ in range(3):time.sleep(10)
  request('resume');wait('document.hasFocus()')
  state=js('({playing:isPlaying,audio:audioCtx.state,times:__qaBackgroundTimes})')
  require(state['playing'] and state['audio']=='running','Playback stopped in background')
  require(len(state['times'])>=55,'Insufficient scheduled beats during 30-second background test')
  intervals=[b-a for a,b in zip(state['times'],state['times'][1:])]
  error=max(abs(x-.5) for x in intervals)
  require(error<1e-5,'Background beat grid changed')
  return {'continuous_seconds':30,'scheduled_beats':len(state['times']),'max_grid_error_seconds':error,'resume':True}
 finally:
  request('resume');js('(()=>{playClick=__qaBackgroundClick;return true})()')
  if js('isPlaying'):tap('#playBtn')

def screen_policy():
 nav('metronome')
 deadline=time.monotonic()+5
 while request('keepScreenOn') and time.monotonic()<deadline:time.sleep(.2)
 require(not request('keepScreenOn'),'Screen held awake while stopped')
 tap('#playBtn');wait('isPlaying');deadline=time.monotonic()+5
 while not request('keepScreenOn') and time.monotonic()<deadline:time.sleep(.2)
 require(request('keepScreenOn'),'Screen can sleep during playback')
 tap('#playBtn');wait('!isPlaying');deadline=time.monotonic()+5
 while request('keepScreenOn') and time.monotonic()<deadline:time.sleep(.2)
 require(not request('keepScreenOn'),'Stop did not release screen flag')
 return {'awake_during_playback':True,'released_after_stop':True}
def persistence():
 js('(()=>{localStorage.setItem("renax-native-qa-marker","persisted");return true})()');request('relaunch');ready();require(js('localStorage.getItem("renax-native-qa-marker")')=='persisted','Local data lost on activity recreation');return True

def offline():
 installed=[]
 try:
  for tool,address in [('iptables','127.0.0.0/8'),('ip6tables','::1/128')]:
   for rule in [('-j','REJECT'),('-d',address,'-j','RETURN')]:
    adb('shell',tool,'-I','OUTPUT',*rule);installed.append((tool,rule))
  request('relaunch');state=ready()
  js("(()=>{window.__qaNetworkProbe='pending';fetch('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/package.json?qa='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(()=>window.__qaNetworkProbe='reachable',()=>window.__qaNetworkProbe='blocked');return true})()")
  wait('window.__qaNetworkProbe',lambda x:x=='blocked',timeout=15)
  js('(()=>{window.__qaOfflineVoices="pending";prepareAllVoiceAudio().then(()=>__qaOfflineVoices="ready",e=>__qaOfflineVoices=String(e));return true})()')
  wait('window.__qaOfflineVoices',lambda x:x=='ready',timeout=25)
  nav('metronome');set_value('#soundBank','voiceMale');tap('#playBtn');wait('isPlaying');tap('#playBtn');wait('!isPlaying')
  return {'cold_activity_start_with_outbound_network_blocked':True,'external_fetch_failed_or_timed_out':True,'all_recorded_voices_loaded_offline':True,'play_stop':True,'url':state['url']}
 finally:
  for tool,rule in reversed(installed):adb('shell',tool,'-D','OUTPUT',*rule,check=False)

try:
 adb('root',check=False);adb('wait-for-device');api=adb('shell','getprop','ro.build.version.sdk').stdout.decode().strip()
 # 1080 physical pixels at 480 dpi: a 360-CSS-pixel Android phone, not mdpi desktop geometry.
 adb('shell','wm','density','480')
 adb('install','--no-incremental','-r',out/'app.apk');adb('install','--no-incremental','-r',out/'probe.apk')
 adb('logcat','-c');start_probe('first')
 check('startup_local_https',ready)
 check('phone_360_css_pixels',lambda:require(js('innerWidth===360&&devicePixelRatio===3'),'Emulator is not using the intended phone scale'))
 check('portrait_six_workspaces',lambda:modes(False))
 check('landscape_six_workspaces',lambda:modes(True))
 request('rotate',landscape=False);wait('innerWidth<innerHeight')
 check('tempo_and_7_8_metric',tempo_and_metric)
 voice_api=(js,wait,tap,nav,set_value,check,require)
 run_control_checks(voice_api)
 run_voice_checks(voice_api)
 check('every_sound_bank_scheduled_and_output_signal',banks)
 check('native_touch_play_stop_audio_context',play_stop)
 for mode in ['polyrhythm','training','sequence','multi']:
  check('native_play_stop_'+mode,lambda mode=mode:mode_play_stop(mode))
 check('three_themes_five_languages',preferences)
 check('sequence_add_remove_measure',add_sequence)
 check('multitrack_add_track',add_multitrack)
 check('track_create_add_section',create_track)
 check('track_play_and_end_stop',track_play)
 for language in ['fr','en']:
  check('real_neural_guide_'+language,lambda language=language:check_guide(language,voice_api))
 check('native_json_export_and_bytes',export_json)
 check('native_json_import_preserves_existing_data',import_json)
 check('native_mp3_export_and_signature',export_mp3)
 check('native_midi_export',export_midi)
 check('native_export_cancel_and_cleanup',export_cancel)
 check('native_export_above_20_MiB_bytes',export_large)
 check('screen_awake_only_during_playback',screen_policy)
 check('background_continuous_playback_30_seconds',background)
 check('activity_recreation_local_storage',persistence)
 stop_probe();start_probe('second')
 check('process_restart_local_storage',lambda:require(js('localStorage.getItem("renax-native-qa-marker")')=='persisted','Local data lost after process restart'))
 check('offline_start_and_play_stop',offline)
except Exception as e:
 results.append({'name':'native_suite_execution','status':'failed','error':str(e),'traceback':traceback.format_exc()})
finally:
 try:stop_probe()
 except Exception:pass
 report=save_report()
 try:(out/'native-logcat.txt').write_bytes(adb('logcat','-d',check=False).stdout)
 except Exception as e:print('Log collection unavailable: '+str(e),flush=True)
 print(json.dumps(report,indent=2,ensure_ascii=False))
 sys.exit(1 if any(r['status']=='failed' for r in results) else 0)
