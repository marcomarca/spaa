import { expect, test } from "bun:test";
import type { Book } from "../src/domain/types";
import { LocalStorageAdapter } from "../src/services/storage";

test("LocalStorageAdapter handles speed defaults and setting", () => {
  // Clear any existing
  LocalStorageAdapter.setSpeed(1.4);
  expect(LocalStorageAdapter.getSpeed()).toBe(1.4);

  LocalStorageAdapter.setSpeed(2.0);
  expect(LocalStorageAdapter.getSpeed()).toBe(2.0);
});

test("LocalStorageAdapter adds and clears pending sync events", () => {
  const ev = {
    event_id: "evt-123",
    event_type: "PlaybackChanged" as const,
    entity_id: "chap-1",
    timestamp: new Date().toISOString(),
    payload: { position_ms: 5000 },
  };

  LocalStorageAdapter.addPendingEvent(ev);
  const pending = LocalStorageAdapter.getPendingEvents();
  expect(pending.some((e) => e.event_id === "evt-123")).toBe(true);

  LocalStorageAdapter.clearPendingEvents(["evt-123"]);
  const remaining = LocalStorageAdapter.getPendingEvents();
  expect(remaining.some((e) => e.event_id === "evt-123")).toBe(false);
});

test("LocalStorageAdapter persists and retrieves cached books and book details", () => {
  const dummyBooks: Book[] = [
    {
      id: "book-1",
      title: "Libro de Prueba",
      author: "Autor",
      mode: "quality",
      created_at: "2026-09-05T00:00:00Z",
    },
  ];

  LocalStorageAdapter.saveCachedBooks(dummyBooks);
  expect(LocalStorageAdapter.getCachedBooks()).toEqual(dummyBooks);

  const dummyDetail: Book = {
    id: "book-1",
    title: "Libro de Prueba",
    author: "Autor",
    mode: "quality",
    created_at: "2026-09-05T00:00:00Z",
    chapters: [
      {
        id: "chap-1",
        sequence: 1,
        title: "Capítulo 1",
        word_count: 500,
        duration_seconds: 120,
        is_ready: true,
      },
    ],
  };

  LocalStorageAdapter.saveCachedBookDetails(dummyDetail);
  expect(LocalStorageAdapter.getCachedBookDetails("book-1")).toEqual(dummyDetail);
  expect(LocalStorageAdapter.getCachedBookDetails("non-existent")).toBeNull();
});
