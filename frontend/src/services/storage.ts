import type { Book, PlaybackState, SyncEvent } from "../domain/types";

const STORAGE_KEYS = {
  PLAYBACK_STATE: "spaa_playback_state",
  PENDING_EVENTS: "spaa_pending_sync_events",
  ACTIVE_BOOK_ID: "spaa_active_book_id",
  SPEED: "spaa_playback_speed",
  SKIP_SILENCE: "spaa_skip_silence",
  CACHED_BOOKS: "spaa_cached_books",
  CACHED_BOOK_PREFIX: "spaa_cached_book_",
};

// In-memory fallback for test and non-browser environments
const memoryStorage = new Map<string, string>();

function getItem(key: string): string | null {
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(key);
  }
  return memoryStorage.get(key) ?? null;
}

function setItem(key: string, value: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(key, value);
  } else {
    memoryStorage.set(key, value);
  }
}

export class LocalStorageAdapter {
  static getPlaybackState(): PlaybackState | null {
    const raw = getItem(STORAGE_KEYS.PLAYBACK_STATE);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static savePlaybackState(state: PlaybackState): void {
    setItem(STORAGE_KEYS.PLAYBACK_STATE, JSON.stringify(state));
  }

  static getPendingEvents(): SyncEvent[] {
    const raw = getItem(STORAGE_KEYS.PENDING_EVENTS);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  static addPendingEvent(event: SyncEvent): void {
    const events = LocalStorageAdapter.getPendingEvents();
    events.push(event);
    setItem(STORAGE_KEYS.PENDING_EVENTS, JSON.stringify(events));
  }

  static clearPendingEvents(handledEventIds: string[]): void {
    const events = LocalStorageAdapter.getPendingEvents();
    const remaining = events.filter((e) => !handledEventIds.includes(e.event_id));
    setItem(STORAGE_KEYS.PENDING_EVENTS, JSON.stringify(remaining));
  }

  static getActiveBookId(): string | null {
    return getItem(STORAGE_KEYS.ACTIVE_BOOK_ID);
  }

  static setActiveBookId(bookId: string): void {
    setItem(STORAGE_KEYS.ACTIVE_BOOK_ID, bookId);
  }

  static getSpeed(): number {
    const val = getItem(STORAGE_KEYS.SPEED);
    return val ? Number.parseFloat(val) : 1.0;
  }

  static setSpeed(speed: number): void {
    setItem(STORAGE_KEYS.SPEED, speed.toString());
  }

  static getSkipSilence(): boolean {
    return getItem(STORAGE_KEYS.SKIP_SILENCE) === "true";
  }

  static setSkipSilence(enabled: boolean): void {
    setItem(STORAGE_KEYS.SKIP_SILENCE, enabled ? "true" : "false");
  }

  static getCachedBooks(): Book[] {
    const raw = getItem(STORAGE_KEYS.CACHED_BOOKS);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  static saveCachedBooks(books: Book[]): void {
    setItem(STORAGE_KEYS.CACHED_BOOKS, JSON.stringify(books));
  }

  static getCachedBookDetails(bookId: string): Book | null {
    const raw = getItem(`${STORAGE_KEYS.CACHED_BOOK_PREFIX}${bookId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static saveCachedBookDetails(book: Book): void {
    setItem(`${STORAGE_KEYS.CACHED_BOOK_PREFIX}${book.id}`, JSON.stringify(book));
  }
}
