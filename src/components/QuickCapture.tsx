import { useLocale as useInterfaceLocale } from "../context/Locale.tsx";
import { tr, getFormatLocale } from "../lib/i18n.ts";
import { newId } from "../lib/id";
import { useState } from "react";
import { Lightbulb, ArrowRight, Trash2, ListPlus } from "lucide-react";
import { useDashboard } from "../context/DashboardStore";
export function QuickCapture() {
  useInterfaceLocale();
  const { ideas, setIdeas, setTasks, notify } = useDashboard();
  const [content, setContent] = useState("");
  return (
    <section className="glass-panel ideas-card">
      <div className="widget-heading">
        <h3>
          <Lightbulb size={17} /> {tr("QuickCapture.19d551948b")}</h3>
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
          aria-label={tr("QuickCapture.bb6db27a55")}
          placeholder={tr("QuickCapture.cfded4af8f")}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button className="icon-button" aria-label={tr("QuickCapture.d72b33f0b5")}>
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
                  : new Date(idea.createdAt).toLocaleString(getFormatLocale(), {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label={tr("QuickCapture.7ea2a02b65", { v0: idea.content })}
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
                notify(tr("QuickCapture.f89ec12fe9"));
              }}
            >
              <ListPlus size={16} />
            </button>
            <button
              className="icon-button danger"
              aria-label={tr("a11y.QuickCapture.82", { v0: idea.content })}
              onClick={() => {
                setIdeas((p) => p.filter((i) => i.id !== idea.id));
                notify(tr("QuickCapture.9872cb6929"), () =>
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
          <span>{tr("QuickCapture.8d282f1b63")}</span>
        </div>
      )}
    </section>
  );
}
