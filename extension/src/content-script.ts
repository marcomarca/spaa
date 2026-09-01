import { AIStudioAdapter } from "./aistudio-adapter";

console.log("[SPAA Worker] Content script loaded on AI Studio.");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CHECK_PAGE_READY") {
    const isReady = AIStudioAdapter.isAIStudioPage() && AIStudioAdapter.findTextInput() !== null;
    sendResponse({ ready: isReady });
    return true;
  }

  if (message.type === "INJECT_TEXT") {
    const input = AIStudioAdapter.findTextInput();
    if (!input) {
      sendResponse({ success: false, error: "Campo de texto no encontrado" });
      return true;
    }

    const setOk = AIStudioAdapter.setPromptText(input, message.text);
    sendResponse({ success: setOk });
    return true;
  }

  if (message.type === "TRIGGER_GENERATE") {
    const genBtn = AIStudioAdapter.findGenerateButton();
    if (!genBtn) {
      sendResponse({ success: false, error: "Botón Generate no encontrado" });
      return true;
    }

    genBtn.click();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "TRIGGER_DOWNLOAD") {
    const dlBtn = AIStudioAdapter.findDownloadButton();
    if (!dlBtn) {
      sendResponse({ success: false, error: "Botón Download no encontrado" });
      return true;
    }

    dlBtn.click();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "CHECK_GENERATION_STATE") {
    const isGen = AIStudioAdapter.isGenerating();
    const err = AIStudioAdapter.readVisibleError();
    sendResponse({ isGenerating: isGen, error: err });
    return true;
  }
});
