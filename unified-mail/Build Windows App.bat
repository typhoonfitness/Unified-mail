@echo off
setlocal enableextensions
title Build Unified Mail (Windows)
cd /d "%~dp0"

echo ============================================
echo   Building Unified Mail for Windows
echo ============================================
echo.

REM --- Find Node/npm even if it's not on PATH ---------------------------------
where npm >nul 2>nul
if %ERRORLEVEL%==0 goto HAVE_NPM

echo npm was not on your PATH. Looking in the usual install spots...
for %%D in (
  "%ProgramFiles%\nodejs"
  "%ProgramFiles(x86)%\nodejs"
  "%LOCALAPPDATA%\Programs\nodejs"
  "%APPDATA%\npm"
  "%LOCALAPPDATA%\nvm"
) do (
  if exist "%%~D\npm.cmd" (
    set "PATH=%%~D;%PATH%"
    echo Found Node at %%~D
    goto HAVE_NPM
  )
)

echo.
echo   Could not find Node.js / npm on this computer.
echo   Install the LTS build from https://nodejs.org  (accept the default
echo   options, which add npm to your PATH), then double-click this file again.
echo.
pause
exit /b 1

:HAVE_NPM
echo.
echo [1/2] Installing dependencies (first run can take a few minutes)...
call npm install
if %ERRORLEVEL% neq 0 (
  echo.
  echo   npm install failed. Scroll up for the error.
  pause
  exit /b 1
)

echo.
echo [2/2] Packaging the app...
call npm run package
if %ERRORLEVEL% neq 0 (
  echo.
  echo   Packaging failed. Scroll up for the error.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Done. Your installer + portable .exe are in:
echo   %~dp0dist
echo ============================================
if exist "%~dp0dist" start "" "%~dp0dist"
echo.
pause
