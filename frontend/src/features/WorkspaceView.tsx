import { Check, Copy, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Book, Chapter } from "../domain/types";

interface WorkspaceViewProps {
  books: Book[];
  activeBook: Book | null;
  activeChapter: Chapter | null;
}

export function WorkspaceView({ activeBook, activeChapter }: WorkspaceViewProps) {
  const [selectedTemplate, setSelectedTemplate] = useState("feynman");
  const [copiedSource, setCopiedSource] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [chatGptResult, setChatGptResult] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);

  const promptTemplates: Record<string, string> = {
    feynman:
      "Aplica la técnica de Feynman a este texto: explica los conceptos fundamentales en lenguaje natural y directo, sin jerga innecesaria y con analogías intuitivas para audiolibro.",
    condensar:
      "Condensa este capítulo aumentando la densidad conceptual: elimina preámbulos y redundancias, preserva definiciones técnicas exactas y prepara el texto para síntesis TTS fluida.",
    conceptos:
      "Extrae los conceptos clave de este capítulo, identificando para cada uno su disparador, regla operativa y posibles errores comunes.",
    preguntas:
      "Genera 5 preguntas intelectuales de alto nivel: 1 de aplicación práctica, 1 de relación entre conceptos, 1 de contraejemplo ('¿cuándo fallaría?') y 2 de contraste.",
    why_chain:
      "Construye una cadena de razonamiento profundo (Why-Chain) de 4 niveles sobre este concepto: ¿Por qué? -> ¿Por qué ocurre eso? -> ¿Qué propiedad lo produce? -> ¿Cuál es el fundamento físico/matemático?",
    cheatsheet:
      "Mejora y estructura estos conceptos en formato Cheatsheet: 🧠 concepto, ⚡ disparador, 📐 regla/fórmula, → procedimiento, ⚠ error/pitfall, 🔗 asociación.",
    evaluar:
      "Evalúa la siguiente respuesta del estudiante frente al concepto original. Rúbrica: score (1-5), puntos correctos, puntos faltantes, conceptos erróneos y feedback conciso.",
    microleccion:
      "Crea una microlección estructurada de 3 minutos de duración en audio: Gancho inicial -> Fundamento nuclear -> Ejemplo de aplicación -> Trampa a evitar.",
  };

  const currentPromptText = promptTemplates[selectedTemplate] || "";

  const copyToClipboard = (text: string, isSource: boolean) => {
    navigator.clipboard.writeText(text);
    if (isSource) {
      setCopiedSource(true);
      setTimeout(() => setCopiedSource(false), 2000);
    } else {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const handleSaveResult = () => {
    if (!chatGptResult.trim()) return;
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: "700" }}>AI Workspace (ChatGPT Manual)</h2>
        <p style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
          {activeBook && activeChapter
            ? `${activeBook.title} — Capítulo ${activeChapter.sequence}: ${activeChapter.title}`
            : "Selecciona un capítulo en la biblioteca"}
        </p>
      </div>

      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}
        >
          <h3 style={{ fontSize: "0.95rem" }}>1. SOURCE (Capítulo)</h3>
          <button
            type="button"
            className="btn-primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              fontSize: "0.8rem",
            }}
            onClick={() => copyToClipboard(activeChapter?.title || "", true)}
          >
            {copiedSource ? <Check size={14} /> : <Copy size={14} />}
            {copiedSource ? "Copiado" : "Copiar capítulo"}
          </button>
        </div>
        <p style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
          {activeChapter
            ? `${activeChapter.word_count} palabras preparadas para optimización.`
            : "No hay capítulo activo."}
        </p>
      </div>

      <div className="card">
        <div style={{ marginBottom: "10px" }}>
          <label
            htmlFor="workspace-template-select"
            style={{
              fontSize: "0.95rem",
              fontWeight: "600",
              display: "block",
              marginBottom: "6px",
            }}
          >
            2. PLANTILLAS DE PROMPTS
          </label>
          <select
            id="workspace-template-select"
            className="input-field"
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            style={{ marginBottom: "8px" }}
          >
            <option value="feynman">Explicación Feynman</option>
            <option value="condensar">Condensar Capítulo</option>
            <option value="conceptos">Extraer Conceptos Clave</option>
            <option value="preguntas">Generar Preguntas de Examen</option>
            <option value="why_chain">Cadena de Razonamiento (Why-Chain)</option>
            <option value="cheatsheet">Mejorar Cheatsheet</option>
            <option value="evaluar">Evaluar Respuesta de Examen</option>
            <option value="microleccion">Crear Microlección de 3 min</option>
          </select>
        </div>

        <p
          style={{
            fontSize: "0.85rem",
            color: "#cbd5e1",
            fontStyle: "italic",
            marginBottom: "12px",
          }}
        >
          "{currentPromptText}"
        </p>

        <button
          type="button"
          className="btn-primary"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 12px",
            fontSize: "0.8rem",
          }}
          onClick={() => copyToClipboard(currentPromptText, false)}
        >
          {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
          {copiedPrompt ? "Prompt Copiado" : "Copiar Prompt para ChatGPT"}
        </button>
      </div>

      <div className="card">
        <h3 style={{ fontSize: "0.95rem", marginBottom: "8px" }}>3. RESULTADO DE CHATGPT</h3>
        <textarea
          className="textarea-field"
          placeholder="Pega aquí la respuesta generada por ChatGPT..."
          value={chatGptResult}
          onChange={(e) => setChatGptResult(e.target.value)}
        />
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSaveResult}
            disabled={!chatGptResult.trim()}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Sparkles size={16} />{" "}
            {savedSuccess ? "Guardado con éxito" : "Validar y Guardar como PREPARED"}
          </button>
        </div>
      </div>
    </div>
  );
}
