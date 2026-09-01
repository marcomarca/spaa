#!/usr/bin/env bash
set -e

echo "=== 1. Checking Backend (Python / uv) ==="
cd "$(dirname "$0")/../backend"
uv run ruff check .
uv run pytest

echo -e "\n=== 2. Checking Frontend (TypeScript / Bun) ==="
cd "$(dirname "$0")/../frontend"
bun run check
bun run build

echo -e "\n=== 3. Checking Extension (TypeScript / Bun) ==="
cd "$(dirname "$0")/../extension"
bun run build

echo -e "\n>>> All SPAA Quality Gates Passed Successfully! <<<"
