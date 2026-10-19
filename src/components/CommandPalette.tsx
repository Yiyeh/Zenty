import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr } from "../lib/i18n.ts";
import { newId } from "../lib/id";
import { useState } from "react";
import {
  Search,
  ArrowUpRight,
  CheckSquare,
  StickyNote,
  Settings,
  Maximize2,
  Plus,
  Link2,
  Gamepad2,
  LibraryBig,
} from "lucide-react";
import { Dialog } from "./Dialog";
import { useDashboard } from "../context/DashboardStore";
export function CommandPalette({
  open,
  onClose,
  onSettings,
  onFocus,
  onSection,
}: {
  open: boolean;
  onClose: () => void;
  onSettings: () => void;
  onFocus: () => void;
  onSection: (section: "focus" | "notes" | "library" | "gaming") => void;
}) {
  useInterfaceLocale();
  const {
    tasks,
    notes,
    bookmarks,
    setTasks,
    setActiveTaskId,
    settings,
    notify,
  } = useDashboard();
  const [query, setQuery] = useState("");
  const match = (value: string) =>
    value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const run = (action: () => void) => {
    action();
    onClose();
    setQuery("");
  };
  const results = [
    ...bookmarks
      .filter((b) => match(`${b.title} ${b.group} ${b.url}`))
      .map((b) => ({
        key: `b-${b.id}`,
        title: b.title,
        detail: b.group,
        icon: ArrowUpRight,
        action: () => {
          if (settings.openInNewTab)
            window.open(b.url, "_blank", "noopener,noreferrer");
          else location.assign(b.url);
        },
      })),
    ...tasks
      .filter((t) => !t.completed && match(t.title))
      .map((t) => ({
        key: `t-${t.id}`,
        title: t.title,
        detail: tr("CommandPalette.2b322dcda2"),
        icon: CheckSquare,
        action: () => {
          setActiveTaskId(t.id);
          onSection("focus");
        },
      })),
    ...notes
      .filter((n) => match(`${n.title} ${n.content}`))
      .map((n) => ({
        key: `n-${n.id}`,
        title: n.title,
        detail: n.content.slice(0, 70),
        icon: StickyNote,
        action: () => onSection("notes"),
      })),
    ...[
      {
        key: "gaming",
        title: tr("CommandPalette.4e407fb48d"),
        detail: tr("CommandPalette.5e738a4ffc"),
        icon: Gamepad2,
        action: () => onSection("gaming"),
      },
      {
        key: "library",
        title: tr("CommandPalette.dbfb33f5ae"),
        detail: tr("CommandPalette.ab6bedac93"),
        icon: LibraryBig,
        action: () => onSection("library"),
      },
      {
        key: "settings",
        title: tr("CommandPalette.c429f4e8c4"),
        detail: tr("CommandPalette.c33e7d4b10"),
        icon: Settings,
        action: onSettings,
      },
      {
        key: "focus",
        title: tr("CommandPalette.2e55b3b442"),
        detail: tr("CommandPalette.56699b9577"),
        icon: Maximize2,
        action: onFocus,
      },
    ].filter((a) => match(a.title)),
  ].slice(0, 12);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tr("CommandPalette.49787bbef4")}
      description={tr("CommandPalette.1c4bb6a4b9")}
    >
      <div className="dialog-body command-body">
        <div className="input-icon command-input">
          <Search size={18} />
          <input
            autoFocus
            aria-label={tr("CommandPalette.fd8d2f1fbc")}
            placeholder={tr("CommandPalette.7768f6961f")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) run(results[0].action);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                document
                  .querySelector<HTMLButtonElement>(".command-result")
                  ?.focus();
              }
            }}
          />
        </div>
        <div
          className="command-results"
          onKeyDown={(e) => {
            const buttons = [
              ...e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            ];
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              buttons[
                (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length
              ]?.focus();
            }
          }}
        >
          {results.map((result) => (
            <button
              className="command-result"
              key={result.key}
              onClick={() => run(result.action)}
            >
              <result.icon size={18} />
              <span>
                {result.title}
                <small>{result.detail}</small>
              </span>
              <kbd>↵</kbd>
            </button>
          ))}
          {query.trim() && (
            <button
              className="command-result"
              onClick={() =>
                run(() => {
                  setTasks((p) => [
                    {
                      id: newId(),
                      title: query.trim(),
                      completed: false,
                      priority: "medium",
                      subtasks: [],
                      pomodoros: 0,
                    },
                    ...p,
                  ]);
                  notify(tr("CommandPalette.0ae52a6bb6"));
                })
              }
            >
              <Plus size={18} />
              <span>
                {tr("CommandPalette.dd7abf1b33")}{query}
                <small>{tr("CommandPalette.6c915f293a")}</small>
              </span>
            </button>
          )}
          {!results.length && !query.trim() && (
            <div className="empty-state">
              <Link2 size={24} />
              {tr("CommandPalette.ad0445dfcc")}</div>
          )}
        </div>
        <div className="command-help">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {tr("CommandPalette.de13cacf66")}</span>
          <span>
            <kbd>↵</kbd> {tr("CommandPalette.0ccd7d0b91")}</span>
          <span>
            <kbd>{tr("CommandPalette.52f878edb3")}</kbd> {tr("CommandPalette.b6f0bdc7c2")}</span>
        </div>
      </div>
    </Dialog>
  );
}
