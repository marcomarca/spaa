Write-Host "=== 1. Checking Backend (Python / uv) ===" -ForegroundColor Cyan
Push-Location "$PSScriptRoot\..\backend"
try {
    uv run ruff check .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    uv run pytest
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

Write-Host "`n=== 2. Checking Frontend (TypeScript / Bun) ===" -ForegroundColor Cyan
Push-Location "$PSScriptRoot\..\frontend"
try {
    bun run check
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    bun run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

Write-Host "`n=== 3. Checking Extension (TypeScript / Bun) ===" -ForegroundColor Cyan
Push-Location "$PSScriptRoot\..\extension"
try {
    bun run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

Write-Host "`n>>> All SPAA Quality Gates Passed Successfully! <<<" -ForegroundColor Green
