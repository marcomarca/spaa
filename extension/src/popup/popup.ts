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
const btnCopyDebug = document.getElementById("btn-copy-debug") as HTMLButtonElement;
const btnCopyLogs = document.getElementById("btn-copy-logs") as HTMLButtonElement;

// Worker Config
const workerIdInput = document.getElementById("workerIdInput") as HTMLInputElement;
const profileAliasInput = document.getElementById("profileAliasInput") as HTMLInputElement;
const backendUrlInput = document.getElementById("backendUrlInput") as HTMLInputElement;
const saveConfigBtn = document.getElementById("saveConfigBtn") as HTMLButtonElement;
const togglePauseBtn = document.getElementById("togglePauseBtn") as HTMLButtonElement;
const masterPowerBtn = document.getElementById("master-power-btn") as HTMLButtonElement;
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
  const allTabs = await chrome.tabs.query({});
  const activeAiTab = allTabs.find((t) => t.active && t.url && t.url.includes("aistudio.google.com"));
  if (activeAiTab) return activeAiTab;

  const anyAiTab = allTabs.find((t) => t.url && t.url.includes("aistudio.google.com"));
  if (anyAiTab) return anyAiTab;

  const titleAiTab = allTabs.find((t) => t.title && t.title.includes("AI Studio"));
  if (titleAiTab) return titleAiTab;

  return null;
}

// Resilient messaging to content script with auto-injection fallback
async function sendTabMessage(tabId: number, message: any): Promise<any> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, async (res) => {
      if (chrome.runtime.lastError || res === undefined) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["content-script.js"],
          });
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, (retryRes) => {
              if (chrome.runtime.lastError) {
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(retryRes || { success: false, error: "Sin respuesta de AI Studio" });
              }
            });
          }, 300);
        } catch (injectErr: any) {
          resolve({
            success: false,
            error: injectErr?.message || chrome.runtime.lastError?.message || "Error al inyectar script",
          });
        }
      } else {
        resolve(res);
      }
    });
  });
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

  const res = await sendTabMessage(tab.id, { type: "TEST_DIAGNOSE" });
  if (!res || !res.elements) return;

  diagModel.textContent = res.values?.selectedModel || "Detectando...";
  diagVoice.textContent = res.values?.selectedVoice || "Detectando...";

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
}

// Hot-Testing Action Handlers
btnHighlight?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: Abre https://aistudio.google.com/ en una pestaña.");
  log("🎯 Resaltando elementos clave en la pestaña de AI Studio...");
  const res = await sendTabMessage(tab.id, { type: "TEST_HIGHLIGHT_ALL" });
  if (res?.success) {
    log("✅ Elementos resaltados con marcos de neón y etiquetas en pantalla.");
  } else {
    log(`❌ Error al resaltar: ${res?.error || "Desconocido (recarga la pestaña con F5)"}`);
  }
});

btnMode?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: No hay pestaña de AI Studio abierta.");
  log("🔀 Alternando modo Text / Composer...");
  const res = await sendTabMessage(tab.id, { type: "TEST_TOGGLE_MODE" });
  if (res?.activeMode) {
    log(`✅ Modo activo: ${res.activeMode}`);
  } else {
    log(`❌ Error al alternar modo: ${res?.error || "Fallo de comunicación"}`);
  }
  runDiagnostics();
});

btnScene?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: No hay pestaña de AI Studio.");
  const testScene = "[enérgico, profesional] Grabación de audiolibro técnico para SPAA.";
  log(`🎭 Inyectando texto en 'Scene': "${testScene}"`);
  const res = await sendTabMessage(tab.id, { type: "TEST_SET_SCENE", text: testScene });
  if (res?.success) {
    log("✅ Escena inyectada con éxito y eventos Angular disparados.");
  } else {
    log(`❌ Fallo: ${res?.error || "No se encontró el textarea de Scene"}`);
  }
  runDiagnostics();
});

btnContext?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: No hay pestaña de AI Studio.");
  const testCtx = "El locutor continúa la explicación del capítulo 1.";
  log(`📖 Inyectando texto en 'Sample Context': "${testCtx}"`);
  const res = await sendTabMessage(tab.id, { type: "TEST_SET_CONTEXT", text: testCtx });
  if (res?.success) {
    log("✅ Contexto inyectado con éxito.");
  } else {
    log(`❌ Fallo: ${res?.error || "No se encontró el textarea de Sample Context"}`);
  }
  runDiagnostics();
});

