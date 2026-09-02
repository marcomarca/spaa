# SPAA — Sistema Personal de Audiolibros y Aprendizaje

Sistema personal offline-first para conversión de material de estudio en Markdown a audiolibros de alta calidad con síntesis de voz supervisada (Gemini AI Studio, F5-TTS, Edge-TTS), gestión de aprendizaje con repetición espaciada FSRS y reproductor Android/PC.

## Estructura del Repositorio

- `backend/`: Servidor maestro en Python (FastAPI, SQLAlchemy, SQLite, FFmpeg) gestionado con `uv`.
- `frontend/`: Aplicación web y cliente offline para Android en React, TypeScript y Vite gestionado con `bun`.
- `extension/`: Extensión Manifest V3 para automatización de Gemini AI Studio en Chrome.
- `docs/`: Documentación de arquitectura, decisiones de diseño (ADRs) y estrategia de pruebas.
- `plan.md`: Especificación maestra congelada del sistema.

## Comandos Rápidos

### Backend (Python / uv)
```bash
cd backend
uv run ruff check .
uv run pytest
uv run uvicorn spaa.api.main:app --reload --port 8009
```

### Frontend (TypeScript / Bun)
```bash
cd frontend
bun run check
bun run dev
```

### Extensión Chrome (TypeScript / Bun)
```bash
cd extension
bun run build
```
