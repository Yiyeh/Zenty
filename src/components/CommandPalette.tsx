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
        detail: "Enfocar esta tarea",
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
        title: "Rincón gamer",
        detail: "Juegos gratis, lanzamientos, ofertas y mi juegoteca",
        icon: Gamepad2,
        action: () => onSection("gaming"),
      },
      {
        key: "library",
        title: "Mi biblioteca",
        detail: "Documentos, libros y mangas",
        icon: LibraryBig,
        action: () => onSection("library"),
      },
      {
        key: "settings",
        title: "Personalizar mi espacio",
        detail: "Apariencia, widgets y conexiones",
        icon: Settings,
        action: onSettings,
      },
      {
        key: "focus",
        title: "Entrar en modo enfoque",
        detail: "Un momento sin distracciones",
        icon: Maximize2,
        action: onFocus,
      },
    ].filter((a) => match(a.title)),
  ].slice(0, 12);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Busca en tu espacio"
      description="Accesos, tareas, notas y acciones. Todo a mano."
    >
      <div className="dialog-body command-body">
        <div className="input-icon command-input">
          <Search size={18} />
          <input
            autoFocus
            aria-label="Buscar accesos, tareas y notas"
            placeholder="Escribe algo…"
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
                  notify("Tarea añadida.");
                })
              }
            >
              <Plus size={18} />
              <span>
                Crear tarea: {query}
                <small>Captura sin salir de lo que estás haciendo</small>
              </span>
            </button>
          )}
          {!results.length && !query.trim() && (
            <div className="empty-state">
              <Link2 size={24} />
              Tu espacio irá creciendo contigo.
            </div>
          )}
        </div>
        <div className="command-help">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navegar
          </span>
          <span>
            <kbd>↵</kbd> Abrir
          </span>
          <span>
            <kbd>Esc</kbd> Cerrar
          </span>
        </div>
      </div>
    </Dialog>
  );
}
