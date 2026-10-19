import { useRef, useEffect, useState } from "react";
import { Search, ArrowRight, Command } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
const engines: Record<string, { name: string; url: string }> = {
  google: { name: "Google", url: "https://www.google.com/search?q=" },
  duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
  bing: { name: "Bing", url: "https://www.bing.com/search?q=" },
  brave: { name: "Brave", url: "https://search.brave.com/search?q=" },
};
export function SearchBar({
  onCommand,
  compact = false,
}: {
  onCommand: () => void;
  compact?: boolean;
}) {
  const { settings, setSettings } = useDashboard();
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        !target.isContentEditable &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  return (
    <div className="search-section">
      <form
        className="search-bar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (!query.trim()) return;
          const url = `${engines[settings.searchEngine].url}${encodeURIComponent(query.trim())}`;
          if (settings.openInNewTab)
            window.open(url, "_blank", "noopener,noreferrer");
          else location.assign(url);
        }}
      >
        <Search size={20} />
        <input
          ref={ref}
          aria-label="Buscar en la web"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="¿A dónde te lleva la curiosidad hoy?"
        />
        <select
          aria-label="Motor de búsqueda"
          value={settings.searchEngine}
          onChange={(e) =>
            setSettings((s) => ({ ...s, searchEngine: e.target.value }))
          }
        >
          {Object.entries(engines).map(([key, engine]) => (
            <option key={key} value={key}>
              {engine.name}
            </option>
          ))}
        </select>
        <button
          className="icon-button search-submit"
          aria-label="Buscar en internet"
        >
          <ArrowRight size={18} />
        </button>
      </form>
      {!compact && (
        <button className="search-local text-button" onClick={onCommand}>
          <Command size={13} /> Buscar en mi espacio <kbd>Ctrl K</kbd>
        </button>
      )}
    </div>
  );
}
