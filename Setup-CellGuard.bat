@echo off
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"

where py >nul 2>&1
if %errorlevel%==0 (
  set "BASE_PY=py -3"
) else (
  set "BASE_PY=python"
)

%BASE_PY% -c "import sys,struct; assert (3,11) <= sys.version_info[:2] < (3,15) and struct.calcsize('P') == 8, 'Use 64-bit Python 3.11 through 3.14'"
if errorlevel 1 goto failed

%BASE_PY% -m venv .venv
if errorlevel 1 goto failed

".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto failed

".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto failed

".venv\Scripts\python.exe" -c "import cv2,numpy,torch,ultralytics; print('CellGuard dependencies ready')"
if errorlevel 1 goto failed

echo.
echo Setup complete. Double-click Start-CellGuard.bat.
pause
exit /b 0

:failed
echo.
echo Setup did not complete. Check the error above and README.md.
pause
exit /b 1
