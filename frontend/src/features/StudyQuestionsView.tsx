import { CheckCircle2, Clock, HelpCircle, Plus, Send } from "lucide-react";
import { useEffect, useState } from "react";
import type { Answer, Book, Chapter, Question, QuestionType } from "../domain/types";
import { api } from "../services/api";

interface StudyQuestionsViewProps {
  activeBook: Book | null;
  activeChapter: Chapter | null;
}

export function StudyQuestionsView({ activeBook, activeChapter }: StudyQuestionsViewProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answersMap, setAnswersMap] = useState<Record<string, string>>({});
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, Answer>>({});
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // New question form state
  const [newType, setNewType] = useState<QuestionType>("feynman");
  const [newPrompt, setNewPrompt] = useState("");
  const [newCriteria, setNewCriteria] = useState("");

  useEffect(() => {
    if (activeChapter) {
      loadChapterQuestions(activeChapter.id);
    }
  }, [activeChapter]);

  const loadChapterQuestions = async (chapterId: string) => {
    setLoading(true);
    try {
      const qs = await api.fetchChapterQuestions(chapterId);
      setQuestions(qs);
    } catch {
      // Offline fallback with mock sample
      setQuestions([
        {
          id: "mock-q-1",
          chapter_id: chapterId,
          question_type: "feynman",
          prompt_text: "Explica con tus propias palabras el concepto principal de este capítulo.",
          expected_criteria: "Claridad y analogías sencillas.",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChapter || !newPrompt.trim()) return;

    try {
      const created = await api.createQuestion(
        activeChapter.id,
        newType,
        newPrompt.trim(),
        newCriteria.trim(),
      );
      setQuestions([...questions, created]);
      setNewPrompt("");
      setNewCriteria("");
      setShowAddModal(false);
    } catch (err) {
      console.error("Error creating question:", err);
    }
  };

  const handleSubmitAnswer = async (questionId: string) => {
    const text = answersMap[questionId];
    if (!text || !text.trim()) return;

    try {
      const ans = await api.submitAnswer(questionId, text.trim());
      setSubmittedAnswers((prev) => ({ ...prev, [questionId]: ans }));
    } catch (err) {
      console.error("Error submitting answer:", err);
      // Offline simulated submission
      const mockAns: Answer = {
        id: crypto.randomUUID(),
        question_id: questionId,
        user_response: text.trim(),
        status: "PENDING_REVIEW",
        correct_points: "[]",
        missing_points: "[]",
        misconceptions: "[]",
        created_at: new Date().toISOString(),
      };
      setSubmittedAnswers((prev) => ({ ...prev, [questionId]: mockAns }));
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "1.2rem",
              fontWeight: "700",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <HelpCircle size={22} color="#38bdf8" /> Preguntas de Estudio y Exámenes
          </h2>
          <p style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
            {activeBook && activeChapter
              ? `${activeBook.title} — Cap ${activeChapter.sequence}: ${activeChapter.title}`
              : "Selecciona un capítulo para responder preguntas"}
          </p>
        </div>
        {activeChapter && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAddModal(true)}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}
          >
            <Plus size={16} /> Nueva Pregunta
          </button>
        )}
      </div>

      {showAddModal && (
        <div className="card" style={{ marginBottom: "16px", borderColor: "#38bdf8" }}>
          <h3 style={{ fontSize: "1rem", marginBottom: "12px" }}>
            Crear Pregunta para este Capítulo
          </h3>
          <form onSubmit={handleCreateQuestion}>
            <div style={{ marginBottom: "10px" }}>
              <label
                htmlFor="new-question-type"
                style={{
                  fontSize: "0.8rem",
                  color: "#94a3b8",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Tipo de Pregunta:
              </label>
              <select
                id="new-question-type"
                value={newType}
                onChange={(e) => setNewType(e.target.value as QuestionType)}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "6px",
                  background: "#0f172a",
                  color: "#f8fafc",
                  border: "1px solid #334155",
                }}
              >
                <option value="feynman">🧠 Feynman (Explicación intuitiva sin jerga)</option>
                <option value="why_chain">🔗 Why-Chain (Cadena de causas profundas)</option>
                <option value="application">⚡ Aplicación Práctica</option>
                <option value="contrast">⚖️ Contraste / Diferencias</option>
                <option value="counterexample">🛑 Contraejemplo ("¿Cuándo fallaría?")</option>
              </select>
            </div>

            <div style={{ marginBottom: "10px" }}>
              <label
                htmlFor="new-question-prompt"
                style={{
                  fontSize: "0.8rem",
                  color: "#94a3b8",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Enunciado de la Pregunta:
              </label>
              <textarea
                id="new-question-prompt"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="Ej. Explica la diferencia entre X e Y con un ejemplo concreto..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "6px",
                  background: "#0f172a",
                  color: "#f8fafc",
                  border: "1px solid #334155",
                }}
                required
              />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label
                htmlFor="new-question-criteria"
                style={{
                  fontSize: "0.8rem",
                  color: "#94a3b8",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Rúbrica / Puntos Clave Esperados (Opcional):
              </label>
              <input
                id="new-question-criteria"
                type="text"
                value={newCriteria}
                onChange={(e) => setNewCriteria(e.target.value)}
                placeholder="Ej. Debe mencionar la conservación de energía y el costo O(N)"
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "6px",
                  background: "#0f172a",
                  color: "#f8fafc",
                  border: "1px solid #334155",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{
                  padding: "6px 12px",
                  background: "transparent",
                  border: "1px solid #475569",
                  color: "#cbd5e1",
                  borderRadius: "6px",
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primary" style={{ padding: "6px 16px" }}>
                Guardar Pregunta
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <p style={{ color: "#94a3b8" }}>Cargando preguntas...</p>}

      {!loading && questions.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
          <p>No hay preguntas configuradas para este capítulo aún.</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAddModal(true)}
            style={{ marginTop: "12px" }}
          >
            Crear la primera pregunta
          </button>
        </div>
      )}

      {questions.map((q, idx) => {
        const currentAns = submittedAnswers[q.id];
        const isReviewed = currentAns?.status === "REVIEWED";
        const isPending = currentAns?.status === "PENDING_REVIEW";

        return (
          <div key={q.id} className="card" style={{ marginBottom: "16px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: "#1e293b",
                  color: "#38bdf8",
                  border: "1px solid #334155",
                }}
              >
                {idx + 1}. {q.question_type.replace("_", " ")}
              </span>

              {isReviewed && (
                <span
                  style={{
                    fontSize: "0.8rem",
                    color: "#22c55e",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <CheckCircle2 size={14} /> Evaluada ({currentAns.score}/10)
                </span>
              )}
              {isPending && (
                <span
                  style={{
                    fontSize: "0.8rem",
                    color: "#f59e0b",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Clock size={14} /> Pendiente de evaluación
                </span>
              )}
            </div>

            <p
              style={{
                fontSize: "1rem",
                fontWeight: "600",
                marginBottom: "12px",
                color: "#f8fafc",
              }}
            >
              {q.prompt_text}
            </p>

            {/* Answer Input or Submitted Display */}
            {!isReviewed && (
              <div>
                <textarea
                  value={answersMap[q.id] || currentAns?.user_response || ""}
                  onChange={(e) => setAnswersMap({ ...answersMap, [q.id]: e.target.value })}
                  disabled={isPending}
                  placeholder="Escribe tu respuesta aquí durante el trayecto..."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "6px",
                    background: "#0f172a",
                    color: "#f8fafc",
                    border: "1px solid #334155",
                    fontSize: "0.9rem",
                    marginBottom: "8px",
                  }}
                />

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={isPending || !answersMap[q.id]?.trim()}
                    onClick={() => handleSubmitAnswer(q.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      opacity: isPending ? 0.6 : 1,
                    }}
                  >
                    <Send size={14} /> {isPending ? "Enviada para Revisión" : "Enviar Respuesta"}
                  </button>
                </div>
              </div>
            )}

            {/* Reviewed Feedback Card */}
            {isReviewed && currentAns && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  background: "#0f172a",
                  borderRadius: "8px",
                  border: "1px solid #334155",
                }}
              >
                <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: "6px" }}>
                  <strong>Tu respuesta:</strong> "{currentAns.user_response}"
                </p>
                {currentAns.evaluator_feedback && (
                  <p style={{ fontSize: "0.9rem", color: "#e2e8f0", marginBottom: "6px" }}>
                    <strong>Feedback ChatGPT:</strong> {currentAns.evaluator_feedback}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
