import { type ClaimedJob, WorkerClient } from "./worker-client";

// Read worker settings from storage or defaults
let workerId = "worker-chrome-1";
let profileAlias = "Perfil 1";
let backendUrl = "http://localhost:8009";
let isPaused = false;

chrome.storage.local.get(["workerId", "profileAlias", "backendUrl", "isPaused"], (res) => {
  if (res.workerId) workerId = res.workerId;
  if (res.profileAlias) profileAlias = res.profileAlias;
  if (res.backendUrl) backendUrl = res.backendUrl;
  if (typeof res.isPaused === "boolean") isPaused = res.isPaused;
});

const client = new WorkerClient(backendUrl, workerId, profileAlias);
let currentJob: ClaimedJob | null = null;
let isProcessing = false;

// Circular log buffer for diagnostics
const MAX_LOGS = 60;
const workerLogs: { timestamp: string; level: "info" | "warn" | "error"; message: string }[] = [];

function swLog(level: "info" | "warn" | "error", msg: string) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: msg,
  };
  workerLogs.push(entry);
  if (workerLogs.length > MAX_LOGS) workerLogs.shift();
  if (level === "error") console.error(`[SPAA SW] ${msg}`);
  else if (level === "warn") console.warn(`[SPAA SW] ${msg}`);
  else console.log(`[SPAA SW] ${msg}`);
}

swLog("info", `Initialized as ${workerId} (${profileAlias}) with backend ${backendUrl}`);

// Chrome DevTools Protocol (CDP) Hardware Trusted Input Engine
async function executeWithDebugger(tabId: number, fn: (target: chrome.debugger.Debuggee) => Promise<void>): Promise<boolean> {
  const target = { tabId };
  let attachedHere = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attachedHere = true;
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (!msg.includes("already attached")) {
      swLog("warn", `Debugger attach notice: ${msg}`);
      return false;
    }
  }

  try {
    await fn(target);
    return true;
  } catch (err) {
    swLog("warn", `Debugger command notice: ${err}`);
    return false;
  } finally {
    if (attachedHere) {
      try {
        await chrome.debugger.detach(target);
      } catch {
        // ignore
      }
    }
  }
}

async function performCDPClick(tabId: number, x: number, y: number): Promise<boolean> {
  return executeWithDebugger(tabId, async (target) => {
    const roundX = Math.round(x);
    const roundY = Math.round(y);

    // 1. Move cursor to target coordinates
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: roundX,
      y: roundY,
      button: "none",
      buttons: 0,
    });

    await new Promise((r) => setTimeout(r, 40));

    // 2. Physical Left Mouse Down (buttons: 1 bitmask is mandatory for Chromium trusted clicks)
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      buttons: 1,
      clickCount: 1,
      x: roundX,
      y: roundY,
      modifiers: 0,
    });

    await new Promise((r) => setTimeout(r, 70));

    // 3. Physical Left Mouse Up (buttons: 0)
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      buttons: 0,
      clickCount: 1,
      x: roundX,
      y: roundY,
      modifiers: 0,
    });

    swLog("info", `CDP Hardware Trusted Click executed at (${roundX}, ${roundY}) with buttons: 1`);
  });
}

async function performCDPCtrlEnter(tabId: number): Promise<boolean> {
  return executeWithDebugger(tabId, async (target) => {
    // 1. Press Control Key
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      windowsVirtualKeyCode: 17, // Control
      nativeVirtualKeyCode: 17,
      key: "Control",
      code: "ControlLeft",
      modifiers: 2, // Control modifier
    });

    await new Promise((r) => setTimeout(r, 30));

    // 2. Press Enter with Ctrl modifier active
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      windowsVirtualKeyCode: 13, // Enter
      nativeVirtualKeyCode: 13,
      key: "Enter",
      code: "Enter",
      unmodifiedText: "\r",
      text: "\r",
      modifiers: 2,
    });

    await new Promise((r) => setTimeout(r, 60));

    // 3. Release Enter
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyUp",
      windowsVirtualKeyCode: 13,
      key: "Enter",
      code: "Enter",
      modifiers: 2,
    });

    // 4. Release Control
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyUp",
      windowsVirtualKeyCode: 17,
      key: "Control",
      code: "ControlLeft",
      modifiers: 0,
    });

    swLog("info", "CDP Hardware Trusted Ctrl+Enter executed");
  });
}

// Listen for popup actions and content script requests
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CDP_TRUSTED_CLICK") {
    const tabId = _sender.tab?.id || message.tabId;
    if (tabId && message.coords) {
      performCDPClick(tabId, message.coords.x, message.coords.y).then((ok) => {
        sendResponse({ success: ok });
      });
      return true;
    }
  }

  if (message.type === "CDP_TRUSTED_KEYBOARD_RUN") {
    const tabId = _sender.tab?.id || message.tabId;
    if (tabId) {
      performCDPCtrlEnter(tabId).then((ok) => {
        sendResponse({ success: ok });
      });
      return true;
    }
  }

  if (message.type === "GET_WORKER_STATUS") {
    sendResponse({
      workerId,
      profileAlias,
      backendUrl,
      isPaused,
      currentJob,
      isProcessing,
    });
    return true;
  }

  if (message.type === "GET_WORKER_LOGS") {
    sendResponse({
      workerId,
      profileAlias,
      backendUrl,
      isPaused,
      currentJob,
      isProcessing,
      workerLogs,
    });
    return true;
  }

  if (message.type === "SET_PAUSED") {
    isPaused = message.paused;
    chrome.storage.local.set({ isPaused });
    swLog("info", `Worker pause state changed: ${isPaused ? "PAUSED" : "ACTIVE"}`);
    sendResponse({ success: true, isPaused });
    return true;
  }

  if (message.type === "UPDATE_CONFIG") {
    if (message.workerId) workerId = message.workerId;
    if (message.profileAlias) profileAlias = message.profileAlias;
    if (message.backendUrl) backendUrl = message.backendUrl;
    client.workerId = workerId;
    client.profileAlias = profileAlias;
    client.backendUrl = backendUrl;
    chrome.storage.local.set({ workerId, profileAlias, backendUrl });
    swLog("info", `Worker config updated: ${workerId} (${profileAlias}) -> ${backendUrl}`);
    sendResponse({ success: true });
    return true;
  }
});

