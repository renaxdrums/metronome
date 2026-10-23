"""Build the release activity plus a separately signed instrumentation APK."""
from pathlib import Path
import os, re, shutil, subprocess, sys, zipfile, json, hashlib

root=Path(__file__).resolve().parents[2]
sdk=Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
build=root/'android/build/native-qa'; output=build/'output'; output.mkdir(parents=True,exist_ok=True)
tools=sdk/'build-tools/35.0.0'; platform=sdk/'platforms/android-35/android.jar'
def run(*args):subprocess.run([str(x) for x in args],check=True,cwd=root)
run('node','tools/build-production.cjs','--csp')
assets=build/'assets';shutil.copytree(root/'dist/site',assets/'site',dirs_exist_ok=True)
index=assets/'site/index.html';html=index.read_text()
html=re.sub(r'<script[^>]+src="offline-cache\.js[^" ]*"[^>]*></script>','',html)
index.write_text(html.replace('</body>','<script src="android-mode.js"></script></body>'))
shutil.copyfile(root/'android/app/src/main/web/local-mode.js',assets/'site/android-mode.js')
(assets/'site/firebase-config.js').write_text('export const firebaseConfig=null;\nexport const providers={email:false,google:false};\nexport const appCheckSiteKey=null;\nexport const emulator=null;\nexport const cloudWriteBudgetEnabled=false;\n')
run('pwsh','-NoProfile','-Command',". './android/prepare-web-assets.ps1'; Prepare-AndroidWorker '"+str(assets/'site')+"'")
reference=json.loads((root/'android/qa/reference-audio.json').read_text())
for relative,expected in reference.items():
 p=assets/'site'/relative
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=expected:raise RuntimeError('Approved audio changed: '+relative)
res=build/'res';(res/'drawable').mkdir(parents=True,exist_ok=True);(res/'values').mkdir(exist_ok=True)
shutil.copyfile(root/'assets/icons/icon-512.png',res/'drawable/ic_launcher.png')
shutil.copyfile(root/'android/app/src/main/res/values/strings.xml',res/'values/strings.xml')
run(tools/'aapt2','compile','--dir',res,'-o',build/'resources.zip')
key=build/'test-only.jks';envpass='android-test-only'
if not key.exists():run('keytool','-genkeypair','-keystore',key,'-alias','qa','-storepass',envpass,'-keypass',envpass,'-keyalg','RSA','-validity','7','-dname','CN=Ephemeral Android QA','-storetype','JKS')
def compile_apk(name,source,manifest,resources=None):
 classes=build/(name+'-classes');dex=build/(name+'-dex');classes.mkdir(exist_ok=True);dex.mkdir(exist_ok=True)
 run('javac','-source','8','-target','8','-encoding','UTF-8','-bootclasspath',os.pathsep.join([str(tools/'core-lambda-stubs.jar'),str(platform)]),'-d',classes,source)
 run(tools/'d8','--lib',platform,'--min-api','26','--output',dex,*sorted(classes.rglob('*.class')))
 unsigned=build/(name+'-unsigned.apk')
 args=[tools/'aapt2','link','-I',platform,'--manifest',manifest,'--min-sdk-version','26','--target-sdk-version','35','-o',unsigned]
 if resources:args.append(resources)
 run(*args)
 with zipfile.ZipFile(unsigned,'a') as z:z.write(dex/'classes.dex','classes.dex')
 if name=='app':run('pwsh','-NoProfile','-File',root/'android/qa/package-assets.ps1',unsigned,assets)
 aligned=build/(name+'-aligned.apk');target=output/(name+'.apk')
 run(tools/'zipalign','-f','-p','4',unsigned,aligned)
 run(tools/'apksigner','sign','--ks',key,'--ks-key-alias','qa','--ks-pass','pass:'+envpass,'--key-pass','pass:'+envpass,'--v4-signing-enabled','false','--out',target,aligned)
 run(tools/'apksigner','verify','--verbose',target)
 run(tools/'zipalign','-c','-p','4',target)
 return target
app=compile_apk('app',root/'android/app/src/main/java/com/renaxdrums/metronome/MainActivity.java',root/'android/app/src/main/AndroidManifest.xml',build/'resources.zip')
compile_apk('probe',root/'android/qa/Probe.java',root/'android/qa/AndroidManifest.xml')
with zipfile.ZipFile(app) as z:
 manifest={n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if not n.startswith('META-INF/')}
(output/'tested-content-sha256.json').write_text(json.dumps(manifest,indent=2))
(output/'build-validation.json').write_text(json.dumps({'approved_audio_files_identical':len(reference),'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'release_activity_debugging_unchanged':True,'test_probe_is_separate_apk':True},indent=2))
print('Native release and separate instrumentation APK built; approved audio unchanged.')
