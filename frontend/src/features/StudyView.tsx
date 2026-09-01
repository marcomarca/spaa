import { Brain, Plus, Star } from "lucide-react";
import { useState } from "react";
import type { Book, Chapter } from "../domain/types";

interface CheatItem {
  id: string;
  concept: string;
  trigger: string;
  rule: string;
  procedure: string;
  pitfall: string;
  association: string;
  userVersion: string;
  selectedForMemory: boolean;
}

interface StudyViewProps {
  activeBook: Book | null;
  activeChapter: Chapter | null;
}

export function StudyView({ activeBook }: StudyViewProps) {
  const [cheats, setCheats] = useState<CheatItem[]>([
    {
      id: "cheat-1",
      concept: "NeRF (Neural Radiance Fields)",
      trigger: "Síntesis de vistas novedosas 3D",
      rule: "F_theta(x, d) -> (c, sigma)",
      procedure: "Muestreo por rayos -> Evaluación MLP -> Renderizado volumétrico",
      pitfall: "Lento en inferencia por cantidad de muestras",
      association: "3D Gaussian Splatting / Voxel Grids",
      userVersion:
        "Red que aprende campo de radiancia continuo para generar imágenes 3D desde fotos.",
      selectedForMemory: true,
    },
  ]);

  const [showAdd, setShowAdd] = useState(false);
  const [concept, setConcept] = useState("");
  const [trigger, setTrigger] = useState("");
  const [rule, setRule] = useState("");
  const [userVersion, setUserVersion] = useState("");

  const handleAddCheat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!concept || !userVersion) return;

    const newItem: CheatItem = {
      id: crypto.randomUUID(),
      concept,
      trigger,
      rule,
      procedure: "",
      pitfall: "",
      association: "",
      userVersion,
      selectedForMemory: true,
    };

    setCheats([...cheats, newItem]);
    setConcept("");
    setTrigger("");
    setRule("");
    setUserVersion("");
    setShowAdd(false);
  };

  const toggleMemory = (id: string) => {
    setCheats(
      cheats.map((c) => (c.id === id ? { ...c, selectedForMemory: !c.selectedForMemory } : c)),
    );
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.2rem", fontWeight: "700" }}>Cheatsheets & FSRS</h2>
          <p style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
            {activeBook ? activeBook.title : "Conceptos del sistema"}
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px" }}
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus size={16} /> Nuevo Cheatsheet
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAddCheat} className="card" style={{ marginBottom: "16px" }}>
          <h3 style={{ fontSize: "1rem", marginBottom: "12px" }}>
            Crear Cheatsheet (User Version)
          </h3>
          <input
            className="input-field"
            placeholder="🧠 Concepto principal"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            required
          />
          <input
            className="input-field"
            placeholder="⚡ Disparador / Cuándo usar"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
          />
          <input
            className="input-field"
            placeholder="📐 Regla / Fórmula clave"
            value={rule}
            onChange={(e) => setRule(e.target.value)}
          />
          <textarea
            className="textarea-field"
            placeholder="Tu síntesis personal obligatoria (summary_written = true)..."
            value={userVersion}
            onChange={(e) => setUserVersion(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary">
            Guardar Versión de Usuario
          </button>
        </form>
      )}

      {cheats.map((c) => (
        <div key={c.id} className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Brain size={20} color="#3b82f6" />
              <h3 style={{ fontSize: "1.05rem" }}>{c.concept}</h3>
            </div>
            <button
              type="button"
              onClick={() => toggleMemory(c.id)}
              style={{
                background: "transparent",
                color: c.selectedForMemory ? "#f59e0b" : "#64748b",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "0.75rem",
              }}
            >
              <Star size={16} fill={c.selectedForMemory ? "#f59e0b" : "none"} />
              {c.selectedForMemory ? "FSRS Activo" : "No memorizar"}
            </button>
          </div>

          <div
            style={{ fontSize: "0.85rem", color: "#cbd5e1", margin: "8px 0", lineHeight: "1.4" }}
          >
            <p>
              <strong>⚡ Disparador:</strong> {c.trigger || "N/A"}
            </p>
            {c.rule && (
              <p>
                <strong>📐 Regla:</strong> {c.rule}
              </p>
            )}
            <p
              style={{
                marginTop: "6px",
                padding: "8px",
                background: "rgba(0,0,0,0.2)",
                borderRadius: "6px",
              }}
            >
              <strong>Tu resumen:</strong> {c.userVersion}
            </p>
          </div>

          <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
            <button
              type="button"
              className="action-btn"
              style={{ padding: "6px 10px", fontSize: "0.75rem" }}
            >
              Again
            </button>
            <button
              type="button"
              className="action-btn"
              style={{ padding: "6px 10px", fontSize: "0.75rem" }}
            >
              Hard
            </button>
            <button
              type="button"
              className="action-btn"
              style={{
                padding: "6px 10px",
                fontSize: "0.75rem",
                background: "rgba(59,130,246,0.15)",
              }}
            >
              Good
            </button>
            <button
              type="button"
              className="action-btn"
              style={{
                padding: "6px 10px",
                fontSize: "0.75rem",
                background: "rgba(16,185,129,0.15)",
              }}
            >
              Easy
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
