Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   🚀 INICIANDO ENTORNO SPAA COMPLETO        " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Compilar Extensión
Write-Host "`n[1/3] 🧩 Compilando Extensión de Chrome..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\..\extension"
try {
    bun run build
} finally {
    Pop-Location
}

# 2. Iniciar Backend en ventana independiente
Write-Host "[2/3] 🐍 Iniciando Backend en http://localhost:8009..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\backend'; `$env:PYTHONPATH='src'; Write-Host '--- SPAA Backend (FastAPI) ---' -ForegroundColor Green; uv run uvicorn spaa.api.main:app --reload --port 8009"

# 3. Iniciar Frontend en ventana independiente
Write-Host "[3/3] ⚛️  Iniciando Frontend en http://localhost:5173..." -ForegroundColor Cyan
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\frontend'; Write-Host '--- SPAA Frontend (Vite) ---' -ForegroundColor Cyan; bun run dev"

Write-Host "`n✅ Servicios iniciados en terminales dedicadas:" -ForegroundColor Green
Write-Host "   - Backend API:  http://localhost:8009 (Swagger: http://localhost:8009/docs)" -ForegroundColor Gray
Write-Host "   - Frontend Web: http://localhost:5173" -ForegroundColor Gray
Write-Host "   - Extensión:    extension/dist (cargada en Chrome)" -ForegroundColor Gray
