Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   🚀 INICIANDO ENTORNO SPAA COMPLETO        " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

function Get-FreePort([int]$startPort) {
    $p = $startPort
    while ($p -lt 65535) {
        $conn = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
        if (-not $conn) { return $p }
        $p++
    }
    return $startPort
}

$backendPort = Get-FreePort 8009
$frontendPort = Get-FreePort 5180

# 1. Compilar Extensión
Write-Host "`n[1/3] 🧩 Compilando Extensión de Chrome..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\..\extension"
try {
    bun run build
} finally {
    Pop-Location
}

# 2. Iniciar Backend en ventana independiente
Write-Host "[2/3] 🐍 Iniciando Backend en http://localhost:$backendPort..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\backend'; `$env:PYTHONPATH='src'; Write-Host '--- SPAA Backend (FastAPI) ---' -ForegroundColor Green; uv run uvicorn spaa.api.main:app --reload --port $backendPort"

# 3. Iniciar Frontend en ventana independiente
Write-Host "[3/3] ⚛️  Iniciando Frontend en http://localhost:$frontendPort..." -ForegroundColor Cyan
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\frontend'; `$env:VITE_BACKEND_PORT='$backendPort'; Write-Host '--- SPAA Frontend (Vite) ---' -ForegroundColor Cyan; bun run dev --port $frontendPort"

Write-Host "`n✅ Servicios iniciados en terminales dedicadas:" -ForegroundColor Green
Write-Host "   - Backend API:  http://localhost:$backendPort (Swagger: http://localhost:$backendPort/docs)" -ForegroundColor Gray
Write-Host "   - Frontend Web: http://localhost:$frontendPort" -ForegroundColor Gray


Write-Host "   - Extensión:    extension/dist (cargada en Chrome)" -ForegroundColor Gray
