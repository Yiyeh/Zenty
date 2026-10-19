import { deviceId, spaceIds } from "../lib/spaces";
import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { translateMessage, tr } from "../lib/i18n.ts";
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
  useInterfaceLocale();
  const { bookmarks, setBookmarks, settings, notify } = useDashboard();
  const [group, setGroup] = useState("Todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [draft, setDraft] = useState<Omit<Bookmark, "id">>({
    title: "",
    url: "",
    space: settings.devicePreferences[deviceId()]?.space || "personal",
    group: "Personal",
    color: "#39745b",
  });
  const [error, setError] = useState("");
  const accesses = bookmarks.filter(
    (bookmark) => bookmark.group !== "Para leer" && (!bookmark.space || bookmark.space === (settings.devicePreferences[deviceId()]?.space || "personal")),
  );
  const groups = ["Todos", ...new Set(accesses.map((b) => b.group))];
  const selectedGroup = groups.includes(group) ? group : "Todos";
  const edit = (bookmark?: Bookmark) => {
    setEditing(bookmark || null);
    setDraft(
      bookmark || {
        title: "",
        url: "",
        space: settings.devicePreferences[deviceId()]?.space || "personal",
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
        tr("Bookmarks.e84807c3c6"),
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
    notify(editing ? tr("Bookmarks.0d699d7571") : tr("Bookmarks.09c4e448ca"));
  };
  const remove = (bookmark: Bookmark) => {
    const index = bookmarks.findIndex((b) => b.id === bookmark.id);
    setBookmarks((prev) => prev.filter((b) => b.id !== bookmark.id));
    notify(tr("Bookmarks.fab106df3c"), () =>
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
    <section className="bookmarks-section" aria-label={tr("Bookmarks.5c9ca10166")}>
      <div className="section-heading">
        <h2>
          {compact ? (
            tr("Bookmarks.b1eb8bfead")
          ) : (
            <>
              {tr("Bookmarks.3fef9b41a3")}<span>{tr("Bookmarks.76e37462c2")}</span>
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
              {g === "Todos" ? tr("common.all") : g === "Personal" ? tr("common.personal") : g === "Trabajo" ? tr("common.work") : g}
            </button>
          ))}
        </div>
        <button className="text-button" onClick={() => edit()}>
          <Plus size={15} /> {tr("Bookmarks.f50ed0c1cb")}</button>
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
                aria-label={tr("a11y.Bookmarks.146", { v0: b.title })}
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
            aria-label={tr("Bookmarks.433e357262")}
          >
            <Plus size={21} />
            <span>{tr("Bookmarks.8107368252")}</span>
          </button>
        )}
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? tr("Bookmarks.c8103e7235") : tr("Bookmarks.9f7c90da66")}
        description={tr("Bookmarks.2bf995ef0d")}
      >
        <form className="dialog-body form-stack" onSubmit={save}>
          <label>
            {tr("Bookmarks.562bb15757")}<input
              required
              maxLength={60}
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder={tr("Bookmarks.c8af3a9e5d")}
            />
          </label>
          <label>
            {tr("Bookmarks.6504b8a436")}<div className="input-icon">
              <Link2 size={16} />
              <input
                required
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder={tr("Bookmarks.ab04e20ed4")}
              />
            </div>
          </label>
          <label>{tr("spaces.bookmarkScope")}<select value={draft.space || ""} onChange={event => setDraft({ ...draft, space: (event.target.value || undefined) as Bookmark["space"] })}><option value="">{tr("spaces.all")}</option>{spaceIds.map(space => <option key={space} value={space}>{tr(`spaces.${space}`)}</option>)}</select></label>
          <div className="form-row">
            <label>
              {tr("Bookmarks.399b037dab")}<input
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
                    <option key={g} value={g}>{g === "Todos" ? tr("common.all") : g === "Personal" ? tr("common.personal") : g === "Trabajo" ? tr("common.work") : g}</option>
                  ))}
              </datalist>
            </label>
            <label>
              {tr("Bookmarks.6b73191a0a")}<input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              />
            </label>
          </div>
          {error && (
            <p className="error-message" role="alert">
              {translateMessage(error)}
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
                <ArrowLeft size={15} /> {tr("Bookmarks.cefb754a60")}</button>
              <button
                type="button"
                className="secondary-button"
                disabled={bookmarks.at(-1)?.id === editing.id}
                onClick={() => move(editing.id, 1)}
              >
                {tr("Bookmarks.3fbab39932")}<ArrowRight size={15} />
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
                <Trash2 size={16} /> {tr("Bookmarks.4828ccd788")}</button>
            )}
            <button className="primary-button">
              <Check size={16} /> {tr("Bookmarks.91150bb7b9")}</button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
