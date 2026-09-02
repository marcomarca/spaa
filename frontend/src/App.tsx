import { BookOpen, Brain, Headphones, HelpCircle, Sparkles, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TransportPlayer } from "./components/TransportPlayer";
import type { Book, Chapter, NetworkSyncState, OfflineManifest } from "./domain/types";
import { LibraryView } from "./features/LibraryView";
import { StudyQuestionsView } from "./features/StudyQuestionsView";
import { StudyView } from "./features/StudyView";
import { WorkspaceView } from "./features/WorkspaceView";
import { syncManager } from "./services/SyncManager";
import { api } from "./services/api";
import { LocalStorageAdapter } from "./services/storage";

type Tab = "player" | "library" | "workspace" | "study" | "questions";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("player");
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [syncState, setSyncState] = useState<NetworkSyncState>(syncManager.getState());
  const [offlineHours, setOfflineHours] = useState<number>(12.0);

  useEffect(() => {
    const unsub = syncManager.subscribe((state) => {
      setSyncState(state);
    });
    syncManager.probeBestConnection();
    return unsub;
  }, []);

  const loadData = useCallback(async () => {
    try {
      const bookList = await api.fetchBooks();
      setBooks(bookList);

      // Load offline buffer manifest
      try {
        const manifest: OfflineManifest = await api.fetchOfflineManifest();
        setOfflineHours(manifest.total_duration_hours);
      } catch {
        // Fallback default
      }

      // If active book saved, select it
      const savedBookId = LocalStorageAdapter.getActiveBookId();
      if (savedBookId && bookList.length > 0) {
        const found = bookList.find((b) => b.id === savedBookId);
        if (found) {
          const detailed = await api.fetchBookDetails(found.id);
          setActiveBook(detailed);
          if (detailed.chapters && detailed.chapters.length > 0) {
            setActiveChapter(detailed.chapters[0]);
          }
        }
      } else if (bookList.length > 0) {
        const detailed = await api.fetchBookDetails(bookList[0].id);
        setActiveBook(detailed);
        if (detailed.chapters && detailed.chapters.length > 0) {
          setActiveChapter(detailed.chapters[0]);
        }
      }
    } catch {
      // Offline fallback
    }
  }, []);

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
          onClick={() => syncManager.probeBestConnection()}
          title="Haz clic para re-detectar conexión LAN/Tailscale"
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
        <div className="buffer-badge">
          <span>Buffer: {offlineHours.toFixed(1)}h</span>
        </div>
      </header>

      <main className="content-area">
        {activeTab === "player" && (
          <TransportPlayer
            currentBook={activeBook}
            currentChapter={activeChapter}
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
    </div>
  );
}
