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

// Chrome DevTools Protocol (CDP) Trusted Input Dispatchers
async function performCDPClick(tabId: number, x: number, y: number): Promise<boolean> {
  const target = { tabId };
  try {
    await chrome.debugger.attach(target, "1.3");

    // 1. Move to position
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: Math.round(x),
      y: Math.round(y),
    });

    // 2. Press mouse left button (isTrusted = true)
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      x: Math.round(x),
      y: Math.round(y),
    });

    await new Promise((r) => setTimeout(r, 60));

    // 3. Release mouse left button
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      x: Math.round(x),
      y: Math.round(y),
    });

    await chrome.debugger.detach(target);
    swLog("info", `CDP Trusted Click dispatched at (${Math.round(x)}, ${Math.round(y)})`);
    return true;
  } catch (err) {
    swLog("warn", `CDP Click fallback note: ${err}`);
    try {
      await chrome.debugger.detach(target);
    } catch {
      // ignore
    }
    return false;
  }
}

async function performCDPCtrlEnter(tabId: number): Promise<boolean> {
  const target = { tabId };
  try {
    await chrome.debugger.attach(target, "1.3");

    // Key Down: Ctrl + Enter
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      macCharCode: 13,
      unmodifiedText: "\r",
      text: "\r",
      modifiers: 2, // Control modifier
    });

    await new Promise((r) => setTimeout(r, 60));

    // Key Up
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyUp",
      windowsVirtualKeyCode: 13,
      modifiers: 2,
    });

    await chrome.debugger.detach(target);
    swLog("info", "CDP Trusted Hardware Ctrl+Enter dispatched to AI Studio");
    return true;
  } catch (err) {
    swLog("warn", `CDP Ctrl+Enter note: ${err}`);
    try {
      await chrome.debugger.detach(target);
    } catch {
      // ignore
    }
    return false;
  }
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

  swLog("info", `Claimed job ${job.job_id} for chunk ${job.chunk_id} (seq ${job.sequence})`);
  currentJob = job;

  try {
    // Send job to content script
    const result = await sendTabMessage(tabId, { type: "EXECUTE_TTS_JOB", job });

    if (!result || !result.success || !result.base64_audio) {
      const errorMsg = result?.error || "Fallo en generación de audio o timeout";
      swLog("error", `Job ${job.job_id} failed: ${errorMsg}`);
      await client.reportStatus(job.job_id, "ERROR", errorMsg);
    } else {
      swLog("info", `Job ${job.job_id} synthesis complete. Uploading audio...`);
      await client.reportStatus(job.job_id, "DOWNLOADING");

      const uploadRes = await client.uploadBase64Audio(job.job_id, result.base64_audio);
      if (uploadRes.success) {
        swLog("info", `Job ${job.job_id} successfully processed and QA validated!`);
      } else {
        swLog("error", `QA validation failed for job ${job.job_id}: ${uploadRes.error}`);
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

