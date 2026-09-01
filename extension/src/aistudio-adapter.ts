/**
 * AIStudioAdapter
 * Isolates all DOM interactions with Gemini AI Studio.
 * Follows priority: role -> aria-label -> semantic attributes -> visible text.
 */
export class AIStudioAdapter {
  static isAIStudioPage(): boolean {
    return window.location.hostname.includes("aistudio.google.com");
  }

  static findTextInput(): HTMLElement | null {
    // 1. Textarea with aria-label or placeholder related to prompt / text
    const textareas = document.querySelectorAll("textarea, [contenteditable='true']");
    for (const el of textareas) {
      const aria = el.getAttribute("aria-label")?.toLowerCase() || "";
      const placeholder = el.getAttribute("placeholder")?.toLowerCase() || "";
      if (aria.includes("prompt") || aria.includes("text") || placeholder.includes("prompt") || placeholder.includes("type")) {
        return el as HTMLElement;
      }
    }
    // Fallback: return first visible textarea
    return textareas.length > 0 ? (textareas[0] as HTMLElement) : null;
  }

  static setPromptText(element: HTMLElement, text: string): boolean {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (element.getAttribute("contenteditable") === "true") {
      element.innerText = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  }

  static findGenerateButton(): HTMLButtonElement | null {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      const aria = btn.getAttribute("aria-label")?.toLowerCase() || "";
      const text = btn.innerText.trim().toLowerCase();
      if (text.includes("generate") || text.includes("run") || aria.includes("generate") || aria.includes("run")) {
        return btn;
      }
    }
    return null;
  }

  static findDownloadButton(): HTMLButtonElement | null {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      const aria = btn.getAttribute("aria-label")?.toLowerCase() || "";
      const text = btn.innerText.trim().toLowerCase();
      if (text.includes("download") || aria.includes("download") || aria.includes("descargar")) {
        return btn;
      }
    }
    return null;
  }

  static isGenerating(): boolean {
    // Check for progress bars, spinners, or buttons in loading/disabled state with 'generating' text
    const spinners = document.querySelectorAll("[role='progressbar'], mat-spinner, .spinner");
    if (spinners.length > 0) return true;

    const genBtn = AIStudioAdapter.findGenerateButton();
    if (genBtn && (genBtn.disabled || genBtn.getAttribute("aria-busy") === "true")) {
      return true;
    }
    return false;
  }

  static readVisibleError(): string | null {
    const errorAlerts = document.querySelectorAll("[role='alert'], .error-message, .mat-error");
    for (const el of errorAlerts) {
      const text = (el as HTMLElement).innerText.trim();
      if (text) return text;
    }
    return null;
  }
}
