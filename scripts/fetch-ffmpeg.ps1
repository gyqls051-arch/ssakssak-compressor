# FFmpeg LGPL 빌드 (ffmpeg.exe + ffprobe.exe) 를 resources/bin/ 에 받는다.
# 사용: powershell -ExecutionPolicy Bypass -File scripts/fetch-ffmpeg.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $root 'resources\bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null

$zip = Join-Path $env:TEMP 'ffmpeg-lgpl.zip'
$url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip'
Write-Host 'Downloading FFmpeg LGPL build...' -ForegroundColor Cyan
Invoke-WebRequest -Uri $url -OutFile $zip

Write-Host 'Extracting...' -ForegroundColor Cyan
$tmp = Join-Path $env:TEMP ('ffmpeg-lgpl-' + [guid]::NewGuid())
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
Copy-Item (Join-Path $inner.FullName 'bin\ffmpeg.exe')  $bin -Force
Copy-Item (Join-Path $inner.FullName 'bin\ffprobe.exe') $bin -Force
Copy-Item (Join-Path $inner.FullName 'LICENSE.txt')    $bin -Force
Remove-Item $tmp -Recurse -Force
Remove-Item $zip -Force
Write-Host "Done -> $bin" -ForegroundColor Green
