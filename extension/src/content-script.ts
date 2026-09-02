import { AIStudioAdapter } from "./aistudio-adapter";

// Live Floating HUD Logger
let hudElement: HTMLElement | null = null;
const hudLogs: string[] = [];

function getOrCreateHUD(): HTMLElement {
  if (hudElement && document.body.contains(hudElement)) return hudElement;

  hudElement = document.createElement("div");
  hudElement.id = "spaa-worker-live-hud";

  // Position from localStorage or default top-right to never block Run button
  const savedLeft = localStorage.getItem("spaa_hud_left");
  const savedTop = localStorage.getItem("spaa_hud_top");
  const isSavedMin = localStorage.getItem("spaa_hud_minimized") === "true";

  hudElement.style.cssText = `
    position: fixed;
    ${savedLeft ? `left: ${savedLeft}px;` : "right: 24px;"}
    ${savedTop ? `top: ${savedTop}px;` : "top: 24px;"}
    width: 360px;
    max-width: 92vw;
    background: rgba(15, 23, 42, 0.96);
    backdrop-filter: blur(12px);
    border: 1px solid #38bdf8;
    border-radius: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.25);
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    z-index: 9999999;
    padding: 12px 14px;
    box-sizing: border-box;
    user-select: none;
    transition: box-shadow 0.2s ease;
  `;

  hudElement.innerHTML = `
    <div id="spaa-hud-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #334155; padding-bottom:6px; cursor:grab;">
      <div style="font-weight:700; color:#38bdf8; display:flex; align-items:center; gap:6px; pointer-events:none;">
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#22c55e;" id="spaa-hud-dot"></span>
        <span id="spaa-hud-title">SPAA TTS Worker Live</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <button id="spaa-hud-power" type="button" style="background:#ef4444; border:none; border-radius:4px; color:#ffffff; cursor:pointer; font-size:11px; font-weight:700; padding:2px 8px; display:flex; align-items:center; gap:3px;">
          ⏻ Apagar
        </button>
        <span style="font-size:11px; color:#64748b; cursor:grab;" title="Arrastra desde aquí">⋮⋮ Mover</span>
        <button id="spaa-hud-toggle" type="button" style="background:#1e293b; border:1px solid #475569; border-radius:4px; color:#cbd5e1; cursor:pointer; font-size:11px; padding:2px 8px;">
          ${isSavedMin ? "Expandir" : "Minimizar"}
        </button>
      </div>
    </div>
    <div id="spaa-hud-body">
      <div id="spaa-hud-status" style="font-weight:600; color:#facc15; margin-bottom:4px; font-size:12px;">
        🟢 IDLE (Esperando Tareas)
      </div>
      <div id="spaa-hud-details" style="font-size:11px; color:#94a3b8; margin-bottom:8px;">
        Servidor: Conectado | AI Studio: Listo
      </div>
      <div id="spaa-hud-logbox" style="background:#020617; border-radius:6px; padding:8px; font-family:monospace; font-size:10.5px; max-height:110px; overflow-y:auto; color:#cbd5e1; border:1px solid #1e293b; user-select:text;">
        <div style="color:#64748b;">[Iniciando] Monitor en vivo activado...</div>
      </div>
    </div>
  `;

  document.body.appendChild(hudElement);

  // Setup Dragging
  const header = hudElement.querySelector("#spaa-hud-header") as HTMLElement;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  header.onmousedown = (e) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    isDragging = true;
    header.style.cursor = "grabbing";
    startX = e.clientX;
    startY = e.clientY;
    const rect = hudElement!.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    hudElement!.style.right = "auto";
    hudElement!.style.bottom = "auto";
    hudElement!.style.left = `${initialLeft}px`;
    hudElement!.style.top = `${initialTop}px`;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const newLeft = Math.max(10, Math.min(window.innerWidth - hudElement!.offsetWidth - 10, initialLeft + dx));
      const newTop = Math.max(10, Math.min(window.innerHeight - hudElement!.offsetHeight - 10, initialTop + dy));
      hudElement!.style.left = `${newLeft}px`;
      hudElement!.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      header.style.cursor = "grab";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      localStorage.setItem("spaa_hud_left", String(parseInt(hudElement!.style.left, 10)));
      localStorage.setItem("spaa_hud_top", String(parseInt(hudElement!.style.top, 10)));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Setup Toggle Minimize
  const toggleBtn = hudElement.querySelector("#spaa-hud-toggle") as HTMLButtonElement;
  const hudBody = hudElement.querySelector("#spaa-hud-body") as HTMLElement;

  const applyMinimize = (min: boolean) => {
    if (min) {
      hudBody.style.display = "none";
      hudElement!.style.width = "auto";
      hudElement!.style.padding = "6px 12px";
      toggleBtn.innerText = "Expandir";
    } else {
      hudBody.style.display = "block";
      hudElement!.style.width = "360px";
      hudElement!.style.padding = "12px 14px";
      toggleBtn.innerText = "Minimizar";
    }
  };

  if (isSavedMin) {
    applyMinimize(true);
  }

  let minimized = isSavedMin;
  toggleBtn.onclick = (e) => {
    e.stopPropagation();
    minimized = !minimized;
    localStorage.setItem("spaa_hud_minimized", String(minimized));
    applyMinimize(minimized);
  };

  // Setup Power Button (ON / OFF)
  const powerBtn = hudElement.querySelector("#spaa-hud-power") as HTMLButtonElement;
  let hudPaused = false;

  const applyPowerUI = (paused: boolean) => {
    hudPaused = paused;
    if (powerBtn) {
      if (paused) {
        powerBtn.style.background = "#10b981";
        powerBtn.innerText = "⏻ Activar";
        updateHUD("⚫ EXTENSIÓN APAGADA", "Automatización en pausa", "Worker detenido por el usuario.", "#64748b");
      } else {
        powerBtn.style.background = "#ef4444";
        powerBtn.innerText = "⏻ Apagar";
      }
    }
  };

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.get(["isPaused"], (res) => {
      if (typeof res.isPaused === "boolean") {
        applyPowerUI(res.isPaused);
      }
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.isPaused) {
        applyPowerUI(changes.isPaused.newValue);
      }
    });
  }

  powerBtn.onclick = (e) => {
    e.stopPropagation();
    const newPaused = !hudPaused;
    applyPowerUI(newPaused);
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: "SET_PAUSED", paused: newPaused });
    }
  };

  return hudElement;
}