btnPrompt?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: No hay pestaña de AI Studio.");
  const testPrompt = "Hola, esta es una prueba en caliente del sistema SPAA con Gemini 2.5 Pro Preview TTS.";
  log(`✍️ Inyectando texto en prompt: "${testPrompt.slice(0, 40)}..."`);
  const res = await sendTabMessage(tab.id, { type: "TEST_SET_PROMPT", text: testPrompt });
  if (res?.success) {
    log(`✅ Texto inyectado (${res.length} chars). Botón Run activado.`);
  } else {
    log(`❌ Fallo: ${res?.error || "No se encontró el textarea del Prompt principal"}`);
  }
  runDiagnostics();
});

btnRun?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: No hay pestaña de AI Studio.");
  log("▶️ Pulsando botón 'Run' en AI Studio...");
  const res = await sendTabMessage(tab.id, { type: "TEST_CLICK_RUN" });
  if (res?.success) {
    log("✅ Clic ejecutado en 'Run'. Generación en curso en AI Studio...");
  } else {
    log(`❌ Fallo al pulsar Run: ${res?.error || "Botón Run no encontrado o deshabilitado"}`);
  }
  runDiagnostics();
});

btnAudio?.addEventListener("click", async () => {
  const tab = await getAIStudioTab();
  if (!tab?.id) return log("❌ Error: No hay pestaña de AI Studio.");
  log("🎧 Inspeccionando reproductor de audio...");
  const res = await sendTabMessage(tab.id, { type: "TEST_EXTRACT_AUDIO" });
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
      if (masterPowerBtn) {
        masterPowerBtn.textContent = "⏻ Activar";
        masterPowerBtn.style.background = "#10b981";
      }
    } else {
      statusBadge.textContent = res.isProcessing ? "⚡ Generando..." : "🟢 Activo";
      statusBadge.className = "badge badge-active";
      togglePauseBtn.textContent = "Pausar Worker";
      togglePauseBtn.className = "btn btn-pause";
      if (masterPowerBtn) {
        masterPowerBtn.textContent = "⏻ Apagar";
        masterPowerBtn.style.background = "#ef4444";
      }
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

masterPowerBtn?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SET_PAUSED", paused: !isPaused }, (res) => {
    isPaused = res.isPaused;
    refreshWorkerStatus();
  });
});

