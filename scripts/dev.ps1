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
Write-Host "[2/3] 🐍 Iniciando Backend en http://0.0.0.0:$backendPort..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\backend'; `$env:PYTHONPATH='src'; Write-Host '--- SPAA Backend (FastAPI) ---' -ForegroundColor Green; uv run uvicorn spaa.api.main:app --reload --host 0.0.0.0 --port $backendPort"

# 3. Iniciar Frontend en ventana independiente
Write-Host "[3/3] ⚛️  Iniciando Frontend en http://0.0.0.0:$frontendPort..." -ForegroundColor Cyan
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\..\frontend'; `$env:VITE_BACKEND_PORT='$backendPort'; Write-Host '--- SPAA Frontend (Vite) ---' -ForegroundColor Cyan; bun run dev --host 0.0.0.0 --port $frontendPort"

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.|192\.168\.56\.)' } |
    Sort-Object -Property @{ Expression = { if ($_.InterfaceAlias -match 'Wi-?Fi') { 0 } else { 1 } } } |
    Select-Object -First 1).IPAddress

Write-Host "`n✅ Servicios iniciados en terminales dedicadas:" -ForegroundColor Green
Write-Host "   - Backend API:       http://localhost:$backendPort (Swagger: http://localhost:$backendPort/docs)" -ForegroundColor Gray
Write-Host "   - Frontend PC:       http://localhost:$frontendPort" -ForegroundColor Gray
if ($lanIp) {
    Write-Host "   - Móvil / Wi-Fi:     http://${lanIp}:$frontendPort (Backend: http://${lanIp}:$backendPort)" -ForegroundColor Yellow
}
Write-Host "   - Extensión:         extension/dist (cargada en Chrome)" -ForegroundColor Gray
