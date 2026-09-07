import {
  Activity,
  BookOpen,
  Brain,
  Headphones,
  HelpCircle,
  Loader2,
  Server,
  Settings,
  Sparkles,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TransportPlayer } from "./components/TransportPlayer";
import type { Book, Chapter, NetworkSyncState, OfflineManifest } from "./domain/types";
import { LibraryView } from "./features/LibraryView";
import { MonitorView } from "./features/MonitorView";
import { StudyQuestionsView } from "./features/StudyQuestionsView";
import { StudyView } from "./features/StudyView";
import { WorkspaceView } from "./features/WorkspaceView";
import { syncManager } from "./services/SyncManager";
import { api } from "./services/api";
import { LocalStorageAdapter } from "./services/storage";

type Tab = "player" | "library" | "workspace" | "study" | "questions" | "monitor";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("player");
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [syncState, setSyncState] = useState<NetworkSyncState>(syncManager.getState());
  const [offlineHours, setOfflineHours] = useState<number>(12.0);

  // Server Connection Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [serverLanUrl, setServerLanUrl] = useState(() => syncManager.getLanUrl());
  const [serverTailscaleUrl, setServerTailscaleUrl] = useState(() => syncManager.getTailscaleUrl());
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const bookList = await api.fetchBooks();
      // Fetch full details (including chapters) for each book in parallel
      const detailedBooks = await Promise.all(
        bookList.map(async (b) => {
          try {
            const detailed = await api.fetchBookDetails(b.id);
            LocalStorageAdapter.saveCachedBookDetails(detailed);
            return detailed;
          } catch {
            return LocalStorageAdapter.getCachedBookDetails(b.id) || b;
          }
        }),
      );
      setBooks(detailedBooks);
      LocalStorageAdapter.saveCachedBooks(detailedBooks);

      // Load offline buffer manifest
      try {
        const manifest: OfflineManifest = await api.fetchOfflineManifest();
        setOfflineHours(manifest.total_duration_hours);
      } catch {
        // Fallback default
      }

      // If active book saved, select it
      const savedBookId = LocalStorageAdapter.getActiveBookId();
      const target = savedBookId
        ? detailedBooks.find((b) => b.id === savedBookId) || detailedBooks[0]
        : detailedBooks[0];

      if (target) {
        setActiveBook(target);
        if (target.chapters && target.chapters.length > 0) {
          const currentId = activeChapter?.id;
          const matchingChap = target.chapters.find((c) => c.id === currentId);
          setActiveChapter(matchingChap || target.chapters[0]);
        }
      }
    } catch {
      // Offline fallback: load cached books from local storage
      const cachedBooks = LocalStorageAdapter.getCachedBooks();
      if (cachedBooks.length > 0) {
        setBooks(cachedBooks);
        const savedBookId = LocalStorageAdapter.getActiveBookId() || cachedBooks[0].id;
        const cachedDetailed =
          LocalStorageAdapter.getCachedBookDetails(savedBookId) ||
          cachedBooks.find((b) => b.id === savedBookId) ||
          cachedBooks[0];
        setActiveBook(cachedDetailed);
        if (cachedDetailed.chapters && cachedDetailed.chapters.length > 0) {
          setActiveChapter(cachedDetailed.chapters[0]);
        }
      }
    }
  }, [activeChapter?.id]);

  useEffect(() => {
    const unsub = syncManager.subscribe((state) => {
      setSyncState(state);
    });
    syncManager.probeBestConnection().then(() => {
      loadData();
    });
    return unsub;
  }, [loadData]);

  const handleConnectServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTestingConnection(true);
    setConnectionMessage(null);

    syncManager.setUrls(serverLanUrl.trim(), serverTailscaleUrl.trim());
    const bestUrl = await syncManager.probeBestConnection();

    setIsTestingConnection(false);
    if (bestUrl) {
      setConnectionMessage(`✓ ¡Conexión exitosa a: ${bestUrl}!`);
      await loadData();
      setTimeout(() => {
        setShowSettingsModal(false);
        setConnectionMessage(null);
      }, 1200);
    } else {
      setConnectionMessage(
        "⚠️ No se pudo conectar. Verifica que tu PC esté encendida con .\\scripts\\dev.ps1 y conectada al mismo Wi-Fi.",
      );
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectChapter = (book: Book, chapter: Chapter) => {
    setActiveBook(book);
    setActiveChapter(chapter);
    LocalStorageAdapter.setActiveBookId(book.id);
    setActiveTab("player");
  };

  const getStatusLabel = () => {
    if (!syncState.isOnline) return "Offline";
    if (syncState.mode === "lan") return "LAN";
    if (syncState.mode === "tailscale") return "Tailscale";
    return "Servidor Local";
  };

  return (
    <div className="app-container">
      <header className="header-status">
        <button
          type="button"
          className="status-badge"
          style={{
            color: syncState.isOnline ? "#10b981" : "#94a3b8",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
          onClick={() => setShowSettingsModal(true)}
          title="Configurar conexión con tu PC / Servidor"
        >
          {syncState.isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{getStatusLabel()}</span>
          {syncState.pendingEventsCount > 0 && (
            <span
              style={{
                fontSize: "0.75rem",
                background: "#f59e0b",
                color: "#000",
                padding: "1px 5px",
                borderRadius: "10px",
              }}
            >
              {syncState.pendingEventsCount} pend
            </span>
          )}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="buffer-badge">
            <span>Buffer: {offlineHours.toFixed(1)}h</span>
          </div>
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: "4px",
            }}
            title="Ajustes de Servidor y Conexión"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      <main className="content-area">
        {activeTab === "player" && (
          <TransportPlayer
            currentBook={activeBook}
            currentChapter={activeChapter}
            onSelectChapter={handleSelectChapter}
            onOpenStudy={() => setActiveTab("study")}
          />
        )}

        {activeTab === "library" && (
          <LibraryView
            books={books}
            activeBook={activeBook}
            activeChapter={activeChapter}
            onSelectChapter={handleSelectChapter}
            onRefresh={loadData}
          />
        )}
        {activeTab === "workspace" && (
          <WorkspaceView books={books} activeBook={activeBook} activeChapter={activeChapter} />
        )}
        {activeTab === "study" && (
          <StudyView activeBook={activeBook} activeChapter={activeChapter} />
        )}
        {activeTab === "questions" && (
          <StudyQuestionsView activeBook={activeBook} activeChapter={activeChapter} />
        )}
        {activeTab === "monitor" && <MonitorView books={books} activeBook={activeBook} />}
      </main>

      <nav className="nav-bar">
        <button
          type="button"
          className={`nav-item ${activeTab === "player" ? "active" : ""}`}
          onClick={() => setActiveTab("player")}
        >
          <Headphones size={20} />
          <span>Player</span>
        </button>
        <button
          type="button"
          className={`nav-item ${activeTab === "library" ? "active" : ""}`}
          onClick={() => setActiveTab("library")}
        >
          <BookOpen size={20} />
          <span>Biblioteca</span>
        </button>
        <button
          type="button"
          className={`nav-item ${activeTab === "monitor" ? "active" : ""}`}
          onClick={() => setActiveTab("monitor")}
        >
          <Activity size={20} />
          <span>Monitor</span>
        </button>
        <button
          type="button"
          className={`nav-item ${activeTab === "study" ? "active" : ""}`}
          onClick={() => setActiveTab("study")}
        >
          <Brain size={20} />
          <span>Cheats</span>
        </button>
        <button
          type="button"
          className={`nav-item ${activeTab === "questions" ? "active" : ""}`}
          onClick={() => setActiveTab("questions")}
        >
          <HelpCircle size={20} />
          <span>Examen</span>
        </button>
        <button
          type="button"
          className={`nav-item ${activeTab === "workspace" ? "active" : ""}`}
          onClick={() => setActiveTab("workspace")}
        >
          <Sparkles size={20} />
          <span>Workspace</span>
        </button>
      </nav>

      {/* Server Connection Modal */}
      {showSettingsModal && (
        <dialog
          open
          className="modal-backdrop"
          aria-label="Conexión con el servidor"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettingsModal(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowSettingsModal(false);
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "440px",
              width: "100%",
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
                <Server size={18} color="#3b82f6" />
                <h3 style={{ fontSize: "1.05rem", fontWeight: "700" }}>
                  Conexión con tu PC (SPAA)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
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
                fontSize: "0.8rem",
                color: "#94a3b8",
                marginBottom: "16px",
                lineHeight: 1.4,
              }}
            >
              Para que tu smartphone descargue y sincronice los libros de tu PC, ingresa la IP local
              de tu computadora en la misma red Wi-Fi.
            </p>

            <form
              onSubmit={handleConnectServer}
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <div>
                <label
                  htmlFor="server-lan-url"
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#64748b",
                    marginBottom: "4px",
                  }}
                >
                  Dirección Wi-Fi / LAN de tu PC
                </label>
                <input
                  id="server-lan-url"
                  className="input-field"
                  value={serverLanUrl}
                  onChange={(e) => setServerLanUrl(e.target.value)}
                  placeholder="http://192.168.10.73:8009"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="server-tailscale-url"
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "#64748b",
                    marginBottom: "4px",
                  }}
                >
                  Dirección Tailscale (Opcional)
                </label>
                <input
                  id="server-tailscale-url"
                  className="input-field"
                  value={serverTailscaleUrl}
                  onChange={(e) => setServerTailscaleUrl(e.target.value)}
                  placeholder="http://100.x.y.z:8009"
                />
              </div>

              {connectionMessage && (
                <div
                  style={{
                    fontSize: "0.8rem",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    backgroundColor: connectionMessage.startsWith("✓")
                      ? "rgba(16, 185, 129, 0.15)"
                      : "rgba(239, 68, 68, 0.15)",
                    color: connectionMessage.startsWith("✓") ? "#10b981" : "#f87171",
                  }}
                >
                  {connectionMessage}
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isTestingConnection}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  {isTestingConnection ? (
                    <>
                      <Loader2 size={16} className="spin-slow" />
                      <span>Conectando...</span>
                    </>
                  ) : (
                    <span>Guardar y Conectar</span>
                  )}
                </button>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => setShowSettingsModal(false)}
                >
                  Cerrar
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}
    </div>
  );
}
