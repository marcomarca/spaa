# SPAA — Sistema Personal de Audiolibros y Aprendizaje

Transformación *offline-first* de libros Markdown en audiolibros estructurados con síntesis neuronal en GPU local, cliente móvil Android nativo y reproducción con pantalla apagada.

---

## 🚀 Inicio Rápido

### Iniciar Entorno Completo (PC y Red Local)
```powershell
.\scripts\dev.ps1
```
* **Frontend PC:** `http://localhost:5180`
* **Acceso Móvil (Wi-Fi):** `http://<TU_IP_LOCAL>:5180` *(la terminal muestra la IP detectada)*
* **Backend API / Swagger:** `http://localhost:8009/docs`

---

## 📱 Cliente Móvil Android

SPAA incluye integración nativa con Capacitor, soporte para reproducción con pantalla bloqueada (MediaSession API + WakeLock) y descargas offline atómicas con validación criptográfica SHA-256.

### Compilar el APK
```powershell
.\scripts\build_android_apk.ps1
```
* **Ubicación del instalador:**
  ```text
  frontend/android/app/build/outputs/apk/debug/app-debug.apk
  ```
* **Instalación vía USB (adb):**
  ```powershell
  adb install frontend\android\app\build\outputs\apk\debug\app-debug.apk
  ```
  *(O copia el archivo `app-debug.apk` directamente a tu teléfono para instalarlo).*

### Capacidades en Smartphone
* **Pantalla Apagada y Auriculares:** Notificación multimedia persistente en pantalla de bloqueo y barra de estado con controles de Play, Pausa, retroceso (-15s), avance (+30s) y soporte para botones Bluetooth.
* **Descargas 100% Offline:** Guarda capítulos o libros completos en la memoria del smartphone desde el reproductor o la biblioteca para escuchar en el transporte sin conexión.

---

## ⚙️ Arquitectura y Puertos

| Componente | Puerto / Ruta | Descripción |
| :--- | :--- | :--- |
| **Frontend** | `5180` (`0.0.0.0`) | React + Vite + TypeScript. Sin colisiones con el puerto 5173. |
| **Backend** | `8009` (`0.0.0.0`) | FastAPI + SQLite (`data/spaa_master.sqlite`). |
| **GPU Worker** | `qwen3tts/` | Inferencia neuronal local Qwen3-TTS 1.7B en micro-bloques (90–110 palabras). |
| **Android** | `frontend/android/` | Contenedor nativo Capacitor con permisos `FOREGROUND_SERVICE`. |

---

## 🛠️ Comandos de Calidad

### Frontend
```bash
cd frontend
bun run check     # Typecheck, Biome linter y Bun tests
bun run cap:sync  # Sincronizar assets web con Android
```

### Backend
```bash
cd backend
uv run ruff check .
uv run pytest
```
