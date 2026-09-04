import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  Filter,
  Layers,
  Pause,
  Play,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Square,
  Terminal,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Book,
  QueueChunkItem,
  QueueMonitorData,
  WorkerLogsResponse,
  WorkerProcessStatus,
} from "../domain/types";
import { api } from "../services/api";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

interface MonitorViewProps {
  books: Book[];
  activeBook: Book | null;
}

export function MonitorView({ books, activeBook }: MonitorViewProps) {
  const [selectedBookId, setSelectedBookId] = useState<string>(activeBook?.id || "");
  const [monitorData, setMonitorData] = useState<QueueMonitorData | null>(null);
  const [logsData, setLogsData] = useState<WorkerLogsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [activeSubTab, setActiveSubTab] = useState<"grid" | "logs">("grid");
  const [selectedChunk, setSelectedChunk] = useState<QueueChunkItem | null>(null);
  const [logFilter, setLogFilter] = useState<"all" | "error" | "info">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [workerProcess, setWorkerProcess] = useState<WorkerProcessStatus | null>(null);
  const [isTogglingWorker, setIsTogglingWorker] = useState<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Audio preview playback states & ref
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [isAudioLoading, setIsAudioLoading] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Robust audio teardown helper (releases decoders, locks, and network streams)
  const stopAndCleanupAudio = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
      } catch (err) {
        console.warn("Error during audio cleanup:", err);
      }
      audioRef.current = null;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setAudioDuration(0);
    setIsAudioLoading(false);
    setAudioError(null);
  }, []);

  // Modal closure handler with guaranteed audio teardown
  const handleCloseModal = useCallback(() => {
    stopAndCleanupAudio();
    setSelectedChunk(null);
  }, [stopAndCleanupAudio]);

  // Teardown audio on component unmount
  useEffect(() => {
    return () => {
      stopAndCleanupAudio();
    };
  }, [stopAndCleanupAudio]);

  // Handle chunk selection & automatic audio preview
  useEffect(() => {
    stopAndCleanupAudio();

    if (!selectedChunk || selectedChunk.status !== "READY") {
      return;
    }

    const audioUrl = api.getChunkAudioUrl(selectedChunk.id);
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    setIsAudioLoading(true);
    setAudioError(null);
    setAudioDuration(selectedChunk.duration_seconds || 0);

    const onLoadedMetadata = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onCanPlay = () => {
      setIsAudioLoading(false);
    };

    const onPlaying = () => {
      setIsPlaying(true);
      setIsAudioLoading(false);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onError = () => {
      setIsAudioLoading(false);
      setIsPlaying(false);
      setAudioError("Archivo de audio no disponible en servidor o error de decodificación.");
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    // Auto-play audio preview immediately
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn("Autoplay bloqueado o abortado:", err);
        setIsPlaying(false);
        setIsAudioLoading(false);
      });
    }

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute("src");
        audio.load();
      } catch {}
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [selectedChunk, stopAndCleanupAudio]);

  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch((err) => {
        console.error("Error al reproducir audio:", err);
        setAudioError("Error al iniciar reproducción.");
      });
    } else {
      audio.pause();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number.parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleRestartAudio = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((err) => console.warn("Error restarting audio:", err));
    }
  };

  // Sync selectedBookId with activeBook if changed
  useEffect(() => {
    if (activeBook && !selectedBookId) {
      setSelectedBookId(activeBook.id);
    }
  }, [activeBook, selectedBookId]);

  const fetchStatus = useCallback(async () => {
    try {
      const [monitor, procStatus] = await Promise.all([
        api.fetchQueueMonitor(selectedBookId || undefined),
        api.getWorkerProcessStatus(),
      ]);
      setMonitorData(monitor);
      setWorkerProcess(procStatus);
    } catch (err) {
      console.error("Error cargando monitor:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedBookId]);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await api.fetchWorkerLogs(200);
      setLogsData(data);
    } catch (err) {
      console.error("Error cargando logs:", err);
    }
  }, []);

  // Poll monitor and logs periodically
  useEffect(() => {
    fetchStatus();
    fetchLogs();

    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStatus();
      if (activeSubTab === "logs") {
        fetchLogs();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchStatus, fetchLogs, autoRefresh, activeSubTab]);

  const handleRetryJob = async (jobId: string) => {
    try {
      setActionMessage("Reintentando bloque...");
      await api.retryJob(jobId);
      await fetchStatus();
      setActionMessage("Bloque restablecido a QUEUED ✓");
      setTimeout(() => setActionMessage(null), 3000);
      if (selectedChunk && selectedChunk.job_id === jobId) {
        setSelectedChunk((prev) => (prev ? { ...prev, status: "QUEUED", last_error: null } : null));
      }
    } catch (err) {
      setActionMessage("Error al reintentar bloque");
    }
  };

  const handleRetryAllFailed = async () => {
    try {
      setActionMessage("Reintentando todos los bloques fallidos...");
      const res = await api.retryAllFailedJobs();
      await fetchStatus();
      setActionMessage(`Se restablecieron ${res.reset_count} bloques a QUEUED ✓`);
      setTimeout(() => setActionMessage(null), 3500);
    } catch (err) {
      setActionMessage("Error al reintentar bloques");
    }
  };

  const handleStartWorker = async () => {
    try {
      setIsTogglingWorker(true);
      setActionMessage("Iniciando worker GPU...");
      const res = await api.startWorker("Ryan");
      setWorkerProcess(res.status);
      setActionMessage(res.message);
      await fetchStatus();
      await fetchLogs();
      setTimeout(() => setActionMessage(null), 3500);
    } catch (err) {
      setActionMessage("Error al iniciar worker GPU");
    } finally {
      setIsTogglingWorker(false);
    }
  };

  const handleStopWorker = async () => {
    try {
      setIsTogglingWorker(true);
      setActionMessage("Deteniendo worker GPU y liberando VRAM...");
      const res = await api.stopWorker();
      setWorkerProcess(res.status);
      setActionMessage(res.message);
      await fetchStatus();
      await fetchLogs();
      setTimeout(() => setActionMessage(null), 3500);
    } catch (err) {
      setActionMessage("Error al detener worker GPU");
    } finally {
      setIsTogglingWorker(false);
    }
  };

  // Group chunks by chapter for clean structured visual inspection
  const groupedChunks = useMemo(() => {
    if (!monitorData?.chunks) return [];
    const groups: {
      chapterId: string;
      chapterTitle: string;
      chapterSequence: number;
      chunks: QueueChunkItem[];
    }[] = [];

    const map = new Map<string, (typeof groups)[0]>();

    for (const chunk of monitorData.chunks) {
      if (statusFilter !== "all") {
        if (statusFilter === "READY" && chunk.status !== "READY") continue;
        if (
          statusFilter === "GENERATING" &&
          !["GENERATING", "CLAIMED", "DOWNLOADING"].includes(chunk.status)
        )
          continue;
        if (statusFilter === "QUEUED" && chunk.status !== "QUEUED") continue;
        if (
          statusFilter === "ERROR" &&
          !["RETRY_WAIT", "WAITING_PROVIDER", "FAILED"].includes(chunk.status)
        )
          continue;
      }

      let group = map.get(chunk.chapter_id);
      if (!group) {
        group = {
          chapterId: chunk.chapter_id,
          chapterTitle: chunk.chapter_title || `Capítulo ${chunk.chapter_sequence}`,
          chapterSequence: chunk.chapter_sequence,
          chunks: [],
        };
        map.set(chunk.chapter_id, group);
        groups.push(group);
      }
      group.chunks.push(chunk);
    }

    return groups;
  }, [monitorData?.chunks, statusFilter]);

  // Filter logs
  const filteredLogLines = useMemo(() => {
    if (!logsData?.lines) return [];
    if (logFilter === "error") {
      return logsData.lines.filter(
        (l) => l.includes("[ERROR]") || l.includes("Timeout") || l.includes("Traceback"),
      );
    }
    if (logFilter === "info") {
      return logsData.lines.filter((l) => l.includes("[INFO]"));
    }
    return logsData.lines;
  }, [logsData?.lines, logFilter]);

  const summary = monitorData?.summary;
  const activeWorker = monitorData?.workers?.[0];

  return (
    <div className="monitor-container">
      {/* Top Controls Bar */}
      <div className="monitor-topbar">
        <div className="monitor-title-area">
          <Activity size={18} className="text-primary" />
          <h2 className="monitor-heading">Monitor de Síntesis GPU</h2>
        </div>

        <div className="monitor-actions">
          {books.length > 1 && (
            <select
              className="monitor-select"
              value={selectedBookId}
              onChange={(e) => setSelectedBookId(e.target.value)}
            >
              <option value="">Todos los libros</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className={`monitor-autorefresh-btn ${autoRefresh ? "active" : ""}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? "Auto-refresco activado (3s)" : "Auto-refresco pausado"}
          >
            <span className={`status-dot ${autoRefresh ? "pulse" : ""}`} />
            <span>{autoRefresh ? "En Vivo" : "Pausado"}</span>
          </button>

          <button
            type="button"
            className="monitor-icon-btn"
            onClick={() => {
              fetchStatus();
              fetchLogs();
            }}
            title="Recargar ahora"
          >
            <RefreshCw size={14} className={isLoading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {actionMessage && <div className="monitor-toast">{actionMessage}</div>}

      {/* Worker GPU Status Card */}
      <div className="worker-status-card">
        <div className="worker-header">
          <div className="worker-info">
            <Cpu size={16} className="text-accent-green" />
            <span className="worker-alias">
              {activeWorker?.profile_alias || "NVIDIA RTX 3070 Qwen3-TTS"}
            </span>
          </div>
          <span
            className={`worker-state-pill ${
              workerProcess?.is_running
                ? "busy"
                : activeWorker?.status?.includes("PAUSED")
                  ? "paused"
                  : "ready"
            }`}
          >
            {workerProcess?.is_running ? "GENERANDO EN GPU ⚡" : "DETENIDO / EN REPOSO"}
          </span>
        </div>

        <div className="worker-control-row">
          <div className="worker-meta">
            {workerProcess?.is_running ? (
              <>
                <span>
                  PID: <strong>{workerProcess.pid}</strong> (Voz: {workerProcess.speaker})
                </span>
                <span>VRAM ocupada (~4.5 GB)</span>
              </>
            ) : (
              <>
                <span>VRAM liberada — GPU en reposo</span>
                <span>Worker inactivo</span>
              </>
            )}
          </div>

          <div className="worker-btn-group">
            {workerProcess?.is_running ? (
              <button
                type="button"
                className="worker-action-btn stop"
                onClick={handleStopWorker}
                disabled={isTogglingWorker}
                title="Detiene la generación y libera la memoria de la tarjeta gráfica"
              >
                <Square size={12} fill="currentColor" />
                <span>
                  {isTogglingWorker ? "Deteniendo..." : "Detener Síntesis (Liberar VRAM)"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="worker-action-btn start"
                onClick={handleStartWorker}
                disabled={isTogglingWorker}
                title="Inicia el worker GPU para procesar los bloques en cola"
              >
                <Play size={12} fill="currentColor" />
                <span>{isTogglingWorker ? "Iniciando..." : "Iniciar Síntesis GPU"}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Counters Overview */}
      {summary && (
        <div className="monitor-stats-grid">
          <div className="stat-card ready">
            <div className="stat-val">{summary.ready_count}</div>
            <div className="stat-lbl">
              <CheckCircle2 size={13} /> Listos ✓
            </div>
          </div>
          <div className="stat-card generating">
            <div className="stat-val">{summary.generating_count}</div>
            <div className="stat-lbl">
              <PlayCircle size={13} className="spin-slow" /> En GPU
            </div>
          </div>
          <div className="stat-card queued">
            <div className="stat-val">{summary.queued_count}</div>
            <div className="stat-lbl">
              <Clock size={13} /> En Cola
            </div>
          </div>
          <div className={`stat-card errors ${summary.error_count > 0 ? "has-errors" : ""}`}>
            <div className="stat-val">{summary.error_count}</div>
            <div className="stat-lbl">
              <AlertTriangle size={13} /> Errores
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {summary && (
        <div className="progress-section">
          <div className="progress-labels">
            <span>
              Progreso: {summary.ready_count} / {summary.total_chunks} bloques (
              {summary.progress_percentage}%)
            </span>
            <span>
              <Volume2 size={13} /> {summary.total_audio_minutes} min compilados
            </span>
          </div>
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.max(summary.progress_percentage, 1.5)}%` }}
            />
          </div>
        </div>
      )}

      {/* Sub-Tabs: Matriz de Bloques vs Consola de Logs */}
      <div className="monitor-subtabs">
        <button
          type="button"
          className={`subtab-btn ${activeSubTab === "grid" ? "active" : ""}`}
          onClick={() => setActiveSubTab("grid")}
        >
          <Layers size={14} />
          <span>Matriz de Bloques ({summary?.total_chunks || 0})</span>
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeSubTab === "logs" ? "active" : ""}`}
          onClick={() => {
            setActiveSubTab("logs");
            fetchLogs();
          }}
        >
          <Terminal size={14} />
          <span>Consola de Logs ({logsData?.total_lines || 0})</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* VIEW 1: MATRIZ GRÁFICA DE BLOQUES (CHUNKS)                    */}
      {/* ============================================================ */}
      {activeSubTab === "grid" && (
        <div className="chunks-dashboard">
          {/* Action & Filter Bar */}
          <div className="filter-action-bar">
            <div className="filter-chips">
              <Filter size={12} className="text-muted" />
              <button
                type="button"
                className={`filter-chip ${statusFilter === "all" ? "active" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                Todos
              </button>
              <button
                type="button"
                className={`filter-chip ${statusFilter === "READY" ? "active" : ""}`}
                onClick={() => setStatusFilter("READY")}
              >
                Listos
              </button>
              <button
                type="button"
                className={`filter-chip ${statusFilter === "GENERATING" ? "active" : ""}`}
                onClick={() => setStatusFilter("GENERATING")}
              >
                En GPU
              </button>
              <button
                type="button"
                className={`filter-chip ${statusFilter === "ERROR" ? "active" : ""}`}
                onClick={() => setStatusFilter("ERROR")}
              >
                Errores {summary && summary.error_count > 0 ? `(${summary.error_count})` : ""}
              </button>
            </div>

            {summary && summary.error_count > 0 && (
              <button
                type="button"
                className="retry-all-btn"
                onClick={handleRetryAllFailed}
                title="Restablece todos los bloques con fallo a la cola"
              >
                <RotateCcw size={12} />
                <span>Reintentar Errores ({summary.error_count})</span>
              </button>
            )}
          </div>

          {/* Grouped Chapters & Blocks */}
          <div className="chapters-list">
            {groupedChunks.map((group) => (
              <div key={group.chapterId} className="chapter-group-card">
                <div className="chapter-group-header">
                  <span className="chapter-num">Cap. {group.chapterSequence}</span>
                  <span className="chapter-name">{group.chapterTitle}</span>
                  <span className="chapter-count">{group.chunks.length} bloques</span>
                </div>

                <div className="chunks-grid">
                  {group.chunks.map((chunk) => {
                    const isError = ["RETRY_WAIT", "WAITING_PROVIDER", "FAILED"].includes(
                      chunk.status,
                    );
                    const isGenerating = [
                      "GENERATING",
                      "CLAIMED",
                      "PREPARING",
                      "DOWNLOADING",
                    ].includes(chunk.status);
                    const isReady = chunk.status === "READY";

                    return (
                      <button
                        type="button"
                        key={chunk.id}
                        className={`chunk-tile ${
                          isError
                            ? "tile-error"
                            : isGenerating
                              ? "tile-generating"
                              : isReady
                                ? "tile-ready"
                                : "tile-queued"
                        }`}
                        onClick={() => setSelectedChunk(chunk)}
                      >
                        <div className="chunk-tile-header">
                          <span className="chunk-badge-id">#{chunk.sequence}</span>
                          <span className={`status-pill status-${chunk.status.toLowerCase()}`}>
                            {isReady
                              ? "Listo ✓"
                              : isGenerating
                                ? "En GPU ⚡"
                                : isError
                                  ? "Error ⚠️"
                                  : "En Cola"}
                          </span>
                        </div>

                        <div className="chunk-tile-body">
                          <span className="chunk-words">{chunk.word_count} palabras</span>
                          {isReady && chunk.duration_seconds > 0 && (
                            <span className="chunk-duration" title="Audio listo para escuchar">
                              <Volume2 size={11} className="inline-duration-icon" />
                              {chunk.duration_seconds}s
                            </span>
                          )}
                        </div>

                        {chunk.spoken_preview && (
                          <div className="chunk-preview-snippet">"{chunk.spoken_preview}..."</div>
                        )}

                        {isReady && (
                          <div className="chunk-audio-badge">
                            <Play size={10} className="play-icon-tiny" />
                            <span>Escuchar preview</span>
                          </div>
                        )}

                        {isError && (
                          <div className="chunk-error-banner">
                            <span className="error-text-short">
                              {chunk.last_error?.slice(0, 50) || "Fallo en síntesis"}
                            </span>
                            {chunk.job_id && (
                              <button
                                type="button"
                                className="chunk-retry-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (chunk.job_id) handleRetryJob(chunk.job_id);
                                }}
                              >
                                Reintentar
                              </button>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW 2: CONSOLA DE LOGS EN VIVO                              */}
      {/* ============================================================ */}
      {activeSubTab === "logs" && (
        <div className="logs-console-view">
          <div className="logs-toolbar">
            <div className="logs-meta-info">
              <span className="log-file-path">data/logs/qwen_worker.log</span>
              <span className="log-total-count">
                {logsData?.file_exists
                  ? `${logsData.total_lines} líneas (${((logsData.file_size_bytes || 0) / 1024).toFixed(1)} KB)`
                  : "Archivo no creado aún"}
              </span>
            </div>

            <div className="logs-level-filters">
              <button
                type="button"
                className={`log-filter-btn ${logFilter === "all" ? "active" : ""}`}
                onClick={() => setLogFilter("all")}
              >
                Todos
              </button>
              <button
                type="button"
                className={`log-filter-btn error ${logFilter === "error" ? "active" : ""}`}
                onClick={() => setLogFilter("error")}
              >
                Errores
              </button>
              <button
                type="button"
                className={`log-filter-btn info ${logFilter === "info" ? "active" : ""}`}
                onClick={() => setLogFilter("info")}
              >
                Info
              </button>
            </div>
          </div>

          <div className="terminal-window">
            {filteredLogLines.length === 0 ? (
              <div className="terminal-empty">
                {logsData?.file_exists
                  ? "No hay entradas para el filtro seleccionado."
                  : "Aún no se han generado logs. Inicia el worker con run_qwen_worker.bat para ver la actividad."}
              </div>
            ) : (
              filteredLogLines.map((line, idx) => {
                const isError = line.includes("[ERROR]") || line.includes("Traceback");
                const isWarning = line.includes("[WARNING]") || line.includes("Timeout");
                const isSuccess = line.includes("COMPLETADO") || line.includes("completada ✓");

                return (
                  <div
                    key={`${idx}-${line.slice(0, 30)}`}
                    className={`terminal-line ${
                      isError ? "log-err" : isWarning ? "log-warn" : isSuccess ? "log-success" : ""
                    }`}
                  >
                    <span className="line-num">{idx + 1}</span>
                    <span className="line-text">{line}</span>
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL DE DETALLE DEL BLOQUE (INSPECCIÓN VISUAL & QA AUDIO)   */}
      {/* ============================================================ */}
      {selectedChunk && (
        <dialog
          open
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseModal();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              handleCloseModal();
            }
          }}
        >
          <div className="chunk-modal">
            <div className="chunk-modal-header">
              <div className="modal-title-area">
                <FileText size={18} className="text-primary" />
                <h3>
                  Bloque #{selectedChunk.sequence} — {selectedChunk.chapter_title}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseModal}
                title="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="chunk-modal-body">
              <div className="modal-meta-grid">
                <div className="meta-item">
                  <span className="meta-k">Estado:</span>
                  <span className={`status-pill status-${selectedChunk.status.toLowerCase()}`}>
                    {selectedChunk.status}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-k">Palabras:</span>
                  <span className="meta-v">{selectedChunk.word_count} palabras</span>
                </div>
                <div className="meta-item">
                  <span className="meta-k">Duración Audio:</span>
                  <span className="meta-v">
                    {selectedChunk.duration_seconds > 0
                      ? `${selectedChunk.duration_seconds} s`
                      : "Pendiente"}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-k">Speaker:</span>
                  <span className="meta-v">
                    {selectedChunk.voice} ({selectedChunk.provider})
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-k">Intentos:</span>
                  <span className="meta-v">{selectedChunk.attempts} / 3</span>
                </div>
                {selectedChunk.worker_id && (
                  <div className="meta-item">
                    <span className="meta-k">Worker Asignado:</span>
                    <span className="meta-v">{selectedChunk.worker_id}</span>
                  </div>
                )}
              </div>

              {/* Media Preview de Audio para QA */}
              <div className="modal-audio-player-card">
                <div className="audio-player-header">
                  <div className="audio-player-title">
                    <Volume2 size={16} className="text-primary" />
                    <span>Auditoría de Audio (Media Preview)</span>
                  </div>
                  <div className="audio-player-status-badge">
                    {selectedChunk.status === "READY" ? (
                      isAudioLoading ? (
                        <span className="audio-status-pill loading">Cargando...</span>
                      ) : isPlaying ? (
                        <span className="audio-status-pill playing">
                          <span className="pulse-indicator" /> Reproduciendo
                        </span>
                      ) : (
                        <span className="audio-status-pill paused">En pausa</span>
                      )
                    ) : (
                      <span className="audio-status-pill not-ready">Audio aún no sintetizado</span>
                    )}
                  </div>
                </div>

                {selectedChunk.status === "READY" ? (
                  <div className="audio-player-controls-wrap">
                    <div className="audio-player-main-row">
                      <button
                        type="button"
                        className={`audio-main-play-btn ${isPlaying ? "playing" : ""}`}
                        onClick={handleTogglePlay}
                        title={isPlaying ? "Pausar audio" : "Reproducir audio"}
                      >
                        {isPlaying ? (
                          <Pause size={18} />
                        ) : (
                          <Play size={18} className="play-icon-offset" />
                        )}
                      </button>

                      <button
                        type="button"
                        className="audio-secondary-ctrl-btn"
                        onClick={handleRestartAudio}
                        title="Reiniciar desde el inicio"
                      >
                        <RotateCcw size={14} />
                      </button>

                      <div className="audio-slider-container">
                        <input
                          type="range"
                          min="0"
                          max={
                            audioDuration > 0
                              ? audioDuration
                              : selectedChunk.duration_seconds > 0
                                ? selectedChunk.duration_seconds
                                : 100
                          }
                          step="0.1"
                          value={currentTime}
                          onChange={handleSeek}
                          className="audio-scrubber-slider"
                          aria-label="Progreso de reproducción de audio"
                        />
                      </div>

                      <div className="audio-time-readout">
                        <span className="current-time">{formatTime(currentTime)}</span>
                        <span className="time-sep">/</span>
                        <span className="total-time">
                          {formatTime(
                            audioDuration > 0 ? audioDuration : selectedChunk.duration_seconds,
                          )}
                        </span>
                      </div>
                    </div>

                    {audioError && (
                      <div className="audio-player-error-banner">
                        <AlertTriangle size={14} />
                        <span>{audioError}</span>
                      </div>
                    )}

                    <div className="audio-qa-hint">
                      <span>
                        Audita la pronunciación y fluidez. Si detectas colapsos fonéticos o fallos,
                        puedes re-encolar este bloque inmediatamente abajo.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="audio-player-empty-state">
                    <span>
                      El archivo de audio estará disponible automáticamente para previsualización
                      una vez el worker GPU complete la síntesis (estado "Listo").
                    </span>
                  </div>
                )}
              </div>

              {selectedChunk.last_error && (
                <div className="modal-error-box">
                  <div className="modal-error-title">
                    <AlertTriangle size={14} />
                    <span>Registro de Error:</span>
                  </div>
                  <pre className="modal-error-content">{selectedChunk.last_error}</pre>
                </div>
              )}

              <div className="modal-text-section">
                <span className="modal-section-title">Texto Hablado (TTS):</span>
                <div className="modal-spoken-box">{selectedChunk.spoken_text}</div>
              </div>
            </div>

            <div className="chunk-modal-footer">
              {selectedChunk.job_id && (
                <button
                  type="button"
                  className="modal-retry-action-btn"
                  onClick={() => {
                    if (selectedChunk.job_id) {
                      const jId = selectedChunk.job_id;
                      handleCloseModal();
                      handleRetryJob(jId);
                    }
                  }}
                >
                  <RotateCcw size={14} />
                  <span>
                    {selectedChunk.status === "READY"
                      ? "Re-encolar para re-generar bloque"
                      : "Reintentar este bloque ahora"}
                  </span>
                </button>
              )}
              <button type="button" className="modal-secondary-btn" onClick={handleCloseModal}>
                Cerrar
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
