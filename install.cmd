@echo off
cd /d "%~dp0"
if not exist ".runtime\tmp" mkdir ".runtime\tmp"
set "TEMP=%~dp0.runtime\tmp"
set "TMP=%~dp0.runtime\tmp"
set "PIP_CACHE_DIR=%~dp0.runtime\pip-cache"
python -m venv .venv
if errorlevel 1 (
  echo Python 3.10 or newer with venv is required.
  pause
  exit /b 1
)
.venv\Scripts\python.exe -m pip install --timeout 120 --index-url https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
if errorlevel 1 (
  echo Installation failed. Please check the network and retry.
  pause
  exit /b 1
)
echo Ready. Double-click start.cmd to open Lyric Studio.
pause
