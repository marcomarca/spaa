# Contributing to SPAA

Thank you for contributing to SPAA (Sistema Personal de Audiolibros y Aprendizaje).

## Development Philosophy

1. **Simplicity > Sophistication**, but **Recoverability > Extreme Simplicity**.
2. **Offline-First**: The Android client and core playback features must operate 100% offline.
3. **Deterministic Core**: Pure domain logic (segmentation, markdown cleaning, QA rules, FSRS) must not depend on web frameworks, transport protocols, or browser APIs.

## Setup & Tooling

- **Backend**: Python 3.11+, managed with `uv`.
  ```bash
  cd backend
  uv sync --all-groups
  uv run ruff check .
  uv run pytest
  ```

- **Frontend & Mobile**: React + TypeScript + Vite, managed with `bun`.
  ```bash
  cd frontend
  bun install
  bun run check
  bun run dev
  ```

- **Chrome Extension**: Manifest V3 in TypeScript, managed with `bun`.
  ```bash
  cd extension
  bun install
  bun run build
  ```

## Running Full Checks

Run the automated check script before opening PRs:
```powershell
.\scripts\check.ps1
```
or on POSIX:
```bash
./scripts/check.sh
```
