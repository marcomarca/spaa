import {
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  HardDriveDownload,
  Loader2,
  Plus,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Book, Chapter } from "../domain/types";
import { api } from "../services/api";
import { OfflineAudioCache } from "../services/offlineAudioCache";

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
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cachedChapterIds, setCachedChapterIds] = useState<Set<string>>(new Set());
  const [downloadingBookId, setDownloadingBookId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  const refreshCached = useCallback(async () => {
    const ids = await OfflineAudioCache.listCachedChapterIds();
    setCachedChapterIds(new Set(ids));
  }, []);

  useEffect(() => {
    refreshCached();
  }, [refreshCached]);

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
      const res = await OfflineAudioCache.downloadChapter(
        chap.id,
        api.getChapterAudioUrl(chap.id),
        chap.audio_sha256 || undefined,
        (p) => {
          const overall = Math.round(((i + p.percent / 100) / readyChapters.length) * 100);
          setDownloadProgress(overall);
        },
      );
      if (res.success) successCount++;
    }

    setDownloadingBookId(null);
    await refreshCached();
    alert(
      `Descarga completada: ${successCount} de ${readyChapters.length} capítulos guardados para escuchar offline.`,
    );
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
    } catch (err) {
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
        }}
      >
        <h2 style={{ fontSize: "1.2rem", fontWeight: "700" }}>Biblioteca</h2>
        <button
          type="button"
          className="btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px" }}
          onClick={() => setShowImport(!showImport)}
        >
          <Plus size={16} /> Importar Markdown
        </button>
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
        books.map((b) => (
          <div key={b.id} className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <h3 style={{ fontSize: "1.1rem" }}>{b.title}</h3>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{b.author}</span>
                {b.chapters?.some((c) => c.is_ready) && (
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
                      gap: "4px",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(59, 130, 246, 0.15)",
                      color: "#60a5fa",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                    title="Descargar todos los capítulos listos para escuchar sin internet"
                  >
                    {downloadingBookId === b.id ? (
                      <>
                        <Loader2 size={12} className="spin-slow" />
                        <span>{downloadProgress}%</span>
                      </>
                    ) : (
                      <>
                        <Download size={12} />
                        <span>Descargar Libro</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {b.chapters && b.chapters.length > 0 && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}
              >
                {b.chapters.map((c) => {
                  const isSelected = activeBook?.id === b.id && activeChapter?.id === c.id;
                  const isCached = cachedChapterIds.has(c.id);
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
                            title="Descargado offline"
                          >
                            <HardDriveDownload size={13} />
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
        ))
      )}
    </div>
  );
}
