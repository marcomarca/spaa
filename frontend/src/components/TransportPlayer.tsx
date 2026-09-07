import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FastForward,
  HardDriveDownload,
  ListMusic,
  Loader2,
  Music,
  Pause,
  Play,
  Rewind,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Book, Chapter, PlayableTrack, ReadyChunkInfo } from "../domain/types";
import { api } from "../services/api";
import { MediaSessionManager } from "../services/mediaSession";
import { OfflineAudioCache } from "../services/offlineAudioCache";
import { LocalStorageAdapter } from "../services/storage";
import { WakeLockManager } from "../services/wakeLock";

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
  const [effectiveAudioSrc, setEffectiveAudioSrc] = useState<string>("");
  const [isOfflineCached, setIsOfflineCached] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [cachedChapterIds, setCachedChapterIds] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [playbackError, setPlaybackError] = useState<string | null>(null);

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

  // Load list of cached chapter IDs for offline playback indicators
  const refreshCachedChapters = useCallback(async () => {
    const ids = await OfflineAudioCache.listCachedChapterIds();
    setCachedChapterIds(new Set(ids));
  }, []);

  useEffect(() => {
    refreshCachedChapters();
  }, [refreshCachedChapters]);

  // Resolve audio source (check offline IndexedDB / CacheStorage first)
  useEffect(() => {
    if (!activeTrack) {
      setEffectiveAudioSrc("");
      setIsOfflineCached(false);
      return;
    }

    let isMounted = true;
    const resolveSource = async () => {
      const isCached = await OfflineAudioCache.isChapterCached(activeTrack.chapterId);
      if (!isMounted) return;
      setIsOfflineCached(isCached);

      if (isCached && activeTrack.type === "chapter") {
        const cachedUrl = await OfflineAudioCache.getCachedAudioUrl(activeTrack.chapterId);
        if (isMounted && cachedUrl) {
          setEffectiveAudioSrc(cachedUrl);
          return;
        }
      }
      if (isMounted) {
        setEffectiveAudioSrc(activeTrack.audioUrl);
      }
    };

    resolveSource();
    return () => {
      isMounted = false;
    };
  }, [activeTrack]);

  // Apply speed changes to audioRef
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  // Play / Pause toggle with detector diagnostics
  const togglePlay = useCallback(async () => {
    if (!audioRef.current || !activeTrack) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setPlaybackError(null);
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.warn("[TransportPlayer] Playback failed:", err);
        setIsPlaying(false);
        if (activeTrack.type === "chapter") {
          const audit = await OfflineAudioCache.auditChapter(activeTrack.chapterId);
          if (!audit.isValidAudio && audit.status !== "MISSING") {
            setPlaybackError(`Error de audio local: ${audit.errorMessage || "Archivo dañado."}`);
          } else if (audit.status === "MISSING") {
            setPlaybackError(
              "Sin conexión: Este capítulo no está descargado para escuchar offline.",
            );
          } else {
            setPlaybackError(
              "No se pudo iniciar la reproducción. Verifica la conexión con el servidor.",
            );
          }
        } else {
          setPlaybackError("No se pudo reproducir el micro-bloque de audio.");
        }
      }
    }
  }, [isPlaying, activeTrack]);

  // Relative seek
  const seekRelative = useCallback(
    (seconds: number) => {
      if (audioRef.current) {
        const targetDuration = duration > 0 ? duration : activeTrack?.durationSeconds || 100;
        const newPos = Math.max(
          0,
          Math.min(targetDuration, audioRef.current.currentTime + seconds),
        );
        audioRef.current.currentTime = newPos;
        setCurrentTime(newPos);
      }
    },
    [duration, activeTrack],
  );

  // Play a specific track with verified offline resolution
  const handlePlayTrack = useCallback(
    async (track: PlayableTrack) => {
      setActiveTrack(track);
      setCurrentTime(0);
      setPlaybackError(null);

      // Sync chapter selection with parent
      if (currentBook && onSelectChapter) {
        const targetChap = currentBook.chapters?.find((c) => c.id === track.chapterId);
        if (targetChap) {
          onSelectChapter(currentBook, targetChap);
        }
      }

      // Resolve source synchronously before triggering playback to prevent network failure
      let resolvedUrl = track.audioUrl;
      if (track.type === "chapter") {
        const isCached = await OfflineAudioCache.isChapterCached(track.chapterId);
        setIsOfflineCached(isCached);
        if (isCached) {
          const cachedUrl = await OfflineAudioCache.getCachedAudioUrl(track.chapterId);
          if (cachedUrl) resolvedUrl = cachedUrl;
        }
      }

      setEffectiveAudioSrc(resolvedUrl);

      if (audioRef.current) {
        if (audioRef.current.src !== resolvedUrl) {
          audioRef.current.src = resolvedUrl;
          audioRef.current.load();
        }
        audioRef.current.currentTime = 0;
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (err) {
          console.warn("[TransportPlayer] handlePlayTrack play failed:", err);
          setIsPlaying(false);
          if (track.type === "chapter") {
            const audit = await OfflineAudioCache.auditChapter(track.chapterId);
            if (!audit.isValidAudio && audit.status !== "MISSING") {
              setPlaybackError(
                `Audio local dañado: ${audit.errorMessage || "Archivo no legible."}`,
              );
            } else if (audit.status === "MISSING") {
              setPlaybackError("Sin conexión: Este capítulo no está descargado localmente.");
            } else {
              setPlaybackError("No se pudo iniciar la reproducción.");
            }
          }
        }
      }
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

  const handlePrevTrack = useCallback(() => {
    if (hasPrev) {
      handlePlayTrack(allPlayableTracks[currentIndex - 1]);
    }
  }, [hasPrev, currentIndex, allPlayableTracks, handlePlayTrack]);

  const handleNextTrack = useCallback(() => {
    if (hasNext) {
      handlePlayTrack(allPlayableTracks[currentIndex + 1]);
    }
  }, [hasNext, currentIndex, allPlayableTracks, handlePlayTrack]);

  // Synchronize MediaSession metadata & lockscreen/headset controls
  useEffect(() => {
    if (!activeTrack) {
      MediaSessionManager.clear();
      return;
    }

    MediaSessionManager.setMetadata({
      title: activeTrack.title,
      artist: currentBook?.author || "SPAA",
      album: currentBook?.title || "SPAA Audiolibros",
    });

    MediaSessionManager.setActionHandlers({
      onPlay: () => {
        if (audioRef.current) {
          audioRef.current.play().catch(() => setIsPlaying(false));
          setIsPlaying(true);
        }
      },
      onPause: () => {
        if (audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
      },
      onSeekBackward: () => seekRelative(-15),
      onSeekForward: () => seekRelative(30),
      onPreviousTrack: hasPrev ? handlePrevTrack : undefined,
      onNextTrack: hasNext ? handleNextTrack : undefined,
      onSeekTo: (details) => {
        if (typeof details.seekTime === "number" && audioRef.current) {
          audioRef.current.currentTime = details.seekTime;
          setCurrentTime(details.seekTime);
        }
      },
    });
  }, [activeTrack, currentBook, hasPrev, hasNext, handlePrevTrack, handleNextTrack, seekRelative]);

  // Synchronize WakeLock & playbackState with isPlaying
  useEffect(() => {
    if (isPlaying) {
      WakeLockManager.request();
      MediaSessionManager.setPlaybackState("playing");
    } else {
      WakeLockManager.release();
      MediaSessionManager.setPlaybackState("paused");
    }
  }, [isPlaying]);

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

  // Offline Download Handler
  const handleDownloadChapter = async () => {
    if (!activeTrack || activeTrack.type !== "chapter" || isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress(0);
    setPlaybackError(null);

    const expectedSha256 =
      currentBook?.chapters?.find((c) => c.id === activeTrack.chapterId)?.audio_sha256 || undefined;

    const res = await OfflineAudioCache.downloadChapter(
      activeTrack.chapterId,
      activeTrack.audioUrl,
      expectedSha256,
      (p) => setDownloadProgress(p.percent),
    );

    setIsDownloading(false);
    if (res.success) {
      setIsOfflineCached(true);
      await refreshCachedChapters();
      const cachedUrl = await OfflineAudioCache.getCachedAudioUrl(activeTrack.chapterId);
      if (cachedUrl) setEffectiveAudioSrc(cachedUrl);
      setPlaybackError(null);
    } else {
      const msg = res.error || "Error al descargar el capítulo para escuchar offline.";
      setPlaybackError(msg);
      alert(msg);
    }
  };

  const handleDeleteCachedChapter = async (chapId: string) => {
    await OfflineAudioCache.deleteCachedChapter(chapId);
    if (activeTrack?.chapterId === chapId) {
      setIsOfflineCached(false);
      setEffectiveAudioSrc(activeTrack.audioUrl);
    }
    await refreshCachedChapters();
  };

  const toggleExpandChapter = (chapId: string) => {
    setExpandedChapters((prev) => ({
      ...prev,
      [chapId]: !prev[chapId],
    }));
  };

  return (
    <div className="player-layout">
      {/* Audio element connected to active track (uses offline cache if available) */}
      {activeTrack && (
        <audio
          ref={audioRef}
          src={effectiveAudioSrc || activeTrack.audioUrl}
          onError={async (e) => {
            console.error("[TransportPlayer] Audio element error:", e);
            setIsPlaying(false);
            if (activeTrack?.type === "chapter") {
              const audit = await OfflineAudioCache.auditChapter(activeTrack.chapterId);
              if (!audit.isValidAudio && audit.status !== "MISSING") {
                setPlaybackError(
                  `Fallo en archivo local: ${audit.errorMessage || "Audio corrupto o incompleto."}`,
                );
              } else if (audit.status === "MISSING") {
                setPlaybackError("Sin conexión: Este capítulo no está descargado localmente.");
              } else {
                setPlaybackError(
                  "Error de reproducción. Verifica la integridad en la pestaña de Biblioteca.",
                );
              }
            } else {
              setPlaybackError("Error al reproducir el micro-bloque de audio.");
            }
          }}
          onTimeUpdate={() => {
            if (audioRef.current) {
              const cur = audioRef.current.currentTime;
              setCurrentTime(cur);
              MediaSessionManager.setPositionState({
                duration: duration > 0 ? duration : activeTrack.durationSeconds,
                position: cur,
                playbackRate: speed,
              });
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current) {
              setDuration(audioRef.current.duration || activeTrack.durationSeconds);
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            WakeLockManager.release();
            MediaSessionManager.setPlaybackState("none");
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
            {activeTrack?.type === "chapter" && isOfflineCached && (
              <span
                className="badge-tag offline-ready"
                title="Guardado localmente en este smartphone"
              >
                <HardDriveDownload size={12} /> Offline
              </span>
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

          {playbackError && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                borderRadius: "8px",
                padding: "8px 12px",
                marginTop: "10px",
                color: "#f87171",
                fontSize: "0.82rem",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>{playbackError}</span>
              </div>
              <button
                type="button"
                onClick={() => setPlaybackError(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#f87171",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                ✕
              </button>
            </div>
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
          {activeTrack?.type === "chapter" &&
            (isOfflineCached ? (
              <button
                type="button"
                className="action-btn"
                onClick={() => handleDeleteCachedChapter(activeTrack.chapterId)}
                title="Eliminar de la memoria del smartphone"
              >
                <Trash2 size={18} color="#ef4444" />
                <span style={{ color: "#ef4444" }}>Borrar</span>
              </button>
            ) : (
              <button
                type="button"
                className="action-btn"
                onClick={handleDownloadChapter}
                disabled={isDownloading}
                title="Descargar este capítulo para escuchar sin internet"
              >
                {isDownloading ? (
                  <>
                    <Loader2 size={18} className="spin-slow" />
                    <span>{downloadProgress}%</span>
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    <span>Offline</span>
                  </>
                )}
              </button>
            ))}
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
                      {cachedChapterIds.has(chap.id) && (
                        <span
                          className="pill pill-green"
                          title="Descargado para escuchar sin conexión"
                        >
                          <HardDriveDownload size={12} /> Offline
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
