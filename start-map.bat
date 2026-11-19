@echo off
setlocal
cd /d "%~dp0"
set "PORT=8001"
where node >nul 2>nul
if not errorlevel 1 (
  start "" /b cmd /c "timeout /t 2 /nobreak ^>nul ^& start http://127.0.0.1:%PORT%"
  node scripts\serve-map.mjs 127.0.0.1 %PORT%
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    start "" /b cmd /c "timeout /t 2 /nobreak ^>nul ^& start http://127.0.0.1:%PORT%"
    py -3 -m http.server %PORT% --bind 127.0.0.1
  ) else (
    where python >nul 2>nul
    if errorlevel 1 (
      echo Node.js or Python 3 is required to run this project.
      pause
      exit /b 1
    )
    start "" /b cmd /c "timeout /t 2 /nobreak ^>nul ^& start http://127.0.0.1:%PORT%"
    python -m http.server %PORT% --bind 127.0.0.1
  )
)
