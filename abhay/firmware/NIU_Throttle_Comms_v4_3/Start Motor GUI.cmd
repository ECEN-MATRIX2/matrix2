@echo off
setlocal
set "NIU_PY=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\pythonw.exe"
if exist "%NIU_PY%" (
  start "" "%NIU_PY%" "%~dp0tools\motor_gui.py"
  exit /b
)
where py >nul 2>nul
if not errorlevel 1 (
  py -3 "%~dp0tools\motor_gui.py"
  exit /b
)
echo Python with Tkinter is required. Install standard Python 3 for Windows.
pause
