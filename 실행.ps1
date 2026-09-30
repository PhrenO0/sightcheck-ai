$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'dist\index.html'))) { throw '먼저 이 폴더에서 npm install 및 npm run build를 실행하세요.' }
$taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$taskNode = if ($taskNodeCommand) { $taskNodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $taskNode)) { throw 'Node.js 20.19+ 또는 22.12+가 필요합니다. README.md의 실행 방법을 확인하세요.' }
$taskServer = Join-Path $taskRoot 'scripts\serve.mjs'
$taskUrl = 'http://127.0.0.1:4173/'
$taskReady = $false
try { $taskReply = Invoke-WebRequest -Uri $taskUrl -TimeoutSec 2; $taskReady = $taskReply.Content -match '시야체크' } catch { }
if (-not $taskReady) {
  Start-Process -FilePath $taskNode -ArgumentList @('"' + $taskServer + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden
  for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
    Start-Sleep -Milliseconds 200
    try { $taskReply = Invoke-WebRequest -Uri $taskUrl -TimeoutSec 1; if ($taskReply.Content -match '시야체크') { $taskReady = $true; break } } catch { }
  }
}
if ($taskReady) { Start-Process $taskUrl } else { throw '서버를 시작하지 못했습니다. 다른 프로그램이 4173 포트를 사용하는지 확인하세요.' }
