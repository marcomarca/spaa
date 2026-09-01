import type { Book, OfflineManifest, SyncEvent } from "../domain/types";

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  async fetchBooks(): Promise<Book[]> {
    const res = await fetch(`${this.baseUrl}/api/books`);
    if (!res.ok) throw new Error("Error al obtener catálogo de libros");
    return res.json();
  }

  async fetchBookDetails(bookId: string): Promise<Book> {
    const res = await fetch(`${this.baseUrl}/api/books/${bookId}`);
    if (!res.ok) throw new Error("Error al obtener detalles del libro");
    return res.json();
  }

  async importBook(
    title: string,
    author: string,
    markdownText: string,
    language = "es",
  ): Promise<Book> {
    const res = await fetch(`${this.baseUrl}/api/books/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        author,
        markdown_text: markdownText,
        language,
        mode: "auto",
      }),
    });
    if (!res.ok) throw new Error("Error al importar libro Markdown");
    return res.json();
  }

  async fetchOfflineManifest(): Promise<OfflineManifest> {
    const res = await fetch(`${this.baseUrl}/api/audio/offline-manifest`);
    if (!res.ok) throw new Error("Error al obtener manifiesto offline");
    return res.json();
  }

  async pushSyncEvents(
    deviceId: string,
    events: SyncEvent[],
  ): Promise<{ processed: number; skipped_duplicates: number }> {
    if (events.length === 0) return { processed: 0, skipped_duplicates: 0 };
    const res = await fetch(`${this.baseUrl}/api/sync/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, events }),
    });
    if (!res.ok) throw new Error("Error al sincronizar eventos");
    return res.json();
  }

  getChapterAudioUrl(chapterId: string): string {
    return `${this.baseUrl}/api/audio/chapter/${chapterId}`;
  }
}

export const api = new ApiClient();