function updateHUD(statusText: string, detailsText?: string, logMsg?: string, dotColor = "#22c55e") {
  try {
    const hud = getOrCreateHUD();
    const statusEl = hud.querySelector("#spaa-hud-status") as HTMLElement;
    const detailsEl = hud.querySelector("#spaa-hud-details") as HTMLElement;
    const dotEl = hud.querySelector("#spaa-hud-dot") as HTMLElement;
    const logbox = hud.querySelector("#spaa-hud-logbox") as HTMLElement;
    const titleEl = hud.querySelector("#spaa-hud-title") as HTMLElement;

    if (statusEl) statusEl.innerText = statusText;
    if (detailsEl && detailsText) detailsEl.innerText = detailsText;
    if (dotEl) dotEl.style.background = dotColor;
    if (titleEl) {
      const cleanStatus = statusText.replace(/^[🟢🟡⚡📥☁️🔴🟣\s]+/, "");
      titleEl.innerText = `SPAA: ${cleanStatus.slice(0, 24)}`;
    }

    if (logMsg) {
      const time = new Date().toLocaleTimeString();
      hudLogs.push(`[${time}] ${logMsg}`);
      if (hudLogs.length > 30) hudLogs.shift();
      if (logbox) {
        logbox.innerHTML = hudLogs.map((l) => `<div style="margin-bottom:3px; line-height:1.3;">${l}</div>`).join("");
        logbox.scrollTop = logbox.scrollHeight;
      }
    }
  } catch {
    // Ignore HUD render errors
  }
}

// DevTools and Console Interceptor
export interface PageLogEntry {
  timestamp: string;
  level: "log" | "info" | "warn" | "error";
  message: string;
  source?: string;
}

const pageLogs: PageLogEntry[] = [];
const MAX_PAGE_LOGS = 150;

function recordLog(level: "log" | "info" | "warn" | "error", args: any[], source = "content-script") {
  try {
    const formatted = args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ""}`;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(" ");

    pageLogs.push({
      timestamp: new Date().toISOString(),
      level,
      message: formatted,
      source,
    });
    if (pageLogs.length > MAX_PAGE_LOGS) pageLogs.shift();
  } catch {
    // Ignore formatting errors
  }
}

// Hook console
const origLog = console.log.bind(console);
const origInfo = console.info.bind(console);
const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);

console.log = (...args: any[]) => {
  recordLog("log", args);
  origLog(...args);
};
console.info = (...args: any[]) => {
  recordLog("info", args);
  origInfo(...args);
};
console.warn = (...args: any[]) => {
  recordLog("warn", args);
  origWarn(...args);
};
console.error = (...args: any[]) => {
  recordLog("error", args);
  origError(...args);
};

// Window unhandled errors and rejections
window.addEventListener("error", (event) => {
  recordLog("error", [`[Window Error] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, event.error], "window");
});

