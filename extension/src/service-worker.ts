import { type ClaimedJob, WorkerClient } from "./worker-client";

// Read worker settings from storage or defaults
let workerId = "worker-chrome-1";
let profileAlias = "Perfil 1";
let backendUrl = "http://localhost:8000";
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

console.log(`[SPAA Service Worker] Initialized as ${workerId} (${profileAlias}).`);

// Listen for popup actions
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

  if (message.type === "SET_PAUSED") {
    isPaused = message.paused;
    chrome.storage.local.set({ isPaused });
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
    console.error("[SPAA Service Worker] Loop error:", err);
  }
}, 4000);

async function pollAndExecute() {
  // Check if AI Studio tab exists
  const tabs = await chrome.tabs.query({ url: "*://aistudio.google.com/*" });
  if (tabs.length === 0 || !tabs[0].id) {
    return; // No AI Studio tab open, stay idle
  }

  const tabId = tabs[0].id;

  // Verify tab is ready
  const isReady = await new Promise<boolean>((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "CHECK_PAGE_READY" }, (res) => {
      resolve(Boolean(res?.ready));
    });
  });

  if (!isReady) return;

  // Claim next job
  isProcessing = true;
  const job = await client.claimNextJob();
  if (!job) {
    isProcessing = false;
    return;
  }

  console.log(`[SPAA Service Worker] Claimed job ${job.job_id} for chunk ${job.chunk_id} (seq ${job.sequence})`);
  currentJob = job;

  try {
    // Send job to content script
    const result = await new Promise<{ success: boolean; error?: string; base64_audio?: string }>((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: "EXECUTE_TTS_JOB", job }, (res) => {
        resolve(res || { success: false, error: "Content script no respondió" });
      });
    });

    if (!result.success || !result.base64_audio) {
      console.error(`[SPAA Service Worker] Job ${job.job_id} failed:`, result.error);
      await client.reportStatus(job.job_id, "ERROR", result.error || "Fallo en generación de audio");
    } else {
      console.log(`[SPAA Service Worker] Job ${job.job_id} synthesis complete. Uploading audio...`);
      await client.reportStatus(job.job_id, "DOWNLOADING");

      const uploadRes = await client.uploadBase64Audio(job.job_id, result.base64_audio);
      if (uploadRes.success) {
        console.log(`[SPAA Service Worker] Job ${job.job_id} successfully processed and QA validated!`);
      } else {
        console.error(`[SPAA Service Worker] QA validation failed for job ${job.job_id}:`, uploadRes.error);
      }
    }
  } catch (err) {
    console.error(`[SPAA Service Worker] Unhandled error in job ${job.job_id}:`, err);
    await client.reportStatus(job.job_id, "ERROR", String(err));
  } finally {
    currentJob = null;
    isProcessing = false;
  }
}
