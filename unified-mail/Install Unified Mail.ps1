# Installs Unified Mail: creates a Desktop shortcut AND a Startup shortcut so
# the app launches automatically when you sign in — mirroring the Start Page.
#
# Run once:  right-click this file -> "Run with PowerShell"
#   (or:  powershell -ExecutionPolicy Bypass -File ".\Install Unified Mail.ps1")

$proj = Split-Path -Parent $MyInvocation.MyCommand.Definition
$vbs  = Join-Path $proj 'launch-hidden.vbs'
$ico  = Join-Path $proj 'build\icon.ico'

if (-not (Test-Path $vbs)) {
  Write-Host "launch-hidden.vbs not found next to this script - aborting." -ForegroundColor Red
  exit 1
}

$ws = New-Object -ComObject WScript.Shell

function New-Shortcut($path) {
  $lnk = $ws.CreateShortcut($path)
  $lnk.TargetPath       = $vbs
  $lnk.WorkingDirectory = $proj
  if (Test-Path $ico) { $lnk.IconLocation = "$ico,0" }
  $lnk.Description       = 'Unified Mail - inbox + dashboard'
  $lnk.Save()
}

# 1) Desktop shortcut
$desktop = [Environment]::GetFolderPath('Desktop')
New-Shortcut (Join-Path $desktop 'Unified Mail.lnk')

# 2) Startup shortcut (runs at sign-in)
$startup = [Environment]::GetFolderPath('Startup')
New-Shortcut (Join-Path $startup 'Unified Mail.lnk')

Write-Host ""
Write-Host "  Installed." -ForegroundColor Green
Write-Host "  - Desktop icon:  Unified Mail" -ForegroundColor Green
Write-Host "  - Runs at sign-in automatically." -ForegroundColor Green
Write-Host ""
Write-Host "  First launch builds the app once (up to a minute); the window" -ForegroundColor DarkGray
Write-Host "  appears when it's ready. To undo startup, run 'Uninstall Unified Mail.ps1'." -ForegroundColor DarkGray
