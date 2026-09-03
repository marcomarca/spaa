# SPAA — Sistema Personal de Audiolibros y Aprendizaje

Sistema personal *offline-first* para la transformación de material de estudio en Markdown a audiolibros estructurados de alta calidad con síntesis neuronal de voz en GPU local, seguimiento visual de síntesis en tiempo real, gestión de aprendizaje activo (repetición espaciada FSRS) y reproductor web/móvil.

---

## 1. Arquitectura del Sistema

El proyecto opera bajo una arquitectura limpia y desacoplada compuesta por los siguientes subsistemas:

```
SPAA Architecture Overview
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React + Vite)                       │
│  - Puerto: http://localhost:5180 (Evita colisiones con 5173)            │
│  - Monitor GPU en Vivo (Tarjetas, Matriz de micro-bloques, Logs live)   │
│  - Control del ciclo de vida del Worker (Iniciar / Detener GPU)         │
│  - Reproductor con sincronización de texto, Exámenes y Repetición FSRS  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Proxy /api
┌────────────────────────────────────▼────────────────────────────────────┐
│                           BACKEND (FastAPI / uv)                        │
│  - Puerto: http://localhost:8009 (Swagger: /docs)                       │
│  - Base de Datos: SQLite (data/spaa_master.sqlite)                      │
│  - Worker Manager: Controla el proceso de inferencia GPU independiente  │
│  - Pipeline de Audio: QA de silencios, normalización y ensamble FFmpeg  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Subprocess Popen (Sin Búfer)
┌────────────────────────────────────▼────────────────────────────────────┐
│                    MOTOR DE SÍNTESIS GPU (Qwen3-TTS 1.7B)               │
│  - Ubicación: qwen3tts/ (Python venv dedicado con CUDA)                 │
│  - Modelo: Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice                         │
│  - Voz: Ryan (Español, entonación enérgica y dinámica)                  │
│  - Granularidad: Micro-bloques de 90 a 110 palabras                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Decisiones Técnicas Clave & Correcciones Implementadas

Cualquier agente de IA o desarrollador que retome el proyecto debe conocer estas decisiones fundamentales:

### A. Granularidad de la Cola: Micro-Bloques (90–110 Palabras)
* **El Problema:** Los modelos neuronales de TTS autorregresivos (Qwen3-TTS, CosyVoice, Bark) saturan su ventana de atención y entran en alucinaciones o bucles si se les envían bloques extensos (>120 palabras). Además, procesar 900 palabras en un solo bloque bloqueaba la GPU durante casi 1 hora sin ofrecer visibilidad ni puntos de guardado intermedios.
* **La Solución:** [`MarkdownSegmenter`](backend/src/spaa/domain/segmentation.py) divide los textos en micro-bloques de **90 a 110 palabras** respetando oraciones y cláusulas sintácticas (`,`, `;`, `:`, `—`).
* **Beneficios:**
  1. Cada micro-bloque tarda solo **2.5 a 3.5 minutos** en una GPU RTX 3070 Mobile.
  2. En cuanto termina un micro-bloque, se valida con QA y se guarda inmediatamente en disco como `READY` (Verde ✓).
  3. Si la máquina se suspende, se reinicia o se detiene el worker, **solo se pierde como máximo el micro-bloque actual (3 minutos)**; todo el progreso previo queda intacto.
  4. **Unificación automática:** Cuando todos los micro-bloques de un capítulo están listos, [`AudioPipelineService`](backend/src/spaa/services/audio_pipeline_service.py) los ensambla automáticamente con FFmpeg en el archivo final `chapter_00X.mp3`.

### B. Streaming de Logs en Tiempo Real (Sin Búfer)
* En Windows, `subprocess.run(capture_output=True)` retenía la salida en un búfer en memoria hasta que el proceso finalizaba al 100%, ocultando el avance durante decenas de minutos.
* Se reemplazó por `subprocess.Popen(bufsize=1)` en [`QwenTTSEngine`](backend/src/spaa/adapters/qwen_tts_engine.py) y llamadas a `print(..., flush=True)` en [`cli_synthesize.py`](qwen3tts/cli_synthesize.py).
* Cada micro-pasada emite telemetría instantánea (`Iniciando micro-pasada X/Y...`, `Completada en Z segundos ✓`) directo a [`data/logs/qwen_worker.log`](data/logs/qwen_worker.log), visible en tiempo real en la pestaña **Monitor** del frontend.

### C. Control del Worker GPU desde la Interfaz
* Se implementó [`WorkerManager`](backend/src/spaa/services/worker_manager.py) con endpoints `/api/queue/worker/start`, `/stop` y `/status`.
* El usuario puede iniciar o detener la inferencia directamente con un clic en la interfaz. Al detener el worker, se liberan inmediatamente ~4.5 a 6.0 GB de VRAM en la GPU.

### D. Gestión y Auto-Resolución de Puertos
* **Regla estricta:** **Nunca usar el puerto 5173** (reservado para otras aplicaciones del sistema).
* **Puerto Frontend:** Fijado en **`5180`** (`frontend/vite.config.ts`).
* **Puerto Backend:** Fijado en **`8009`**.
* **Skill y Regla de Operación:** Registrados en [`.agents/skills/auto-port-resolution/SKILL.md`](.agents/skills/auto-port-resolution/SKILL.md) y [`.agents/rules/port_management.md`](.agents/rules/port_management.md).
* **Script Inteligente:** [`scripts/dev.ps1`](scripts/dev.ps1) contiene la función `Get-FreePort` para reasignar automáticamente los puertos si alguno se encuentra ocupado.

---

## 3. Estructura del Repositorio

```
SPAA/
├── .agents/                    # Customizaciones y directrices para agentes IA
│   ├── rules/                  # Reglas de comportamiento (ej. gestión de puertos)
│   └── skills/                 # Skills especializados (auto-port-resolution, mv3)
├── backend/                    # API FastAPI y lógica de dominio (Python 3.11+, uv)
│   ├── src/spaa/
│   │   ├── adapters/           # DB Models, SQLite, Qwen/F5 Engines
│   │   ├── api/routes/         # Endpoints (books, queue, audio, study, sync)
│   │   ├── domain/             # Lógica pura (segmentación, markdown cleaner, modelos)
│   │   ├── runners/            # Scripts de ejecución del worker
│   │   └── services/           # Pipeline de audio, worker manager, book service
│   └── tests/                  # Tests unitarios e integración (pytest)
├── frontend/                   # UI React + Vite + TypeScript (bun, Capacitor)
│   ├── src/
│   │   ├── features/           # MonitorView, Player, Library, Study, Workspace
│   │   ├── services/           # Cliente HTTP hacia la API
│   │   └── styles/             # CSS moderno (diseño dark premium, responsive)
│   └── vite.config.ts          # Configuración Vite en puerto 5180 con proxy /api
├── qwen3tts/                   # Entorno de inferencia Qwen3-TTS 1.7B
│   ├── cli_synthesize.py       # Interfaz CLI con streaming de logs
│   ├── qwen_custom_voice.py    # Motor de voz con corte a 90 palabras y soundfile
│   └── outputs/                # Audios temporales generados por la GPU
├── data/                       # Almacenamiento local (ignorado en git)
│   ├── logs/qwen_worker.log    # Log rotativo en tiempo real del worker GPU
│   └── spaa_master.sqlite      # Base de datos SQLite maestro
├── extension/                  # Extensión Manifest V3 para automatización auxiliar
├── scripts/
│   ├── dev.ps1                 # Script principal de inicio todo-en-uno
│   └── resegment_pending_chapters.py # Utilidad para migrar libros a micro-bloques
├── run.md                      # Manual operativo rápido para el usuario
├── AGENTS.md                   # Contrato de ingeniería para desarrolladores y agentes IA
└── README.md                   # Este documento
```

---

## 4. Guía de Ejecución Rápida

### Inicio de Todo el Entorno (Recomendado)
Ejecuta en PowerShell:
```powershell
.\scripts\dev.ps1
```
Este script:
1. Compila la extensión Chrome (`extension/dist`).
2. Verifica puertos libres y levanta el Backend en `http://localhost:8009`.
3. Levanta el Frontend en `http://localhost:5180`.

### Acceso a la Aplicación
1. Abre tu navegador en **`http://localhost:5180`**.
2. Dirígete a la pestaña **Monitor**.
3. Haz clic en **`[ ▶ Iniciar Síntesis GPU ]`** para iniciar el proceso de síntesis en segundo plano.
4. Observa cómo los micro-bloques cambian a **Verde (`Listo ✓`)** cada 2-3 minutos y visualiza los logs en directo.

---

## 5. Comandos de Calidad y Mantenimiento

### Backend (Python / uv)
```bash
cd backend
uv run ruff format .
uv run ruff check .
uv run pytest
```

### Frontend (TypeScript / Bun)
```bash
cd frontend
bun run format
bun run lint
bun run typecheck
bun run build
```

### Extensión Chrome (TypeScript / Bun)
```bash
cd extension
bun run build
```