// Periodic heartbeat every 25 seconds
setInterval(() => {
  if (!isPaused) {
    client.sendHeartbeat(currentJob ? "GENERATING" : "READY", currentJob?.job_id);
  }
}, 25000);

// Polling loop every 4 seconds
setInterval(async () => {
  if (isPaused || isProcessing || currentJob) return;

  try {
    await pollAndExecute();
  } catch (err) {
    swLog("error", `Loop error: ${err}`);
  }
}, 4000);

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
          }, 200);
        } catch (injectErr: any) {
          resolve({ success: false, error: injectErr?.message || "Inyección fallida" });
        }
      } else {
        resolve(res);
      }
    });
  });
}

// Closed-loop Chrome Downloads tracker
async function waitForDownloadedWav(minTimestampSec: number, timeoutMs = 15000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const items = await chrome.downloads.search({
        query: ["Generated Audio"],
        orderBy: ["-startTime"],
        limit: 5,
      });

      for (const item of items) {
        const itemStartSec = new Date(item.startTime).getTime() / 1000;
        if (itemStartSec >= minTimestampSec - 5) {
          if (item.state === "complete" && item.exists) {
            swLog("info", `Lazo cerrado: Archivo descargado detectado -> ${item.filename}`);
            return item.filename;
          }
        }
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}

async function pollAndExecute() {
  const tab = await getAIStudioTab();
  if (!tab || !tab.id) {
    return; // No AI Studio tab open, stay idle
  }

  const tabId = tab.id;

  // Verify tab is ready
  const checkRes = await sendTabMessage(tabId, { type: "CHECK_PAGE_READY" });
  if (!checkRes?.ready) return;

  // Claim next job
  isProcessing = true;
  const job = await client.claimNextJob();
  if (!job) {
    isProcessing = false;
    return;
  }

  const jobStartTimeSec = Date.now() / 1000;
  swLog("info", `Claimed job ${job.job_id} for chunk ${job.chunk_id} (seq ${job.sequence})`);
  currentJob = job;

  try {
    // Send job to content script
    const result = await sendTabMessage(tabId, { type: "EXECUTE_TTS_JOB", job });

    if (!result || !result.success) {
      const errorMsg = result?.error || "Fallo en generación de audio o timeout";
      swLog("error", `Job ${job.job_id} failed: ${errorMsg}`);
      await client.reportStatus(job.job_id, "ERROR", errorMsg);
    } else {
      swLog("info", `Job ${job.job_id} synthesis complete. Processing audio delivery...`);
      await client.reportStatus(job.job_id, "DOWNLOADING");

      let uploadSuccess = false;
      let lastErr = "";

      // Path A: Base64 direct buffer upload
      if (result.base64_audio) {
        const uploadRes = await client.uploadBase64Audio(job.job_id, result.base64_audio);
        if (uploadRes.success) {
          uploadSuccess = true;
          swLog("info", `Job ${job.job_id} successfully validated via Base64 stream!`);
        } else {
          lastErr = uploadRes.error || "Fallo en validación Base64";
          swLog("warn", `Base64 upload attempt failed for job ${job.job_id}: ${lastErr}. Trying Downloads folder pickup...`);
        }
      }

      // Path B: Closed-loop pickup from Downloads folder (Generated Audio *.wav)
      if (!uploadSuccess) {
        const downloadedFile = await waitForDownloadedWav(jobStartTimeSec, 15000);
        const importRes = await client.importDownloadedWav(job.job_id, {
          exactFilepath: downloadedFile || undefined,
          minTimestamp: jobStartTimeSec,
        });

        if (importRes.success) {
          uploadSuccess = true;
          swLog("info", `Job ${job.job_id} validado y confirmado por lazo cerrado (${importRes.downloaded_file || downloadedFile})!`);
        } else {
          lastErr = importRes.error || lastErr || "Fallo al importar de Downloads";
        }
      }

      if (uploadSuccess) {
        swLog("info", `Job ${job.job_id} (${job.chapter_title || 'Capítulo'} Bloque ${job.sequence}/${job.total_chunks || 1}) GUARDADO Y COMPLETADO ✓`);
      } else {
        swLog("error", `QA validation failed for job ${job.job_id}: ${lastErr}`);
        await client.reportStatus(job.job_id, "ERROR", lastErr);
      }
    }
  } catch (err) {
    swLog("error", `Unhandled error in job ${job.job_id}: ${err}`);
    await client.reportStatus(job.job_id, "ERROR", String(err));
  } finally {
    currentJob = null;
    isProcessing = false;
  }
}

