import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { newId } from "../lib/id";
import { useState } from "react";
import type { CSSProperties } from "react";
import { Plus, Trash2, Pencil, Check, StickyNote, X } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import type { StickyNote as Note } from "../lib/dashboard";
const colors: Record<string, { name: string; bg: string; dot: string }> = {
  yellow: { get name() { return tr("StickyNotes.77d7cd9907"); }, bg: "#f8f6e9", dot: "#dfd298" },
  purple: { get name() { return tr("StickyNotes.075e17b12b"); }, bg: "#f3f0f8", dot: "#b5a2d2" },
  blue: { get name() { return tr("StickyNotes.fac7d276ef"); }, bg: "#eef4f7", dot: "#a1bfce" },
  pink: { get name() { return tr("StickyNotes.75f9577a16"); }, bg: "#faf0f0", dot: "#d4abae" },
  green: { get name() { return tr("StickyNotes.af9630c6bd"); }, bg: "#f0f4e9", dot: "#aec196" },
};
export function StickyNotes() {
  useInterfaceLocale();
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
          <StickyNote size={17} /> {tr("StickyNotes.406ad6be7f")}</h3>
        <button className="icon-button" aria-label={tr("StickyNotes.c710bdbc89")} onClick={add}>
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
                    aria-label={tr("StickyNotes.aeb349f12a")}
                    maxLength={100}
                    placeholder={tr("StickyNotes.2586d7f575")}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <textarea
                    aria-label={tr("StickyNotes.cd6b4514e7")}
                    placeholder={tr("StickyNotes.1d753d3dde")}
                    rows={4}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <h4>{note.title || tr("StickyNotes.30d1a8cd45")}</h4>
                  <p>
                    {note.content ||
                      tr("StickyNotes.047bf26db9")}
                  </p>
                </>
              )}
              <div className="note-actions">
                <div className="note-colors">
                  {Object.entries(colors).map(([key, color]) => (
                    <button
                      key={key}
                      style={{ background: color.dot }}
                      aria-label={tr("StickyNotes.2dfdecddd0", { v0: color.name, v1: note.title || "nota" })}
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
                        aria-label={tr("StickyNotes.5b89f3c125")}
                        onClick={() => setEditing(null)}
                      >
                        <X size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={tr("StickyNotes.489141307f")}
                        onClick={() => {
                          setNotes((p) =>
                            p.map((n) =>
                              n.id === note.id
                                ? {
                                    ...n,
                                    title: title.trim() || tr("StickyNotes.30d1a8cd45"),
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
                      aria-label={tr("a11y.StickyNotes.137", { v0: note.title })}
                      onClick={() => edit(note)}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <button
                    className="icon-button danger"
                    aria-label={tr("a11y.StickyNotes.145", { v0: note.title })}
                    onClick={() => {
                      setNotes((p) => p.filter((n) => n.id !== note.id));
                      if (editing === note.id) setEditing(null);
                      notify(tr("StickyNotes.51ab1b2b3b"), () =>
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
          <span>{tr("StickyNotes.1186d77fb8")}</span>
          <button className="text-button" onClick={add}>
            {tr("StickyNotes.bae6883594")}<Plus size={13} />
          </button>
        </div>
      )}
    </section>
  );
}
