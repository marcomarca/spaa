/**
 * DOM Adapter for Google AI Studio Speech Playground.
 *
 * Isolated DOM interactions strictly decoupling Chrome extension logic from Google AI Studio layout.
 * Calibrated against real AI Studio Live / Speech Prompt DOM snapshots.
 */
export class AIStudioAdapter {
  /**
   * Checks if current URL is Google AI Studio Speech Playground.
   */
  static isAIStudioPage(): boolean {
    const url = window.location.href;
    if (url.includes("aistudio.google.com/api-keys") || url.includes("aistudio.google.com/app/apikey")) {
      console.warn("[AIStudioAdapter] On API keys page. Redirecting to generate-speech...");
      window.location.href = "https://aistudio.google.com/generate-speech?model=gemini-2.5-pro-preview-tts";
      return false;
    }
    return url.includes("aistudio.google.com/generate-speech") || url.includes("aistudio.google.com");
  }

  /**
   * Dismisses any error toast, snackbar, or banner by clicking its close (X) button.
   * STRICT: NEVER touches navigation, 'Get code', or API key buttons.
   */
  static dismissErrorBanners(): void {
    // Close modal dialogs if opened by mistake (e.g. Get Code dialog)
    const dialogClose = document.querySelector<HTMLButtonElement>(
      "mat-dialog-container button[aria-label*='Close' i], ms-dialog button.close-button, .cdk-overlay-pane button.close-button, [role='dialog'] button[aria-label*='Close' i]"
    );
    if (dialogClose) {
      try {
        dialogClose.click();
      } catch {
        // Ignore
      }
    }

    // Dismiss snackbars / banners inside notification containers
    const bannerCloseBtns = document.querySelectorAll<HTMLButtonElement>(
      "ms-global-banner button, .mat-mdc-snack-bar-container button, ms-notification-banner button, .main-content ~ .actions button, .main-content button, [role='alert'] button, ms-banner button, .snackbar-actions button"
    );
    for (const b of bannerCloseBtns) {
      try {
        b.click();
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Calculates the exact center viewport coordinates of an element for CDP hardware clicks.
   */
  static getElementCenterCoords(element: HTMLElement | null): { x: number; y: number } | null {
    if (!element) return null;
    try {
      element.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Performs a multi-tiered trusted click (DOM Pointer Sequence + CDP Hardware Mouse Click).
   */
  static triggerTrustedClick(element: HTMLElement | null): boolean {
    if (!element) return false;

    // 1. In-DOM Pointer Sequence
    try {
      element.focus();
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse" }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
      element.click();
    } catch {
      // ignore
    }

    // 2. CDP Hardware Mouse Click via Service Worker
    const coords = AIStudioAdapter.getElementCenterCoords(element);
    if (coords && typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({ type: "CDP_TRUSTED_CLICK", coords });
      } catch {
        // ignore
      }
    }

    return true;
  }

  /**
   * Detects and clicks the initial 'Turn text into natural-sounding speech...' landing button
   * to transition AI Studio from the welcome/template screen to the actual prompt editor.
   */
  static ensureSpeechEditorInitialized(): boolean {
    if (AIStudioAdapter.findTextInput() !== null) {
      return true;
    }

    const startBtn = document.querySelector<HTMLButtonElement>(
      "button.text-input-container, .text-input-container button, button:has(.text-input-container), [class*='text-input-container']"
    );
    if (startBtn) {
      AIStudioAdapter.triggerTrustedClick(startBtn);
      return true;
    }

    const allButtons = document.querySelectorAll("button, div[role='button']");
    for (const btn of allButtons) {
      const text = (btn as HTMLElement).innerText?.trim() || "";
      if (text.includes("Turn text into") || text.includes("natural-sounding speech")) {
        AIStudioAdapter.triggerTrustedClick(btn as HTMLElement);
        return true;
      }
    }

    return false;
  }

  /**
   * Switches to 'Text' mode if current view is in 'Composer' mode.
   */
  static ensureTextMode(): boolean {
    const textToggleBtn = document.querySelector(
      'ms-button-toggle button[data-value="TEXT"], button[aria-label="Text" i], mat-button-toggle[value="TEXT"] button, mat-button-toggle[value="text"] button'
    ) as HTMLButtonElement | null;
    if (textToggleBtn) {
      if (textToggleBtn.getAttribute("aria-checked") === "false" || !textToggleBtn.classList.contains("selected")) {
        textToggleBtn.click();
        return true;
      }
    }

    const allButtons = document.querySelectorAll("button, mat-button-toggle");
    for (const b of allButtons) {
      const text = b.textContent?.trim() || "";
      if (text === "Text" || text === "≡ Text" || text.includes("Text")) {
        if (b.getAttribute("aria-checked") === "false" || !b.classList.contains("selected")) {
          (b as HTMLElement).click();
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Toggles between Text and Composer modes.
   */
  static toggleMode(targetMode?: "TEXT" | "COMPOSER"): string {
    const textBtn = document.querySelector('ms-button-toggle button[data-value="TEXT"], button[aria-label="Text" i]') as HTMLButtonElement | null;
    const composerBtn = document.querySelector('ms-button-toggle button[data-value="COMPOSER"], button[aria-label="Composer" i]') as HTMLButtonElement | null;

    if (targetMode === "TEXT") {
      textBtn?.click();
      return "TEXT";
    }
    if (targetMode === "COMPOSER") {
      composerBtn?.click();
      return "COMPOSER";
    }

    if (textBtn?.getAttribute("aria-checked") === "true") {
      composerBtn?.click();
      return "COMPOSER";
    }
    textBtn?.click();
    return "TEXT";
  }

  /**
   * Locates the main spoken text prompt input across both Text and Composer modes.
   */
  static findTextInput(): HTMLTextAreaElement | null {
    // 1. Text mode main textarea (highest priority)
    const textModePrompt = document.querySelector(
      'textarea[aria-label="Enter a prompt" i], textarea[placeholder*="Enter a prompt" i]'
    ) as HTMLTextAreaElement | null;
    if (textModePrompt) return textModePrompt;

    // 2. Transcript wrapper textarea
    const transcriptTextarea = document.querySelector(".transcript-text textarea, ms-speech-prompt textarea") as HTMLTextAreaElement | null;
    if (transcriptTextarea) return transcriptTextarea;

    // 3. Composer mode speech block textarea (fallback if in composer mode)
    const composerTextarea = document.querySelector(
      'ms-speech-block textarea, textarea[aria-label*="Speech block" i], ms-autosize-textarea textarea'
    ) as HTMLTextAreaElement | null;
    if (composerTextarea) return composerTextarea;

    // 4. Placeholder fallback
    const placeholderTextarea = document.querySelector(
      "textarea[placeholder*=\"That's a great idea\" i], textarea[placeholder*=\"tags\" i]"
    ) as HTMLTextAreaElement | null;
    if (placeholderTextarea) return placeholderTextarea;

    // 5. Any textarea in speech-prompt-main
    const anyPromptTextarea = document.querySelector(".speech-prompt-main textarea") as HTMLTextAreaElement | null;
    if (anyPromptTextarea) return anyPromptTextarea;

    // 6. Generic visible textarea excluding Scene / Sample Context
    const allTextareas = document.querySelectorAll("textarea");
    for (const t of allTextareas) {
      const label = (t.getAttribute("aria-label") || "").toLowerCase();
      const placeholder = (t.getAttribute("placeholder") || "").toLowerCase();
      if (!label.includes("scene") && !label.includes("context") && !placeholder.includes("scene") && !placeholder.includes("context")) {
        return t;
      }
    }

    return null;
  }

  /**
   * Locates the 'Scene' textarea.
   */
  static findSceneInput(): HTMLTextAreaElement | null {
    return document.querySelector(
      'textarea[aria-label="Scene" i], textarea[placeholder*="bustling street" i], ms-autosize-textarea[arialabel*="Scene" i] textarea, ms-autosize-textarea[aria-label*="Scene" i] textarea'
    ) as HTMLTextAreaElement | null;
  }

  /**
   * Locates the 'Sample Context' textarea.
   */
  static findSampleContextInput(): HTMLTextAreaElement | null {
    return document.querySelector(
      'textarea[aria-label*="Sample Context" i], textarea[aria-label*="Context" i], textarea[placeholder*="Previous speaker" i], ms-autosize-textarea[arialabel*="Context" i] textarea, ms-autosize-textarea[aria-label*="Context" i] textarea'
    ) as HTMLTextAreaElement | null;
  }

  /**
   * Locates the Model Selector button card.
   */
  static findModelSelector(): HTMLElement | null {
    return document.querySelector("ms-model-selector button.model-selector-card, ms-model-selector") as HTMLElement | null;
  }

  /**
   * Locates the Voice Settings trigger.
   */
  static findVoiceSelector(): HTMLElement | null {
    return document.querySelector("ms-voice-settings .active-voice-card-trigger, ms-voice-settings") as HTMLElement | null;
  }

  /**
   * Injects prompt text simulating real user typing so Angular form controls update.
   */
  static setPromptText(element: HTMLTextAreaElement, text: string): boolean {
    try {
      element.focus();
      element.select();

      let inserted = false;
      try {
        inserted = document.execCommand("insertText", false, text);
      } catch {
        inserted = false;
      }

      if (!inserted || element.value !== text) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
        if (nativeSetter) {
          nativeSetter.call(element, text);
        } else {
          element.value = text;
        }
      }

      // Dispatch comprehensive event suite for Angular Reactive Forms
      element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA", bubbles: true }));
      return true;
    } catch (err) {
      console.error("[AIStudioAdapter] Failed to set prompt text:", err);
      return false;
    }
  }

  /**
   * Locates the 'Run' / Generate button.
   */
  static findRunButton(): HTMLButtonElement | null {
    // 1. Semantic ms-run-button submit
    const msRunBtn = document.querySelector("ms-run-button button") as HTMLButtonElement | null;
    if (msRunBtn) return msRunBtn;

    // 2. Button with run-button-label
    const labelBtn = document.querySelector("button:has(.run-button-label)") as HTMLButtonElement | null;
    if (labelBtn) return labelBtn;

    // 3. Button with text 'Run'
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      const text = btn.innerText.trim();
      if (text.startsWith("Run") || text === "Run ↵" || text.includes("Run")) {
        return btn;
      }
    }

    return null;
  }

  /**
   * Checks if the Run button is enabled and ready to generate.
   */
  static isRunButtonReady(): boolean {
    if (AIStudioAdapter.isGenerating()) return false;
    const btn = AIStudioAdapter.findRunButton();
    if (!btn) return false;
    const isAriaDisabled = btn.getAttribute("aria-disabled") === "true";
    return !btn.disabled && !isAriaDisabled;
  }

  /**
   * Checks if audio generation is currently in progress.
   * Matches exact AI Studio Stop button: <button ms-button><span class="spin">progress_activity</span><span>Stop</span></button>
   */
  static isGenerating(): boolean {
    // 1. Check if any run button currently contains 'Stop', '.spin', or 'progress_activity'
    const msRunBtn = document.querySelector("ms-run-button button, button:has(.run-button-label), button:has(.spin)") as HTMLButtonElement | null;
    if (msRunBtn) {
      const text = msRunBtn.innerText.trim().toLowerCase();
      if (text.includes("stop")) return true;
      if (msRunBtn.querySelector(".spin, [class*='spin'], [class*='progress_activity']") || msRunBtn.innerHTML.includes("progress_activity")) {
        return true;
      }
      if (msRunBtn.getAttribute("type") === "button" && !text.includes("run")) {
        return true;
      }
    }

    // 2. Check all buttons for active Stop state
    const allButtons = document.querySelectorAll("button");
    for (const b of allButtons) {
      if (b.innerText.trim().toLowerCase() === "stop" || (b.innerHTML.includes("progress_activity") && b.innerHTML.includes("spin"))) {
        return true;
      }
    }

    // 3. Container level class
    const runContainer = document.querySelector("ms-run-button");
    if (runContainer && (runContainer.classList.contains("generating") || runContainer.querySelector(".spin, progress_activity, mat-spinner"))) {
      return true;
    }

    return false;
  }

  /**
   * Triggers audio synthesis safely. NEVER clicks if already generating.
   * Multi-tiered trigger: DOM Pointer sequence + Hardware CDP Coordinate Click + Hardware CDP Ctrl+Enter.
   */
  static clickRun(): boolean {
    if (AIStudioAdapter.isGenerating()) {
      console.warn("[AIStudioAdapter] Already generating! Aborting clickRun to prevent canceling synthesis.");
      return false;
    }

    const btn = AIStudioAdapter.findRunButton();
    const promptInput = AIStudioAdapter.findTextInput();

    // Dismiss error banner if any before clicking Run
    AIStudioAdapter.dismissErrorBanners();

    let clicked = false;
    if (btn && !btn.innerText.trim().toLowerCase().includes("stop") && !btn.innerHTML.includes("progress_activity")) {
      // 1. In-DOM Pointer & Click Sequence
      try {
        btn.focus();
        btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
        btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse" }));
        btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
        btn.click();
      } catch {
        // ignore
      }

      // 2. Hardware CDP Mouse Click (isTrusted = true) via Service Worker
      const coords = AIStudioAdapter.getElementCenterCoords(btn);
      if (coords && typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        try {
          chrome.runtime.sendMessage({ type: "CDP_TRUSTED_CLICK", coords });
        } catch {
          // ignore
        }
      }

      clicked = true;
    }

    // 3. Secondary dispatch: In-DOM keyboard trigger Ctrl+Enter
    if (promptInput) {
      try {
        promptInput.focus();
        const ctrlEnterEvent = new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          ctrlKey: true,
          metaKey: true,
          bubbles: true,
          cancelable: true,
        });
        promptInput.dispatchEvent(ctrlEnterEvent);
      } catch {
        // ignore
      }
    }

    // 4. Tertiary dispatch: Hardware CDP Ctrl+Enter (isTrusted = true)
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({ type: "CDP_TRUSTED_KEYBOARD_RUN" });
      } catch {
        // ignore
      }
    }

    return clicked;
  }

  /**
   * Finds generated audio data URI or Blob URL from the music player.
   */
  static getGeneratedAudioSrc(): string | null {
    const audioEl = document.querySelector("ms-music-player audio, audio") as HTMLAudioElement | null;
    if (audioEl) {
      const src = audioEl.currentSrc || audioEl.src;
      if (src && (src.startsWith("data:audio") || src.startsWith("blob:") || src.startsWith("http"))) {
        return src;
      }
    }
    const sourceEl = document.querySelector("ms-music-player source, audio source") as HTMLSourceElement | null;
    if (sourceEl && sourceEl.src) {
      return sourceEl.src;
    }
    return null;
  }

  /**
   * Locates the Download button in the player footer.
   */
  static findDownloadButton(): HTMLButtonElement | null {
    const dlBtn = document.querySelector(
      'ms-music-player button[aria-label="Download"], ms-music-player button.download-button'
    ) as HTMLButtonElement | null;
    if (dlBtn) return dlBtn;

    const anyDl = document.querySelector("button.download-button, button[aria-label*='Download' i]") as HTMLButtonElement | null;
    return anyDl;
  }

  /**
   * Reads visible error toast, snackbar, or banner if generation failed or rate-limited.
   */
  static readVisibleError(): string | null {
    const errorContainers = [
      ".main-content .message",
      ".message span",
      "ms-notification-banner",
      ".mat-mdc-snack-bar-container",
      "ms-global-banner",
      ".error-message",
      "mat-error",
      ".cdk-overlay-pane .error",
      "[role='alert']",
      "ms-banner",
    ];

    for (const selector of errorContainers) {
      const el = document.querySelector(selector);
      if (el && el.textContent?.trim()) {
        const text = el.textContent.trim();
        if (
          text.includes("400") ||
          text.includes("403") ||
          text.includes("429") ||
          text.includes("500") ||
          text.includes("Http response") ||
          text.includes("error") ||
          text.includes("Quota") ||
          text.includes("exhausted") ||
          text.includes("Rate limit") ||
          text.includes("Failed")
        ) {
          return text;
        }
      }
    }

    return null;
  }

  /**
   * Retrieves currently selected model name from UI.
   */
  static getSelectedModel(): string | null {
    const modelEl = document.querySelector('[data-test-id="model-name"]');
    return modelEl?.textContent?.trim() || null;
  }

  /**
   * Retrieves currently selected voice name from UI.
   */
  static getSelectedVoice(): string | null {
    const voiceEl = document.querySelector(".voice-display-name");
    return voiceEl?.textContent?.trim() || null;
  }

  /**
   * Draws a visible neon highlight and floating tooltip around an element on AI Studio page.
   */
  static highlightElement(element: HTMLElement | null, labelText: string, color = "#38bdf8"): void {
    if (!element) return;

    element.scrollIntoView({ behavior: "smooth", block: "center" });

    const originalOutline = element.style.outline;
    const originalShadow = element.style.boxShadow;
    const originalTransition = element.style.transition;

    element.style.transition = "all 0.3s ease";
    element.style.outline = `3px solid ${color}`;
    element.style.boxShadow = `0 0 20px ${color}`;

    // Create floating badge
    const badge = document.createElement("div");
    badge.className = "spaa-test-badge";
    badge.textContent = `🎯 ${labelText}`;
    badge.style.position = "absolute";
    badge.style.zIndex = "99999999";
    badge.style.background = color;
    badge.style.color = "#0f172a";
    badge.style.fontWeight = "bold";
    badge.style.fontSize = "12px";
    badge.style.padding = "4px 8px";
    badge.style.borderRadius = "4px";
    badge.style.boxShadow = "0 4px 10px rgba(0,0,0,0.5)";
    badge.style.pointerEvents = "none";

    const rect = element.getBoundingClientRect();
    badge.style.left = `${window.scrollX + rect.left}px`;
    badge.style.top = `${Math.max(0, window.scrollY + rect.top - 28)}px`;

    document.body.appendChild(badge);

    setTimeout(() => {
      element.style.outline = originalOutline;
      element.style.boxShadow = originalShadow;
      element.style.transition = originalTransition;
      badge.remove();
    }, 4000);
  }

  /**
   * Runs comprehensive diagnostics on all required AI Studio elements.
   */
  static diagnoseDOM() {
    const isPage = AIStudioAdapter.isAIStudioPage();
    const textInput = AIStudioAdapter.findTextInput();
    const sceneInput = AIStudioAdapter.findSceneInput();
    const sampleContextInput = AIStudioAdapter.findSampleContextInput();
    const runBtn = AIStudioAdapter.findRunButton();
    const isRunReady = AIStudioAdapter.isRunButtonReady();
    const modelSelector = AIStudioAdapter.findModelSelector();
    const voiceSelector = AIStudioAdapter.findVoiceSelector();
    const player = document.querySelector("ms-music-player");
    const audioSrc = AIStudioAdapter.getGeneratedAudioSrc();
    const dlBtn = AIStudioAdapter.findDownloadButton();
    const selectedModel = AIStudioAdapter.getSelectedModel();
    const selectedVoice = AIStudioAdapter.getSelectedVoice();

    return {
      isPage,
      elements: {
        textPromptInput: Boolean(textInput),
        sceneInput: Boolean(sceneInput),
        sampleContextInput: Boolean(sampleContextInput),
        runButton: Boolean(runBtn),
        isRunReady,
        modelSelector: Boolean(modelSelector),
        voiceSelector: Boolean(voiceSelector),
        playerDetected: Boolean(player),
        hasGeneratedAudio: Boolean(audioSrc),
        downloadButton: Boolean(dlBtn),
      },
      values: {
        selectedModel: selectedModel || "No detectado",
        selectedVoice: selectedVoice || "No detectado",
        textPromptValue: textInput?.value || "",
        sceneValue: sceneInput?.value || "",
        sampleContextValue: sampleContextInput?.value || "",
        hasAudioData: Boolean(audioSrc),
      },
    };
  }

  /**
   * Generates a deep diagnostic report of all DOM selectors, candidates, and available elements.
   */
  static getDetailedDebugReport() {
    const isPage = AIStudioAdapter.isAIStudioPage();
    const currentUrl = window.location.href;
    const pageTitle = document.title;
    const readyState = document.readyState;

    // Discover custom elements
    const customElements = Array.from(
      new Set(
        Array.from(document.querySelectorAll("*"))
          .map((el) => el.tagName.toLowerCase())
          .filter((tag) => tag.startsWith("ms-") || tag.startsWith("mat-") || tag.startsWith("cdk-"))
      )
    );

    // Helper to test selectors
    const testCandidateSelectors = (selectors: string[]) => {
      const results: { selector: string; matched: boolean; htmlSnippet?: string; attributes?: Record<string, string> }[] = [];
      let matchedEl: HTMLElement | null = null;
      let matchedSel: string | null = null;

      for (const sel of selectors) {
        let el: HTMLElement | null = null;
        try {
          el = document.querySelector(sel) as HTMLElement | null;
        } catch {
          // invalid selector syntax in browser
        }
        const matched = Boolean(el);
        if (matched && !matchedEl && el) {
          matchedEl = el;
          matchedSel = sel;
        }

        const attrs: Record<string, string> = {};
        if (el) {
          for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i];
            attrs[attr.name] = attr.value;
          }
        }

        results.push({
          selector: sel,
          matched,
          htmlSnippet: el ? el.outerHTML.slice(0, 200) : undefined,
          attributes: el ? attrs : undefined,
        });
      }

      return {
        matched: Boolean(matchedEl),
        matchedSelector: matchedSel,
        elementSnippet: matchedEl ? matchedEl.outerHTML.slice(0, 300) : undefined,
        candidates: results,
      };
    };

    // Components to test
    const components = {
      textPromptInput: testCandidateSelectors([
        'textarea[aria-label="Enter a prompt"]',
        ".transcript-text textarea",
        'ms-speech-block textarea[aria-label="Speech block text"]',
        "ms-speech-block textarea",
        'textarea[placeholder*="That\'s a great idea"]',
        'textarea[placeholder*="tags"]',
        ".speech-prompt-main textarea",
      ]),
      sceneInput: testCandidateSelectors([
        'textarea[aria-label="Scene"]',
        'ms-autosize-textarea[arialabel="Scene"] textarea',
        'textarea[placeholder*="Scene" i]',
      ]),
      sampleContextInput: testCandidateSelectors([
        'textarea[aria-label="Sample Context"]',
        'ms-autosize-textarea[arialabel="Sample Context"] textarea',
        'textarea[placeholder*="Context" i]',
      ]),
      runButton: testCandidateSelectors([
        "ms-run-button button",
        "button:has(.run-button-label)",
        "button.run-button",
        'button[aria-label="Run"]',
        'button[aria-label="Generate"]',
        'button[data-test-id="run-button"]',
      ]),
      modelSelector: testCandidateSelectors([
        "ms-model-selector button.model-selector-card",
        "ms-model-selector",
        '[data-test-id="model-name"]',
      ]),
      voiceSelector: testCandidateSelectors([
        "ms-voice-settings .active-voice-card-trigger",
        "ms-voice-settings",
        ".voice-display-name",
      ]),
      musicPlayer: testCandidateSelectors([
        "ms-music-player",
        "ms-music-player audio",
        "audio",
      ]),
      downloadButton: testCandidateSelectors([
        'ms-music-player button[aria-label="Download"]',
        "ms-music-player button.download-button",
        "button.download-button",
        'button[aria-label*="Download" i]',
      ]),
    };

    // Inspect all textarea elements in DOM
    const allTextareas = Array.from(document.querySelectorAll("textarea")).map((ta, idx) => ({
      index: idx + 1,
      tagName: ta.tagName.toLowerCase(),
      id: ta.id || undefined,
      name: ta.name || undefined,
      ariaLabel: ta.getAttribute("aria-label") || undefined,
      placeholder: ta.placeholder || undefined,
      className: ta.className || undefined,
      parentTag: ta.parentElement?.tagName.toLowerCase(),
      valuePreview: ta.value.slice(0, 50),
    }));

    // Inspect all buttons in DOM (up to 30)
    const allButtons = Array.from(document.querySelectorAll("button"))
      .slice(0, 30)
      .map((btn, idx) => ({
        index: idx + 1,
        text: btn.innerText.trim().slice(0, 40) || undefined,
        ariaLabel: btn.getAttribute("aria-label") || undefined,
        className: btn.className || undefined,
        disabled: btn.disabled,
        parentTag: btn.parentElement?.tagName.toLowerCase(),
      }));

    // Error banner
    const visibleError = AIStudioAdapter.readVisibleError();

    return {
      timestamp: new Date().toISOString(),
      page: {
        isAIStudioPage: isPage,
        url: currentUrl,
        title: pageTitle,
        readyState,
      },
      customElements,
      components,
      allTextareas,
      allButtons,
      visibleError,
      values: {
        selectedModel: AIStudioAdapter.getSelectedModel() || "No detectado",
        selectedVoice: AIStudioAdapter.getSelectedVoice() || "No detectado",
        hasAudioSrc: Boolean(AIStudioAdapter.getGeneratedAudioSrc()),
      },
    };
  }
}
