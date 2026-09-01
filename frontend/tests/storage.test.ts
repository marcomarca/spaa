import { expect, test } from "bun:test";
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
