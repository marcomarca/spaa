/**
 * OfflineIntegrityDetector
 * Rigorous audio verification engine for offline mobile storage.
 * Detects HTML fake downloads (SPA fallback), empty/truncated buffers,
 * invalid audio headers (magic bytes), and SHA-256 mismatches.
 */

export type ChapterIntegrityStatus =
  | "VERIFIED_READY"
  | "CORRUPTED_HTML"
  | "CORRUPTED_MAGIC_BYTES"
  | "TRUNCATED"
  | "SHA_MISMATCH"
  | "EMPTY"
  | "MISSING";

export interface IntegrityCheckResult {
  chapterId: string;
  status: ChapterIntegrityStatus;
  isValidAudio: boolean;
  byteLength: number;
  computedSha256: string;
  expectedSha256?: string;
  detectedFormat?: "mp3" | "id3" | "wav" | "html" | "json" | "unknown";
  errorMessage?: string;
}

export class OfflineIntegrityDetector {
  /** Minimum reasonable size for an actual audio chapter (10 KB) */
  static readonly MIN_AUDIO_BYTES = 10 * 1024;

  /**
   * Inspects the first 16-64 bytes of a buffer to identify format or detect HTML text.
   */
  static detectHeaderFormat(
    buffer: ArrayBufferLike,
  ): "mp3" | "id3" | "wav" | "html" | "json" | "unknown" {
    if (!buffer || buffer.byteLength < 4) return "unknown";

    const bytes = new Uint8Array(buffer.slice(0, Math.min(64, buffer.byteLength)));

    // 1. ID3v2 tag: "ID3" (0x49, 0x44, 0x33)
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      return "id3";
    }

    // 2. RIFF WAV: "RIFF" .... "WAVE"
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes.length >= 12
    ) {
      if (bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
        return "wav";
      }
    }

    // 3. MP3 Sync Word without ID3: 0xFF followed by 0xE0-0xFF (MPEG-1/2 Audio layer III)
    // 0xFF 0xFB (MPEG 1 Layer 3, no protection), 0xFF 0xFA, 0xFF 0xF3, 0xFF 0xF2
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
      return "mp3";
    }

    // 4. HTML detection (e.g. "<!DOCTYPE", "<html", "<head")
    const textSample = new TextDecoder("utf-8", { fatal: false })
      .decode(bytes.slice(0, 32))
      .trim()
      .toLowerCase();

    if (
      textSample.startsWith("<!doctype") ||
      textSample.startsWith("<html") ||
      textSample.startsWith("<head") ||
      textSample.startsWith("<body") ||
      textSample.startsWith("<script")
    ) {
      return "html";
    }

    // 5. JSON error detection (e.g. {"detail": ...})
    if (textSample.startsWith("{") || textSample.startsWith("[")) {
      return "json";
    }

    return "unknown";
  }

  /**
   * Computes SHA-256 hex string from an ArrayBuffer using Web Crypto API.
   */
  static async computeSha256(buffer: ArrayBufferLike): Promise<string> {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      return "";
    }
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Rigorously analyzes an audio buffer and returns an audit result.
   */
  static async verifyBuffer(
    chapterId: string,
    buffer: ArrayBufferLike,
    expectedSha256?: string,
    expectedMinBytes = OfflineIntegrityDetector.MIN_AUDIO_BYTES,
  ): Promise<IntegrityCheckResult> {
    if (!buffer || buffer.byteLength === 0) {
      return {
        chapterId,
        status: "EMPTY",
        isValidAudio: false,
        byteLength: 0,
        computedSha256: "",
        expectedSha256,
        errorMessage: "El archivo almacenado tiene 0 bytes (vacío).",
      };
    }

    const format = OfflineIntegrityDetector.detectHeaderFormat(buffer);

    // Check for fake HTML download
    if (format === "html" || format === "json") {
      return {
        chapterId,
        status: "CORRUPTED_HTML",
        isValidAudio: false,
        byteLength: buffer.byteLength,
        computedSha256: await OfflineIntegrityDetector.computeSha256(buffer),
        expectedSha256,
        detectedFormat: format,
        errorMessage:
          "Descarga falsa: se recibió una página HTML o JSON del servidor en vez de audio.",
      };
    }

    // Check for minimum byte length
    if (buffer.byteLength < expectedMinBytes) {
      return {
        chapterId,
        status: "TRUNCATED",
        isValidAudio: false,
        byteLength: buffer.byteLength,
        computedSha256: await OfflineIntegrityDetector.computeSha256(buffer),
        expectedSha256,
        detectedFormat: format,
        errorMessage: `Archivo truncado o incompleto (${(buffer.byteLength / 1024).toFixed(1)} KB, mínimo esperado: ${(expectedMinBytes / 1024).toFixed(1)} KB).`,
      };
    }

    // Check magic bytes
    if (format !== "mp3" && format !== "id3" && format !== "wav") {
      return {
        chapterId,
        status: "CORRUPTED_MAGIC_BYTES",
        isValidAudio: false,
        byteLength: buffer.byteLength,
        computedSha256: await OfflineIntegrityDetector.computeSha256(buffer),
        expectedSha256,
        detectedFormat: format,
        errorMessage: "Encabezado de archivo inválido (no es un archivo MP3 o WAV reconocido).",
      };
    }

    // Cryptographic SHA-256 check
    const computedSha = await OfflineIntegrityDetector.computeSha256(buffer);
    if (expectedSha256?.trim()) {
      const cleanExpected = expectedSha256.trim().toLowerCase();
      if (computedSha.toLowerCase() !== cleanExpected) {
        return {
          chapterId,
          status: "SHA_MISMATCH",
          isValidAudio: false,
          byteLength: buffer.byteLength,
          computedSha256: computedSha,
          expectedSha256,
          detectedFormat: format,
          errorMessage:
            "Fallo criptográfico SHA-256: el contenido no coincide con el compilado original.",
        };
      }
    }

    return {
      chapterId,
      status: "VERIFIED_READY",
      isValidAudio: true,
      byteLength: buffer.byteLength,
      computedSha256: computedSha,
      expectedSha256,
      detectedFormat: format,
    };
  }

  /**
   * Human-readable label for status.
   */
  static getStatusLabel(status: ChapterIntegrityStatus): string {
    switch (status) {
      case "VERIFIED_READY":
        return "Verificado (Listo para offline)";
      case "CORRUPTED_HTML":
        return "Dañado (Página HTML en vez de audio)";
      case "CORRUPTED_MAGIC_BYTES":
        return "Dañado (Formato binario desconocido)";
      case "TRUNCATED":
        return "Incompleto (Descarga interrumpida)";
      case "SHA_MISMATCH":
        return "Corrupto (Fallo de integridad SHA-256)";
      case "EMPTY":
        return "Vacío (0 bytes)";
      case "MISSING":
        return "No descargado";
    }
  }
}
