import { AIStudioAdapter } from "./aistudio-adapter";

console.log("[SPAA Content Script] Loaded and ready for live hot-testing.");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractBase64FromDataUrl(dataUrl: string): string {
  const parts = dataUrl.split(",");
  return parts.length > 1 ? parts[1] : dataUrl;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // 1. Diagnostics
  if (message.type === "TEST_DIAGNOSE") {
    const diag = AIStudioAdapter.diagnoseDOM();
    sendResponse(diag);
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
      color = "#38bdf8";
    } else if (target === "scene") {
      el = AIStudioAdapter.findSceneInput();
      label = "Scene Textarea";
      color = "#a855f7";
    } else if (target === "context") {
      el = AIStudioAdapter.findSampleContextInput();
      label = "Context Textarea";
      color = "#ec4899";
    } else if (target === "run") {
      el = AIStudioAdapter.findRunButton();
      label = "Run Button";
      color = "#10b981";
    } else if (target === "model") {
      el = AIStudioAdapter.findModelSelector();
      label = "Model Settings";
      color = "#eab308";
    } else if (target === "voice") {
      el = AIStudioAdapter.findVoiceSelector();
      label = "Speaker / Voice";
      color = "#f97316";
    } else if (target === "player") {
      el = document.querySelector("ms-music-player");
      label = "Music Player";
      color = "#06b6d4";
    }

    if (el) {
      AIStudioAdapter.highlightElement(el, label, color);
      sendResponse({ success: true, found: true });
    } else {
      sendResponse({ success: false, found: false, error: `Elemento '${target}' no encontrado` });
    }
    return true;
  }

  // 4. Inject Text Tests
  if (message.type === "TEST_SET_PROMPT") {
    const text = message.text || "Hola, esta es una prueba en caliente del sistema SPAA con Gemini 2.5 Pro Preview TTS.";
    const input = AIStudioAdapter.findTextInput();
    if (!input) {
      sendResponse({ success: false, error: "Textarea de prompt no encontrado" });
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

  // 5. Toggle Mode Test
  if (message.type === "TEST_TOGGLE_MODE") {
    const newMode = AIStudioAdapter.toggleMode();
    sendResponse({ success: true, activeMode: newMode });
    return true;
  }

  // 6. Test Click Run
  if (message.type === "TEST_CLICK_RUN") {
    const btn = AIStudioAdapter.findRunButton();
    if (!btn) {
      sendResponse({ success: false, error: "Botón Run no encontrado" });
      return true;
    }
    const isReady = AIStudioAdapter.isRunButtonReady();
    AIStudioAdapter.highlightElement(btn, "Click en Run", "#10b981");
    AIStudioAdapter.clickRun();
    sendResponse({ success: true, wasReady: isReady });
    return true;
  }

  // 7. Test Extract Audio
  if (message.type === "TEST_EXTRACT_AUDIO") {
    const audioSrc = AIStudioAdapter.getGeneratedAudioSrc();
    if (!audioSrc) {
      sendResponse({ success: false, hasAudio: false, error: "No hay audio generado en ms-music-player" });
      return true;
    }

    let base64 = "";
    if (audioSrc.startsWith("data:audio")) {
      base64 = extractBase64FromDataUrl(audioSrc);
      sendResponse({
        success: true,
        hasAudio: true,
        type: "data-url",
        base64_audio: base64,
        size_bytes: Math.round((base64.length * 3) / 4),
      });
    } else {
      fetch(audioSrc)
        .then((r) => r.blob())
        .then(async (blob) => {
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          base64 = btoa(binary);
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
    }
    return true;
  }

  // 8. Regular Production Automation Execution
  if (message.type === "CHECK_PAGE_READY") {
    AIStudioAdapter.ensureTextMode();
    const isReady = AIStudioAdapter.isAIStudioPage() && AIStudioAdapter.findTextInput() !== null;
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
});

async function executeJob(job: { job_id: string; spoken_text: string }) {
  console.log(`[SPAA Content Script] Starting TTS generation for job ${job.job_id}...`);

  AIStudioAdapter.ensureTextMode();
  await sleep(250);

  let input = AIStudioAdapter.findTextInput();
  let retries = 0;
  while (!input && retries < 10) {
    await sleep(500);
    input = AIStudioAdapter.findTextInput();
    retries++;
  }

  if (!input) {
    return { success: false, error: "Campo de texto 'Enter a prompt' no encontrado en AI Studio" };
  }

  const previousAudio = AIStudioAdapter.getGeneratedAudioSrc();
  const setOk = AIStudioAdapter.setPromptText(input, job.spoken_text);
  if (!setOk) {
    return { success: false, error: "Fallo al insertar el texto en el textarea" };
  }

  await sleep(400);

  const runBtn = AIStudioAdapter.findRunButton();
  if (!runBtn) {
    return { success: false, error: "Botón 'Run' no encontrado en el DOM" };
  }

  AIStudioAdapter.clickRun();
  console.log("[SPAA Content Script] 'Run' button clicked. Waiting for audio synthesis...");

  const startTime = Date.now();
  const TIMEOUT_MS = 120000;

  while (Date.now() - startTime < TIMEOUT_MS) {
    await sleep(1000);

    const visibleError = AIStudioAdapter.readVisibleError();
    if (visibleError && !visibleError.includes("API key")) {
      return { success: false, error: `Error visible en AI Studio: ${visibleError}` };
    }

    const audioSrc = AIStudioAdapter.getGeneratedAudioSrc();
    if (audioSrc && audioSrc !== previousAudio) {
      console.log("[SPAA Content Script] Generated audio captured from player!");

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

      return {
        success: true,
        job_id: job.job_id,
        base64_audio: base64Audio || undefined,
      };
    }
  }

  return { success: false, error: "Timeout esperando la generación de audio en AI Studio (120s)" };
}
