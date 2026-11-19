@echo off
setlocal
cd /d "%~dp0"
set "PORT=8001"
set "LAN_IP=192.168.110.49"
echo Open this address on a phone connected to the same Wi-Fi:
echo http://%LAN_IP%:%PORT%/
echo.
echo If the address changes, run ipconfig and update LAN_IP in this file.
echo Keep this window open while using the map. Press Ctrl+C to stop.
where node >nul 2>nul
if not errorlevel 1 (
  node scripts\serve-map.mjs %LAN_IP% %PORT%
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3 -m http.server %PORT% --bind %LAN_IP%
  ) else (
    where python >nul 2>nul
    if errorlevel 1 (
      echo Node.js or Python 3 is required to run the local server.
      pause
      exit /b 1
    )
    python -m http.server %PORT% --bind %LAN_IP%
  )
)
pause
