/**
 * OfflineAudioCache
 * Handles robust downloading, cryptographic verification, and local storage
 * (IndexedDB as primary, CacheStorage as secondary) for offline chapter playback
 * on smartphones and offline environments.
 */

import { type IntegrityCheckResult, OfflineIntegrityDetector } from "./offlineIntegrityDetector";

const CACHE_NAME = "spaa-offline-audio-v1";
const IDB_NAME = "spaa_offline_audio_db";
const IDB_STORE = "audio_chapters";
const IDB_VERSION = 1;

export interface DownloadProgress {
  chapterId: string;
  loadedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface CachedChapterRecord {
  chapterId: string;
  buffer: ArrayBufferLike;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
  downloadedAt: string;
  verified: boolean;
}

export class OfflineAudioCache {
  private static objectUrls = new Map<string, string>();
  private static idbPromise: Promise<IDBDatabase | null> | null = null;

  /**
   * Opens or returns the IndexedDB database instance.
   */
  private static getIDB(): Promise<IDBDatabase | null> {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return Promise.resolve(null);
    }
    if (OfflineAudioCache.idbPromise) {
      return OfflineAudioCache.idbPromise;
    }

    OfflineAudioCache.idbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: "chapterId" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn("[OfflineAudioCache] Error opening IndexedDB:", req.error);
          resolve(null);
        };
      } catch (err) {
        console.warn("[OfflineAudioCache] Exception opening IndexedDB:", err);
        resolve(null);
      }
    });

    return OfflineAudioCache.idbPromise;
  }

  private static isCacheStorageSupported(): boolean {
    return typeof window !== "undefined" && "caches" in window;
  }

  /**
   * Retrieves chapter buffer from IndexedDB or CacheStorage.
   */
  private static async getRawRecord(
    chapterId: string,
  ): Promise<{ buffer: ArrayBufferLike; mimeType: string; sha256?: string } | null> {
    // 1. Try IndexedDB
    try {
      const db = await OfflineAudioCache.getIDB();
      if (db) {
        const record = await new Promise<CachedChapterRecord | null>((resolve) => {
          const tx = db.transaction(IDB_STORE, "readonly");
          const store = tx.objectStore(IDB_STORE);
          const req = store.get(chapterId);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });

        if (record?.buffer && record.buffer.byteLength > 0) {
          return {
            buffer: record.buffer,
            mimeType: record.mimeType || "audio/mpeg",
            sha256: record.sha256,
          };
        }
      }
    } catch {
      // Ignore and fallback to CacheStorage
    }

    // 2. Fallback to CacheStorage
    if (OfflineAudioCache.isCacheStorageSupported()) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const req = new Request(`/api/audio/chapter/${chapterId}`);
        const res = await cache.match(req);
        if (res) {
          const buffer = await res.arrayBuffer();
          const sha = res.headers.get("X-Audio-SHA256") || "";
          return {
            buffer,
            mimeType: res.headers.get("Content-Type") || "audio/mpeg",
            sha256: sha,
          };
        }
      } catch {
        // CacheStorage not accessible
      }
    }

    return null;
  }

  /**
   * Checks if a chapter's audio is fully cached in offline storage and passes integrity checks.
   */
  static async isChapterCached(chapterId: string): Promise<boolean> {
    const raw = await OfflineAudioCache.getRawRecord(chapterId);
    if (!raw) return false;

    // Must be valid audio (not HTML fallback or empty)
    const integrity = await OfflineIntegrityDetector.verifyBuffer(chapterId, raw.buffer);
    return integrity.isValidAudio;
  }

  /**
   * Retrieves a Blob Object URL for a cached chapter, or null if not available or corrupt.
   */
  static async getCachedAudioUrl(chapterId: string): Promise<string | null> {
    // Check if we already have an active object URL
    if (OfflineAudioCache.objectUrls.has(chapterId)) {
      return OfflineAudioCache.objectUrls.get(chapterId) || null;
    }

    const raw = await OfflineAudioCache.getRawRecord(chapterId);
    if (!raw) return null;

    // Verify integrity before creating playback URL
    const integrity = await OfflineIntegrityDetector.verifyBuffer(chapterId, raw.buffer);
    if (!integrity.isValidAudio) {
      console.warn(`[OfflineAudioCache] Chapter ${chapterId} in storage is invalid:`, integrity);
      return null;
    }

    try {
      const blob = new Blob([raw.buffer as ArrayBuffer], { type: raw.mimeType || "audio/mpeg" });
      const objectUrl = URL.createObjectURL(blob);
      OfflineAudioCache.objectUrls.set(chapterId, objectUrl);
      return objectUrl;
    } catch (err) {
      console.warn(`[OfflineAudioCache] Error creating Object URL for ${chapterId}:`, err);
      return null;
    }
  }

  /**
   * Computes SHA-256 hex string from an ArrayBuffer using Web Crypto.
   */
  static async computeSha256(buffer: ArrayBuffer): Promise<string> {
    return OfflineIntegrityDetector.computeSha256(buffer);
  }

  /**
   * Downloads a chapter, validates SHA-256 and audio headers rigorously, and stores it in local storage.
   */
  static async downloadChapter(
    chapterId: string,
    downloadUrl: string,
    expectedSha256?: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<{ success: boolean; error?: string; integrity?: IntegrityCheckResult }> {
    try {
      // 2-minute timeout for large chapter downloads
      const res = await fetch(downloadUrl, {
        signal: AbortSignal.timeout(120000),
      });

      if (!res.ok) {
        return {
          success: false,
          error: `Error HTTP ${res.status} al descargar el archivo de audio.`,
        };
      }

      // Check HTTP Content-Type: Reject if HTML or JSON error
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("text/html") || contentType.includes("application/json")) {
        return {
          success: false,
          error: `El servidor devolvió '${contentType}' en lugar de un archivo de audio. Verifica que el servidor de SPAA esté en ejecución.`,
        };
      }

      const contentLength =
        Number(res.headers.get("content-length") || res.headers.get("Content-Length")) || 0;
      const serverSha256 =
        expectedSha256 ||
        res.headers.get("X-Audio-SHA256") ||
        res.headers.get("x-audio-sha256") ||
        "";

      let fullBuffer: Uint8Array;

      // Stream read with progress
      if (res.body && onProgress) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded += value.length;
            const percent =
              contentLength > 0
                ? Math.min(100, Math.round((loaded / contentLength) * 100))
                : Math.min(99, Math.round((loaded / (1024 * 1024 * 32)) * 100));

            onProgress({
              chapterId,
              loadedBytes: loaded,
              totalBytes: contentLength || loaded,
              percent,
            });
          }
        }

        fullBuffer = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          fullBuffer.set(chunk, offset);
          offset += chunk.length;
        }
      } else {
        const arrayBuf = await res.arrayBuffer();
        fullBuffer = new Uint8Array(arrayBuf);
      }

      // Check if truncated compared to Content-Length header
      if (contentLength > 0 && fullBuffer.byteLength < contentLength) {
        return {
          success: false,
          error: `Descarga incompleta: se recibieron ${fullBuffer.byteLength} de ${contentLength} bytes.`,
        };
      }

      // RUGGED INTEGRITY CHECK WITH DETECTOR
      const integrity = await OfflineIntegrityDetector.verifyBuffer(
        chapterId,
        fullBuffer.buffer,
        serverSha256,
      );

      if (!integrity.isValidAudio) {
        return {
          success: false,
          error: integrity.errorMessage || "Integridad de audio no válida.",
          integrity,
        };
      }

      // Store in IndexedDB and CacheStorage
      await OfflineAudioCache.storeVerifiedAudio(
        chapterId,
        fullBuffer.buffer,
        integrity.computedSha256,
      );

      return { success: true, integrity };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Fallo durante la descarga: ${message}` };
    }
  }

  /**
   * Stores a verified audio buffer into both IndexedDB and CacheStorage.
   */
  private static async storeVerifiedAudio(
    chapterId: string,
    buffer: ArrayBufferLike,
    sha256: string,
  ): Promise<void> {
    // 1. Store in IndexedDB
    try {
      const db = await OfflineAudioCache.getIDB();
      if (db) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, "readwrite");
          const store = tx.objectStore(IDB_STORE);
          const record: CachedChapterRecord = {
            chapterId,
            buffer,
            sizeBytes: buffer.byteLength,
            sha256,
            mimeType: "audio/mpeg",
            downloadedAt: new Date().toISOString(),
            verified: true,
          };
          const req = store.put(record);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    } catch (err) {
      console.warn("[OfflineAudioCache] Error storing into IndexedDB:", err);
    }

    // 2. Store in CacheStorage if available
    if (OfflineAudioCache.isCacheStorageSupported()) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const req = new Request(`/api/audio/chapter/${chapterId}`);
        const blob = new Blob([buffer as ArrayBuffer], { type: "audio/mpeg" });
        const responseToCache = new Response(blob, {
          headers: {
            "Content-Type": "audio/mpeg",
            "X-Audio-SHA256": sha256,
            "Content-Length": buffer.byteLength.toString(),
          },
        });
        await cache.put(req, responseToCache);
      } catch (err) {
        console.warn("[OfflineAudioCache] Error storing into CacheStorage:", err);
      }
    }

    // Update object URL cache
    const existingUrl = OfflineAudioCache.objectUrls.get(chapterId);
    if (existingUrl) {
      URL.revokeObjectURL(existingUrl);
      OfflineAudioCache.objectUrls.delete(chapterId);
    }
  }

  /**
   * Deletes a cached chapter from both IndexedDB and CacheStorage.
   */
  static async deleteCachedChapter(chapterId: string): Promise<boolean> {
    let deleted = false;

    // 1. Delete from IndexedDB
    try {
      const db = await OfflineAudioCache.getIDB();
      if (db) {
        await new Promise<void>((resolve) => {
          const tx = db.transaction(IDB_STORE, "readwrite");
          const store = tx.objectStore(IDB_STORE);
          const req = store.delete(chapterId);
          req.onsuccess = () => {
            deleted = true;
            resolve();
          };
          req.onerror = () => resolve();
        });
      }
    } catch {
      // Ignore
    }

    // 2. Delete from CacheStorage
    if (OfflineAudioCache.isCacheStorageSupported()) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const req = new Request(`/api/audio/chapter/${chapterId}`);
        const cacheDeleted = await cache.delete(req);
        if (cacheDeleted) deleted = true;
      } catch {
        // Ignore
      }
    }

    const existingUrl = OfflineAudioCache.objectUrls.get(chapterId);
    if (existingUrl) {
      URL.revokeObjectURL(existingUrl);
      OfflineAudioCache.objectUrls.delete(chapterId);
    }

    return deleted;
  }

  /**
   * Lists all cached chapter IDs that are VERIFIED and valid.
   */
  static async listCachedChapterIds(): Promise<string[]> {
    const ids = new Set<string>();

    // 1. Read from IndexedDB
    try {
      const db = await OfflineAudioCache.getIDB();
      if (db) {
        const records = await new Promise<CachedChapterRecord[]>((resolve) => {
          const tx = db.transaction(IDB_STORE, "readonly");
          const store = tx.objectStore(IDB_STORE);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });

        for (const r of records) {
          if (r.buffer && r.buffer.byteLength >= OfflineIntegrityDetector.MIN_AUDIO_BYTES) {
            ids.add(r.chapterId);
          }
        }
      }
    } catch {
      // Ignore
    }

    // 2. Read from CacheStorage
    if (OfflineAudioCache.isCacheStorageSupported()) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const requests = await cache.keys();
        for (const req of requests) {
          const match = req.url.match(/\/api\/audio\/chapter\/([^/?#]+)/);
          if (match?.[1]) {
            const chapId = match[1];
            if (!ids.has(chapId)) {
              const res = await cache.match(req);
              if (res) {
                const blob = await res.blob();
                if (blob.size >= OfflineIntegrityDetector.MIN_AUDIO_BYTES) {
                  ids.add(chapId);
                }
              }
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    return Array.from(ids);
  }

  /**
   * Audits a single chapter in offline storage with the detector.
   */
  static async auditChapter(
    chapterId: string,
    expectedSha256?: string,
  ): Promise<IntegrityCheckResult> {
    const raw = await OfflineAudioCache.getRawRecord(chapterId);
    if (!raw) {
      return {
        chapterId,
        status: "MISSING",
        isValidAudio: false,
        byteLength: 0,
        computedSha256: "",
        expectedSha256,
        errorMessage: "El capítulo no se encuentra descargado en este dispositivo.",
      };
    }

    return OfflineIntegrityDetector.verifyBuffer(
      chapterId,
      raw.buffer,
      expectedSha256 || raw.sha256,
    );
  }

  /**
   * Audits all cached or known chapters and returns a detailed report.
   */
  static async auditAllChapters(
    knownChapters?: { id: string; title?: string; sha256?: string }[],
  ): Promise<IntegrityCheckResult[]> {
    const results: IntegrityCheckResult[] = [];
    const auditedIds = new Set<string>();

    if (knownChapters && knownChapters.length > 0) {
      for (const chap of knownChapters) {
        auditedIds.add(chap.id);
        const res = await OfflineAudioCache.auditChapter(chap.id, chap.sha256);
        results.push(res);
      }
    } else {
      const cachedIds = await OfflineAudioCache.listCachedChapterIds();
      for (const id of cachedIds) {
        auditedIds.add(id);
        const res = await OfflineAudioCache.auditChapter(id);
        results.push(res);
      }
    }

    return results;
  }

  /**
   * Purges corrupted or fake entries (HTML fallbacks, empty files) from storage.
   */
  static async purgeCorruptedOrFake(knownChapterIds?: string[]): Promise<number> {
    let purgedCount = 0;
    const targetIds = knownChapterIds || (await OfflineAudioCache.listCachedChapterIds());

    for (const id of targetIds) {
      const audit = await OfflineAudioCache.auditChapter(id);
      if (!audit.isValidAudio && audit.status !== "MISSING") {
        await OfflineAudioCache.deleteCachedChapter(id);
        purgedCount++;
      }
    }

    return purgedCount;
  }

  /**
   * Calculates total storage used by cached audio in bytes.
   */
  static async getCachedStorageSize(): Promise<number> {
    let totalBytes = 0;

    // 1. From IndexedDB
    try {
      const db = await OfflineAudioCache.getIDB();
      if (db) {
        const records = await new Promise<CachedChapterRecord[]>((resolve) => {
          const tx = db.transaction(IDB_STORE, "readonly");
          const store = tx.objectStore(IDB_STORE);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });

        for (const r of records) {
          totalBytes += r.sizeBytes || (r.buffer ? r.buffer.byteLength : 0);
        }
        return totalBytes;
      }
    } catch {
      // Fallback
    }

    // 2. From CacheStorage
    if (OfflineAudioCache.isCacheStorageSupported()) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const requests = await cache.keys();
        for (const req of requests) {
          const res = await cache.match(req);
          if (res) {
            const blob = await res.blob();
            totalBytes += blob.size;
          }
        }
      } catch {
        // Ignore
      }
    }

    return totalBytes;
  }
}
