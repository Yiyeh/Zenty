import { newId } from "../lib/id";
import { useState } from "react";
import { Lightbulb, ArrowRight, Trash2, ListPlus } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
export function QuickCapture() {
  const { ideas, setIdeas, setTasks, notify } = useDashboard();
  const [content, setContent] = useState("");
  return (
    <section className="glass-panel ideas-card">
      <div className="widget-heading">
        <h3>
          <Lightbulb size={17} /> Antes de que se te olvide
        </h3>
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!content.trim()) return;
          setIdeas((p) => [
            {
              id: newId(),
              content: content.trim(),
              createdAt: new Date().toISOString(),
            },
            ...p,
          ]);
          setContent("");
        }}
      >
        <input
          aria-label="Nueva idea"
          placeholder="Atrapa esa idea…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button className="icon-button" aria-label="Guardar idea">
          <ArrowRight size={17} />
        </button>
      </form>
      {ideas.length ? (
        ideas.map((idea) => (
          <div className="idea-item" key={idea.id}>
            <div>
              <p>{idea.content}</p>
              <small>
                {Number.isNaN(Date.parse(idea.createdAt))
                  ? idea.createdAt
                  : new Date(idea.createdAt).toLocaleString("es-CL", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label={`Convertir en tarea: ${idea.content}`}
              onClick={() => {
                setTasks((p) => [
                  {
                    id: newId(),
                    title: idea.content,
                    completed: false,
                    priority: "medium",
                    pomodoros: 0,
                    subtasks: [],
                  },
                  ...p,
                ]);
                setIdeas((p) => p.filter((i) => i.id !== idea.id));
                notify("Idea convertida en tarea.");
              }}
            >
              <ListPlus size={16} />
            </button>
            <button
              className="icon-button danger"
              aria-label={`Eliminar idea ${idea.content}`}
              onClick={() => {
                setIdeas((p) => p.filter((i) => i.id !== idea.id));
                notify("Idea eliminada.", () =>
                  setIdeas((p) =>
                    p.some((i) => i.id === idea.id) ? p : [...p, idea],
                  ),
                );
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))
      ) : (
        <div className="empty-state small-empty">
          <span>Sin orden, sin filtros. Solo tus ideas.</span>
        </div>
      )}
    </section>
  );
}
