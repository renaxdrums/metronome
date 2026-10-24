# Inline the unchanged local encoder in the Android worker: WebView does not
# consistently intercept worker importScripts requests to its synthetic origin.
function Prepare-AndroidWorker([string]$Site) {
  $workerPath=Join-Path $Site 'mp3-export-worker.js'
  $encoderPath=Join-Path $Site 'vendor/lamejs/lame.min.js'
  $worker=[IO.File]::ReadAllText($workerPath)
  $pattern='importScripts\(["'']vendor/lamejs/lame\.min\.js(?:\?[^"'']*)?["'']\);'
  $matches=[regex]::Matches($worker,$pattern)
  if($matches.Count -ne 1){throw 'Expected exactly one local MP3 encoder import'}
  $encoder=[IO.File]::ReadAllText($encoderPath)
  $match=$matches[0]
  $combined=$worker.Substring(0,$match.Index)+$encoder+";`n"+$worker.Substring($match.Index+$match.Length)
  [IO.File]::WriteAllText($workerPath,$combined,[Text.UTF8Encoding]::new($false))
  & node (Join-Path $PSScriptRoot 'prepare-workers.cjs') $Site
  if ($LASTEXITCODE -ne 0) { throw 'Android guide worker preparation failed' }
}
