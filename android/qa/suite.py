"""Functional checks inside the real Android release WebView, with native gestures/SAF."""
from pathlib import Path
import json, socket, subprocess, time, traceback, sys

root=Path(__file__).resolve().parents[2]; out=root/'android/build/native-qa/output'
results=[]; process=None; log=None
TARGET='com.renaxdrums.metronome'
def adb(*args,check=True):
 return subprocess.run(['adb',*map(str,args)],capture_output=True,check=check)
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
 tap('[data-workspace="'+mode+'"]');wait('document.body.dataset.workspace',lambda x:x==mode)
def check(name,fn):
 started=time.monotonic()
 try:
  detail=fn();results.append({'name':name,'status':'passed','details':detail,'seconds':round(time.monotonic()-started,2)});print('PASS '+name,flush=True)
 except Exception as e:
  item={'name':name,'status':'failed','error':str(e),'seconds':round(time.monotonic()-started,2)}
  try:item['web_state']=js('({workspace:document.body.dataset.workspace,text:document.body.innerText.slice(0,1800),url:location.href})')
  except Exception as nested:item['diagnostic_error']=str(nested)
  results.append(item);print('FAIL '+name+': '+str(e),flush=True)
  try:js('(()=>{document.querySelectorAll("dialog[open]").forEach(d=>d.close());if(typeof stopMetronome==="function")stopMetronome();return true})()')
  except Exception:pass
  adb('shell','input','keyevent','BACK',check=False)
def require(value,message):
 if not value:raise AssertionError(message)
 return value
def ready():
 wait('!!(window.RENAX_SONGS&&window.RENAX_I18N&&window.RENAX_WORKSPACE&&document.querySelector("#playBtn"))',timeout=45)
 wait('!document.querySelector("#renaxArrival")||document.querySelector("#renaxArrival").hidden',timeout=25)
 state=js('({url:location.href,title:document.title,workspace:document.body.dataset.workspace,body:document.body.innerText.slice(0,800)})')
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
 found=[n for n in choices if n['text'].strip().casefold() in wanted or n['desc'].strip().casefold() in wanted]
 if not found:raise AssertionError('Native control missing: '+str(texts)+'; available='+str([(n['text'],n['desc']) for n in choices])[:1600])
 n=next((n for n in found if n['clickable']),found[-1]);request('tap',x=n['x'],y=n['y'])
def save_picker(filename):
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
 path='/sdcard/Download/'+filename; deadline=time.monotonic()+10;data=b''
 while time.monotonic()<deadline:
  data=adb('exec-out','cat',path,check=False).stdout
  if data and b'No such file' not in data and b'Permission denied' not in data:break
  time.sleep(.3)
 require(bool(data) and b'No such file' not in data,'Saved file missing: '+path)
 (out/filename).write_bytes(data);return data

def play_stop():
 nav('metronome');tap('#playBtn');wait('typeof isPlaying!=="undefined"&&isPlaying');state=wait('typeof audioCtx!=="undefined"&&audioCtx?audioCtx.state:null',lambda s:s=='running')
 tap('#playBtn');wait('!isPlaying');return {'audio_context':state,'stopped':True}
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
 for option in choices[:8]:
  set_value('#soundBank',option['value']);wait('String(currentBank)',lambda x:x==option['value']);tested.append(option)
 set_value('#soundBank',choices[0]['value']);return tested

def modes(landscape):
 request('rotate',landscape=landscape)
 wait('innerWidth>innerHeight',lambda x:x==landscape)
 visited=[]
 for mode in ['metronome','polyrhythm','training','sequence','multi','tracks']:
  nav(mode);selected=js('document.querySelector("#workspaceNav [aria-selected=true]").dataset.workspace');require(selected==mode,'Wrong selected tab');visited.append(mode)
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
 nav('multi');before=js('document.querySelector("#multiTracks").children.length');tap('#multiControls .multi-add');after=wait('document.querySelector("#multiTracks").children.length',lambda x:x>before)
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
 expected=js('RENAX_SONGS.library');click('#backup-local .song-actions button')
 data=save_picker('renax-morceaux.json');require(json.loads(data)==expected,'JSON content changed through native export');return {'bytes':len(data),'native_picker':True}
