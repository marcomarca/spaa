/**
 * MediaSessionManager
 * Integrates web audio playback with the native OS media subsystem
 * (Android Notification Bar, Lockscreen Media Controls, and Bluetooth Headsets).
 */

export interface MediaSessionMetadataPayload {
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
}

export interface MediaSessionActionHandlers {
  onPlay: () => void;
  onPause: () => void;
  onSeekBackward?: (details: MediaSessionActionDetails) => void;
  onSeekForward?: (details: MediaSessionActionDetails) => void;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
  onSeekTo?: (details: MediaSessionActionDetails) => void;
  onStop?: () => void;
}

export class MediaSessionManager {
  private static isSupported(): boolean {
    return typeof navigator !== "undefined" && "mediaSession" in navigator;
  }

  static setMetadata(payload: MediaSessionMetadataPayload): void {
    if (!MediaSessionManager.isSupported()) return;

    const artwork = payload.artworkUrl
      ? [
          { src: payload.artworkUrl, sizes: "96x96", type: "image/png" },
          { src: payload.artworkUrl, sizes: "192x192", type: "image/png" },
          { src: payload.artworkUrl, sizes: "512x512", type: "image/png" },
        ]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: payload.title,
      artist: payload.artist || "SPAA Audiolibros",
      album: payload.album || "SPAA — Sistema de Aprendizaje",
      artwork,
    });
  }

  static setPlaybackState(state: "playing" | "paused" | "none"): void {
    if (!MediaSessionManager.isSupported()) return;
    navigator.mediaSession.playbackState = state;
  }

  static setPositionState(state: {
    duration: number;
    playbackRate?: number;
    position: number;
  }): void {
    if (!MediaSessionManager.isSupported() || !navigator.mediaSession.setPositionState) {
      return;
    }

    try {
      if (state.duration > 0 && state.position >= 0 && state.position <= state.duration) {
        navigator.mediaSession.setPositionState({
          duration: state.duration,
          playbackRate: state.playbackRate ?? 1.0,
          position: state.position,
        });
      }
    } catch {
      // Ignore transient out-of-range race conditions
    }
  }

  static setActionHandlers(handlers: MediaSessionActionHandlers): void {
    if (!MediaSessionManager.isSupported()) return;

    try {
      navigator.mediaSession.setActionHandler("play", handlers.onPlay);
      navigator.mediaSession.setActionHandler("pause", handlers.onPause);

      if (handlers.onSeekBackward) {
        navigator.mediaSession.setActionHandler("seekbackward", handlers.onSeekBackward);
      }

      if (handlers.onSeekForward) {
        navigator.mediaSession.setActionHandler("seekforward", handlers.onSeekForward);
      }

      if (handlers.onPreviousTrack) {
        navigator.mediaSession.setActionHandler("previoustrack", handlers.onPreviousTrack);
      }

      if (handlers.onNextTrack) {
        navigator.mediaSession.setActionHandler("nexttrack", handlers.onNextTrack);
      }

      if (handlers.onSeekTo) {
        navigator.mediaSession.setActionHandler("seekto", handlers.onSeekTo);
      }

      if (handlers.onStop) {
        navigator.mediaSession.setActionHandler("stop", handlers.onStop);
      }
    } catch {
      // Ignored if action is not supported on platform
    }
  }

  static clear(): void {
    if (!MediaSessionManager.isSupported()) return;
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  }
}
