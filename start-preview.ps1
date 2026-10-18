# AI 模型世界 —— 本地预览启动器
# 用法：双击桌面的「AI 模型世界」快捷方式即可。
# 它会：找到 Node → 起本地服务器 → 就绪后自动打开浏览器。

$ErrorActionPreference = 'Continue'
$port = 3000
$url  = "http://localhost:$port/"
$root = $PSScriptRoot
Set-Location -LiteralPath $root
try { $Host.UI.RawUI.WindowTitle = 'AI 模型世界 · 本地预览' } catch {}

# 优先用系统装好的 Node；没有才退回 TRAE 自带的
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $nodeDir = 'C:\Users\AI\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\vm\tools\node'
  if (Test-Path (Join-Path $nodeDir 'node.exe')) { $env:Path = "$nodeDir;$env:Path" }
}

Write-Host ''
Write-Host '  AI 模型世界 · 本地预览' -ForegroundColor Green
Write-Host '  ------------------------------' -ForegroundColor DarkGray

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host ''
  Write-Host '  [错误] 找不到 node。' -ForegroundColor Red
  Write-Host '  请确认 TRAE 已安装；或自行安装 Node.js 后重试。'
  Write-Host ''
  Read-Host '  按回车退出'
  exit 1
}

$nextCmd = Join-Path $root 'node_modules\.bin\next.cmd'
if (-not (Test-Path $nextCmd)) {
  Write-Host ''
  Write-Host '  [错误] 找不到 node_modules，依赖尚未安装。' -ForegroundColor Red
  Write-Host '  请先在本目录执行：npm install'
  Write-Host ''
  Read-Host '  按回车退出'
  exit 1
}

function Test-ServerUp {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $task = $client.ConnectAsync('127.0.0.1', $port)
    $up = $task.Wait(500)
    $client.Dispose()
    return $up
  } catch { return $false }
}

# 端口已在监听 → 说明服务器已经在跑，不重复启动，只把浏览器叫出来
if (Test-ServerUp) {
  Write-Host ''
  Write-Host "  服务器已在运行，直接打开 $url" -ForegroundColor Yellow
  Start-Process $url
  Start-Sleep -Milliseconds 800
  exit 0
}

Write-Host ''
Write-Host "  正在启动服务器… 就绪后会自动打开 $url" -ForegroundColor Cyan
Write-Host '  （日志会显示在下面；关闭本窗口即停止服务器）' -ForegroundColor DarkGray
Write-Host ''

# 后台轮询端口，等服务器真正起来再打开浏览器（首次访问要先编译，别太早开）
Start-Job -ArgumentList $port, $url -ScriptBlock {
  param($p, $u)
  for ($i = 0; $i -lt 300; $i++) {
    try {
      $c = New-Object System.Net.Sockets.TcpClient
      $t = $c.ConnectAsync('127.0.0.1', $p)
      $ready = $t.Wait(800)
      $c.Dispose()
      if ($ready) { Start-Process $u; break }
    } catch {}
    Start-Sleep -Milliseconds 400
  }
} | Out-Null

# 直接跑 next dev：跳过 predev 的素材重生成（那步会联网下载精灵图、很慢）
& $nextCmd dev -p $port
