---
name: chrome-extension-mv3-automation
description: >-
  Rules, architecture guidelines, bundler configurations, and debugging patterns for Chrome Manifest V3 extensions
  automating web applications (e.g., Google AI Studio TTS). Prevents ES module export syntax errors in Content Scripts,
  establishes resilient tab discovery, ensures idempotent messaging, and enforces clean build pipelines.
---

# Chrome Manifest V3 Automation & Content Script Development Skill

This skill contains critical engineering standards, gotchas, and proven solutions for building, bundling, and debugging Chrome Manifest V3 (MV3) automation extensions (such as the SPAA Gemini AI Studio TTS Worker).

---

## 1. Critical MV3 Content Script Bundling Rules

### 🚫 The "Unexpected token 'export'" Bug (Gotcha #1)
Chrome Content Scripts run as **classic scripts**, NOT ES Modules.
If a bundler (Bun, esbuild, Vite, Rollup) emits `export { ... }` or `export default ...` in the content script bundle:
- Chrome throws an immediate `Uncaught SyntaxError: Unexpected token 'export'`.
- The script crashes before reaching `chrome.runtime.onMessage.addListener`.
- Service workers and popups trying to message the tab fail with `Could not establish connection. Receiving end does not exist.`

### ✅ Rule & Build Pipeline Fix:
In `scripts/build.ts` (or your bundler configuration):
1. **Never export** types or functions from the content-script entrypoint file.
2. **Post-process the bundle** to automatically strip any trailing `export` statements.
3. **Validate syntax** during build using `new Function(content)`:

```typescript
// scripts/build.ts
const contentScriptPath = join(distDir, "content-script.js");
if (existsSync(contentScriptPath)) {
  let code = readFileSync(contentScriptPath, "utf-8");
  // Strip ES module exports so Chrome can execute as a classic script
  code = code.replace(/export\s*\{[^}]*\};?/g, "").replace(/export\s+default\s+[^;]+;?/g, "");
  writeFileSync(contentScriptPath, code);

  // Validate syntax
  try {
    new Function(code);
  } catch (err) {
    console.error("Syntax validation error in content-script.js:", err);
    process.exit(1);
  }
}
```

---

## 2. Resilient Tab Discovery & Messaging Architecture

### 🚫 The Strict URL Query Gotcha (Gotcha #2)
Using `chrome.tabs.query({ url: "*://aistudio.google.com/*" })` or `{ active: true, currentWindow: true }`:
- Fails when query parameters exist (e.g. `?project=xxx&model=yyy`).
- Fails when the popup window is focused instead of the main browser window.
- Returns empty array `[]`, causing message dispatch to fail silently.

### ✅ Solution: Universal Tab Query & In-Memory Matcher
Always query all open tabs and filter in memory:

```typescript
async function getAIStudioTab(): Promise<chrome.tabs.Tab | null> {
  const allTabs = await chrome.tabs.query({});
  // 1. Prefer active tab that matches target domain
  const activeTab = allTabs.find((t) => t.active && t.url && t.url.includes("aistudio.google.com"));
  if (activeTab) return activeTab;

  // 2. Any tab matching target domain
  const anyTab = allTabs.find((t) => t.url && t.url.includes("aistudio.google.com"));
  if (anyTab) return anyTab;

  // 3. Fallback by page title
  const titleTab = allTabs.find((t) => t.title && t.title.includes("AI Studio"));
  return titleTab || null;
}
```

### ✅ Solution: Resilient Send with Automatic Script Re-Injection
When `chrome.tabs.sendMessage` returns `chrome.runtime.lastError` (tab was reloaded or content script disconnected), automatically inject the script and retry:

```typescript
async function sendTabMessage(tabId: number, message: any): Promise<any> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, async (res) => {
      if (chrome.runtime.lastError || res === undefined) {
        try {
          // Dynamic re-injection
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["content-script.js"],
          });
          // Wait briefly for listener registration
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, (retryRes) => {
              if (chrome.runtime.lastError) {
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(retryRes || { success: false, error: "No response from tab" });
              }
            });
          }, 250);
        } catch (injectErr: any) {
          resolve({ success: false, error: injectErr?.message || "Injection failed" });
        }
      } else {
        resolve(res);
      }
    });
  });
}
```

---

## 3. Idempotent Content Script Execution

Always guard content scripts so multiple injections don't cause identifier conflicts or duplicate listeners:

```typescript
// content-script.ts
if (!(window as any).__SPAA_CONTENT_SCRIPT_INITIALIZED__) {
  (window as any).__SPAA_CONTENT_SCRIPT_INITIALIZED__ = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message.type === "PING") {
        sendResponse({ success: true });
        return true;
      }
      // Handle actions...
    } catch (err: any) {
      console.error("[Content Script] Message handling error:", err);
      sendResponse({ success: false, error: err?.message || String(err) });
      return true;
    }
  });
}
```

---

## 4. DOM Isolation & Adaptive UI Selectors

1. **Keep all DOM logic inside a dedicated adapter** (`aistudio-adapter.ts`).
2. **Support multiple UI states & modes:**
   - In Google AI Studio, audio synthesis can run in `Text` mode (`textarea[aria-label="Enter a prompt"]`) or `Composer` multi-speaker mode (`ms-speech-block textarea`).
   - Implement cascading fallbacks for text areas, run buttons, and audio players.
3. **Prevent Action Cancellation:**
   - Before clicking `Run`, always check `isGenerating()`. If the button shows `Stop` or `.spin`, abort the click to prevent canceling an in-flight synthesis.
4. **Dispatch Complete Pointer Sequences:**
   - Modern Angular / Lit / Material elements require full pointer event sequences:
     `pointerdown` $\rightarrow$ `mousedown` $\rightarrow$ `pointerup` $\rightarrow$ `mouseup` $\rightarrow$ `click`.

---

## 5. Chrome DevTools Protocol (CDP) for Trusted Hardware Clicks

When automating applications with anti-automation defenses (like Angular / Google apps verifying `event.isTrusted === true`):
- Synthetic JS `element.click()` or `dispatchEvent()` produce `isTrusted = false`.
- **Solution:** Use `chrome.debugger` API with `Input.dispatchMouseEvent` and `Input.dispatchKeyEvent`.
- Events emitted via CDP arrive at Chrome's core hardware input pipeline and have **`isTrusted: true`**, making them completely indistinguishable from physical mouse and keyboard inputs.

---

## 6. Versioning Rule

Always increment the version in both `extension/manifest.json` and `extension/package.json` on every modification (e.g. `2.6.0` $\rightarrow$ `2.7.0`). This guarantees clear traceability in `chrome://extensions/`.

