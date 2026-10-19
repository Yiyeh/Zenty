import { tr } from "./i18n.ts";
import { APP_NAME } from "./brand.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GamingFeed } from "./gaming";
export type FeedKind = "giveaways" | "releases" | "deals";
export function useGamingFeed(kind: FeedKind | null) {
  const [results, setResults] = useState<Partial<Record<FeedKind, GamingFeed>>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const ticket = ++sequence.current;
    if (!kind) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/gaming/${kind}`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(tr("useGamingFeed.09dbdfca7a"));
      const body: GamingFeed = await response.json();
      if (!Array.isArray(body.items) || typeof body.stale !== "boolean")
        throw new Error(tr("useGamingFeed.78bdd7baa6"));
      if (ticket === sequence.current)
        setResults((p) => ({ ...p, [kind]: body }));
    } catch {
      if (ticket === sequence.current)
        setResults((p) => ({
          ...p,
          [kind]: {
            items: p[kind]?.items || [],
            updatedAt: p[kind]?.updatedAt || null,
            stale: true,
            warning: tr("useGamingFeed.4ad1af9426", { v0: APP_NAME }),
          },
        }));
    } finally {
      if (ticket === sequence.current) setLoading(false);
    }
  }, [kind]);
  useEffect(() => {
    const counter = sequence;
    void reload();
    return () => {
      counter.current++;
    };
  }, [reload]);
  return { feed: kind ? results[kind] : undefined, loading, reload };
}
