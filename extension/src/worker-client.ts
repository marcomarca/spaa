export interface ClaimedJob {
  job_id: string;
  chunk_id: string;
  book_id: string;
  chapter_id: string;
  chapter_title?: string;
  chapter_sequence?: number;
  sequence: number;
  total_chunks?: number;
  spoken_text: string;
  word_count: number;
  language: string;
  provider: string;
  model: string;
  voice: string;
  lease_until: string;
}

export class WorkerClient {
  public backendUrl: string;
  public workerId: string;
  public profileAlias: string;

  constructor(backendUrl = "http://localhost:8009", workerId = "worker-chrome-1", profileAlias = "Perfil 1") {
    this.backendUrl = backendUrl;
    this.workerId = workerId;
    this.profileAlias = profileAlias;
  }

  async claimNextJob(): Promise<ClaimedJob | null> {
    try {
      const res = await fetch(`${this.backendUrl}/api/queue/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_id: this.workerId,
          profile_alias: this.profileAlias,
          provider: "gemini",
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.job ?? null;
    } catch {
      return null;
    }
  }

  async sendHeartbeat(status = "READY", jobId?: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.backendUrl}/api/queue/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_id: this.workerId,
          status,
          job_id: jobId,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async reportStatus(jobId: string, status: "GENERATING" | "DOWNLOADING" | "ERROR", error?: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.backendUrl}/api/queue/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          worker_id: this.workerId,
          status,
          error,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async uploadBase64Audio(jobId: string, base64Audio: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Decode base64 to byte array
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/wav" });

      const formData = new FormData();
      formData.append("worker_id", this.workerId);
      formData.append("file", blob, `chunk_${jobId}.wav`);

      const res = await fetch(`${this.backendUrl}/api/queue/upload-wav/${jobId}`, {
        method: "POST",
        body: formData,
      });

      return await res.json();
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async uploadWavChunk(jobId: string, blob: Blob, filename = "chunk.wav"): Promise<{ success: boolean; error?: string }> {
    try {
      const formData = new FormData();
      formData.append("worker_id", this.workerId);
      formData.append("file", blob, filename);

      const res = await fetch(`${this.backendUrl}/api/queue/upload-wav/${jobId}`, {
        method: "POST",
        body: formData,
      });

      return await res.json();
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
