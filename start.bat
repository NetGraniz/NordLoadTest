@echo off
title NordLoadTest - Ctrl+C to stop
cd /d "%~dp0"
set "NORD_RUNTIME=%LOCALAPPDATA%\NordLoadTest\runtime-26.2"
set "NORD_MODULES=%NORD_RUNTIME%\node_modules"

if not exist "%NORD_MODULES%\mineflayer" (
  echo Dependencies are missing. Installing them to the local C: drive...
  if not exist "%NORD_RUNTIME%" mkdir "%NORD_RUNTIME%"
  copy /y "%~dp0package.json" "%NORD_RUNTIME%\package.json" >nul
  if exist "%~dp0package-lock.json" copy /y "%~dp0package-lock.json" "%NORD_RUNTIME%\package-lock.json" >nul
  call npm install --prefix "%NORD_RUNTIME%" --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Preparing Minecraft 26.2 runtime data...
node "%NORD_MODULES%\mineflayer\tools\install-minecraft-data-26.2.mjs"
if errorlevel 1 (
  pause
  exit /b 1
)

set "NODE_PATH=%NORD_MODULES%"
echo Starting NordLoadTest. Press Ctrl+C once to stop all bots.
node --max-old-space-size=8192 "%~dp0src\index.js"
pause
