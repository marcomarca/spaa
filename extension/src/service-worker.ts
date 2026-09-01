import { type ClaimedJob, WorkerClient } from "./worker-client";

const client = new WorkerClient();
let currentJob: ClaimedJob | null = null;
let isPolling = false;

console.log("[SPAA Service Worker] Initialized.");

// Listen to download events to capture generated audio WAVs
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === "complete") {
    console.log(`[SPAA Service Worker] Download complete for ID ${delta.id}`);
  }
});

// Periodic heartbeat
setInterval(() => {
  client.sendHeartbeat(currentJob ? "GENERATING" : "READY", currentJob?.job_id);
}, 30000);

export async function pollNextJob() {
  if (isPolling || currentJob) return;
  isPolling = true;

  try {
    const job = await client.claimNextJob();
    if (job) {
      console.log(`[SPAA Service Worker] Claimed job ${job.job_id} for chunk ${job.chunk_id}`);
      currentJob = job;
      await processJob(job);
    }
  } catch (err) {
    console.error("[SPAA Service Worker] Error polling job:", err);
  } finally {
    isPolling = false;
  }
}

async function processJob(job: ClaimedJob) {
  // Query open AI Studio tab
  const tabs = await chrome.tabs.query({ url: "*://aistudio.google.com/*" });
  if (tabs.length === 0 || !tabs[0].id) {
    console.warn("[SPAA Service Worker] No AI Studio tab found. Waiting...");
    await client.reportStatus(job.job_id, "ERROR", "No hay pestaña abierta de Gemini AI Studio");
    currentJob = null;
    return;
  }

  const tabId = tabs[0].id;

  // 1. Inject text
  chrome.tabs.sendMessage(tabId, { type: "INJECT_TEXT", text: job.spoken_text }, async (res) => {
    if (!res?.success) {
      await client.reportStatus(job.job_id, "ERROR", res?.error || "Fallo al insertar texto");
      currentJob = null;
      return;
    }

    // 2. Trigger generate
    chrome.tabs.sendMessage(tabId, { type: "TRIGGER_GENERATE" }, async (genRes) => {
      if (!genRes?.success) {
        await client.reportStatus(job.job_id, "ERROR", genRes?.error || "Fallo al pulsar Generate");
        currentJob = null;
        return;
      }

      await client.reportStatus(job.job_id, "GENERATING");
    });
  });
}
