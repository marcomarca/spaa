<#
.SYNOPSIS
    Inicia el worker local secuencial Qwen3-TTS 12Hz 1.7B CustomVoice en la GPU NVIDIA local (RTX 3070).
#>
[CmdletBinding()]
param(
    [switch]$Once,
    [string]$WorkerId = "worker-qwen-rtx3070",
    [string]$Alias = "NVIDIA RTX 3070 Qwen3-TTS",
    [string]$Speaker = "Ryan",
    [double]$Interval = 2.0,
    [int]$MaxTemp = 70,
    [int]$CooldownTemp = 58,
    [switch]$NoThermal
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

$Candidates = @(
    (Join-Path $ProjectRoot "qwen3tts\.venv\python.exe"),
    (Join-Path $ProjectRoot "qwen3tts\.venv\Scripts\python.exe"),
    "C:\pinokio\api\Ultimate-TTS-Studio.git\app\tts_env\python.exe"
)

$Py = $null
foreach ($c in $Candidates) {
    if (Test-Path $c) {
        $Py = $c
        break
    }
}

if (-not $Py) {
    Write-Error "No se encontró el entorno Python con PyTorch CUDA para Qwen3-TTS."
    exit 1
}

$env:PYTHONPATH = (Join-Path $ProjectRoot "backend\src")

Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  SPAA LOCAL QWEN3-TTS WORKER (GPU NVIDIA RTX 3070)     " -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  Worker ID: $WorkerId" -ForegroundColor Yellow
Write-Host "  Alias:     $Alias" -ForegroundColor Yellow
Write-Host "  Speaker:   $Speaker" -ForegroundColor Yellow
Write-Host "  Python:    $Py" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  [Nota VRAM]: Cierra Pinokio/Ultimate-TTS si está abierto" -ForegroundColor DarkYellow
Write-Host "  para liberar los 8 GB de VRAM de la RTX 3070." -ForegroundColor DarkYellow
Write-Host ""

$argsList = @(
    "-m", "spaa.runners.qwen_worker_runner",
    "--worker-id", $WorkerId,
    "--alias", $Alias,
    "--speaker", $Speaker,
    "--interval", "$Interval",
    "--max-temp", "$MaxTemp",
    "--cooldown-temp", "$CooldownTemp"
)

if ($NoThermal) {
    $argsList += "--no-thermal"
}

if ($Once) {
    $argsList += "--once"
}

Push-Location (Join-Path $ProjectRoot "backend")
try {
    & $Py @argsList
}
finally {
    Pop-Location
}
