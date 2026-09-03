import {
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FastForward,
  ListMusic,
  Loader2,
  Music,
  Pause,
  Play,
  Rewind,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Book, Chapter, PlayableTrack, ReadyChunkInfo } from "../domain/types";
import { api } from "../services/api";
import { LocalStorageAdapter } from "../services/storage";

interface TransportPlayerProps {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  onSelectChapter?: (book: Book, chapter: Chapter) => void;
  onOpenStudy?: () => void;
}

export function TransportPlayer({
  currentBook,
  currentChapter,
  onSelectChapter,
  onOpenStudy,
}: TransportPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(() => LocalStorageAdapter.getSpeed());
  const [skipSilence, setSkipSilence] = useState<boolean>(() =>
    LocalStorageAdapter.getSkipSilence(),
  );
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const [activeTrack, setActiveTrack] = useState<PlayableTrack | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const availableSpeeds = [0.8, 1.0, 1.2, 1.4, 1.6, 2.0, 2.5, 3.0];

  // Helper format seconds to mm:ss
  const formatTime = (secs: number): string => {
    if (Number.isNaN(secs) || secs < 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Build the flat list of all playable tracks available in currentBook
  const allPlayableTracks = useMemo<PlayableTrack[]>(() => {
    if (!currentBook?.chapters) return [];
    const tracks: PlayableTrack[] = [];

    for (const chap of currentBook.chapters) {
      if (chap.is_ready) {
        // Full compiled chapter audio
        tracks.push({
          id: `chap-${chap.id}`,
          type: "chapter",
          chapterId: chap.id,
          chapterTitle: chap.title,
          chapterSequence: chap.sequence,
          title: `Capítulo ${chap.sequence}: ${chap.title}`,
          subtitle: "Capítulo completo compilado",
          durationSeconds: chap.duration_seconds,
          audioUrl: api.getChapterAudioUrl(chap.id),
        });
      } else if (chap.ready_chunks && chap.ready_chunks.length > 0) {
        // Individual ready micro-blocks
        for (const chunk of chap.ready_chunks) {
          tracks.push({
            id: `chunk-${chunk.id}`,
            type: "chunk",
            chapterId: chap.id,
            chapterTitle: chap.title,
            chapterSequence: chap.sequence,
            chunkSequence: chunk.sequence,
            title: `Cap. ${chap.sequence} — Bloque #${chunk.sequence}`,
            subtitle: chunk.spoken_text || "Micro-bloque sintetizado",
            durationSeconds: chunk.duration_seconds,
            audioUrl: api.getChunkAudioUrl(chunk.id),
          });
        }
      }
    }
    return tracks;
  }, [currentBook]);

  // Synchronize activeTrack when currentChapter or playable tracks change
  useEffect(() => {
    if (!currentChapter) return;

    // Check if currentChapter is ready and activeTrack does not match
    if (currentChapter.is_ready) {
      const chapTrack = allPlayableTracks.find(
        (t) => t.type === "chapter" && t.chapterId === currentChapter.id,
      );
      if (chapTrack && (!activeTrack || activeTrack.chapterId !== currentChapter.id)) {
        setActiveTrack(chapTrack);
      }
    } else if (currentChapter.ready_chunks && currentChapter.ready_chunks.length > 0) {
      const firstChunkTrack = allPlayableTracks.find(
        (t) => t.type === "chunk" && t.chapterId === currentChapter.id,
      );
      if (firstChunkTrack && (!activeTrack || activeTrack.chapterId !== currentChapter.id)) {
        setActiveTrack(firstChunkTrack);
      }
    } else if (!activeTrack && allPlayableTracks.length > 0) {
      setActiveTrack(allPlayableTracks[0]);
    }
  }, [currentChapter, allPlayableTracks, activeTrack]);

  // Apply speed changes to audioRef
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  // Play / Pause toggle
  const togglePlay = () => {
    if (!audioRef.current || !activeTrack) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  // Play a specific track
  const handlePlayTrack = useCallback(
    (track: PlayableTrack) => {
      setActiveTrack(track);
      setCurrentTime(0);
      setIsPlaying(true);

      // Sync chapter selection with parent
      if (currentBook && onSelectChapter) {
        const targetChap = currentBook.chapters?.find((c) => c.id === track.chapterId);
        if (targetChap) {
          onSelectChapter(currentBook, targetChap);
        }
      }

      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => setIsPlaying(false));
        }
      }, 50);
    },
    [currentBook, onSelectChapter],
  );

  // Next / Previous track navigation
  const currentIndex = useMemo(() => {
    if (!activeTrack) return -1;
    return allPlayableTracks.findIndex((t) => t.id === activeTrack.id);
  }, [activeTrack, allPlayableTracks]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allPlayableTracks.length - 1;

  const handlePrevTrack = () => {
    if (hasPrev) {
      handlePlayTrack(allPlayableTracks[currentIndex - 1]);
    }
  };

  const handleNextTrack = useCallback(() => {
    if (hasNext) {
      handlePlayTrack(allPlayableTracks[currentIndex + 1]);
    }
  }, [hasNext, currentIndex, allPlayableTracks, handlePlayTrack]);

  // Relative seek
  const seekRelative = (seconds: number) => {
    if (audioRef.current) {
      const newPos = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds));
      audioRef.current.currentTime = newPos;
      setCurrentTime(newPos);
    }
  };

  // Slider scrub seek
  const handleSeekScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number.parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  // Cycle playback speed
  const cycleSpeed = () => {
    const nextIdx = (availableSpeeds.indexOf(speed) + 1) % availableSpeeds.length;
    const nextSpeed = availableSpeeds[nextIdx];
    setSpeed(nextSpeed);
    LocalStorageAdapter.setSpeed(nextSpeed);
  };

  // Toggle skip silence
  const toggleSkipSilence = () => {
    const next = !skipSilence;
    setSkipSilence(next);
    LocalStorageAdapter.setSkipSilence(next);
  };

  // Save bookmark
  const handleBookmark = () => {
    if (!currentBook || !activeTrack || !audioRef.current) return;
    const pos = Math.floor(audioRef.current.currentTime * 1000);
    LocalStorageAdapter.addPendingEvent({
      event_id: crypto.randomUUID(),
      event_type: "BookmarkCreated",
      entity_id: activeTrack.chapterId,
      timestamp: new Date().toISOString(),
      payload: {
        book_id: currentBook.id,
        chapter_id: activeTrack.chapterId,
        position_ms: pos,
        track_title: activeTrack.title,
      },
    });
    setBookmarkSaved(true);
    setTimeout(() => setBookmarkSaved(false), 2000);
  };

  const toggleExpandChapter = (chapId: string) => {
    setExpandedChapters((prev) => ({
      ...prev,
      [chapId]: !prev[chapId],
    }));
  };

  return (
    <div className="player-layout">
      {/* Audio element connected to active track */}
      {activeTrack && (
        <audio
          ref={audioRef}
          src={activeTrack.audioUrl}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current) {
              setDuration(audioRef.current.duration || activeTrack.durationSeconds);
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            if (hasNext) {
              handleNextTrack();
            }
          }}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        />
      )}

      {/* Main Transport Player Card */}
      <div className="transport-card">
        {/* Track Title & Metadata */}
        <div className="transport-header-info">
          <div className="track-type-badge">
            {activeTrack?.type === "chapter" ? (
              <span className="badge-tag chapter">
                <Music size={12} /> Capítulo Completo
              </span>
            ) : activeTrack?.type === "chunk" ? (
              <span className="badge-tag chunk">
                <Volume2 size={12} /> Micro-bloque #{activeTrack.chunkSequence}
              </span>
            ) : (
              <span className="badge-tag idle">Sin audio activo</span>
            )}
            {isPlaying && <span className="pulse-dot" title="Reproduciendo audio" />}
          </div>

          <h2 className="transport-title">{currentBook?.title || "Ningún libro seleccionado"}</h2>
          <p className="transport-chapter">
            {activeTrack ? activeTrack.title : "Selecciona un audio de la lista inferior"}
          </p>
          {activeTrack?.subtitle && activeTrack.type === "chunk" && (
            <p className="transport-spoken-preview">"{activeTrack.subtitle.slice(0, 110)}..."</p>
          )}
        </div>

        {/* Timeline Scrubber */}
        <div className="timeline-container">
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : activeTrack?.durationSeconds || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeekScrub}
            className="timeline-slider"
            disabled={!activeTrack}
            aria-label="Progreso de audio"
          />
          <div className="timeline-labels">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration > 0 ? duration : activeTrack?.durationSeconds || 0)}</span>
          </div>
        </div>

        {/* Transport Primary Controls */}
        <div className="transport-main-controls">
          <button
            type="button"
            className="nav-track-btn"
            onClick={handlePrevTrack}
            disabled={!hasPrev}
            title="Pista anterior disponible"
            aria-label="Pista anterior"
          >
            <SkipBack size={22} />
          </button>

          <button
            type="button"
            className="seek-circle-btn"
            onClick={() => seekRelative(-15)}
            disabled={!activeTrack}
            title="Retroceder 15s"
            aria-label="Retroceder 15 segundos"
          >
            <Rewind size={18} />
            <span className="seek-txt">15</span>
          </button>

          <button
            type="button"
            className={`play-button-large ${isPlaying ? "playing" : ""}`}
            onClick={togglePlay}
            disabled={!activeTrack}
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
          >
            {isPlaying ? <Pause size={42} /> : <Play size={42} style={{ marginLeft: "4px" }} />}
          </button>

          <button
            type="button"
            className="seek-circle-btn"
            onClick={() => seekRelative(30)}
            disabled={!activeTrack}
            title="Adelantar 30s"
            aria-label="Avanzar 30 segundos"
          >
            <FastForward size={18} />
            <span className="seek-txt">30</span>
          </button>

          <button
            type="button"
            className="nav-track-btn"
            onClick={handleNextTrack}
            disabled={!hasNext}
            title="Siguiente pista disponible"
            aria-label="Siguiente pista"
          >
            <SkipForward size={22} />
          </button>
        </div>

        {/* Toggles (Speed, Skip silence) */}
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

        {/* Actions Row */}
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

      {/* Playlist / Lista de Pistas de Audio del Libro */}
      <div className="playlist-container">
        <div className="playlist-header">
          <div className="playlist-header-left">
            <ListMusic size={20} className="playlist-icon" />
            <h3 className="playlist-title">Lista de Audios y Capítulos</h3>
          </div>
          <span className="playlist-available-badge">{allPlayableTracks.length} audios listos</span>
        </div>

        <div className="playlist-items-list">
          {currentBook?.chapters?.map((chap) => {
            const hasChunksReady = (chap.ready_chunks?.length || 0) > 0;
            const isChapterPlaying =
              activeTrack?.type === "chapter" && activeTrack.chapterId === chap.id;
            const isExpanded = expandedChapters[chap.id] ?? (!chap.is_ready && hasChunksReady);

            return (
              <div
                key={chap.id}
                className={`chapter-playlist-card ${
                  chap.is_ready
                    ? "status-ready"
                    : hasChunksReady
                      ? "status-partial"
                      : "status-queued"
                } ${isChapterPlaying ? "active-playing" : ""}`}
              >
                {/* Chapter Row Header */}
                <div className="chapter-row-main">
                  <div className="chapter-info-col">
                    <div className="chapter-seq-title">
                      <span className="chapter-seq-num">#{chap.sequence}</span>
                      <span className="chapter-name">{chap.title}</span>
                    </div>

                    <div className="chapter-status-pills">
                      {chap.is_ready ? (
                        <span className="pill pill-green">
                          <CheckCircle2 size={13} /> Listo completo (
                          {formatTime(chap.duration_seconds)})
                        </span>
                      ) : hasChunksReady ? (
                        <span className="pill pill-yellow">
                          <Loader2 size={13} className="spin-slow" /> En progreso:{" "}
                          {chap.ready_chunks_count}/{chap.total_chunks} bloques (
                          {formatTime(chap.ready_duration_seconds || 0)})
                        </span>
                      ) : (
                        <span className="pill pill-gray">
                          <Clock size={13} /> En cola ({chap.total_chunks || 0} bloques)
                        </span>
                      )}
                      <span className="pill pill-words">{chap.word_count} palabras</span>
                    </div>
                  </div>

                  <div className="chapter-actions-col">
                    {chap.is_ready && (
                      <button
                        type="button"
                        className={`play-track-action-btn ${isChapterPlaying ? "active" : ""}`}
                        onClick={() => {
                          const t = allPlayableTracks.find(
                            (trk) => trk.type === "chapter" && trk.chapterId === chap.id,
                          );
                          if (t) handlePlayTrack(t);
                        }}
                        title="Reproducir capítulo completo"
                      >
                        {isChapterPlaying && isPlaying ? <Pause size={18} /> : <Play size={18} />}
                        <span>{isChapterPlaying && isPlaying ? "Pausar" : "Reproducir"}</span>
                      </button>
                    )}

                    {hasChunksReady && !chap.is_ready && (
                      <button
                        type="button"
                        className="expand-chunks-btn"
                        onClick={() => toggleExpandChapter(chap.id)}
                        title={isExpanded ? "Ocultar micro-bloques" : "Ver micro-bloques listos"}
                      >
                        <span>{chap.ready_chunks?.length} bloques listos</span>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-list of ready micro-blocks for chapters in progress */}
                {hasChunksReady && isExpanded && (
                  <div className="micro-chunks-sublist">
                    <p className="micro-chunks-header-txt">
                      Micro-bloques listos para escuchar mientras se sintetiza el resto:
                    </p>
                    <div className="micro-chunks-grid">
                      {chap.ready_chunks?.map((chk: ReadyChunkInfo) => {
                        const isChunkPlaying =
                          activeTrack?.type === "chunk" && activeTrack.id === `chunk-${chk.id}`;

                        return (
                          <div
                            key={chk.id}
                            className={`micro-chunk-item ${isChunkPlaying ? "active-chunk" : ""}`}
                          >
                            <div className="chunk-left">
                              <span className="chunk-badge">Bloque #{chk.sequence}</span>
                              <span className="chunk-duration">
                                {chk.duration_seconds.toFixed(1)}s • {chk.word_count}w
                              </span>
                              {chk.spoken_text && (
                                <p className="chunk-snippet">"{chk.spoken_text.slice(0, 70)}..."</p>
                              )}
                            </div>

                            <button
                              type="button"
                              className={`play-chunk-btn ${isChunkPlaying ? "active" : ""}`}
                              onClick={() => {
                                const trk = allPlayableTracks.find(
                                  (t) => t.id === `chunk-${chk.id}`,
                                );
                                if (trk) handlePlayTrack(trk);
                              }}
                              title={`Escuchar bloque #${chk.sequence}`}
                            >
                              {isChunkPlaying && isPlaying ? (
                                <Pause size={15} />
                              ) : (
                                <Play size={15} />
                              )}
                              <span>{isChunkPlaying && isPlaying ? "Pausa" : "Oír"}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
