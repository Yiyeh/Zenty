import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeNewsFeed,
  type NewsCategory,
  type NewsFeedResponse,
} from "./news.ts";
interface FetchNewsOptions {
  category?: NewsCategory;
  source?: string;
  tag?: string;
  q?: string;
  refresh?: boolean;
  limit?: number;
}
/** Shared by the home widget and the full news view. Concurrent requests share one flight. */
export function createNewsFeedClient(
  fetcher: typeof fetch = (...args) => fetch(...args),
  now = Date.now,
) {
  const cached = new Map<string, { data: NewsFeedResponse; time: number }>();
  const flights = new Map<string, Promise<NewsFeedResponse>>();
  return (options: FetchNewsOptions = {}): Promise<NewsFeedResponse> => {
    const params = new URLSearchParams();
    if (options.category && !["all", "saved"].includes(options.category))
      params.set("category", options.category);
    for (const key of ["source", "tag", "q"] as const)
      if (options[key]) params.set(key, options[key]);
    if (options.limit) params.set("limit", String(options.limit));
    const key = params.toString();
    const previous = cached.get(key);
    if (flights.has(key)) return flights.get(key)!;
    if (!options.refresh && previous && now() - previous.time < 300_000)
      return Promise.resolve(previous.data);
    if (options.refresh) params.set("refresh", "1");
    const request = (async () => {
      const response = await fetcher(`/api/news?${params}`, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok)
        throw new Error(
          "No se pudieron actualizar las noticias. Vuelve a intentarlo.",
        );
      const data = normalizeNewsFeed(await response.json());
      if (cached.size >= 20) cached.delete(cached.keys().next().value!);
      cached.set(key, { data, time: now() });
      return data;
    })().finally(() => flights.delete(key));
    flights.set(key, request);
    return request;
  };
}
export const fetchNewsFeed = createNewsFeedClient();
function readCachedFeed() {
  try {
    const raw = sessionStorage.getItem("mia_news_cache");
    return raw ? normalizeNewsFeed(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export function useNewsFeed() {
  const [data, setData] = useState<NewsFeedResponse | null>(readCachedFeed);
  const [loading, setLoading] = useState(!data);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const loadFeed = useCallback(async (force = false) => {
    const version = ++sequence.current;
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetchNewsFeed({ refresh: force });
      if (version !== sequence.current) return;
      setData(result);
      try {
        sessionStorage.setItem("mia_news_cache", JSON.stringify(result));
      } catch {
        /* Cache is optional. */
      }
    } catch (err) {
      if (version === sequence.current)
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron obtener las noticias.",
        );
    } finally {
      if (version === sequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);
  const invalidate = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    void loadFeed();
    return invalidate;
  }, [loadFeed, invalidate]);
  return {
    articles: data?.items || [],
    sources: data?.sources || [],
    updatedAt: data?.updatedAt || null,
    total: data?.total || 0,
    stale: data?.stale || false,
    unavailableSources: data?.unavailableSources || [],
    loading,
    refreshing,
    error,
    refresh: () => loadFeed(true),
  };
}
