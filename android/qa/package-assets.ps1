param([string]$Apk,[string]$Assets)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../apk-assets.ps1')
Add-ApkAssets $Apk $Assets
Assert-ApkAssets $Apk $Assets
