<#
.SYNOPSIS
    Inicia el worker local secuencial F5-TTS en la GPU NVIDIA local (RTX 3070).
#>
[CmdletBinding()]
param(
    [switch]$Once,
    [string]$WorkerId = "worker-f5-rtx3070",
    [string]$Alias = "NVIDIA RTX 3070 F5-TTS",
    [double]$Interval = 2.0
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Py = Join-Path $ProjectRoot "backend\.venv-f5\Scripts\python.exe"

if (-not (Test-Path $Py)) {
    Write-Error "No se encontró el entorno Python F5 en: $Py"
    exit 1
}

$env:PYTHONPATH = (Join-Path $ProjectRoot "backend\src")

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  SPAA LOCAL F5-TTS WORKER (GPU NVIDIA RTX 3070)      " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Worker ID: $WorkerId" -ForegroundColor Yellow
Write-Host "  Alias:     $Alias" -ForegroundColor Yellow
Write-Host "  Python:    $Py" -ForegroundColor DarkGray
Write-Host ""

$argsList = @(
    (Join-Path $ProjectRoot "backend\src\spaa\runners\f5_worker_runner.py"),
    "--worker-id", $WorkerId,
    "--alias", $Alias,
    "--interval", "$Interval"
)

if ($Once) {
    $argsList += "--once"
}

& $Py @argsList
