# ZIP entry names must use '/', including when the build runs on Windows.
Add-Type -AssemblyName System.IO.Compression

function Add-ApkAssets([string]$ApkPath, [string]$AssetsDirectory) {
  $root = (Get-Item -LiteralPath $AssetsDirectory).FullName
  $archive = [IO.Compression.ZipFile]::Open($ApkPath, [IO.Compression.ZipArchiveMode]::Update)
  try {
    if (@($archive.Entries | Where-Object { $_.FullName.StartsWith('assets/') }).Count) {
      throw 'APK already contains assets; link resources without aapt2 -A.'
    }
    foreach ($file in Get-ChildItem -LiteralPath $root -File -Recurse -Force) {
      $relative = [IO.Path]::GetRelativePath($root, $file.FullName).Replace('\', '/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, ('assets/' + $relative)) | Out-Null
    }
  } finally { $archive.Dispose() }
}

function Assert-ApkAssets([string]$ApkPath, [string]$AssetsDirectory) {
  $root = (Get-Item -LiteralPath $AssetsDirectory).FullName
  $archive = [IO.Compression.ZipFile]::OpenRead($ApkPath)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($entry in $archive.Entries) {
      if ($entry.FullName.Contains('\') -or !$names.Add($entry.FullName)) {
        throw "Invalid or duplicate APK path: $($entry.FullName)"
      }
    }
    if (!$names.Contains('assets/site/index.html')) { throw 'APK startup page is missing: assets/site/index.html' }
    $expectedCount = 0
    foreach ($file in Get-ChildItem -LiteralPath $root -File -Recurse -Force) {
      $name = 'assets/' + [IO.Path]::GetRelativePath($root, $file.FullName).Replace('\', '/')
      $entry = $archive.GetEntry($name)
      if ($null -eq $entry) { throw "Missing APK asset: $name" }
      $input = $file.OpenRead()
      try { $expected = [BitConverter]::ToString($sha.ComputeHash($input)) } finally { $input.Dispose() }
      $input = $entry.Open()
      try { $actual = [BitConverter]::ToString($sha.ComputeHash($input)) } finally { $input.Dispose() }
      if ($actual -cne $expected) { throw "APK asset content differs: $name" }
      $expectedCount++
    }
    $actualCount = @($archive.Entries | Where-Object { $_.FullName.StartsWith('assets/') }).Count
    if ($actualCount -ne $expectedCount) { throw 'APK contains unexpected assets.' }
  } finally { $sha.Dispose(); $archive.Dispose() }
}
