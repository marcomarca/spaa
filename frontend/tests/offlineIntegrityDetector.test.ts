import { expect, test } from "bun:test";
import { OfflineIntegrityDetector } from "../src/services/offlineIntegrityDetector";

test("OfflineIntegrityDetector identifies MP3 with ID3 header", async () => {
  // Create a mock buffer with ID3 header
  const buffer = new Uint8Array(20 * 1024);
  buffer[0] = 0x49; // 'I'
  buffer[1] = 0x44; // 'D'
  buffer[2] = 0x33; // '3'
  buffer[3] = 0x03; // version 2.3

  const format = OfflineIntegrityDetector.detectHeaderFormat(buffer.buffer);
  expect(format).toBe("id3");

  const result = await OfflineIntegrityDetector.verifyBuffer("test-1", buffer.buffer);
  expect(result.status).toBe("VERIFIED_READY");
  expect(result.isValidAudio).toBe(true);
});

test("OfflineIntegrityDetector identifies raw MP3 sync frame", async () => {
  const buffer = new Uint8Array(15 * 1024);
  buffer[0] = 0xff;
  buffer[1] = 0xfb; // 1111 1011 (MPEG-1 Layer 3, no CRC)

  const format = OfflineIntegrityDetector.detectHeaderFormat(buffer.buffer);
  expect(format).toBe("mp3");

  const result = await OfflineIntegrityDetector.verifyBuffer("test-mp3", buffer.buffer);
  expect(result.status).toBe("VERIFIED_READY");
  expect(result.isValidAudio).toBe(true);
});

test("OfflineIntegrityDetector detects and rejects fake HTML downloads (SPA fallback)", async () => {
  const htmlText = "<!DOCTYPE html><html><head><title>SPAA</title></head><body>App</body></html>";
  const encoder = new TextEncoder();
  const buffer = encoder.encode(htmlText).buffer;

  const format = OfflineIntegrityDetector.detectHeaderFormat(buffer);
  expect(format).toBe("html");

  const result = await OfflineIntegrityDetector.verifyBuffer("fake-html-chap", buffer);
  expect(result.status).toBe("CORRUPTED_HTML");
  expect(result.isValidAudio).toBe(false);
  expect(result.errorMessage).toContain("Descarga falsa");
});

test("OfflineIntegrityDetector rejects empty and truncated buffers", async () => {
  const empty = new ArrayBuffer(0);
  const emptyRes = await OfflineIntegrityDetector.verifyBuffer("empty", empty);
  expect(emptyRes.status).toBe("EMPTY");
  expect(emptyRes.isValidAudio).toBe(false);

  // Buffer under MIN_AUDIO_BYTES (e.g. 500 bytes) with ID3
  const tiny = new Uint8Array(500);
  tiny[0] = 0x49;
  tiny[1] = 0x44;
  tiny[2] = 0x33;
  const tinyRes = await OfflineIntegrityDetector.verifyBuffer("tiny", tiny.buffer);
  expect(tinyRes.status).toBe("TRUNCATED");
  expect(tinyRes.isValidAudio).toBe(false);
});

test("OfflineIntegrityDetector detects SHA-256 mismatches", async () => {
  const buffer = new Uint8Array(12 * 1024);
  buffer[0] = 0x49;
  buffer[1] = 0x44;
  buffer[2] = 0x33;

  const computed = await OfflineIntegrityDetector.computeSha256(buffer.buffer);
  expect(computed.length).toBe(64);

  // Correct hash
  const validRes = await OfflineIntegrityDetector.verifyBuffer("chap-sha", buffer.buffer, computed);
  expect(validRes.status).toBe("VERIFIED_READY");

  // Incorrect hash
  const invalidRes = await OfflineIntegrityDetector.verifyBuffer(
    "chap-sha",
    buffer.buffer,
    "0000000000000000000000000000000000000000000000000000000000000000",
  );
  expect(invalidRes.status).toBe("SHA_MISMATCH");
  expect(invalidRes.isValidAudio).toBe(false);
});
