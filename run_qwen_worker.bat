@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  SPAA - Iniciar Worker Local Qwen3-TTS 1.7B (NVIDIA RTX 3070)
echo ============================================================
echo.
echo Recuerda: Cierra cualquier instancia de Pinokio/WebUI abierta
echo [Protector Termico]: Activo (Pausa a 70 C, reanuda a 58 C)
echo.

cd backend
uv run python -m spaa.runners.qwen_worker_runner %*
if errorlevel 1 (
  echo.
  echo [ERROR] El worker se detuvo con errores.
  pause
)
