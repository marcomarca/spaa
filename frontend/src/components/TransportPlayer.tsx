import { Bookmark, FastForward, Pause, Play, Rewind, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Book, Chapter } from "../domain/types";
import { api } from "../services/api";
import { LocalStorageAdapter } from "../services/storage";

interface TransportPlayerProps {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  onNextChapter?: () => void;
  onPrevChapter?: () => void;
  onOpenStudy?: () => void;
}

export function TransportPlayer({
  currentBook,
  currentChapter,
  onOpenStudy,
}: TransportPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(() => LocalStorageAdapter.getSpeed());
  const [skipSilence, setSkipSilence] = useState<boolean>(() =>
    LocalStorageAdapter.getSkipSilence(),
  );
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const availableSpeeds = [0.8, 1.0, 1.2, 1.4, 1.6, 2.0, 2.5, 3.0];

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  const togglePlay = () => {
    if (!audioRef.current || !currentChapter?.is_ready) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  const seekRelative = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + seconds);
    }
  };

  const cycleSpeed = () => {
    const currentIndex = availableSpeeds.indexOf(speed);
    const nextSpeed = availableSpeeds[(currentIndex + 1) % availableSpeeds.length];
    setSpeed(nextSpeed);
    LocalStorageAdapter.setSpeed(nextSpeed);
  };

  const toggleSkipSilence = () => {
    const next = !skipSilence;
    setSkipSilence(next);
    LocalStorageAdapter.setSkipSilence(next);
  };

  const handleBookmark = () => {
    if (!currentBook || !currentChapter || !audioRef.current) return;
    const pos = Math.floor(audioRef.current.currentTime * 1000);
    LocalStorageAdapter.addPendingEvent({
      event_id: crypto.randomUUID(),
      event_type: "BookmarkCreated",
      entity_id: currentChapter.id,
      timestamp: new Date().toISOString(),
      payload: {
        book_id: currentBook.id,
        chapter_id: currentChapter.id,
        position_ms: pos,
      },
    });
    setBookmarkSaved(true);
    setTimeout(() => setBookmarkSaved(false), 2000);
  };

  const audioSrc = currentChapter?.is_ready ? api.getChapterAudioUrl(currentChapter.id) : undefined;

  return (
    <div className="transport-card">
      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        />
      )}

      <div>
        <h2 className="transport-title">{currentBook?.title || "Ningún libro seleccionado"}</h2>
        <p className="transport-chapter">
          {currentChapter
            ? `Capítulo ${currentChapter.sequence}: ${currentChapter.title}`
            : "Selecciona un capítulo"}
        </p>
      </div>

      <button
        type="button"
        className="play-button-large"
        onClick={togglePlay}
        disabled={!currentChapter?.is_ready}
        aria-label={isPlaying ? "Pausar" : "Reproducir"}
      >
        {isPlaying ? <Pause size={44} /> : <Play size={44} style={{ marginLeft: "4px" }} />}
      </button>

      <div className="seek-controls">
        <button
          type="button"
          className="seek-btn"
          onClick={() => seekRelative(-15)}
          aria-label="Retroceder 15 segundos"
        >
          <Rewind size={18} /> -15s
        </button>
        <button
          type="button"
          className="seek-btn"
          onClick={() => seekRelative(30)}
          aria-label="Avanzar 30 segundos"
        >
          +30s <FastForward size={18} />
        </button>
      </div>

      <div className="transport-toggles">
        <button type="button" className="toggle-chip active" onClick={cycleSpeed}>
          {speed.toFixed(1)}x
        </button>
        <button
          type="button"
          className={`toggle-chip ${skipSilence ? "active" : ""}`}
          onClick={toggleSkipSilence}
        >
          Skip silence
        </button>
      </div>

      <div className="action-row">
        <button type="button" className="action-btn" onClick={handleBookmark}>
          <Bookmark size={18} color={bookmarkSaved ? "#10b981" : "currentColor"} />
          {bookmarkSaved ? "Guardado" : "Bookmark"}
        </button>
        <button type="button" className="action-btn" onClick={onOpenStudy}>
          <Sparkles size={18} /> Study
        </button>
      </div>
    </div>
  );
}
