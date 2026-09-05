/**
 * OfflineAudioCache
 * Handles atomic downloading, cryptographic SHA-256 verification, and local CacheStorage
 * management for offline chapter playback on smartphones.
 */

const CACHE_NAME = "spaa-offline-audio-v1";

export interface DownloadProgress {
  chapterId: string;
  loadedBytes: number;
  totalBytes: number;
  percent: number;
}

export class OfflineAudioCache {
  private static objectUrls = new Map<string, string>();

  private static isSupported(): boolean {
    return typeof window !== "undefined" && "caches" in window;
  }

  /**
   * Checks if a chapter's audio is fully cached in offline storage.
   */
  static async isChapterCached(chapterId: string): Promise<boolean> {
    if (!OfflineAudioCache.isSupported()) return false;
    try {
      const cache = await caches.open(CACHE_NAME);
      const req = new Request(`/api/audio/chapter/${chapterId}`);
      const match = await cache.match(req);
      return !!match;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves a Blob Object URL for a cached chapter, or null if not available.
   */
  static async getCachedAudioUrl(chapterId: string): Promise<string | null> {
    if (!OfflineAudioCache.isSupported()) return null;

    // Check if we already have an active object URL
    if (OfflineAudioCache.objectUrls.has(chapterId)) {
      return OfflineAudioCache.objectUrls.get(chapterId) || null;
    }

    try {
      const cache = await caches.open(CACHE_NAME);
      const req = new Request(`/api/audio/chapter/${chapterId}`);
      const res = await cache.match(req);
      if (!res) return null;

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      OfflineAudioCache.objectUrls.set(chapterId, objectUrl);
      return objectUrl;
    } catch (err) {
      console.warn(`[OfflineAudioCache] Error reading cache for chapter ${chapterId}:`, err);
      return null;
    }
  }

  /**
   * Computes SHA-256 hex string from an ArrayBuffer using Web Crypto.
   */
  static async computeSha256(buffer: ArrayBuffer): Promise<string> {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      return "";
    }
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Downloads a chapter, validates SHA-256 integrity, and stores it in cache.
   */
  static async downloadChapter(
    chapterId: string,
    downloadUrl: string,
    expectedSha256?: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<{ success: boolean; error?: string }> {
    if (!OfflineAudioCache.isSupported()) {
      return { success: false, error: "CacheStorage no está disponible en este dispositivo." };
    }

    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        return {
          success: false,
          error: `Error HTTP ${res.status} al descargar el archivo de audio.`,
        };
      }

      const contentLength = Number(res.headers.get("content-length")) || 0;
      const serverSha256 = expectedSha256 || res.headers.get("X-Audio-SHA256") || "";

      // Stream read with progress
      if (res.body && onProgress && contentLength > 0) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded += value.length;
            onProgress({
              chapterId,
              loadedBytes: loaded,
              totalBytes: contentLength,
              percent: Math.min(100, Math.round((loaded / contentLength) * 100)),
            });
          }
        }

        // Concatenate chunks into a single ArrayBuffer
        const fullBuffer = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          fullBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        return await OfflineAudioCache.verifyAndStore(chapterId, fullBuffer.buffer, serverSha256);
      }

      // Fallback direct buffer read
      const arrayBuffer = await res.arrayBuffer();
      return await OfflineAudioCache.verifyAndStore(chapterId, arrayBuffer, serverSha256);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Fallo durante la descarga: ${message}` };
    }
  }

  private static async verifyAndStore(
    chapterId: string,
    buffer: ArrayBuffer,
    expectedSha256?: string,
  ): Promise<{ success: boolean; error?: string }> {
    // 1. SHA-256 verification
    if (expectedSha256) {
      const computed = await OfflineAudioCache.computeSha256(buffer);
      if (computed && computed.toLowerCase() !== expectedSha256.toLowerCase()) {
        return {
          success: false,
          error: `Integridad comprometida: SHA-256 no coincide (esperado: ${expectedSha256}, calculado: ${computed})`,
        };
      }
    }

    // 2. Store in CacheStorage
    const cache = await caches.open(CACHE_NAME);
    const req = new Request(`/api/audio/chapter/${chapterId}`);
    const blob = new Blob([buffer], { type: "audio/mpeg" });
    const responseToCache = new Response(blob, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Audio-SHA256": expectedSha256 || "",
        "Content-Length": buffer.byteLength.toString(),
      },
    });

    await cache.put(req, responseToCache);

    // Update object URL cache
    const existingUrl = OfflineAudioCache.objectUrls.get(chapterId);
    if (existingUrl) {
      URL.revokeObjectURL(existingUrl);
      OfflineAudioCache.objectUrls.delete(chapterId);
    }

    return { success: true };
  }

  /**
   * Deletes a cached chapter from offline storage.
   */
  static async deleteCachedChapter(chapterId: string): Promise<boolean> {
    if (!OfflineAudioCache.isSupported()) return false;
    try {
      const cache = await caches.open(CACHE_NAME);
      const req = new Request(`/api/audio/chapter/${chapterId}`);
      const deleted = await cache.delete(req);

      const existingUrl = OfflineAudioCache.objectUrls.get(chapterId);
      if (existingUrl) {
        URL.revokeObjectURL(existingUrl);
        OfflineAudioCache.objectUrls.delete(chapterId);
      }

      return deleted;
    } catch {
      return false;
    }
  }

  /**
   * Lists all cached chapter IDs.
   */
  static async listCachedChapterIds(): Promise<string[]> {
    if (!OfflineAudioCache.isSupported()) return [];
    try {
      const cache = await caches.open(CACHE_NAME);
      const requests = await cache.keys();
      const ids: string[] = [];

      for (const req of requests) {
        const match = req.url.match(/\/api\/audio\/chapter\/([^/?#]+)/);
        if (match?.[1]) {
          ids.push(match[1]);
        }
      }
      return ids;
    } catch {
      return [];
    }
  }

  /**
   * Calculates total storage used by cached audio in bytes.
   */
  static async getCachedStorageSize(): Promise<number> {
    if (!OfflineAudioCache.isSupported()) return 0;
    try {
      const cache = await caches.open(CACHE_NAME);
      const requests = await cache.keys();
      let totalBytes = 0;

      for (const req of requests) {
        const res = await cache.match(req);
        if (res) {
          const blob = await res.blob();
          totalBytes += blob.size;
        }
      }
      return totalBytes;
    } catch {
      return 0;
    }
  }
}
