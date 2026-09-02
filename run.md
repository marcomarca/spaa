# 🚀 Guía Rápida de Comandos — SPAA Project

Comandos de terminal más frecuentes para desarrollo, síntesis local de audiolibros, pruebas, linter, compilación y despliegue del ecosistema **SPAA**.

---

## 🎙️ 0. Síntesis Local de Audiolibros con F5-TTS (Prioridad Principal)

El motor principal y predeterminado de SPAA es **F5-TTS en Español** ejecutándose directamente en la GPU local (NVIDIA CUDA):

```powershell
# Iniciar worker secuencial continuo (procesa toda la cola hasta terminar)
.\scripts\run_f5_worker.ps1
```

```powershell
# Procesar un único bloque de prueba y finalizar
.\scripts\run_f5_worker.ps1 -Once
```

> **Características del Worker F5:**
> - ⚡ **Aceleración GPU:** Inferencia local ultrarrápida con PyTorch CUDA en NVIDIA GeForce RTX.
> - 🎭 **Clonación de Voz:** Perfil "Marco" con audio de referencia de alta fidelidad.
> - 🛡️ **Tolerancia a Fallos:** Puedes pausar (`Ctrl+C`) o apagar la PC en cualquier momento; el progreso se guarda en SQLite y reanuda sin pérdidas.
> - 📦 **Compilación Automática:** Concatena los bloques y compila el `.mp3` final de cada capítulo al completar su último bloque.

---

## ⚡ 1. Iniciar Aplicación (Backend + Frontend)

Para interactuar con la aplicación visual (reproductor de audiolibros, tarjetas de estudio FSRS y biblioteca):

```powershell
# Windows (PowerShell) - Desde la raíz del repositorio
.\scripts\dev.ps1
```

```bash
# Linux / macOS / Git Bash
./scripts/dev.sh
```

> **Servicios que levanta:**
> - 🐍 **Backend API:** `http://localhost:8009` (Swagger: `http://localhost:8009/docs`)
> - ⚛️ **Frontend Web/App:** `http://localhost:5173`
> - 🧩 **Extensión (Opcional):** Compila `extension/dist`

---

## 2. ⚙️ Inicio de Servicios por Separado

### 🎙️ Worker F5-TTS Local (GPU)
```powershell
.\scripts\run_f5_worker.ps1
```

### 🐍 Backend (FastAPI / uv)
Inicia el servidor API en `http://localhost:8009` con recarga automática:
```powershell
# Windows (PowerShell)
cd backend
$env:PYTHONPATH='src'; uv run uvicorn spaa.api.main:app --reload --port 8009
```
```bash
# Linux / macOS / Git Bash
cd backend
PYTHONPATH=src uv run uvicorn spaa.api.main:app --reload --port 8009
```
- **Documentación Swagger:** `http://localhost:8009/docs`
- **Health check:** `http://localhost:8009/health`

### ⚛️ Frontend (React + Vite / Bun)
Inicia el servidor web en `http://localhost:5173`:
```bash
cd frontend
bun run dev
```

### 🧩 Extensión de Chrome (Auxiliar Opcional)
Compila los scripts en TypeScript hacia la carpeta `extension/dist`:
```bash
cd extension
bun run build
```
- **Instalación:** Abre `chrome://extensions/` en Chrome, activa el *Modo de desarrollador*, haz clic en *Cargar descomprimida* y selecciona la carpeta [`extension/dist`](file:///d:/apps-2026/SPAA/extension/dist).

---

## 2. 🧪 Pruebas Automatizadas (Testing)

### Backend (Pytest)
```bash
cd backend

# Ejecutar toda la suite de tests
uv run pytest

# Ejecutar un test unitario específico con salida detallada
uv run pytest tests/unit/test_markdown_cleaner.py -vv

# Ejecutar tests de integración
uv run pytest tests/integration/ -v
```

### Frontend (Bun Test)
```bash
cd frontend
bun test
```

### 🛡️ Quality Gate Completo (Verificación integral)
Ejecuta linters, verificación de tipos y tests en todos los módulos:
```powershell
# Windows (PowerShell)
.\scripts\check.ps1
```
```bash
# Linux / macOS (Bash)
./scripts/check.sh
```

---

## 3. 🧹 Formato, Linters y Verificación de Tipos

### Backend (Ruff)
```bash
cd backend

# Verificar errores de linter
uv run ruff check .

# Corregir errores y ordenar imports automáticamente
uv run ruff check --fix .

# Formatear código
uv run ruff format .
```

### Frontend (Biome & TypeScript)
```bash
cd frontend

# Verificar tipos TypeScript
bun run typecheck

# Verificar linter con Biome
bun run lint

# Formatear archivos con Biome
bun run format

# Ejecutar verificación completa (types + lint + tests)
bun run check
```

### Extensión de Chrome
```bash
cd extension
bun run typecheck
```

---

## 4. 📚 Utilidades de Importación y Datos

### Importar Libro Markdown al Backend
Importa un archivo `.md` directo a la base de datos dividiéndolo en capítulos y bloques:
```bash
# Desde la raíz del repositorio
cd backend
uv run python ../scripts/import_book.py "../data/ejemplo.md" --title "Mi Libro" --author "Nombre Autor" --language es
```

---

## 5. 📱 Empaquetado Móvil (Capacitor / Android)

```bash
cd frontend

# 1. Compilar bundle web de producción
bun run build

# 2. Sincronizar assets con el proyecto nativo Android
bunx cap sync android

# 3. Abrir proyecto nativo en Android Studio
bunx cap open android
```

---

## 6. 🔍 Diagnóstico Rápido de la Extensión

1. Abre [Google AI Studio](https://aistudio.google.com/).
2. Haz clic en el icono de la extensión **SPAA Gemini AI Studio TTS Worker**.
3. Presiona **`📋 Copiar Reporte y Diagnóstico para Depuración`**.
4. Pega el contenido en la consola o chat de desarrollo para inspeccionar el estado del DOM y los selectores.
