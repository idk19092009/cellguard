@echo off
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"

if not exist ".venv\Scripts\python.exe" (
  echo Run Setup-CellGuard.bat first.
  pause
  exit /b 1
)

echo Open http://localhost:3001/ in this computer's browser.
echo Leave this window open while using CellGuard. Press Ctrl+C to stop.
".venv\Scripts\python.exe" "locator\server.py" --host 127.0.0.1 --port 3001
pause
