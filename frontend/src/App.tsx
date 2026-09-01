import { BookOpen, Headphones, Sparkles, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { TransportPlayer } from "./components/TransportPlayer";
import type { Book, Chapter, OfflineManifest } from "./domain/types";
import { LibraryView } from "./features/LibraryView";
import { StudyView } from "./features/StudyView";
import { WorkspaceView } from "./features/WorkspaceView";
import { api } from "./services/api";
import { LocalStorageAdapter } from "./services/storage";

type Tab = "player" | "library" | "workspace" | "study";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("player");
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineHours, setOfflineHours] = useState<number>(12.0);

  const loadData = async () => {
    try {
      const bookList = await api.fetchBooks();
      setBooks(bookList);
      setIsOnline(true);

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
      setIsOnline(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectChapter = (book: Book, chapter: Chapter) => {
    setActiveBook(book);
    setActiveChapter(chapter);
    LocalStorageAdapter.setActiveBookId(book.id);
    setActiveTab("player");
  };

  return (
    <div className="app-container">
      <header className="header-status">
        <div className="status-badge" style={{ color: isOnline ? "#10b981" : "#94a3b8" }}>
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{isOnline ? "LAN Conectado" : "Offline"}</span>
        </div>
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
          className={`nav-item ${activeTab === "workspace" ? "active" : ""}`}
          onClick={() => setActiveTab("workspace")}
        >
          <Sparkles size={20} />
          <span>AI Workspace</span>
        </button>
        <button
          type="button"
          className={`nav-item ${activeTab === "study" ? "active" : ""}`}
          onClick={() => setActiveTab("study")}
        >
          <BookOpen size={20} />
          <span>Study</span>
        </button>
      </nav>
    </div>
  );
}
