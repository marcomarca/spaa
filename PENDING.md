# SPAA — Especificación de Tareas Pendientes y Roadmap

> Este documento extrae y detalla **todas las tareas pendientes de `plan.md`** con especificaciones técnicas completas, contratos de entrada/salida y criterios de aceptación, de modo que cualquier agente o desarrollador pueda ejecutarlas directamente sin consultar el documento maestro.

---

## Estado Actual del Repositorio (Completado en MVP)
* **Backend:** Clean Architecture en Python 3.11+ (`uv`), FastAPI, SQLite (SQLAlchemy), segmentación determinista $\le 950$ palabras, cola de jobs con leases y reintentos, validación QA y ensamblado MP3 (FFmpeg `loudnorm`, mono 96 kbps, 44.1 kHz), endpoints de sync y FSRS. 13 tests pasando.
* **Frontend:** React + TypeScript + Vite (`bun`), interfaz de Modo Transporte, catálogo de biblioteca, AI Workspace con 8 plantillas de prompts, gestión de Cheatsheets con `user_version` obligatoria y persistencia local offline. Tests y build exitosos.
* **Extensión Chrome:** Andamiaje Manifest V3, aislamiento del DOM en `aistudio-adapter.ts`, cliente HTTP y service worker.
* **Gobernanza:** Licencia MIT, CI en GitHub Actions, scripts de verificación y CLI de importación.

---

## 1. Extensión Chrome: Calibración y Flujo Completo (Iteraciones G1–G9)

### Objetivo
Automatizar la generación de audio en Gemini AI Studio de forma supervisada, resiliente y multi-perfil.

### Tareas Detalladas

#### 1.1 Calibración de Selectores DOM en AI Studio (`src/aistudio-adapter.ts`)
* **Contexto:** URL objetivo `https://aistudio.google.com/live` (o vista Generate Speech).
* **Acciones:**
  1. Calibrar selector del campo de texto (textarea con `role="textbox"` o placeholder relacionado).
  2. Confirmar selección de modelo `gemini-2.5-pro-preview-tts`.
  3. Confirmar selector de voz (ej. voz `Puck` o configurable por perfil).
  4. Selector del botón `Generate` / `Run` y detección de estado ocupado (`aria-busy="true"` o spinners).
  5. Selector del botón `Download` de audio WAV.
* **Criterio de Aceptación:** Inserción de texto, clic de generación y detección de fin de síntesis sin fallos en 10 ejecuciones consecutivas.

#### 1.2 Captura y Subida Automática del WAV Descargado
* **Contexto:** Al pulsar `Download`, Chrome descarga un archivo `.wav` temporal.
* **Acciones:**
  1. En `src/service-worker.ts`, escuchar `chrome.downloads.onChanged`.
  2. Detectar cuando la descarga del WAV del job actual finalice (`state === "complete"`).
  3. Obtener el archivo y enviarlo mediante `POST /api/queue/upload-wav/{job_id}` como `multipart/form-data` con campo `worker_id`.
  4. Si la respuesta del backend indica `success: true`, marcar el worker como `READY` y solicitar el siguiente job (`claimNextJob`).
  5. Si falla el QA en el backend, registrar el error y solicitar el siguiente trabajo disponible.
* **Criterio de Aceptación:** Flujo end-to-end desatendido: `claim` $\rightarrow$ `inject` $\rightarrow$ `generate` $\rightarrow$ `download` $\rightarrow$ `upload` $\rightarrow$ `MP3 generado`.

#### 1.3 Resiliencia y Captura de Errores (G7)
* **Acciones:**
  1. Si un botón o elemento no se encuentra tras 15 segundos, o la sesión de Google expira:
     - Enviar `POST /api/queue/report` con `status="ERROR"` y mensaje descriptivo.
     - El backend pasa el job a `RETRY_WAIT` (reintentos a los 5 min y 30 min).
  2. Si el navegador o pestaña se cierra, el lease de 5 minutos expira en el backend y el job regresa automáticamente a `QUEUED`.
* **Criterio de Aceptación:** Cero jobs en estado bloqueado o "fantasma" tras cierres forzados del navegador.

