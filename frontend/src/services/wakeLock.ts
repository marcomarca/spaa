/**
 * WakeLockManager
 * Prevents screen and device CPU sleep while playing audio in web/mobile environments.
 */

export class WakeLockManager {
  private static sentinel: WakeLockSentinel | null = null;
  private static isRequested = false;

  private static isSupported(): boolean {
    return typeof navigator !== "undefined" && "wakeLock" in navigator;
  }

  static async request(): Promise<boolean> {
    if (!WakeLockManager.isSupported()) return false;

    WakeLockManager.isRequested = true;
    try {
      if (!WakeLockManager.sentinel) {
        WakeLockManager.sentinel = await navigator.wakeLock.request("screen");
        WakeLockManager.sentinel.addEventListener("release", () => {
          WakeLockManager.sentinel = null;
        });
      }
      return true;
    } catch {
      // Wake lock can fail if low battery or tab hidden
      return false;
    }
  }

  static async release(): Promise<void> {
    WakeLockManager.isRequested = false;
    if (WakeLockManager.sentinel) {
      try {
        await WakeLockManager.sentinel.release();
      } catch {
        // Ignore
      }
      WakeLockManager.sentinel = null;
    }
  }

  static isLocked(): boolean {
    return WakeLockManager.sentinel !== null;
  }

  static getIsRequested(): boolean {
    return WakeLockManager.isRequested;
  }
}

// Auto-reacquire when returning to foreground if still requested
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", async () => {
    if (
      document.visibilityState === "visible" &&
      WakeLockManager.getIsRequested() &&
      !WakeLockManager.isLocked()
    ) {
      // Re-request if previously requested and active
      await WakeLockManager.request();
    }
  });
}
