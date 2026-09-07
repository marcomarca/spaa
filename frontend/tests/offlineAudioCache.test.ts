import { expect, test } from "bun:test";
import { OfflineAudioCache } from "../src/services/offlineAudioCache";

test("OfflineAudioCache computes SHA-256 correctly", async () => {
  const text = "hello world";
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  const hash = await OfflineAudioCache.computeSha256(data.buffer);
  // Known SHA-256 of "hello world": b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
  expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
});

test("OfflineAudioCache gracefully handles missing CacheStorage in unit test environment", async () => {
  const isCached = await OfflineAudioCache.isChapterCached("chap-non-existent");
  expect(isCached).toBe(false);

  const url = await OfflineAudioCache.getCachedAudioUrl("chap-non-existent");
  expect(url).toBeNull();

  const list = await OfflineAudioCache.listCachedChapterIds();
  expect(Array.isArray(list)).toBe(true);

  const size = await OfflineAudioCache.getCachedStorageSize();
  expect(typeof size).toBe("number");
});

test("OfflineAudioCache auditChapter returns MISSING for un-downloaded chapter", async () => {
  const audit = await OfflineAudioCache.auditChapter("chap-unknown-123");
  expect(audit.status).toBe("MISSING");
  expect(audit.isValidAudio).toBe(false);
  expect(audit.byteLength).toBe(0);
});

test("OfflineAudioCache auditAllChapters audits list of chapters", async () => {
  const known = [
    { id: "chap-1", title: "Capítulo 1" },
    { id: "chap-2", title: "Capítulo 2" },
  ];
  const audits = await OfflineAudioCache.auditAllChapters(known);
  expect(audits.length).toBe(2);
  expect(audits[0].chapterId).toBe("chap-1");
  expect(audits[0].status).toBe("MISSING");
});
