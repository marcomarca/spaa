import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  HardDriveDownload,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Book, Chapter } from "../domain/types";
import { api } from "../services/api";
import { OfflineAudioCache } from "../services/offlineAudioCache";
import {
  type IntegrityCheckResult,
  OfflineIntegrityDetector,
} from "../services/offlineIntegrityDetector";

interface LibraryViewProps {
  books: Book[];
  activeBook: Book | null;
  activeChapter: Chapter | null;
  onSelectChapter: (book: Book, chapter: Chapter) => void;
  onRefresh: () => void;
}

export function LibraryView({
  books,
  activeBook,
  activeChapter,
  onSelectChapter,
  onRefresh,
}: LibraryViewProps) {
  const [showImport, setShowImport] = useState(false);
  const [showDetectorModal, setShowDetectorModal] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cachedChapterIds, setCachedChapterIds] = useState<Set<string>>(new Set());
  const [auditMap, setAuditMap] = useState<Record<string, IntegrityCheckResult>>({});
  const [isAuditing, setIsAuditing] = useState(false);
  const [downloadingBookId, setDownloadingBookId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [totalStorageBytes, setTotalStorageBytes] = useState<number>(0);

  const runAudit = useCallback(async () => {
    setIsAuditing(true);
    const allChaps = books.flatMap((b) => b.chapters || []);
    const audits = await OfflineAudioCache.auditAllChapters(
      allChaps.map((c) => ({ id: c.id, title: c.title, sha256: c.audio_sha256 || undefined })),
    );
    const map: Record<string, IntegrityCheckResult> = {};
    for (const a of audits) {
      map[a.chapterId] = a;
    }
    setAuditMap(map);

    const validIds = audits.filter((a) => a.isValidAudio).map((a) => a.chapterId);
    setCachedChapterIds(new Set(validIds));

    const totalBytes = await OfflineAudioCache.getCachedStorageSize();
    setTotalStorageBytes(totalBytes);
    setIsAuditing(false);
  }, [books]);

  const refreshCached = useCallback(async () => {
    const ids = await OfflineAudioCache.listCachedChapterIds();
    setCachedChapterIds(new Set(ids));
    const totalBytes = await OfflineAudioCache.getCachedStorageSize();
    setTotalStorageBytes(totalBytes);
  }, []);

  useEffect(() => {
    refreshCached();
    runAudit();
  }, [refreshCached, runAudit]);

  const handleDownloadBookOffline = async (book: Book) => {
    if (!book.chapters || downloadingBookId) return;
    const readyChapters = book.chapters.filter((c) => c.is_ready);
    if (readyChapters.length === 0) {
      alert("No hay capítulos completados y listos para descargar en este libro.");
      return;
    }

    setDownloadingBookId(book.id);
    setDownloadProgress(0);

    let successCount = 0;
    for (let i = 0; i < readyChapters.length; i++) {
      const chap = readyChapters[i];
      // Run audit check on this chapter first
      const audit = await OfflineAudioCache.auditChapter(chap.id, chap.audio_sha256 || undefined);
      if (audit.isValidAudio) {
        successCount++;
        continue;
      }

      // If corrupted or missing, perform rigorous download
      const res = await OfflineAudioCache.downloadChapter(
        chap.id,
        api.getChapterAudioUrl(chap.id),
        chap.audio_sha256 || undefined,
        (p) => {
          const overall = Math.round(((i + p.percent / 100) / readyChapters.length) * 100);
          setDownloadProgress(overall);
        },
      );

      if (res.success) {
        successCount++;
      } else {
        console.error(`[LibraryView] Falló descarga de capítulo ${chap.sequence}:`, res.error);
        alert(
          `Fallo en capítulo ${chap.sequence} ("${chap.title}"):\n${res.error || "Error de red"}\n\nEl Detector ha bloqueado el guardado de datos inválidos.`,
        );
        break;
      }
    }

    setDownloadingBookId(null);
    await refreshCached();
    await runAudit();
    alert(
      `Descarga verificada: ${successCount} de ${readyChapters.length} capítulos listos y auditados para escuchar offline.`,
    );
  };

  const handlePurgeCorrupted = async () => {
    const allChaps = books.flatMap((b) => b.chapters || []);
    const count = await OfflineAudioCache.purgeCorruptedOrFake(allChaps.map((c) => c.id));
    await refreshCached();
    await runAudit();
    alert(`Se purgaron ${count} archivos locales inválidos o falsos.`);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !markdown) return;
    setIsSubmitting(true);
    try {
      await api.importBook(title, author, markdown);
      setTitle("");
      setAuthor("");
      setMarkdown("");
      setShowImport(false);
      onRefresh();
    } catch {
      alert("Error al importar libro.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <h2 style={{ fontSize: "1.2rem", fontWeight: "700" }}>Biblioteca</h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            className="btn-secondary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 12px",
              backgroundColor: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "8px",
              color: "#60a5fa",
              fontSize: "0.85rem",
              fontWeight: "600",
              cursor: "pointer",
            }}
            onClick={() => {
              setShowDetectorModal(true);
              runAudit();
            }}
            title="Abrir Detector de Integridad Offline"
          >
            <ShieldCheck size={16} color="#60a5fa" />
            <span>Detector Offline</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px" }}
            onClick={() => setShowImport(!showImport)}
          >
            <Plus size={16} /> Importar Markdown
          </button>
        </div>
      </div>

      {showImport && (
        <form onSubmit={handleImport} className="card" style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "1rem", marginBottom: "12px" }}>Importar nuevo libro</h3>
          <input
            className="input-field"
            placeholder="Título del libro"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <input
            className="input-field"
            placeholder="Autor"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <textarea
            className="textarea-field"
            placeholder="Pega aquí el contenido Markdown (# Capítulo 1...)"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Procesando..." : "Importar y Segmentar"}
          </button>
        </form>
      )}

      {books.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "32px" }}>
          <BookOpen size={40} color="#64748b" style={{ margin: "0 auto 12px" }} />
          <p style={{ color: "#94a3b8" }}>No hay libros en la biblioteca.</p>
        </div>
      ) : (
        books.map((b) => {
          const readyChapters = b.chapters?.filter((c) => c.is_ready) || [];
          const allReadyCached =
            readyChapters.length > 0 && readyChapters.every((c) => cachedChapterIds.has(c.id));
          const cachedCount = readyChapters.filter((c) => cachedChapterIds.has(c.id)).length;

          return (
            <div key={b.id} className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                  gap: "10px",
                }}
              >
                <div>
                  <h3 style={{ fontSize: "1.1rem" }}>{b.title}</h3>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{b.author}</span>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {readyChapters.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadBookOffline(b);
                      }}
                      disabled={downloadingBookId === b.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        backgroundColor: allReadyCached
                          ? "rgba(16, 185, 129, 0.15)"
                          : "rgba(59, 130, 246, 0.2)",
                        color: allReadyCached ? "#10b981" : "#60a5fa",
                        border: allReadyCached
                          ? "1px solid rgba(16, 185, 129, 0.4)"
                          : "1px solid rgba(59, 130, 246, 0.4)",
                        fontSize: "0.78rem",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                      title="Descargar todos los capítulos listos para escuchar sin internet"
                    >
                      {downloadingBookId === b.id ? (
                        <>
                          <Loader2 size={13} className="spin-slow" />
                          <span>Descargando {downloadProgress}%</span>
                        </>
                      ) : allReadyCached ? (
                        <>
                          <CheckCircle2 size={13} color="#10b981" />
                          <span>
                            Offline Listo ({cachedCount}/{readyChapters.length})
                          </span>
                        </>
                      ) : (
                        <>
                          <Download size={13} />
                          <span>Descargar Libro ({readyChapters.length - cachedCount} listos)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {b.chapters && b.chapters.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    marginTop: "12px",
                  }}
                >
                  {b.chapters.map((c) => {
                    const isSelected = activeBook?.id === b.id && activeChapter?.id === c.id;
                    const isCached = cachedChapterIds.has(c.id);
                    const audit = auditMap[c.id];
                    const isCorrupted = audit && !audit.isValidAudio && audit.status !== "MISSING";

                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onSelectChapter(b, c)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          backgroundColor: isSelected
                            ? "rgba(59, 130, 246, 0.2)"
                            : "rgba(255, 255, 255, 0.03)",
                          border: isSelected ? "1px solid #3b82f6" : "1px solid transparent",
                          color: "inherit",
                          textAlign: "left",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Volume2 size={16} color={c.is_ready ? "#10b981" : "#64748b"} />
                          <span style={{ fontSize: "0.9rem" }}>
                            {c.sequence}. {c.title}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "0.8rem",
                            color: "#94a3b8",
                          }}
                        >
                          {isCached && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                                color: "#10b981",
                              }}
                              title="Descargado e integridad verificada"
                            >
                              <HardDriveDownload size={13} />
                              <span style={{ fontSize: "0.72rem" }}>Offline</span>
                            </span>
                          )}
                          {isCorrupted && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                                color: "#ef4444",
                              }}
                              title={`Archivo dañado: ${audit.errorMessage || "Corrupto"}`}
                            >
                              <AlertTriangle size={13} />
                              <span style={{ fontSize: "0.72rem", color: "#f87171" }}>Dañado</span>
                            </span>
                          )}
                          <span>{c.word_count} palabras</span>
                          {c.is_ready ? (
                            <CheckCircle2 size={14} color="#10b981" />
                          ) : (
                            <Clock size={14} color="#f59e0b" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Detector de Integridad Offline Modal */}
      {showDetectorModal && (
        <dialog
          open
          className="modal-backdrop"
          aria-label="Detector de Integridad Offline"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDetectorModal(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowDetectorModal(false);
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "560px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              backgroundColor: "#151d30",
              border: "1px solid #2a3754",
              borderRadius: "12px",
              padding: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <ShieldCheck size={20} color="#60a5fa" />
                <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>
                  Detector de Integridad Offline
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDetectorModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <p
              style={{
                fontSize: "0.82rem",
                color: "#94a3b8",
                marginBottom: "14px",
                lineHeight: 1.4,
              }}
            >
              Este detector audita el almacenamiento físico en tu dispositivo móvil, analizando
              magic bytes, tamaño real y hash criptográfico SHA-256 para evitar descargas falsas o
              corruptas.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                borderRadius: "8px",
                marginBottom: "16px",
                fontSize: "0.85rem",
              }}
            >
              <div>
                <span style={{ color: "#94a3b8" }}>Almacenamiento usado: </span>
                <strong style={{ color: "#f8fafc" }}>
                  {(totalStorageBytes / (1024 * 1024)).toFixed(2)} MB
                </strong>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={runAudit}
                  disabled={isAuditing}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(59, 130, 246, 0.2)",
                    border: "1px solid rgba(59, 130, 246, 0.4)",
                    color: "#60a5fa",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                  }}
                >
                  <RefreshCw size={12} className={isAuditing ? "spin-slow" : ""} />
                  <span>{isAuditing ? "Auditando..." : "Re-auditar"}</span>
                </button>
                <button
                  type="button"
                  onClick={handlePurgeCorrupted}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(239, 68, 68, 0.2)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#f87171",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                  }}
                  title="Eliminar archivos falsos o corruptos"
                >
                  <Trash2 size={12} />
                  <span>Purgar Dañados</span>
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {books.flatMap((b) => b.chapters || []).length === 0 ? (
                <p style={{ color: "#64748b", fontSize: "0.85rem", textAlign: "center" }}>
                  No hay capítulos registrados en la biblioteca.
                </p>
              ) : (
                books.map((b) => (
                  <div key={b.id} style={{ marginBottom: "12px" }}>
                    <h4 style={{ fontSize: "0.9rem", color: "#cbd5e1", marginBottom: "6px" }}>
                      {b.title}
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {b.chapters?.map((c) => {
                        const audit = auditMap[c.id];
                        const status = audit ? audit.status : "MISSING";
                        const isOk = status === "VERIFIED_READY";
                        const isMissing = status === "MISSING";
                        const isError = !isOk && !isMissing;

                        return (
                          <div
                            key={c.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "8px 12px",
                              borderRadius: "6px",
                              backgroundColor: isOk
                                ? "rgba(16, 185, 129, 0.08)"
                                : isError
                                  ? "rgba(239, 68, 68, 0.1)"
                                  : "rgba(255, 255, 255, 0.02)",
                              border: isOk
                                ? "1px solid rgba(16, 185, 129, 0.2)"
                                : isError
                                  ? "1px solid rgba(239, 68, 68, 0.3)"
                                  : "1px solid rgba(255, 255, 255, 0.05)",
                              fontSize: "0.82rem",
                            }}
                          >
                            <div style={{ maxWidth: "60%" }}>
                              <div style={{ fontWeight: "600", color: "#e2e8f0" }}>
                                {c.sequence}. {c.title}
                              </div>
                              {audit && audit.byteLength > 0 && (
                                <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                                  Tamaño: {(audit.byteLength / (1024 * 1024)).toFixed(2)} MB
                                  {audit.detectedFormat &&
                                    ` • Formato: ${audit.detectedFormat.toUpperCase()}`}
                                </div>
                              )}
                              {audit?.errorMessage && (
                                <div
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "#f87171",
                                    marginTop: "2px",
                                  }}
                                >
                                  {audit.errorMessage}
                                </div>
                              )}
                            </div>
                            <div>
                              <span
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: "4px",
                                  fontSize: "0.75rem",
                                  fontWeight: "600",
                                  backgroundColor: isOk
                                    ? "rgba(16, 185, 129, 0.2)"
                                    : isError
                                      ? "rgba(239, 68, 68, 0.25)"
                                      : "rgba(100, 116, 139, 0.2)",
                                  color: isOk ? "#10b981" : isError ? "#f87171" : "#94a3b8",
                                }}
                              >
                                {OfflineIntegrityDetector.getStatusLabel(status)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: "16px", textAlign: "right" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDetectorModal(false)}
                style={{ padding: "6px 14px", fontSize: "0.85rem" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