// Copy Full Debug Report to Clipboard
async function copyFullDebugReport() {
  const originalText = btnCopyDebug.innerHTML;
  btnCopyDebug.innerHTML = "⏳ Recopilando diagnóstico...";
  btnCopyDebug.disabled = true;

  try {
    const tab = await getAIStudioTab();

    // 1. Get detailed content script DOM report if tab is available
    let domReport: any = null;
    if (tab?.id) {
      domReport = await sendTabMessage(tab.id as number, { type: "GET_DETAILED_DEBUG_REPORT" });
    }

    // 2. Get Service Worker logs and state
    const swData: any = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_WORKER_LOGS" }, (res) => {
        resolve(res || null);
      });
    });

    // 3. Popup UI logs
    const popupLogs = testConsole.textContent || "(Sin logs en popup)";

    // 4. Format markdown
    const timestamp = new Date().toISOString();
    const manifestVersion = chrome.runtime.getManifest()?.version || "1.2.0";
    const markdown: string[] = [
      "# 🛠️ SPAA Worker & AI Studio DOM Report",
      `**Generado:** \`${timestamp}\``,
      `**Extensión:** \`SPAA Gemini AI Studio TTS Worker v${manifestVersion}\``,
      "",
      "## 1. 🌐 Estado de la Pestaña AI Studio",
      tab
        ? `- **URL:** \`${tab.url || "N/A"}\`\n- **Título:** \`${tab.title || "N/A"}\`\n- **Conexión Content-Script:** 🟢 Activa`
        : "- 🔴 **No se detectó ninguna pestaña de AI Studio abierta.**",
      "",
      "## 2. ⚙️ Estado del Worker (Background)",
      `- **Worker ID:** \`${swData?.workerId || workerIdInput.value || "N/A"}\``,
      `- **Perfil:** \`${swData?.profileAlias || profileAliasInput.value || "N/A"}\``,
      `- **Servidor Backend:** \`${swData?.backendUrl || backendUrlInput.value || "N/A"}\``,
      `- **Estado:** \`${swData?.isPaused ? "PAUSADO" : swData?.isProcessing ? "GENERANDO" : "ACTIVO / IDLE"}\``,
      `- **Job Actual:** \`${swData?.currentJob ? JSON.stringify(swData.currentJob) : "Ninguno"}\``,
      "",
      "## 3. 🎯 Matriz de Diagnóstico de Selectores DOM",
    ];

    if (domReport?.components) {
      markdown.push("| Componente | Estado | Selector Coincidente | Fallbacks Probados |");
      markdown.push("|---|---|---|---|");
      for (const [compName, compData] of Object.entries(domReport.components as Record<string, any>)) {
        const status = compData.matched ? "🟢 ENCONTRADO" : "🔴 NO ENCONTRADO";
        const matched = compData.matchedSelector ? `\`${compData.matchedSelector}\`` : "*-*";
        const total = compData.candidates?.length || 0;
        const failed = compData.candidates?.filter((c: any) => !c.matched).length || 0;
        markdown.push(`| **${compName}** | ${status} | ${matched} | ${failed}/${total} fallidos |`);
      }

      markdown.push("", "### 🔍 Detalle por Selector Probado:");
      for (const [compName, compData] of Object.entries(domReport.components as Record<string, any>)) {
        markdown.push(
          `\n<details><summary><b>${compName}</b> (${compData.matched ? "🟢 Match" : "🔴 Fail"})</summary>\n`
        );
        if (compData.elementSnippet) {
          markdown.push(`**Snippet HTML Encontrado:**\n\`\`\`html\n${compData.elementSnippet}\n\`\`\`\n`);
        }
        markdown.push("**Candidatos evaluados:**");
        for (const cand of compData.candidates || []) {
          markdown.push(`- [${cand.matched ? "x" : " "}] \`${cand.selector}\``);
        }
        markdown.push("</details>");
      }

      if (domReport.visibleError) {
        markdown.push("", "### ⚠️ Error Visible en Pantalla (AI Studio):", `> ${domReport.visibleError}`);
      }

      if (domReport.allTextareas && domReport.allTextareas.length > 0) {
        markdown.push("", `### 📝 Textareas Disponibles en DOM (${domReport.allTextareas.length}):`);
        for (const ta of domReport.allTextareas) {
          markdown.push(
            `- **#${ta.index}**: \`<${ta.tagName}>\` (Parent: \`<${ta.parentTag}>\`) | aria-label: \`${ta.ariaLabel || "N/A"}\` | placeholder: \`${ta.placeholder || "N/A"}\` | class: \`${ta.className || "N/A"}\``
          );
        }
      }

      if (domReport.customElements && domReport.customElements.length > 0) {
        markdown.push("", "### 🧩 Tags Personalizados Detectados:", `\`${domReport.customElements.join(", ")}\``);
      }
    } else {
      markdown.push("> ⚠️ No se pudo obtener el informe DOM detallado (asegúrate de que https://aistudio.google.com esté cargada).");
    }

    markdown.push(
      "",
      "## 4. 📟 Registro de Pruebas del Popup (Consola de Test)",
      `\`\`\`txt\n${popupLogs}\n\`\`\``,
      "",
      "## 5. 📜 Logs Recientes del Service Worker",
      `\`\`\`json\n${JSON.stringify(swData?.workerLogs || [], null, 2)}\n\`\`\``,
      "",
      "## 6. 💻 Logs de la Consola de DevTools (AI Studio & Content Script)",
      `\`\`\`json\n${JSON.stringify(domReport?.pageLogs || [], null, 2)}\n\`\`\``
    );

    const fullMarkdown = markdown.join("\n");
    await navigator.clipboard.writeText(fullMarkdown);

    btnCopyDebug.innerHTML = "✅ ¡Copiado al Portapapeles!";
    btnCopyDebug.classList.add("btn-copy-success");
    log("📋 Reporte completo copiado al portapapeles. Pégalo directamente en el chat.");
  } catch (err) {
    btnCopyDebug.innerHTML = "❌ Error al copiar";
    log(`❌ Error al copiar reporte: ${err}`);
  } finally {
    btnCopyDebug.disabled = false;
    setTimeout(() => {
      btnCopyDebug.innerHTML = originalText;
      btnCopyDebug.classList.remove("btn-copy-success");
    }, 2500);
  }
}

btnCopyDebug?.addEventListener("click", copyFullDebugReport);

btnCopyLogs?.addEventListener("click", async () => {
  const original = btnCopyLogs.textContent;
  const logs = testConsole.textContent || "";
  try {
    await navigator.clipboard.writeText(logs);
    btnCopyLogs.textContent = "¡Copiado!";
  } catch (err) {
    btnCopyLogs.textContent = "Error";
  }
  setTimeout(() => {
    btnCopyLogs.textContent = original;
  }, 1500);
});

// Periodic intervals
runDiagnostics();
refreshWorkerStatus();
setInterval(runDiagnostics, 2500);
setInterval(refreshWorkerStatus, 2000);

