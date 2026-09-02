#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== [1/3] 🧩 Compilando Extensión de Chrome ==="
cd "$DIR/../extension"
bun run build

echo "=== [2/3] 🐍 Iniciando Backend en http://localhost:8009 ==="
cd "$DIR/../backend"
PYTHONPATH=src uv run uvicorn spaa.api.main:app --reload --port 8009 &
BACKEND_PID=$!

echo "=== [3/3] ⚛️  Iniciando Frontend en http://localhost:5173 ==="
cd "$DIR/../frontend"
bun run dev &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

echo "✅ Servicios SPAA iniciados. Presiona Ctrl+C para detener ambos."
wait
