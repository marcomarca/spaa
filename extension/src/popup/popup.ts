const statusBadge = document.getElementById("status-badge") as HTMLSpanElement;
const jobIndicator = document.getElementById("job-indicator") as HTMLSpanElement;
const workerIdInput = document.getElementById("workerIdInput") as HTMLInputElement;
const profileAliasInput = document.getElementById("profileAliasInput") as HTMLInputElement;
const backendUrlInput = document.getElementById("backendUrlInput") as HTMLInputElement;
const saveConfigBtn = document.getElementById("saveConfigBtn") as HTMLButtonElement;
const togglePauseBtn = document.getElementById("togglePauseBtn") as HTMLButtonElement;

let isPaused = false;

function refreshStatus() {
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
    refreshStatus();
  });
});

refreshStatus();
setInterval(refreshStatus, 2000);