#### 1.4 Configuración Multi-Perfil (G9 - Hasta 3 Workers)
* **Acciones:**
  1. Crear scripts/accesos directos para 3 perfiles de Chrome:
     - Perfil A (`worker-a`, alias `Perfil 1`)
     - Perfil B (`worker-b`, alias `Perfil 2`)
     - Perfil C (`worker-c`, alias `Perfil 3`)
  2. Cada extensión lee su identificador desde `chrome.storage.local` o configuración de popup.
* **Criterio de Aceptación:** 3 perfiles generando simultáneamente chunks distintos de la misma cola sin colisiones.

---

## 2. Etapa 2: Proveedores Fallback y Buffer Inteligente (§43, §45, §50, §75)

### Objetivo
Garantizar síntesis local cuando no haya conexión o cuando el buffer offline caiga en niveles críticos.

### Tareas Detalladas

#### 2.1 Proveedor F5-TTS Local (`backend/src/spaa/adapters/tts_providers.py`)
* **Contexto:** Síntesis local mediante PyTorch en la GPU NVIDIA RTX 3070 (8 GB).
* **Acciones:**
  1. Implementar `F5TTSProvider.synthesize(request, output_wav)`.
  2. Cargar modelo F5-TTS local y la muestra de voz limpia de ~15 segundos del usuario.
  3. Guardar el WAV resultante en `data/temporary/{chunk_id}.wav` y pasarlo por `AudioPipelineService`.
* **Criterio de Aceptación:** Generación exitosa de audio WAV local con QA pasado y ensamblado a MP3.

#### 2.2 Proveedor Edge-TTS Fallback
* **Contexto:** Síntesis ligera de emergencia.
* **Acciones:**
  1. Integrar librería `edge-tts` en `backend`.
  2. Implementar `EdgeTTSProvider.synthesize(request, output_wav)` con voces neuronales en español (`es-ES-AlvaroNeural` / `es-ES-ElviraNeural`) e inglés.
* **Criterio de Aceptación:** Fallback automático en caso de indisponibilidad de Gemini y F5.

#### 2.3 Política Dinámica de Buffer (§43)
* **Reglas:**
  * **Buffer $> 8$ horas:** Priorizar calidad máxima $\rightarrow$ Solo Gemini AI Studio.
  * **Buffer entre 4 y 8 horas:** Gemini $\rightarrow$ Fallback a F5-TTS.
  * **Buffer $< 4$ horas (Crítico):** Gemini $\rightarrow$ F5-TTS $\rightarrow$ Edge-TTS.

#### 2.4 QA de Cobertura con Whisper Local (§50 - Opcional)
* **Acciones:**
  1. Transcribir el WAV generado con Whisper en GPU.
  2. Comparar similitud textual difusa (Levenshtein / ratio) frente a `spoken_text`.
  3. Rechazar audio si falta más del 10% del texto (cortes al inicio o final).

---

## 3. Android Nativo vía Capacitor (§5, §52, §55, §56, §66)

### Objetivo
Empaquetar la aplicación web como cliente Android 100% offline con reproducción en segundo plano y persistencia local.

### Tareas Detalladas

#### 3.1 Inicialización de Capacitor en `frontend/`
* **Acciones:**
  1. Ejecutar en `frontend/`:
     ```bash
     bun add @capacitor/core @capacitor/android @capacitor-community/sqlite
     bun add -d @capacitor/cli
     bunx cap init SPAA com.spaa.app --web-dir dist
     bunx cap add android
     ```
  2. Configurar permisos en `AndroidManifest.xml`:
     * `android.permission.INTERNET`
     * `android.permission.ACCESS_NETWORK_STATE`
     * `android.permission.FOREGROUND_SERVICE`
     * `android.permission.WAKE_LOCK`

#### 3.2 Servicio de Reproducción en Segundo Plano (Media3 / Foreground Service)
* **Acciones:**
  1. Implementar un servicio nativo o plugin Capacitor para Android Media3.
  2. Mantener la reproducción activa con pantalla bloqueada y app minimizada.
  3. Integrar controles estándar de notificación multimedia y Bluetooth (Play/Pause, retroceso 15s, avance 30s).
* **Criterio de Aceptación:** 4 horas continuas de reproducción con pantalla apagada sin interrupción por el sistema operativo.