window.addEventListener("unhandledrejection", (event) => {
  recordLog("error", [`[Unhandled Promise Rejection] ${event.reason?.message || event.reason}`], "window");
});

if (!(window as any).__SPAA_CONTENT_SCRIPT_INITIALIZED__) {
  (window as any).__SPAA_CONTENT_SCRIPT_INITIALIZED__ = true;

  // Initialize HUD & Auto-Open Speech Editor
  setTimeout(() => {
    if (AIStudioAdapter.isAIStudioPage()) {
      getOrCreateHUD();
      AIStudioAdapter.ensureSpeechEditorInitialized();
      updateHUD("🟢 LISTO / IDLE", "Pestaña AI Studio conectada", "Extensión iniciada en pestaña AI Studio");
    }
  }, 500);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      // 1. Diagnostics
      if (message.type === "TEST_DIAGNOSE") {
        const diag = AIStudioAdapter.diagnoseDOM();
        sendResponse(diag);
        return true;
      }

      // 1.1 Detailed Debug Report
      if (message.type === "GET_DETAILED_DEBUG_REPORT") {
        const report = AIStudioAdapter.getDetailedDebugReport();
        sendResponse({
          ...report,
          pageLogs,
        });
        return true;
      }

      // 2. Visual Highlighter
      if (message.type === "TEST_HIGHLIGHT_ALL") {
        AIStudioAdapter.highlightElement(AIStudioAdapter.findTextInput(), "Prompt Textarea", "#38bdf8");
        AIStudioAdapter.highlightElement(AIStudioAdapter.findSceneInput(), "Scene", "#a855f7");
        AIStudioAdapter.highlightElement(AIStudioAdapter.findSampleContextInput(), "Context", "#ec4899");
        AIStudioAdapter.highlightElement(AIStudioAdapter.findRunButton(), "Run Button", "#10b981");
        AIStudioAdapter.highlightElement(AIStudioAdapter.findModelSelector(), "Model Selector", "#eab308");
        AIStudioAdapter.highlightElement(AIStudioAdapter.findVoiceSelector(), "Voice Selector", "#f97316");
        sendResponse({ success: true });
        return true;
      }

      // 3. Highlight specific target
      if (message.type === "TEST_PING_ELEMENT") {
        const target = message.target;
        let el: HTMLElement | null = null;
        let label = target;
        let color = "#38bdf8";

        if (target === "prompt") {
          el = AIStudioAdapter.findTextInput();
          label = "Prompt Textarea";
        } else if (target === "scene") {
          el = AIStudioAdapter.findSceneInput();
          label = "Scene Input";
          color = "#a855f7";
        } else if (target === "context") {
          el = AIStudioAdapter.findSampleContextInput();
          label = "Sample Context Input";
          color = "#ec4899";
        } else if (target === "run") {
          el = AIStudioAdapter.findRunButton();
          label = "Run Button";
          color = "#10b981";
        } else if (target === "model") {
          el = AIStudioAdapter.findModelSelector();
          label = "Model Selector";
          color = "#eab308";
        } else if (target === "voice") {
          el = AIStudioAdapter.findVoiceSelector();
          label = "Voice Selector";
          color = "#f97316";
        } else if (target === "player") {
          el = document.querySelector("ms-music-player");
          label = "Music Player";
          color = "#06b6d4";
        }

        if (el) {
          AIStudioAdapter.highlightElement(el, label, color);
          sendResponse({ success: true, matched: true });
        } else {
          sendResponse({ success: false, matched: false, error: `Element '${target}' not found in DOM` });
        }
        return true;
      }

      // 4. Mode toggle
      if (message.type === "TEST_TOGGLE_MODE") {
        const newMode = AIStudioAdapter.toggleMode(message.mode);
        sendResponse({ success: true, mode: newMode });
        return true;
      }

      // 5. Injections
      if (message.type === "TEST_SET_PROMPT") {
        const text = message.text || "Hola, esta es una prueba en caliente del pipeline de audio de SPAA.";
        const input = AIStudioAdapter.findTextInput();
        if (!input) {
          sendResponse({ success: false, error: "Textarea 'Enter a prompt' no encontrado" });
          return true;
        }
        const ok = AIStudioAdapter.setPromptText(input, text);
        AIStudioAdapter.highlightElement(input, "Texto Inyectado", "#38bdf8");
        sendResponse({ success: ok, length: text.length, value: input.value });
        return true;
      }

      if (message.type === "TEST_SET_SCENE") {
        const text = message.text || "[enérgico, profesional] Grabación de audiolibro técnico.";
        const input = AIStudioAdapter.findSceneInput();
        if (!input) {
          sendResponse({ success: false, error: "Textarea 'Scene' no encontrado" });
          return true;
        }
        const ok = AIStudioAdapter.setPromptText(input, text);
        AIStudioAdapter.highlightElement(input, "Escena Inyectada", "#a855f7");
        sendResponse({ success: ok, length: text.length, value: input.value });
        return true;
      }

      if (message.type === "TEST_SET_CONTEXT") {
        const text = message.text || "El narrador comienza a explicar el siguiente capítulo.";
        const input = AIStudioAdapter.findSampleContextInput();
        if (!input) {
          sendResponse({ success: false, error: "Textarea 'Sample Context' no encontrado" });
          return true;
        }
        const ok = AIStudioAdapter.setPromptText(input, text);
        AIStudioAdapter.highlightElement(input, "Contexto Inyectado", "#ec4899");
        sendResponse({ success: ok, length: text.length, value: input.value });
        return true;
      }

      // 6. Action Triggers
      if (message.type === "TEST_CLICK_RUN") {
        const ok = AIStudioAdapter.clickRun();
        sendResponse({ success: ok });
        return true;
      }

      // 7. Audio Extraction
      if (message.type === "TEST_EXTRACT_AUDIO") {
        const audioSrc = AIStudioAdapter.getGeneratedAudioSrc();
        if (!audioSrc) {
          sendResponse({ success: false, hasAudio: false, error: "No hay audio generado en el reproductor" });
          return true;
        }

        if (audioSrc.startsWith("data:audio")) {
          const base64 = extractBase64FromDataUrl(audioSrc);
          sendResponse({
            success: true,
            hasAudio: true,
            type: "data-url",
            base64_audio: base64,
            length: base64.length,
          });
          return true;
        }

        // Fetch Blob
        fetch(audioSrc)
          .then((res) => res.blob())
          .then(async (blob) => {
            const buffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            sendResponse({
              success: true,
              hasAudio: true,
              type: "blob-url",
              base64_audio: base64,
              size_bytes: blob.size,
            });
          })
          .catch((err) => {
            sendResponse({ success: false, error: String(err) });
          });
        return true;
      }

      // 8. Regular Production Automation Execution
      if (message.type === "CHECK_PAGE_READY") {
        AIStudioAdapter.ensureSpeechEditorInitialized();
        AIStudioAdapter.ensureTextMode();
        const isReady =
          AIStudioAdapter.isAIStudioPage() &&
          (AIStudioAdapter.findTextInput() !== null || AIStudioAdapter.ensureSpeechEditorInitialized());
        const model = AIStudioAdapter.getSelectedModel();
        const voice = AIStudioAdapter.getSelectedVoice();
        sendResponse({ ready: isReady, model, voice });
        return true;
      }

      if (message.type === "EXECUTE_TTS_JOB") {
        const { job } = message;
        executeJob(job)
          .then((result) => sendResponse(result))
          .catch((err) => sendResponse({ success: false, error: String(err) }));
        return true;
      }
    } catch (err: any) {
      console.error("[SPAA Content Script] Error handling message:", err);
      sendResponse({ success: false, error: err?.message || String(err) });
      return true;
    }
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractBase64FromDataUrl(dataUrl: string): string {
  const parts = dataUrl.split(",");
  return parts.length > 1 ? parts[1] : dataUrl;
}

