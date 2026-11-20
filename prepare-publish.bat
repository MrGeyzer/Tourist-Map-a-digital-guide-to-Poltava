@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 or later is required.
  pause
  exit /b 1
)
node --test scripts/*.test.mjs
if errorlevel 1 goto failed
node scripts/build-site.mjs
if errorlevel 1 goto failed
powershell -NoProfile -Command "$ErrorActionPreference = 'Stop'; New-Item -ItemType Directory -Force -Path 'release' | Out-Null; Compress-Archive -Path 'dist\*' -DestinationPath 'release\poltava-map.zip' -Force"
if errorlevel 1 goto failed
echo.
echo Ready: dist and release\poltava-map.zip
echo Nothing has been uploaded or published.
pause
exit /b 0
:failed
echo Preparation failed. See the error above.
pause
exit /b 1
