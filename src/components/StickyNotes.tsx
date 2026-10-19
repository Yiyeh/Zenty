import { newId } from "../lib/id";
import { useState } from "react";
import type { CSSProperties } from "react";
import { Plus, Trash2, Pencil, Check, StickyNote, X } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import type { StickyNote as Note } from "../lib/dashboard";
const colors: Record<string, { name: string; bg: string; dot: string }> = {
  yellow: { name: "Arena", bg: "#f8f6e9", dot: "#dfd298" },
  purple: { name: "Lavanda", bg: "#f3f0f8", dot: "#b5a2d2" },
  blue: { name: "Cielo", bg: "#eef4f7", dot: "#a1bfce" },
  pink: { name: "Rosa", bg: "#faf0f0", dot: "#d4abae" },
  green: { name: "Salvia", bg: "#f0f4e9", dot: "#aec196" },
};
export function StickyNotes() {
  const { notes, setNotes, notify } = useDashboard();
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const edit = (note: Note) => {
    setEditing(note.id);
    setTitle(note.title);
    setContent(note.content);
  };
  const add = () => {
    const note = {
      id: newId(),
      title: "",
      content: "",
      color: "yellow",
    };
    setNotes((p) => [...p, note]);
    edit(note);
  };
  return (
    <section className="glass-panel notes-card">
      <div className="widget-heading">
        <h3>
          <StickyNote size={17} /> Una nota para después
        </h3>
        <button className="icon-button" aria-label="Crear nota" onClick={add}>
          <Plus size={17} />
        </button>
      </div>
      {notes.length ? (
        <div className="note-list">
          {notes.map((note) => (
            <article
              className="note-item"
              key={note.id}
              style={
                {
                  "--note-bg": (colors[note.color] || colors.yellow).bg,
                } as CSSProperties
              }
            >
              {editing === note.id ? (
                <div className="form-stack">
                  <input
                    autoFocus
                    aria-label="Título de la nota"
                    maxLength={100}
                    placeholder="Un título para recordarlo"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <textarea
                    aria-label="Contenido de la nota"
                    placeholder="Una idea, un recordatorio, algo que no quieres olvidar…"
                    rows={4}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <h4>{note.title || "Sin título"}</h4>
                  <p>
                    {note.content ||
                      "Un lugar para esa idea que no quieres perder."}
                  </p>
                </>
              )}
              <div className="note-actions">
                <div className="note-colors">
                  {Object.entries(colors).map(([key, color]) => (
                    <button
                      key={key}
                      style={{ background: color.dot }}
                      aria-label={`Color ${color.name} para ${note.title || "nota"}`}
                      aria-pressed={note.color === key}
                      onClick={() =>
                        setNotes((p) =>
                          p.map((n) =>
                            n.id === note.id ? { ...n, color: key } : n,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
                <div>
                  {editing === note.id ? (
                    <>
                      <button
                        className="icon-button"
                        aria-label="Cancelar edición de nota"
                        onClick={() => setEditing(null)}
                      >
                        <X size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Guardar nota"
                        onClick={() => {
                          setNotes((p) =>
                            p.map((n) =>
                              n.id === note.id
                                ? {
                                    ...n,
                                    title: title.trim() || "Sin título",
                                    content,
                                  }
                                : n,
                            ),
                          );
                          setEditing(null);
                        }}
                      >
                        <Check size={15} />
                      </button>
                    </>
                  ) : (
                    <button
                      className="icon-button"
                      aria-label={`Editar nota ${note.title}`}
                      onClick={() => edit(note)}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <button
                    className="icon-button danger"
                    aria-label={`Eliminar nota ${note.title}`}
                    onClick={() => {
                      setNotes((p) => p.filter((n) => n.id !== note.id));
                      if (editing === note.id) setEditing(null);
                      notify("Nota eliminada.", () =>
                        setNotes((p) =>
                          p.some((n) => n.id === note.id) ? p : [...p, note],
                        ),
                      );
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state small-empty">
          <StickyNote size={26} strokeWidth={1.2} />
          <span>Hay ideas que merecen quedarse.</span>
          <button className="text-button" onClick={add}>
            Escribir mi primera nota <Plus size={13} />
          </button>
        </div>
      )}
    </section>
  );
}
