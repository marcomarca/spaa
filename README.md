# SPAA — Sistema Personal de Audiolibros y Aprendizaje

Sistema personal offline-first para conversión de material de estudio en Markdown a audiolibros de alta calidad con síntesis de voz local (**F5-TTS en Español** con aceleración GPU NVIDIA CUDA y clonación de voz), gestión de aprendizaje con repetición espaciada FSRS y reproductor Android/PC.

## Estructura del Repositorio

- `scripts/run_f5_worker.ps1`: Worker local secuencial para inferencia F5-TTS en GPU local (NVIDIA CUDA).
- `backend/`: Servidor maestro en Python (FastAPI, SQLAlchemy, SQLite, FFmpeg, motor F5-TTS) gestionado con `uv`.
- `frontend/`: Aplicación web y cliente offline para Android en React, TypeScript y Vite gestionado con `bun`.
- `extension/`: Extensión Manifest V3 auxiliar para automatización de Gemini AI Studio en Chrome.
- `docs/`: Documentación de arquitectura, decisiones de diseño (ADRs) y estrategia de pruebas.
- `run.md`: Guía rápida de comandos de ejecución y desarrollo.

## Comandos Rápidos

### 🎙️ Síntesis Local de Audiolibros (F5-TTS en GPU)
```powershell
# Iniciar worker secuencial continuo (GPU NVIDIA RTX)
.\scripts\run_f5_worker.ps1

# Procesar solo 1 bloque de prueba
.\scripts\run_f5_worker.ps1 -Once
```

### 🐍 Backend (Python / uv)
```bash
cd backend
uv run ruff check .
uv run pytest
uv run uvicorn spaa.api.main:app --reload --port 8009
```

### ⚛️ Frontend (TypeScript / Bun)
```bash
cd frontend
bun run check
bun run dev
```

### 🧩 Extensión Chrome Auxiliar (TypeScript / Bun)
```bash
cd extension
bun run build
```
