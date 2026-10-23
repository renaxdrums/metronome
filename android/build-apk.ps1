param([Parameter(Mandatory=$true)][string]$AndroidToolsRoot,[Parameter(Mandatory=$true)][string]$JavaHome,[Parameter(Mandatory=$true)][string]$CompilerJar,[Parameter(Mandatory=$true)][string]$OutputApk)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'apk-assets.ps1')
$projectRoot=Split-Path $PSScriptRoot -Parent
$build=Join-Path $PSScriptRoot 'build'
foreach($name in @('classes','dex','res/drawable','res/values','assets/site','signing')){New-Item -ItemType Directory -Force -Path (Join-Path $build $name) | Out-Null}
$sdk=Join-Path $AndroidToolsRoot 'build-tools-35.0.0/android-15'
$platform=Join-Path $AndroidToolsRoot 'platforms-android-35/android-35/android.jar'
$java=Join-Path $JavaHome 'bin/java.exe'
$env:JAVA_HOME=$JavaHome
function Run([string]$program,[string[]]$arguments){& $program @arguments;if($LASTEXITCODE -ne 0){throw "Build step failed: $program ($LASTEXITCODE)"}}
Push-Location $projectRoot
try{Run 'node' @('tools/build-production.cjs','--csp')}finally{Pop-Location}
Copy-Item -Path (Join-Path $projectRoot 'dist/site/*') -Destination (Join-Path $build 'assets/site') -Recurse -Force
Copy-Item (Join-Path $projectRoot 'assets/icons/icon-512.png') (Join-Path $build 'res/drawable/ic_launcher.png') -Force
Copy-Item (Join-Path $PSScriptRoot 'app/src/main/res/values/strings.xml') (Join-Path $build 'res/values/strings.xml') -Force
$indexPath=Join-Path $build 'assets/site/index.html'
$html=Get-Content $indexPath -Raw
$html=[regex]::Replace($html,'<script[^>]+src="offline-cache\.js[^" ]*"[^>]*></script>','')
$html=$html.Replace('</body>','<script src="android-mode.js"></script></body>')
Copy-Item (Join-Path $PSScriptRoot 'app/src/main/web/local-mode.js') (Join-Path $build 'assets/site/android-mode.js') -Force
Set-Content $indexPath $html -Encoding utf8NoBOM -NoNewline
@'
// The installed application keeps data on-device. Account management opens
// the official HTTPS website in the external browser, not an embedded login.
export const firebaseConfig=null;
export const providers={email:false,google:false};
export const appCheckSiteKey=null;
export const emulator=null;
export const cloudWriteBudgetEnabled=false;
'@ | Set-Content (Join-Path $build 'assets/site/firebase-config.js') -Encoding utf8NoBOM
$source=Join-Path $PSScriptRoot 'app/src/main/java/com/renaxdrums/metronome/MainActivity.java'
Run $java @('-jar',$CompilerJar,'-source','1.8','-target','1.8','-proc:none','-warn:none','-bootclasspath',$platform,'-d',(Join-Path $build 'classes'),$source)
$classes=@(Get-ChildItem (Join-Path $build 'classes') -Filter '*.class' -Recurse | ForEach-Object FullName)
Run (Join-Path $sdk 'd8.bat') (@('--lib',$platform,'--min-api','26','--output',(Join-Path $build 'dex'))+$classes)
Run (Join-Path $sdk 'aapt2.exe') @('compile','--dir',(Join-Path $build 'res'),'-o',(Join-Path $build 'resources.zip'))
# Add assets below with explicit ZIP names: aapt2 -A produced Windows backslashes.
Run (Join-Path $sdk 'aapt2.exe') @('link','-I',$platform,'--manifest',(Join-Path $PSScriptRoot 'app/src/main/AndroidManifest.xml'),'--min-sdk-version','26','--target-sdk-version','35','-o',(Join-Path $build 'unsigned.apk'),(Join-Path $build 'resources.zip'))
Add-Type -AssemblyName System.IO.Compression
$archive=[IO.Compression.ZipFile]::Open((Join-Path $build 'unsigned.apk'),[IO.Compression.ZipArchiveMode]::Update)
try{[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $build 'dex/classes.dex'),'classes.dex') | Out-Null}finally{$archive.Dispose()}
Add-ApkAssets (Join-Path $build 'unsigned.apk') (Join-Path $build 'assets')
Assert-ApkAssets (Join-Path $build 'unsigned.apk') (Join-Path $build 'assets')
Run (Join-Path $sdk 'zipalign.exe') @('-f','-p','4',(Join-Path $build 'unsigned.apk'),(Join-Path $build 'aligned.apk'))
$signing=Join-Path $PSScriptRoot 'signing';New-Item -ItemType Directory -Force $signing | Out-Null
$keystore=Join-Path $signing 'renax-drums.jks';$passwordFile=Join-Path $signing 'password.dpapi'
if(!(Test-Path $keystore)){
  $random=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  ConvertTo-SecureString $random -AsPlainText -Force | ConvertFrom-SecureString | Set-Content $passwordFile
  $env:RENAX_STORE_PASS=$random
  Run (Join-Path $JavaHome 'bin/keytool.exe') @('-genkeypair','-keystore',$keystore,'-alias','renaxdrums','-storepass:env','RENAX_STORE_PASS','-keypass:env','RENAX_STORE_PASS','-keyalg','RSA','-keysize','3072','-validity','3650','-dname','CN=Renax Drums','-storetype','JKS')
}else{$secure=(Get-Content $passwordFile -Raw).Trim() | ConvertTo-SecureString;$env:RENAX_STORE_PASS=([Management.Automation.PSCredential]::new('key',$secure)).GetNetworkCredential().Password}
try{
  New-Item -ItemType Directory -Force (Split-Path $OutputApk -Parent) | Out-Null
  Run $java @('-jar',(Join-Path $sdk 'lib/apksigner.jar'),'sign','--ks',$keystore,'--ks-key-alias','renaxdrums','--ks-pass','env:RENAX_STORE_PASS','--key-pass','env:RENAX_STORE_PASS','--out',$OutputApk,(Join-Path $build 'aligned.apk'))
  Run $java @('-jar',(Join-Path $sdk 'lib/apksigner.jar'),'verify','--verbose','--print-certs',$OutputApk)
  Run (Join-Path $sdk 'zipalign.exe') @('-c','-p','4',$OutputApk)
  Assert-ApkAssets $OutputApk (Join-Path $build 'assets')
}finally{Remove-Item Env:RENAX_STORE_PASS -ErrorAction SilentlyContinue}
Write-Output "APK built and signature verified: $OutputApk"
