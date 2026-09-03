@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo Qwen3-TTS 1.7B CustomVoice ES - instalacion aislada
echo ============================================================

py -3.10 --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Se requiere Python 3.10 x64 disponible mediante: py -3.10
  echo Instala Python 3.10 y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

if not exist .venv (
  py -3.10 -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip setuptools wheel

rem Misma familia de PyTorch/CUDA usada por el launcher Pinokio analizado.
pip install torch==2.7.0 torchvision==0.22.0 torchaudio==2.7.0 --index-url https://download.pytorch.org/whl/cu128
if errorlevel 1 goto :error

pip install -r requirements.txt
if errorlevel 1 goto :error

python check_gpu.py

echo.
echo Instalacion base terminada.
echo Siguiente paso: ejecutar DOWNLOAD_MODEL.bat
pause
exit /b 0

:error
echo.
echo [ERROR] La instalacion fallo. Revisa el mensaje anterior.
pause
exit /b 1
