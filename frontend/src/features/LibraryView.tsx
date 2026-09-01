import { BookOpen, CheckCircle2, Clock, Plus, Volume2 } from "lucide-react";
import { useState } from "react";
import type { Book, Chapter } from "../domain/types";
import { api } from "../services/api";

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
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{b.author}</span>
            </div>

            {b.chapters && b.chapters.length > 0 && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}
              >
                {b.chapters.map((c) => {
                  const isSelected = activeBook?.id === b.id && activeChapter?.id === c.id;
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
