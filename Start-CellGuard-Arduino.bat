@echo off
setlocal
cd /d "%~dp0"
echo Arduino serial is disabled in this candidate build.
echo The redesigned arm has not been measured or calibrated; no physical command will be sent.
echo This file intentionally does not launch or move hardware.
echo For the simulation preview, follow README.md and run the Python server from the full project root.
pause
