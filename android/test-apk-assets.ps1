$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'apk-assets.ps1')
$temp = Join-Path ([IO.Path]::GetTempPath()) ('renax-apk-test-' + [Guid]::NewGuid())
New-Item -ItemType Directory -Path (Join-Path $temp 'assets/site/nested') -Force | Out-Null
try {
  $assets = Join-Path $temp 'assets'
  [IO.File]::WriteAllText((Join-Path $assets 'site/index.html'), '<html>Renax</html>')
  [IO.File]::WriteAllBytes((Join-Path $assets 'site/nested/click.wav'), [byte[]]@(0, 1, 128, 255))
  [IO.File]::WriteAllText((Join-Path $assets 'site/nested/échantillon.txt'), 'échantillon')
  function New-TestApk([string]$name) {
    $file = Join-Path $temp $name
    $zip = [IO.Compression.ZipFile]::Open($file, [IO.Compression.ZipArchiveMode]::Create)
    try { $zip.CreateEntry('classes.dex') | Out-Null } finally { $zip.Dispose() }
    return $file
  }
  function Expect-Rejection([string]$apk, [string]$message) {
    $reason = $null
    try { Assert-ApkAssets $apk $assets } catch { $reason = $_.Exception.Message }
    if (!$reason -or !$reason.Contains($message)) { throw "Expected '$message', got '$reason'" }
  }
  $good = New-TestApk 'good.apk'
  Add-ApkAssets $good $assets
  Assert-ApkAssets $good $assets
  # Reproduce the exact path defect in the reported Windows-built APK.
  $bad = New-TestApk 'windows-paths.apk'
  $zip = [IO.Compression.ZipFile]::Open($bad, [IO.Compression.ZipArchiveMode]::Update)
  try { $zip.CreateEntry('assets/site\index.html') | Out-Null } finally { $zip.Dispose() }
  Expect-Rejection $bad 'Invalid or duplicate APK path'
  Expect-Rejection (New-TestApk 'empty.apk') 'startup page is missing'
  # Android must receive the original bytes, including sounds and nested assets.
  [IO.File]::WriteAllBytes((Join-Path $assets 'site/nested/click.wav'), [byte[]]@(0, 1, 128, 254))
  Expect-Rejection $good 'APK asset content differs'
  [IO.File]::WriteAllBytes((Join-Path $assets 'site/nested/click.wav'), [byte[]]@(0, 1, 128, 255))
  $zip = [IO.Compression.ZipFile]::Open($good, [IO.Compression.ZipArchiveMode]::Update)
  try { $zip.GetEntry('assets/site/nested/click.wav').Delete() } finally { $zip.Dispose() }
  Expect-Rejection $good 'Missing APK asset'
  $duplicate = New-TestApk 'duplicate.apk'
  Add-ApkAssets $duplicate $assets
  $zip = [IO.Compression.ZipFile]::Open($duplicate, [IO.Compression.ZipArchiveMode]::Update)
  try { $zip.CreateEntry('assets/site/index.html') | Out-Null } finally { $zip.Dispose() }
  Expect-Rejection $duplicate 'Invalid or duplicate APK path'
  $extra = New-TestApk 'extra.apk'
  Add-ApkAssets $extra $assets
  $zip = [IO.Compression.ZipFile]::Open($extra, [IO.Compression.ZipArchiveMode]::Update)
  try { $zip.CreateEntry('assets/unexpected.txt') | Out-Null } finally { $zip.Dispose() }
  Expect-Rejection $extra 'unexpected assets'
  Write-Output 'PASS: startup page, nested/binary/Unicode assets, Windows paths, missing page/file, changed bytes, duplicate and extra entries.'
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }
