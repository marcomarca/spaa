// Elements
const tabBtnTests = document.getElementById("tab-btn-tests") as HTMLButtonElement;
const tabBtnWorker = document.getElementById("tab-btn-worker") as HTMLButtonElement;
const tabContentTests = document.getElementById("tab-content-tests") as HTMLDivElement;
const tabContentWorker = document.getElementById("tab-content-worker") as HTMLDivElement;

// Status & Diagnostics
const statusBadge = document.getElementById("status-badge") as HTMLSpanElement;
const diagTab = document.getElementById("diag-tab") as HTMLSpanElement;
const diagModel = document.getElementById("diag-model") as HTMLSpanElement;
const diagVoice = document.getElementById("diag-voice") as HTMLSpanElement;
const diagPrompt = document.getElementById("diag-prompt") as HTMLSpanElement;
const diagSceneCtx = document.getElementById("diag-scene-ctx") as HTMLSpanElement;
const diagRun = document.getElementById("diag-run") as HTMLSpanElement;
const diagPlayer = document.getElementById("diag-player") as HTMLSpanElement;
const testConsole = document.getElementById("test-console") as HTMLDivElement;

// Audio Preview
const audioPreviewContainer = document.getElementById("audio-preview-container") as HTMLDivElement;
const audioMeta = document.getElementById("audio-meta") as HTMLDivElement;
const popupAudioPlayer = document.getElementById("popup-audio-player") as HTMLAudioElement;

// Action Buttons
const btnHighlight = document.getElementById("btn-test-highlight") as HTMLButtonElement;
const btnMode = document.getElementById("btn-test-mode") as HTMLButtonElement;
const btnScene = document.getElementById("btn-test-scene") as HTMLButtonElement;
const btnContext = document.getElementById("btn-test-context") as HTMLButtonElement;
const btnPrompt = document.getElementById("btn-test-prompt") as HTMLButtonElement;
const btnRun = document.getElementById("btn-test-run") as HTMLButtonElement;
const btnAudio = document.getElementById("btn-test-audio") as HTMLButtonElement;

// Worker Config
const workerIdInput = document.getElementById("workerIdInput") as HTMLInputElement;
const profileAliasInput = document.getElementById("profileAliasInput") as HTMLInputElement;
const backendUrlInput = document.getElementById("backendUrlInput") as HTMLInputElement;
const saveConfigBtn = document.getElementById("saveConfigBtn") as HTMLButtonElement;
const togglePauseBtn = document.getElementById("togglePauseBtn") as HTMLButtonElement;
const jobIndicator = document.getElementById("job-indicator") as HTMLSpanElement;

let isPaused = false;

// Logger
function log(msg: string) {
  const time = new Date().toLocaleTimeString();
  testConsole.textContent = `[${time}] ${msg}\n` + (testConsole.textContent || "");
}

// Tab Switching
tabBtnTests.addEventListener("click", () => {
  tabBtnTests.classList.add("active");
  tabBtnWorker.classList.remove("active");
  tabContentTests.style.display = "block";
  tabContentWorker.style.display = "none";
});

tabBtnWorker.addEventListener("click", () => {
  tabBtnWorker.classList.add("active");
  tabBtnTests.classList.remove("active");
  tabContentWorker.style.display = "block";
  tabContentTests.style.display = "none";
});

// Query active AI Studio Tab
async function getAIStudioTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: "*://aistudio.google.com/*" });
  return tabs.length > 0 ? tabs[0] : null;
}

// Refresh Live Diagnostics
async function runDiagnostics() {
  const tab = await getAIStudioTab();
  if (!tab || !tab.id) {
    diagTab.textContent = "🔴 No abierta";
    diagTab.className = "status-err";
    diagPrompt.textContent = "-";
    diagSceneCtx.textContent = "-";
    diagRun.textContent = "-";
    diagPlayer.textContent = "-";
    return;
  }

  diagTab.textContent = "🟢 Conectada";
  diagTab.className = "status-ok";

  chrome.tabs.sendMessage(tab.id, { type: "TEST_DIAGNOSE" }, (res) => {
    if (!res) return;

    diagModel.textContent = res.values.selectedModel || "Detectando...";
    diagVoice.textContent = res.values.selectedVoice || "Detectando...";

    if (res.elements.textPromptInput) {
      diagPrompt.textContent = "🟢 Detectado";
      diagPrompt.className = "status-ok";
    } else {
      diagPrompt.textContent = "🔴 No encontrado";
      diagPrompt.className = "status-err";
    }

    if (res.elements.sceneInput || res.elements.sampleContextInput) {
      diagSceneCtx.textContent = "🟢 Detectados";
      diagSceneCtx.className = "status-ok";
    } else {
      diagSceneCtx.textContent = "⚪ Opcionales";
      diagSceneCtx.className = "status-warn";
    }

    if (res.elements.runButton) {
      if (res.elements.isRunReady) {
        diagRun.textContent = "🟢 Listo (Ready)";
        diagRun.className = "status-ok";
      } else {
        diagRun.textContent = "🟡 Deshabilitado (espera texto)";
        diagRun.className = "status-warn";
      }
    } else {
      diagRun.textContent = "🔴 No encontrado";
      diagRun.className = "status-err";
    }

    if (res.elements.hasGeneratedAudio) {
      diagPlayer.textContent = "🟢 Audio disponible";
      diagPlayer.className = "status-ok";
    } else {
      diagPlayer.textContent = "⚪ Sin audio aún";
      diagPlayer.className = "status-warn";
    }
  });
}

// Hot-Testing Action Handlers
btnHighlight?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: Abre https://aistudio.google.com/live en una pestaña.");
  log("🎯 Resaltando elementos clave en la pestaña de AI Studio...");
  chrome.tabs.sendMessage(tab.id, { type: "TEST_HIGHLIGHT_ALL" }, () => {
    log("✅ Elementos resaltados con marcos de neón y etiquetas en pantalla.");
  });
});

btnMode?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: No hay pestaña de AI Studio abierta.");
  log("🔀 Alternando modo Text / Composer...");
  chrome.tabs.sendMessage(tab.id, { type: "TEST_TOGGLE_MODE" }, (res) => {
    log(`✅ Modo activo: ${res?.activeMode}`);
    runDiagnostics();
  });
});

btnScene?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: No hay pestaña de AI Studio.");
  const testScene = "[enérgico, profesional] Grabación de audiolibro técnico para SPAA.";
  log(`🎭 Inyectando texto en 'Scene': "${testScene}"`);
  chrome.tabs.sendMessage(tab.id, { type: "TEST_SET_SCENE", text: testScene }, (res) => {
    if (res?.success) log("✅ Escena inyectada con éxito y eventos Angular disparados.");
    else log(`❌ Fallo: ${res?.error}`);
    runDiagnostics();
  });
});

btnContext?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: No hay pestaña de AI Studio.");
  const testCtx = "El locutor continúa la explicación del capítulo 1.";
  log(`📖 Inyectando texto en 'Sample Context': "${testCtx}"`);
  chrome.tabs.sendMessage(tab.id, { type: "TEST_SET_CONTEXT", text: testCtx }, (res) => {
    if (res?.success) log("✅ Contexto inyectado con éxito.");
    else log(`❌ Fallo: ${res?.error}`);
    runDiagnostics();
  });
});

btnPrompt?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: No hay pestaña de AI Studio.");
  const testPrompt = "Hola, esta es una prueba en caliente del sistema SPAA con Gemini 2.5 Pro Preview TTS.";
  log(`✍️ Inyectando texto en prompt: "${testPrompt.slice(0, 40)}..."`);
  chrome.tabs.sendMessage(tab.id, { type: "TEST_SET_PROMPT", text: testPrompt }, (res) => {
    if (res?.success) log(`✅ Texto inyectado (${res.length} chars). Botón Run activado.`);
    else log(`❌ Fallo: ${res?.error}`);
    runDiagnostics();
  });
});

btnRun?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: No hay pestaña de AI Studio.");
  log("▶️ Pulsando botón 'Run' en AI Studio...");
  chrome.tabs.sendMessage(tab.id, { type: "TEST_CLICK_RUN" }, (res) => {
    if (res?.success) log("✅ Clic ejecutado en 'Run'. Generación en curso en AI Studio...");
    else log(`❌ Fallo al pulsar Run: ${res?.error}`);
    runDiagnostics();
  });
});

btnAudio?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: No hay pestaña de AI Studio.");
  log("🎧 Inspeccionando reproductor de audio...");
  chrome.tabs.sendMessage(tab.id, { type: "TEST_EXTRACT_AUDIO" }, (res) => {
    if (res?.success && res.base64_audio) {
      log(`✅ Audio capturado con éxito! Tamaño: ${(res.size_bytes / 1024).toFixed(1)} KB`);
      audioPreviewContainer.style.display = "block";
      audioMeta.textContent = `Audio capturado (${(res.size_bytes / 1024).toFixed(1)} KB):`;
      popupAudioPlayer.src = `data:audio/wav;base64,${res.base64_audio}`;
      popupAudioPlayer.play();
    } else {
      log(`⚠️ ${res?.error || "No hay audio generado aún en el reproductor."}`);
    }
    runDiagnostics();
  });
});

// Worker Config & State Sync
function refreshWorkerStatus() {
  chrome.runtime.sendMessage({ type: "GET_WORKER_STATUS" }, (res) => {
    if (!res) return;

    if (workerIdInput && !workerIdInput.matches(":focus")) workerIdInput.value = res.workerId;
    if (profileAliasInput && !profileAliasInput.matches(":focus")) profileAliasInput.value = res.profileAlias;
    if (backendUrlInput && !backendUrlInput.matches(":focus")) backendUrlInput.value = res.backendUrl;

    isPaused = res.isPaused;
    if (isPaused) {
      statusBadge.textContent = "⏸ Pausado";
      statusBadge.className = "badge badge-paused";
      togglePauseBtn.textContent = "Reanudar Worker";
      togglePauseBtn.className = "btn btn-resume";
    } else {
      statusBadge.textContent = res.isProcessing ? "⚡ Generando..." : "🟢 Activo";
      statusBadge.className = "badge badge-active";
      togglePauseBtn.textContent = "Pausar Worker";
      togglePauseBtn.className = "btn btn-pause";
    }

    if (res.currentJob) {
      jobIndicator.textContent = `Job: ${res.currentJob.chunk_id.slice(0, 8)}... (Seq ${res.currentJob.sequence})`;
    } else {
      jobIndicator.textContent = res.isProcessing ? "Reclamando..." : "Idle";
    }
  });
}

saveConfigBtn?.addEventListener("click", () => {
  const workerId = workerIdInput.value.trim();
  const profileAlias = profileAliasInput.value.trim();
  const backendUrl = backendUrlInput.value.trim();

  chrome.runtime.sendMessage(
    {
      type: "UPDATE_CONFIG",
      workerId,
      profileAlias,
      backendUrl,
    },
    () => {
      saveConfigBtn.textContent = "¡Guardado!";
      setTimeout(() => {
        saveConfigBtn.textContent = "Guardar Configuración";
      }, 1500);
    }
  );
});

togglePauseBtn?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SET_PAUSED", paused: !isPaused }, (res) => {
    isPaused = res.isPaused;
    refreshWorkerStatus();
  });
});

// Periodic intervals
runDiagnostics();
refreshWorkerStatus();
setInterval(runDiagnostics, 2500);
setInterval(refreshWorkerStatus, 2000);
