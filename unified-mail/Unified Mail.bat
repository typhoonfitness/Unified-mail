@echo off
REM ============================================================
REM  Unified Mail launcher — double-click this (or the desktop
REM  shortcut) to start the app. No PowerShell commands needed.
REM  Runs the app the same way "npm run dev" does, so it always
REM  reflects the latest code (no stale build). First run
REM  installs dependencies once.
REM ============================================================
cd /d "%~dp0"

if not exist "node_modules\" (
  echo [Unified Mail] First-time setup: installing dependencies...
  call npm install
)

echo [Unified Mail] Launching...
call npm run dev
