# TetherDesk - One-click starter
# Jalankan: .\start.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "  TetherDesk" -ForegroundColor Green
Write-Host "  --------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# 1. Cari cloudflared
$Cloudflared = "$Root\apps\web\cloudflared.exe"
if (-not (Test-Path $Cloudflared)) {
    $cfCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cfCmd) { $Cloudflared = $cfCmd.Source } else { $Cloudflared = $null }
    if (-not $Cloudflared) {
        Write-Host "  [ERROR] cloudflared.exe tidak ditemukan." -ForegroundColor Red
        Write-Host "  Letakkan cloudflared.exe di apps\web\cloudflared.exe" -ForegroundColor Yellow
        Write-Host "  Download: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor Cyan
        Read-Host "  Tekan Enter untuk keluar"
        exit 1
    }
}

Write-Host "  [1/3] Menjalankan Cloudflare tunnel..." -ForegroundColor Cyan

# Jalankan cloudflared di background, capture output untuk URL
$TunnelJob = Start-Job -ScriptBlock {
    param($cf)
    & $cf tunnel --url http://localhost:3000 2>&1
} -ArgumentList $Cloudflared

# Tunggu URL muncul di output (max 30 detik)
$TunnelUrl = $null
$Deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $Deadline -and -not $TunnelUrl) {
    Start-Sleep -Milliseconds 500
    $Output = Receive-Job $TunnelJob -Keep 2>$null
    foreach ($line in $Output) {
        if ($line -match "url=(https://[^\s]+\.trycloudflare\.com)") {
            $TunnelUrl = $Matches[1]
            break
        }
        if ($line -match "(https://[^\s]+\.trycloudflare\.com)") {
            $TunnelUrl = $Matches[1]
            break
        }
    }
}

if (-not $TunnelUrl) {
    Write-Host "  [ERROR] Gagal mendapat URL tunnel dari cloudflared (timeout 30s)." -ForegroundColor Red
    Stop-Job $TunnelJob
    Remove-Job $TunnelJob
    Read-Host "  Tekan Enter untuk keluar"
    exit 1
}

Write-Host "  Tunnel URL: $TunnelUrl" -ForegroundColor Green

# 2. Tulis config agent
$ConfigDir = "$env:USERPROFILE\.tetherdesk"
if (-not (Test-Path $ConfigDir)) { New-Item -ItemType Directory -Path $ConfigDir | Out-Null }
$Config = "{`"backendOrigin`":`"$TunnelUrl`"}"
$enc = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText("$ConfigDir\config.json", $Config, $enc)
Write-Host "  Config ditulis ke $ConfigDir\config.json" -ForegroundColor DarkGray

# 3. Bebaskan port 3000 jika dipakai proses lain
$portCheck = netstat -ano | Select-String ":3000\s" | Select-String "LISTENING"
if ($portCheck) {
    $pid3000 = ($portCheck -split "\s+")[-1]
    Write-Host "  Port 3000 dipakai PID $pid3000, menghentikan..." -ForegroundColor Yellow
    Stop-Process -Id $pid3000 -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}

# Jalankan backend Next.js di jendela baru
Write-Host ""
Write-Host "  [2/3] Menjalankan backend (Next.js)..." -ForegroundColor Cyan
$BackendWindow = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; pnpm --filter @tetherdesk/web dev" -PassThru

# Tunggu Next.js siap (8 detik)
Write-Host "  Menunggu backend siap..." -ForegroundColor DarkGray
Start-Sleep -Seconds 8

# 4. Jalankan agent di jendela baru
Write-Host "  [3/3] Menjalankan agent..." -ForegroundColor Cyan
$AgentWindow = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; pnpm --filter @tetherdesk/agent dev" -PassThru

Write-Host ""
Write-Host "  TetherDesk sedang berjalan!" -ForegroundColor Green
Write-Host ""
Write-Host "  Dashboard : $TunnelUrl" -ForegroundColor Cyan
Write-Host "  Cara pakai:" -ForegroundColor White
Write-Host "    1. Buka $TunnelUrl di browser laptop" -ForegroundColor White
Write-Host "    2. Scan QR code dengan HP kamu" -ForegroundColor White
Write-Host "    3. Tap Allow di laptop untuk approve koneksi" -ForegroundColor White
Write-Host ""
Write-Host "  Tekan Enter untuk menghentikan semua proses..." -ForegroundColor DarkGray
Read-Host

# Cleanup
Write-Host "  Menghentikan semua proses..." -ForegroundColor Yellow
Stop-Job $TunnelJob -ErrorAction SilentlyContinue
Remove-Job $TunnelJob -ErrorAction SilentlyContinue
if ($BackendWindow -and -not $BackendWindow.HasExited) { Stop-Process -Id $BackendWindow.Id -Force -ErrorAction SilentlyContinue }
if ($AgentWindow -and -not $AgentWindow.HasExited) { Stop-Process -Id $AgentWindow.Id -Force -ErrorAction SilentlyContinue }
Write-Host "  Selesai." -ForegroundColor Green