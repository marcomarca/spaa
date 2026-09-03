@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\activate.bat (
  echo Primero ejecuta INSTALL_WINDOWS.bat
  pause
  exit /b 1
)
call .venv\Scripts\activate.bat
set TOKENIZERS_PARALLELISM=false
python app.py
pause
