@echo off
setlocal
cd /d "%~dp0"
set "PORT=8001"
echo Open this address on a phone connected to the same Wi-Fi:
for /f "delims=" %%I in ('powershell -NoProfile -Command "Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | ForEach-Object { $_.IPv4Address.IPAddress }"') do echo http://%%I:%PORT%/
echo.
echo The address is detected automatically on each start.
echo If no phone address appears, connect this computer to Wi-Fi and restart.
echo If another map window is running, stop it with Ctrl+C first.
echo If Windows Firewall asks, allow access on your private home network.
echo Keep this window open while using the map. Press Ctrl+C to stop.
where node >nul 2>nul
if not errorlevel 1 (
  node scripts\serve-map.mjs 0.0.0.0 %PORT%
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    py -3 -m http.server %PORT% --bind 0.0.0.0
  ) else (
    where python >nul 2>nul
    if errorlevel 1 (
      echo Node.js or Python 3 is required to run the local server.
      pause
      exit /b 1
    )
    python -m http.server %PORT% --bind 0.0.0.0
  )
)
pause
