@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\activate.bat (
  echo Primero ejecuta INSTALL_WINDOWS.bat
  pause
  exit /b 1
)
call .venv\Scripts\activate.bat
python download_model.py
if errorlevel 1 (
  echo [ERROR] Fallo la descarga del modelo.
  pause
  exit /b 1
)
pause
