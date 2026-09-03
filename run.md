# 🚀 Guía de Inicio Rápido — SPAA

Ahora todo el sistema se inicia con **un único comando** y la generación de audios en GPU se controla directamente desde la interfaz web.

---

## ⚡ Inicio en 1 Solo Paso

Abre tu terminal en la raíz del proyecto (`SPAA`) y ejecuta:

```powershell
.\scripts\dev.ps1
```

Esto compilará la extensión y levantará tanto la API (`http://localhost:8009`) como la aplicación web (`http://localhost:5180`).

---

## 2. Acceso a la Interfaz Web y Control GPU

1. Abre tu navegador en **http://localhost:5180**.

2. Haz clic en la pestaña **Monitor** en la barra inferior.
3. En la tarjeta de tu tarjeta gráfica (**NVIDIA RTX 3070 Qwen3-TTS**):
   * Haz clic en **[ ▶ Iniciar Síntesis GPU ]** para comenzar a convertir los bloques a voz.
   * Haz clic en **[ ⏸ Detener Síntesis (Liberar VRAM) ]** cuando quieras pausar y liberar los ~4.5 GB de memoria gráfica al instante.
4. En esa misma pantalla podrás ver:
   * Los bloques iluminándose en **azul ⚡** mientras se procesan y en **verde ✓** al quedar listos.
   * La **Consola de Logs** en vivo con tiempos exactos, factor RTF y métricas.

---

## 🛠️ Modos Avanzados (Opcional)

Si deseas ejecutar el worker en una terminal independiente dedicada:
```bat
.\run_qwen_worker.bat
```
* **Protector térmico activo:** Pausa automáticamente si la GPU supera 70°C y reanuda al enfriarse a 58°C.
* **Seguridad:** Puedes detenerlo (`Ctrl+C`) en cualquier momento; reanudará donde se quedó.

---

## 🧪 Pruebas de Calidad

```powershell
# Backend (Python / uv)
cd backend
uv run pytest
uv run ruff check .

# Frontend (TypeScript / Bun)
cd frontend
bun run check
bun test
bun run build
```