async function executeJob(job: {
  job_id: string;
  chunk_id: string;
  chapter_title?: string;
  chapter_sequence?: number;
  sequence: number;
  total_chunks?: number;
  spoken_text: string;
  scene?: string;
  sample_context?: string;
}) {
  const shortId = job.job_id.slice(0, 8);
  const chapterNum = job.chapter_sequence || 1;
  const chunkSeq = job.sequence || 1;
  const totalChunks = job.total_chunks || 1;
  const headerTag = `Cap. ${chapterNum} • Bloque ${chunkSeq}/${totalChunks}`;
  const wordCount = job.spoken_text.split(/\s+/).filter(Boolean).length;

  console.log(`[SPAA Content Script] Starting TTS generation for ${headerTag} (Job #${shortId})...`);
  updateHUD("🟡 PREPARANDO JOB", headerTag, `Iniciando síntesis (${wordCount} palabras)...`, "#f59e0b");

  // 1. Auto-open Speech Editor if in landing/template state
  AIStudioAdapter.ensureSpeechEditorInitialized();
  await sleep(350);

  // 2. If currently generating from a previous action, wait for it to settle
  let waitGen = 0;
  while (AIStudioAdapter.isGenerating() && waitGen < 30) {
    updateHUD("⏳ ESPERANDO SÍNTESIS PREVIA", headerTag, "Esperando que AI Studio termine la generación anterior...", "#f59e0b");
    await sleep(1000);
    waitGen++;
  }

  // 3. Dismiss any existing error toast/banner
  AIStudioAdapter.dismissErrorBanners();
  await sleep(200);

  AIStudioAdapter.ensureSpeechEditorInitialized();
  AIStudioAdapter.ensureTextMode();
  await sleep(250);

  let input = AIStudioAdapter.findTextInput();
  let retries = 0;
  while (!input && retries < 12) {
    AIStudioAdapter.ensureSpeechEditorInitialized();
    AIStudioAdapter.ensureTextMode();
    await sleep(400);
    input = AIStudioAdapter.findTextInput();
    retries++;
  }

  if (!input) {
    updateHUD("🔴 ERROR DOM", headerTag, "Campo 'Enter a prompt' no encontrado", "#ef4444");
    return { success: false, error: "Campo de texto 'Enter a prompt' no encontrado en AI Studio" };
  }

  // Optional Scene / Context injection if present
  if (job.scene) {
    const sceneInput = AIStudioAdapter.findSceneInput();
    if (sceneInput) {
      AIStudioAdapter.setPromptText(sceneInput, job.scene);
      AIStudioAdapter.highlightElement(sceneInput, "Escena SPAA", "#a855f7");
    }
  }

  if (job.sample_context) {
    const ctxInput = AIStudioAdapter.findSampleContextInput();
    if (ctxInput) {
      AIStudioAdapter.setPromptText(ctxInput, job.sample_context);
      AIStudioAdapter.highlightElement(ctxInput, "Contexto SPAA", "#ec4899");
    }
  }

  const previousAudio = AIStudioAdapter.getGeneratedAudioSrc();
  updateHUD("🟡 INYECTANDO TEXTO", headerTag, `Insertando ${wordCount} palabras en prompt...`, "#f59e0b");
  const setOk = AIStudioAdapter.setPromptText(input, job.spoken_text);
  if (!setOk) {
    updateHUD("🔴 ERROR TEXTO", headerTag, "Fallo al insertar texto en el textarea", "#ef4444");
    return { success: false, error: "Fallo al insertar el texto en el textarea" };
  }
  AIStudioAdapter.highlightElement(input, headerTag, "#38bdf8");

  await sleep(500);

  const runBtn = AIStudioAdapter.findRunButton();
  if (!runBtn) {
    updateHUD("🔴 ERROR RUN", headerTag, "Botón Run no encontrado", "#ef4444");
    return { success: false, error: "Botón 'Run' no encontrado en el DOM" };
  }

  AIStudioAdapter.highlightElement(runBtn, "Ejecutando...", "#10b981");
  updateHUD("⚡ ENVIANDO RUN ↵", headerTag, "Pulsando botón Run...", "#38bdf8");
  AIStudioAdapter.clickRun();

  // Closed-loop confirmation: Wait for Stop state to be active without sending extra cancel clicks
  for (let w = 0; w < 12; w++) {
    await sleep(350);
    if (AIStudioAdapter.isGenerating()) {
      console.log(`[SPAA Content Script] Generation confirmed active (Stop button detected)!`);
      break;
    }
    const immediateErr = AIStudioAdapter.readVisibleError();
    if (immediateErr) {
      console.warn(`[SPAA Content Script] Detected error immediately after Run: ${immediateErr}`);
      break;
    }
  }

  const startTime = Date.now();
  const TIMEOUT_MS = 150000;
  let loggedGenerating = false;
  let hasBeenGenerating = false;
  let retryCount = 0;

  while (Date.now() - startTime < TIMEOUT_MS) {
    await sleep(1000);

    const isGen = AIStudioAdapter.isGenerating();
    if (isGen) {
      hasBeenGenerating = true;
      if (!loggedGenerating) {
        updateHUD("⚡ SINTETIZANDO AUDIO", `${headerTag} (Estado: Stop)`, "Google AI Studio está sintetizando el audio...", "#a855f7");
        loggedGenerating = true;
      }
    }

    const visibleError = AIStudioAdapter.readVisibleError();
    if (visibleError && !visibleError.includes("API key")) {
      console.warn(`[SPAA Content Script] Detected AI Studio Error Banner: ${visibleError}`);
      const isRateLimit =
        visibleError.includes("403") ||
        visibleError.includes("429") ||
        visibleError.includes("Quota") ||
        visibleError.includes("Http response at 400 or 500");

      AIStudioAdapter.dismissErrorBanners();

      if (isRateLimit && retryCount < 3) {
        retryCount++;
        // Auto-Recovery Protocol: 12-second backoff with live countdown
        for (let cd = 12; cd > 0; cd--) {
          updateHUD(
            "🟠 ESPERA ANTI-RATE LIMIT",
            `${headerTag} (Reintento ${retryCount}/3 en ${cd}s)`,
            `Error 403/429 de AI Studio. Esperando ${cd}s para reintentar...`,
            "#f59e0b"
          );
          await sleep(1000);
        }
        AIStudioAdapter.dismissErrorBanners();
        await sleep(500);

        // Re-inject text if needed and re-trigger Run
        const currentInput = AIStudioAdapter.findTextInput();
        if (currentInput) {
          AIStudioAdapter.setPromptText(currentInput, job.spoken_text);
        }
        updateHUD("⚡ REINTENTANDO RUN", `${headerTag} (Intento ${retryCount + 1})`, "Reintentando enviar Run...", "#38bdf8");
        AIStudioAdapter.clickRun();
        loggedGenerating = false;
        continue;
      } else {
        updateHUD("🔴 ERROR AI STUDIO", headerTag, `Error: ${visibleError}`, "#ef4444");
        return { success: false, error: `Error visible en AI Studio: ${visibleError}` };
      }
    }

    const audioSrc = AIStudioAdapter.getGeneratedAudioSrc();
    // Only capture when new audio is present and generation is completed (not in Stop state)
    if (audioSrc && audioSrc !== previousAudio && !AIStudioAdapter.isGenerating()) {
      console.log("[SPAA Content Script] Generated audio captured from player!");
      updateHUD("📥 AUDIO CAPTURADO", headerTag, "Extrayendo audio WAV del reproductor...", "#22c55e");

      const playerEl = document.querySelector<HTMLElement>("ms-music-player");
      if (playerEl) {
        AIStudioAdapter.highlightElement(playerEl, "Audio Capturado!", "#22c55e");
      }

      let base64Audio = "";
      if (audioSrc.startsWith("data:audio")) {
        base64Audio = extractBase64FromDataUrl(audioSrc);
      } else if (audioSrc.startsWith("blob:") || audioSrc.startsWith("http")) {
        try {
          const blob = await fetch(audioSrc).then((r) => r.blob());
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          base64Audio = btoa(binary);
        } catch (blobErr) {
          console.warn("[SPAA Content Script] Failed to fetch blob, clicking download fallback:", blobErr);
          AIStudioAdapter.findDownloadButton()?.click();
        }
      }

      const dlBtn = AIStudioAdapter.findDownloadButton();
      if (dlBtn) dlBtn.click();

      updateHUD("☁️ GUARDANDO Y VALIDANDO", headerTag, "Enviando WAV al backend SPAA...", "#38bdf8");

      // 5-second post-generation cooldown before starting the next chunk
      for (let cd = 5; cd > 0; cd--) {
        updateHUD("⏳ ENFRIAMIENTO", `${headerTag} COMPLETADO ✓`, `Pausa de seguridad anti-rate-limit (${cd}s)...`, "#38bdf8");
        await sleep(1000);
      }

      return {
        success: true,
        job_id: job.job_id,
        base64_audio: base64Audio || undefined,
      };
    }
  }

  updateHUD("🔴 TIMEOUT", headerTag, "Timeout esperando audio (150s)", "#ef4444");
  return { success: false, error: "Timeout esperando la generación de audio en AI Studio (150s)" };
}
