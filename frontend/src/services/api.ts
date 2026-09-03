import type {
  Answer,
  Book,
  EvaluationPayload,
  OfflineManifest,
  Question,
  QueueMonitorData,
  SyncEvent,
  WorkerLogsResponse,
  WorkerProcessStatus,
} from "../domain/types";

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
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

  getChunkAudioUrl(chunkId: string): string {
    return `${this.baseUrl}/api/audio/chunk/${chunkId}`;
  }

  // ==========================================
  // Study & Question Evaluation Endpoints
  // ==========================================

  async fetchChapterQuestions(chapterId: string): Promise<Question[]> {
    const res = await fetch(`${this.baseUrl}/api/study/questions/chapter/${chapterId}`);
    if (!res.ok) throw new Error("Error al obtener preguntas del capítulo");
    return res.json();
  }

  async createQuestion(
    chapterId: string,
    questionType: string,
    promptText: string,
    expectedCriteria = "",
  ): Promise<Question> {
    const res = await fetch(`${this.baseUrl}/api/study/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapter_id: chapterId,
        question_type: questionType,
        prompt_text: promptText,
        expected_criteria: expectedCriteria,
      }),
    });
    if (!res.ok) throw new Error("Error al crear pregunta de estudio");
    return res.json();
  }

  async submitAnswer(questionId: string, userResponse: string): Promise<Answer> {
    const res = await fetch(`${this.baseUrl}/api/study/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: questionId,
        user_response: userResponse,
      }),
    });
    if (!res.ok) throw new Error("Error al registrar respuesta");
    return res.json();
  }

  async fetchPendingAnswers(): Promise<Answer[]> {
    const res = await fetch(`${this.baseUrl}/api/study/answers/pending`);
    if (!res.ok) throw new Error("Error al listar respuestas pendientes");
    return res.json();
  }

  async generateEvaluationPrompt(
    answerId: string,
  ): Promise<{ answer_id: string; question_id: string; prompt: string }> {
    const res = await fetch(`${this.baseUrl}/api/study/answers/${answerId}/generate-prompt`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Error al generar prompt de evaluación");
    return res.json();
  }

  async submitEvaluation(answerId: string, payload: EvaluationPayload): Promise<Answer> {
    const res = await fetch(`${this.baseUrl}/api/study/answers/${answerId}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Error al registrar evaluación de respuesta");
    return res.json();
  }

  async recordFsrsReview(entityId: string, rating: number): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/api/study/fsrs/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_id: entityId, rating }),
    });
    if (!res.ok) throw new Error("Error al registrar repaso FSRS");
    return res.json();
  }

  // ==========================================
  // TTS Queue & GPU Worker Monitor Endpoints
  // ==========================================

  async fetchQueueMonitor(bookId?: string): Promise<QueueMonitorData> {
    const url = bookId
      ? `${this.baseUrl}/api/queue/monitor?book_id=${encodeURIComponent(bookId)}`
      : `${this.baseUrl}/api/queue/monitor`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Error al consultar monitor de cola TTS");
    return res.json();
  }

  async fetchWorkerLogs(lines = 150): Promise<WorkerLogsResponse> {
    const res = await fetch(`${this.baseUrl}/api/queue/logs?lines=${lines}`);
    if (!res.ok) throw new Error("Error al obtener logs del worker");
    return res.json();
  }

  async retryJob(jobId: string): Promise<{ success: boolean; job_id: string }> {
    const res = await fetch(`${this.baseUrl}/api/queue/jobs/${jobId}/retry`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Error al reintentar bloque TTS");
    return res.json();
  }

  async retryAllFailedJobs(): Promise<{ success: boolean; reset_count: number }> {
    const res = await fetch(`${this.baseUrl}/api/queue/retry-failed`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Error al reintentar bloques fallidos");
    return res.json();
  }

  // ==========================================
  // Worker Process Lifecycle Control
  // ==========================================

  async getWorkerProcessStatus(): Promise<WorkerProcessStatus> {
    const res = await fetch(`${this.baseUrl}/api/queue/worker/status`);
    if (!res.ok) throw new Error("Error al consultar estado del proceso del worker");
    return res.json();
  }

  async startWorker(
    speaker = "Ryan",
  ): Promise<{ success: boolean; message: string; status: WorkerProcessStatus }> {
    const res = await fetch(`${this.baseUrl}/api/queue/worker/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speaker }),
    });
    if (!res.ok) throw new Error("Error al iniciar worker GPU");
    return res.json();
  }

  async stopWorker(): Promise<{
    success: boolean;
    message: string;
    status: WorkerProcessStatus;
  }> {
    const res = await fetch(`${this.baseUrl}/api/queue/worker/stop`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Error al detener worker GPU");
    return res.json();
  }
}

export const api = new ApiClient();
