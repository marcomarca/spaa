import { AIStudioAdapter } from "./aistudio-adapter";

console.log("[SPAA Content Script] Loaded and listening on AI Studio.");

// Helpers
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Convert base64 data URL to raw base64 payload
function extractBase64FromDataUrl(dataUrl: string): string {
  const parts = dataUrl.split(",");
  return parts.length > 1 ? parts[1] : dataUrl;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

  // 1. Ensure Text mode
  AIStudioAdapter.ensureTextMode();
  await sleep(250);

  // 2. Find text input
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

  // 3. Clear previous audio from DOM if any
  const previousAudio = AIStudioAdapter.getGeneratedAudioSrc();

  // 4. Inject spoken text
  const setOk = AIStudioAdapter.setPromptText(input, job.spoken_text);
  if (!setOk) {
    return { success: false, error: "Fallo al insertar el texto en el textarea" };
  }

  await sleep(400); // Allow Angular change detection to activate Run button

  // 5. Click Run button
  const runBtn = AIStudioAdapter.findRunButton();
  if (!runBtn) {
    return { success: false, error: "Botón 'Run' no encontrado en el DOM" };
  }

  AIStudioAdapter.clickRun();
  console.log("[SPAA Content Script] 'Run' button clicked. Waiting for audio synthesis...");

  // 6. Poll for completion or error
  const startTime = Date.now();
  const TIMEOUT_MS = 120000; // 2 minutes max

  while (Date.now() - startTime < TIMEOUT_MS) {
    await sleep(1000);

    // Check for visible error
    const visibleError = AIStudioAdapter.readVisibleError();
    if (visibleError && !visibleError.includes("API key")) {
      return { success: false, error: `Error visible en AI Studio: ${visibleError}` };
    }

    // Check if new audio is generated
    const audioSrc = AIStudioAdapter.getGeneratedAudioSrc();
    if (audioSrc && audioSrc !== previousAudio) {
      console.log("[SPAA Content Script] Generated audio captured from player!");

      let base64Audio = "";
      if (audioSrc.startsWith("data:audio")) {
        base64Audio = extractBase64FromDataUrl(audioSrc);
      } else if (audioSrc.startsWith("blob:") || audioSrc.startsWith("http")) {
        // Fetch blob and convert to base64
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

      // Also trigger Download button to save backup copy
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
