export type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

export interface Chapter {
  id: string;
  sequence: number;
  title: string;
  word_count: number;
  duration_seconds: float;
  is_ready: boolean;
  audio_sha256?: string | null;
}

export type float = number;

export interface Book {
  id: string;
  title: string;
  author: string;
  mode: "quality" | "auto" | "local";
  created_at: string;
  chapters?: Chapter[];
}

export interface PlaybackState {
  book_id: string;
  chapter_id: string;
  position_ms: number;
  speed: number;
  is_completed: boolean;
  updated_at: string;
}

export interface SyncEvent {
  event_id: string;
  event_type: "PlaybackChanged" | "ChapterCompleted" | "BookmarkCreated" | "CheatsheetChanged";
  entity_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface OfflineChapterItem {
  chapter_id: string;
  book_id: string;
  sequence: number;
  title: string;
  duration_seconds: number;
  file_size_bytes: number;
  sha256: string;
  download_url: string;
}

export interface OfflineManifest {
  total_chapters: number;
  total_duration_hours: number;
  chapters: OfflineChapterItem[];
}
