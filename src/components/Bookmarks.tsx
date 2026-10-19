import { newId } from "../lib/id";
import { useState } from "react";
import {
  Plus,
  ArrowUpRight,
  Pencil,
  Trash2,
  Link2,
  Check,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
import { Dialog } from "./Dialog";
import { safeUrl } from "../lib/dashboard";
import type { Bookmark } from "../lib/dashboard";
export function Bookmarks({ compact = false }: { compact?: boolean }) {
  const { bookmarks, setBookmarks, settings, notify } = useDashboard();
  const [group, setGroup] = useState("Todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    url: "",
    group: "Personal",
    color: "#39745b",
  });
  const [error, setError] = useState("");
  const accesses = bookmarks.filter(
    (bookmark) => bookmark.group !== "Para leer",
  );
  const groups = ["Todos", ...new Set(accesses.map((b) => b.group))];
  const selectedGroup = groups.includes(group) ? group : "Todos";
  const edit = (bookmark?: Bookmark) => {
    setEditing(bookmark || null);
    setDraft(
      bookmark || {
        title: "",
        url: "",
        group: "Personal",
        color: settings.accentColor,
      },
    );
    setError("");
    setOpen(true);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const url = safeUrl(
      draft.url.includes("://") ? draft.url : `https://${draft.url}`,
    );
    if (!url || !draft.title.trim() || !draft.group.trim()) {
      setError(
        "Añade un nombre, un grupo y una dirección web válida (http o https).",
      );
      return;
    }
    const next = {
      ...draft,
      title: draft.title.trim(),
      group: draft.group.trim(),
      url,
      id: editing?.id || newId(),
    };
    setBookmarks((prev) =>
      editing
        ? prev.map((b) => (b.id === editing.id ? next : b))
        : [...prev, next],
    );
    setOpen(false);
    notify(editing ? "Acceso actualizado." : "Acceso añadido a tu espacio.");
  };
  const remove = (bookmark: Bookmark) => {
    const index = bookmarks.findIndex((b) => b.id === bookmark.id);
    setBookmarks((prev) => prev.filter((b) => b.id !== bookmark.id));
    notify("Acceso eliminado.", () =>
      setBookmarks((prev) => {
        const next = prev.filter((b) => b.id !== bookmark.id);
        next.splice(index, 0, bookmark);
        return next;
      }),
    );
  };
  const move = (id: string, direction: number) =>
    setBookmarks((prev) => {
      const next = [...prev];
      const from = next.findIndex((b) => b.id === id);
      const to = from + direction;
      if (to >= 0 && to < next.length)
        [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  return (
    <section className="bookmarks-section" aria-label="Accesos rápidos">
      <div className="section-heading">
        <h2>
          {compact ? (
            "Accesos"
          ) : (
            <>
              Tus lugares de siempre<span>Un clic y estás ahí.</span>
            </>
          )}
        </h2>
        <div className="bookmark-tabs">
          {groups.map((g) => (
            <button
              key={g}
              aria-pressed={selectedGroup === g}
              onClick={() => setGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <button className="text-button" onClick={() => edit()}>
          <Plus size={15} /> Añadir acceso
        </button>
      </div>
      <div className="bookmark-grid">
        {accesses
          .filter((b) => selectedGroup === "Todos" || b.group === selectedGroup)
          .map((b) => (
            <div className="bookmark" key={b.id}>
              <a
                href={b.url}
                target={settings.openInNewTab ? "_blank" : "_self"}
                rel="noopener noreferrer"
              >
                <span
                  className="bookmark-icon"
                  style={{ color: b.color, backgroundColor: `${b.color}12` }}
                >
                  {b.title.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  {b.title}
                  <small>{new URL(b.url).hostname.replace(/^www\./, "")}</small>
                </span>
                <ArrowUpRight size={15} className="bookmark-arrow" />
              </a>
              <button
                className="bookmark-edit icon-button"
                aria-label={`Editar acceso ${b.title}`}
                onClick={() => edit(b)}
              >
                <Pencil size={12} />
              </button>
            </div>
          ))}
        {!compact && (
          <button
            className="bookmark-add"
            onClick={() => edit()}
            aria-label="Crear acceso rápido"
          >
            <Plus size={21} />
            <span>Tu próximo lugar</span>
          </button>
        )}
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar acceso" : "Un nuevo lugar"}
        description="Tus aplicaciones, herramientas y rincones favoritos."
      >
        <form className="dialog-body form-stack" onSubmit={save}>
          <label>
            Nombre
            <input
              required
              maxLength={60}
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Por ejemplo, mi espacio en Notion"
            />
          </label>
          <label>
            Dirección web
            <div className="input-icon">
              <Link2 size={16} />
              <input
                required
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder="https://…"
              />
            </div>
          </label>
          <div className="form-row">
            <label>
              Grupo
              <input
                required
                maxLength={40}
                list="bookmark-groups"
                value={draft.group}
                onChange={(e) => setDraft({ ...draft, group: e.target.value })}
              />
              <datalist id="bookmark-groups">
                {groups
                  .filter((g) => g !== "Todos")
                  .map((g) => (
                    <option key={g}>{g}</option>
                  ))}
              </datalist>
            </label>
            <label>
              Color
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              />
            </label>
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {editing && (
            <div className="form-row">
              <button
                type="button"
                className="secondary-button"
                disabled={bookmarks[0]?.id === editing.id}
                onClick={() => move(editing.id, -1)}
              >
                <ArrowLeft size={15} /> Mover antes
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={bookmarks.at(-1)?.id === editing.id}
                onClick={() => move(editing.id, 1)}
              >
                Mover después <ArrowRight size={15} />
              </button>
            </div>
          )}
          <div className="dialog-actions">
            {editing && (
              <button
                type="button"
                className="text-button danger"
                onClick={() => {
                  remove(editing);
                  setOpen(false);
                }}
              >
                <Trash2 size={16} /> Eliminar
              </button>
            )}
            <button className="primary-button">
              <Check size={16} /> Guardar acceso
            </button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
