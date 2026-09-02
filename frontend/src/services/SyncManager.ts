import type { NetworkSyncState, OfflineChapterItem, SyncEvent } from "../domain/types";
import { api } from "./api";

const SYNC_QUEUE_KEY = "spaa_pending_sync_events";

export class SyncManager {
  private lanUrl: string;
  private tailscaleUrl: string;
  private state: NetworkSyncState = {
    mode: "localhost",
    activeUrl: "",
    isOnline: true,
    pendingEventsCount: 0,
    offlineBufferedHours: 0,
    storageUsedBytes: 0,
  };

  private listeners: ((state: NetworkSyncState) => void)[] = [];

  constructor(lanUrl = "http://192.168.1.50:8009", tailscaleUrl = "http://100.100.100.100:8009") {
    this.lanUrl = localStorage.getItem("spaa_lan_url") || lanUrl;
    this.tailscaleUrl = localStorage.getItem("spaa_tailscale_url") || tailscaleUrl;
    this.loadPendingEventsCount();
  }

  subscribe(listener: (state: NetworkSyncState) => void) {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const l of this.listeners) {
      l(this.state);
    }
  }

  getState(): NetworkSyncState {
    return { ...this.state };
  }

  setUrls(lanUrl: string, tailscaleUrl: string) {
    this.lanUrl = lanUrl;
    this.tailscaleUrl = tailscaleUrl;
    localStorage.setItem("spaa_lan_url", lanUrl);
    localStorage.setItem("spaa_tailscale_url", tailscaleUrl);
    this.probeBestConnection();
  }

  async probeBestConnection(): Promise<string> {
    // 1. Try local proxy / current origin
    try {
      const pingRes = await fetch("/health", { signal: AbortSignal.timeout(1200) });
      if (pingRes.ok) {
        this.state = { ...this.state, mode: "localhost", activeUrl: "", isOnline: true };
        api.setBaseUrl("");
        this.notify();
        return "";
      }
    } catch {
      // Continue to next probe
    }

    // 2. Try LAN URL (1.5s timeout)
    if (this.lanUrl) {
      try {
        const pingLan = await fetch(`${this.lanUrl}/health`, { signal: AbortSignal.timeout(1500) });
        if (pingLan.ok) {
          this.state = { ...this.state, mode: "lan", activeUrl: this.lanUrl, isOnline: true };
          api.setBaseUrl(this.lanUrl);
          this.notify();
          return this.lanUrl;
        }
      } catch {
        // LAN unreachable
      }
    }

    // 3. Try Tailscale URL (2.5s timeout)
    if (this.tailscaleUrl) {
      try {
        const pingTail = await fetch(`${this.tailscaleUrl}/health`, {
          signal: AbortSignal.timeout(2500),
        });
        if (pingTail.ok) {
          this.state = {
            ...this.state,
            mode: "tailscale",
            activeUrl: this.tailscaleUrl,
            isOnline: true,
          };
          api.setBaseUrl(this.tailscaleUrl);
          this.notify();
          return this.tailscaleUrl;
        }
      } catch {
        // Tailscale unreachable
      }
    }

    // Offline mode
    this.state = { ...this.state, mode: "offline", isOnline: false };
    this.notify();
    return "";
  }

  enqueueSyncEvent(event: SyncEvent) {
    const queue = this.getPendingEvents();
    queue.push(event);
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    this.state.pendingEventsCount = queue.length;
    this.notify();

    if (this.state.isOnline) {
      this.flushSyncQueue();
    }
  }

  getPendingEvents(): SyncEvent[] {
    try {
      const raw = localStorage.getItem(SYNC_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private loadPendingEventsCount() {
    this.state.pendingEventsCount = this.getPendingEvents().length;
  }

  async flushSyncQueue(deviceId = "web-client-1"): Promise<{ sent: number; remaining: number }> {
    const events = this.getPendingEvents();
    if (events.length === 0) return { sent: 0, remaining: 0 };

    try {
      const res = await api.pushSyncEvents(deviceId, events);
      if (res.processed + res.skipped_duplicates > 0) {
        localStorage.removeItem(SYNC_QUEUE_KEY);
        this.state.pendingEventsCount = 0;
        this.notify();
        return { sent: events.length, remaining: 0 };
      }
    } catch (err) {
      console.warn("[SyncManager] Failed to flush sync events to server:", err);
    }
    return { sent: 0, remaining: events.length };
  }

  // Atomic Download & Verification (§62)
  async downloadAndVerifyChapter(item: OfflineChapterItem): Promise<boolean> {
    try {
      const audioUrl = item.download_url.startsWith("http")
        ? item.download_url
        : `${this.state.activeUrl || ""}${item.download_url}`;

      const res = await fetch(audioUrl);
      if (!res.ok) return false;

      const arrayBuffer = await res.arrayBuffer();

      // Compute SHA-256 in browser
      if (item.sha256) {
        const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const computedSha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

        if (computedSha256.toLowerCase() !== item.sha256.toLowerCase()) {
          console.error(`[SyncManager] SHA-256 mismatch for ${item.chapter_id}. Part rejected.`);
          return false;
        }
      }

      // Store in CacheStorage or IndexedDB
      if ("caches" in window) {
        const cache = await caches.open("spaa-offline-audio-v1");
        const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
        await cache.put(
          new Request(`/api/audio/chapter/${item.chapter_id}`),
          new Response(blob, {
            headers: {
              "Content-Type": "audio/mpeg",
              "X-Audio-SHA256": item.sha256,
            },
          }),
        );
      }

      this.state.storageUsedBytes += arrayBuffer.byteLength;
      this.state.offlineBufferedHours += item.duration_seconds / 3600;
      this.notify();
      return true;
    } catch (err) {
      console.error(`[SyncManager] Download failed for chapter ${item.chapter_id}:`, err);
      return false;
    }
  }

  // Storage Garbage Collection (§56)
  async runStorageGarbageCollection(maxSizeBytes = 8 * 1024 * 1024 * 1024): Promise<number> {
    if (!("caches" in window)) return 0;

    let freedBytes = 0;
    try {
      const cache = await caches.open("spaa-offline-audio-v1");
      const requests = await cache.keys();

      if (this.state.storageUsedBytes > maxSizeBytes && requests.length > 5) {
        // Delete oldest items
        for (let i = 0; i < 3; i++) {
          const req = requests[i];
          if (req) {
            await cache.delete(req);
            freedBytes += 2 * 1024 * 1024; // estimated
          }
        }
      }
    } catch (err) {
      console.warn("[SyncManager] GC error:", err);
    }
    return freedBytes;
  }
}

export const syncManager = new SyncManager();
