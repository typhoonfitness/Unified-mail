# Creates a "Unified Mail" shortcut on your Desktop with the app icon.
# Double-click the shortcut afterwards to launch the app (no console window).
#
# Run once:  right-click this file -> "Run with PowerShell"
# (or in a terminal:  powershell -ExecutionPolicy Bypass -File ".\Create Desktop Shortcut.ps1")

$proj = Split-Path -Parent $MyInvocation.MyCommand.Definition
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Unified Mail.lnk'

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($shortcutPath)
$lnk.TargetPath = (Join-Path $proj 'launch-hidden.vbs')
$lnk.WorkingDirectory = $proj
$lnk.IconLocation = (Join-Path $proj 'build\icon.ico')
$lnk.Description = 'Unified Mail — inbox + dashboard'
$lnk.Save()

Write-Host ""
Write-Host "  Desktop shortcut created:  $shortcutPath" -ForegroundColor Green
Write-Host "  Double-click 'Unified Mail' on your desktop to launch." -ForegroundColor Green
Write-Host ""
Write-Host "  (First launch builds the app once and may take up to a minute;" -ForegroundColor DarkGray
Write-Host "   the window appears when it's ready.)" -ForegroundColor DarkGray
