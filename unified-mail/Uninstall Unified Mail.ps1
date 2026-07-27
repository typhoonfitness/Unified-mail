# Removes the Unified Mail Desktop and Startup shortcuts created by
# "Install Unified Mail.ps1". Does not touch the project files.

$desktop = [Environment]::GetFolderPath('Desktop')
$startup = [Environment]::GetFolderPath('Startup')

foreach ($p in @(
    (Join-Path $desktop 'Unified Mail.lnk'),
    (Join-Path $startup 'Unified Mail.lnk')
  )) {
  if (Test-Path $p) {
    Remove-Item $p -Force
    Write-Host "Removed $p" -ForegroundColor Green
  }
}
Write-Host "Done. Unified Mail will no longer launch at sign-in." -ForegroundColor White