#### 3.3 Sincronización y Descargas Atómicas en Android (§62)
* **Acciones:**
  1. Cliente de descarga en segundo plano que descarga capítulos listos (`/api/audio/chapter/{id}`).
  2. Guardar inicialmente como `chapter_{seq}.mp3.part`.
  3. Calcular SHA-256 local y comparar con cabecera `X-Audio-SHA256`.
  4. Renombrar atómicamente a `chapter_{seq}.mp3`.
* **Criterio de Aceptación:** Ningún archivo corrupto o descarga a medias visible en la biblioteca del reproductor.

#### 3.4 Recolección de Basura (Garbage Collection de Almacenamiento §56)
* **Regla de Borrado:**
  * Si el almacenamiento de la app supera ~8 GB:
    1. Borrar archivos de audio MP3 locales de capítulos ya escuchados (`is_completed = true`) cuyo progreso ya esté sincronizado con el PC y no estén marcados como favoritos.
    2. Orden de eliminación: más antiguos primero.
  * **Prohibición estricta:** NUNCA borrar cheatsheets, notas, respuestas ni eventos FSRS no sincronizados.

---

## 4. Conectividad Inteligente LAN + Tailscale (§58, §59)

### Objetivo
Sincronización transparente y automática sin intervención manual.

### Tareas Detalladas
* **Acciones:**
  1. En el cliente frontend/Android, configurar dos URLs de backend:
     * Primaria: IP LAN local (ej. `http://192.168.1.X:8000`).
     * Secundaria: IP Tailscale (ej. `http://100.X.Y.Z:8000`).
  2. Estrategia de sondeo:
     * Intentar ping rápido a LAN (timeout 1.5s).
     * Si falla, intentar Tailscale (timeout 2.5s).
     * Si ambas fallan, cambiar estado a `OFFLINE` sin mostrar alertas intrusivas.
  3. Cuando se detecta conexión:
     * Vaciar cola de eventos pendientes (`SyncEvent`) mediante `POST /api/sync/events`.
     * Consultar `/api/audio/offline-manifest` y descargar nuevos capítulos hasta alcanzar el buffer objetivo (14 horas).

---

## 5. Exámenes, Preguntas y Evaluación con ChatGPT (§15–§17, §76)

### Objetivo
Permitir responder preguntas en el transporte y evaluar las respuestas al volver a casa mediante el AI Workspace manual.

### Tareas Detalladas
* **Acciones:**
  1. Modelo de datos `Question` (Feynman, Why-chain, Aplicación, Contraste, Contraejemplo) y `Answer` en SQLite.
  2. Vista en frontend para responder preguntas en texto durante el trayecto (estados: `ANSWERED` $\rightarrow$ `PENDING_REVIEW` $\rightarrow$ `REVIEWED`).
  3. En `AI Workspace` de PC:
     * Botón `[Copiar para evaluar en ChatGPT]`: Genera el prompt con la pregunta + texto fuente + respuesta del usuario + rúbrica.
     * Cuadro para pegar la evaluación recibida (score, puntos correctos, puntos faltantes, misconceptions).
     * Actualización opcional de la calificación FSRS.

---

## 6. Backups Programados (§67)

### Objetivo
Proteger datos irreemplazables (base de datos SQLite, cheatsheets, notas, respuestas, tarjetas FSRS).

### Tareas Detalladas
* **Acciones:**
  1. Script en `scripts/backup.py` que crea copias de seguridad fechadas de `data/spaa_master.sqlite` en `data/backups/`.
  2. Política de retención: 7 backups diarios y 4 semanales.
  3. Los archivos de audio MP3/WAV no se incluyen en el backup (se pueden regenerar).

---

## Resumen de Prioridades de Ejecución

```text
Prioridad 1: Extensión Chrome en vivo (G1-G6) -> Validar flujo automático completo con Gemini AI Studio.
Prioridad 2: Capacitor Android -> Empaquetado APK y servicio Media3 en segundo plano.
Prioridad 3: Conectividad LAN/Tailscale automática y descargas atómicas en móvil.
Prioridad 4: Integración F5-TTS / Edge-TTS en backend (Etapa 2).
Prioridad 5: Sistema de preguntas y evaluación de exámenes (Etapa 3).
```
