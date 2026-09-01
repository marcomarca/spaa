/**
 * DOM Adapter for Google AI Studio Speech Playground.
 *
 * Isolated DOM interactions strictly decoupling Chrome extension logic from Google AI Studio layout.
 * Calibrated against real AI Studio Live / Speech Prompt DOM snapshots.
 */
export class AIStudioAdapter {
  /**
   * Checks if current page is Google AI Studio.
   */
  static isAIStudioPage(): boolean {
    return (
      window.location.hostname.includes("aistudio.google.com") ||
      document.querySelector("ms-speech-prompt, ms-app, ms-logo-icon") !== null
    );
  }

  /**
   * Switches to 'Text' mode if current view is in 'Composer' mode.
   */
  static ensureTextMode(): boolean {
    const textToggleBtn = document.querySelector('ms-button-toggle button[data-value="TEXT"]') as HTMLButtonElement | null;
    if (textToggleBtn && textToggleBtn.getAttribute("aria-checked") === "false") {
      textToggleBtn.click();
      return true;
    }
    return false;
  }

  /**
   * Locates the main spoken text prompt input.
   */
  static findTextInput(): HTMLTextAreaElement | null {
    // 1. Text mode main textarea (highest priority)
    const textModePrompt = document.querySelector('textarea[aria-label="Enter a prompt"]') as HTMLTextAreaElement | null;
    if (textModePrompt) return textModePrompt;

    // 2. Transcript wrapper textarea
    const transcriptTextarea = document.querySelector(".transcript-text textarea") as HTMLTextAreaElement | null;
    if (transcriptTextarea) return transcriptTextarea;

    // 3. Composer mode speech block textarea (fallback if in composer mode)
    const composerTextarea = document.querySelector(
      'ms-speech-block textarea[aria-label="Speech block text"], ms-speech-block textarea'
    ) as HTMLTextAreaElement | null;
    if (composerTextarea) return composerTextarea;

    // 4. Placeholder fallback
    const placeholderTextarea = document.querySelector(
      "textarea[placeholder*=\"That's a great idea\"], textarea[placeholder*=\"tags\"]"
    ) as HTMLTextAreaElement | null;
    if (placeholderTextarea) return placeholderTextarea;

    // 5. Any textarea in speech-prompt-main
    const anyPromptTextarea = document.querySelector(".speech-prompt-main textarea") as HTMLTextAreaElement | null;
    return anyPromptTextarea;
  }

  /**
   * Injects prompt text simulating real user typing so Angular form controls update.
   */
  static setPromptText(element: HTMLTextAreaElement, text: string): boolean {
    try {
      element.focus();

      // Use native prototype setter to bypass Angular form control interception
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(element, text);
      } else {
        element.value = text;
      }

      // Dispatch input and change events
      element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
      element.blur();
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
      if (btn.innerText.trim().startsWith("Run")) {
        return btn;
      }
    }

    return null;
  }

  /**
   * Checks if the Run button is enabled and ready to generate.
   */
  static isRunButtonReady(): boolean {
    const btn = AIStudioAdapter.findRunButton();
    if (!btn) return false;
    const isAriaDisabled = btn.getAttribute("aria-disabled") === "true";
    return !btn.disabled && !isAriaDisabled;
  }

  /**
   * Triggers audio synthesis by clicking the Run button.
   */
  static clickRun(): boolean {
    const btn = AIStudioAdapter.findRunButton();
    if (!btn) return false;
    btn.click();
    return true;
  }

  /**
   * Finds generated audio data URI or Blob URL from the music player.
   */
  static getGeneratedAudioSrc(): string | null {
    const audioEl = document.querySelector("ms-music-player audio") as HTMLAudioElement | null;
    if (audioEl && audioEl.src && (audioEl.src.startsWith("data:audio") || audioEl.src.startsWith("blob:"))) {
      return audioEl.src;
    }
    return null;
  }

  /**
   * Locates the Download button in the player footer.
   */
  static findDownloadButton(): HTMLButtonElement | null {
    // 1. Download button by aria-label inside ms-music-player
    const dlBtn = document.querySelector(
      'ms-music-player button[aria-label="Download"], ms-music-player button.download-button'
    ) as HTMLButtonElement | null;
    if (dlBtn) return dlBtn;

    // 2. Any button with download-button class
    const anyDl = document.querySelector("button.download-button, button[aria-label*='Download' i]") as HTMLButtonElement | null;
    return anyDl;
  }

  /**
   * Checks if audio generation is currently in progress.
   */
  static isGenerating(): boolean {
    const runBtn = AIStudioAdapter.findRunButton();
    if (!runBtn) return false;

    // Check if Run button is busy or disabled while generating
    const isBusy = runBtn.getAttribute("aria-busy") === "true" || runBtn.closest("ms-run-button")?.classList.contains("generating");
    const hasSpinner = runBtn.querySelector(".mat-mdc-progress-spinner, mat-spinner") !== null;

    return isBusy || hasSpinner;
  }

  /**
   * Reads visible error toast or banner if generation failed.
   */
  static readVisibleError(): string | null {
    const errorContainers = [
      "ms-global-banner",
      ".error-message",
      "mat-error",
      ".cdk-overlay-pane .error",
      "[role='alert']",
    ];

    for (const selector of errorContainers) {
      const el = document.querySelector(selector);
      if (el && el.textContent?.trim()) {
        return el.textContent.trim();
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
}
