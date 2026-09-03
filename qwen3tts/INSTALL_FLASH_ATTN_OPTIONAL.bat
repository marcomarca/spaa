@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\activate.bat (
  echo Primero ejecuta INSTALL_WINDOWS.bat
  pause
  exit /b 1
)
call .venv\Scripts\activate.bat

echo Instalando Triton Windows y FlashAttention usados por el launcher Pinokio...
pip install triton-windows==3.3.1.post19
if errorlevel 1 goto :error

pip install "https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.4.10/flash_attn-2.8.2+cu128torch2.7-cp310-cp310-win_amd64.whl"
if errorlevel 1 goto :error

python -c "import flash_attn; print('FlashAttention OK:', flash_attn.__version__)"
echo Instalacion opcional terminada.
pause
exit /b 0

:error
echo.
echo [ERROR] FlashAttention opcional no pudo instalarse.
echo La app puede intentar funcionar sin el, usando el backend compatible por defecto.
pause
exit /b 1