def export_mp3():
 nav('tracks');js('RENAX_SONGS.restoreNavigation({pane:"songs",view:"playlist",profile:RENAX_SONGS.library.activeProfile,song:null})')
 tap('#mp3ExportOpen');tap('#mp3ExportSave');wait('!!document.querySelector("#mp3ExportDownload")&&!document.querySelector("#mp3ExportDownload").hidden',timeout=120)
 name=js('document.querySelector("#mp3ExportDownload").download');tap('#mp3ExportDownload');data=save_picker(name)
 require(len(data)>100 and (data.startswith(b'ID3') or data[0]==255),'Invalid MP3 output');click('#mp3ExportDialog .mp3-actions button:last-child');return {'file':name,'bytes':len(data),'native_picker':True}
def background():
 nav('metronome');tap('#playBtn');wait('isPlaying');request('home');wait('!isPlaying');request('resume');wait('document.hasFocus()');return {'playback_stops_on_background':True,'resume':True}
def persistence():
 js('(()=>{localStorage.setItem("renax-native-qa-marker","persisted");return true})()');request('relaunch');ready();require(js('localStorage.getItem("renax-native-qa-marker")')=='persisted','Local data lost on activity recreation');return True

def offline():
 adb('shell','cmd','connectivity','airplane-mode','enable');adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
 wait('navigator.onLine',lambda x:x is False,timeout=15);request('relaunch');state=ready();nav('metronome');tap('#playBtn');wait('isPlaying');tap('#playBtn');wait('!isPlaying');return {'cold_activity_start_without_network':True,'play_stop':True,'url':state['url']}

try:
 adb('install','--no-incremental','-r',out/'app.apk');adb('install','--no-incremental','-r',out/'probe.apk')
 adb('logcat','-c');start_probe('first')
 check('startup_local_https',ready)
 check('portrait_six_workspaces',lambda:modes(False))
 check('landscape_six_workspaces',lambda:modes(True))
 request('rotate',landscape=False);wait('innerWidth<innerHeight')
 check('tempo_and_7_8_metric',tempo_and_metric)
 check('eight_sound_bank_selections',banks)
 check('native_touch_play_stop_audio_context',play_stop)
 check('three_themes_five_languages',preferences)
 check('sequence_add_remove_measure',add_sequence)
 check('multitrack_add_track',add_multitrack)
 check('track_create_add_section',create_track)
 check('track_play_and_end_stop',track_play)
 check('native_json_export_and_bytes',export_json)
 check('native_mp3_export_and_signature',export_mp3)
 check('background_stop_resume',background)
 check('activity_recreation_local_storage',persistence)
 check('offline_start_and_play_stop',offline)
 stop_probe();start_probe('second')
 check('process_restart_local_storage',lambda:require(js('localStorage.getItem("renax-native-qa-marker")')=='persisted','Local data lost after process restart'))
except Exception as e:
 results.append({'name':'native_suite_execution','status':'failed','error':str(e),'traceback':traceback.format_exc()})
finally:
 try:stop_probe()
 except Exception:pass
 (out/'native-logcat.txt').write_bytes(adb('logcat','-d',check=False).stdout)
 report={'android_api':adb('shell','getprop','ro.build.version.sdk',check=False).stdout.decode().strip(),'release_activity_unchanged':True,'instrumentation_separate_from_release_apk':True,'physical_device_tested':False,'audible_output_and_bluetooth_tested':False,'midi_native_export':'not supported by current native MIME allow-list; not marked passed','tests':results}
 (out/'native-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
 print(json.dumps(report,indent=2,ensure_ascii=False))
 sys.exit(1 if any(r['status']=='failed' for r in results) else 0)
