import { useCallback, useEffect, useRef, useState } from "react";
import { getCache, peekCache, setCache } from "../utils/cache";

type Options = {
  cacheKey: string;
  maxAgeMs?: number;
  enabled?: boolean;
};

export function useCachedQuery<T>(loader: () => Promise<T>, options: Options) {
  const { cacheKey, maxAgeMs = 60_000, enabled = true } = options;
  const [data, setData] = useState<T | null>(() => peekCache<T>(cacheKey));
  const [loading, setLoading] = useState(!peekCache<T>(cacheKey));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (mode: "initial" | "refresh" | "background" = "initial") => {
      if (!enabled) return;

      const cached = getCache<T>(cacheKey, maxAgeMs);
      if (cached && mode !== "refresh") {
        if (mounted.current) {
          setData(cached);
          setLoading(false);
        }
        if (mode === "background") return;
      }

      if (mode === "refresh") setRefreshing(true);
      else if (!peekCache<T>(cacheKey)) setLoading(true);

      setError("");
      try {
        const next = await loader();
        setCache(cacheKey, next);
        if (mounted.current) setData(next);
      } catch (err) {
        if (mounted.current) {
          setError(err instanceof Error ? err.message : "Request failed");
          if (!peekCache<T>(cacheKey)) setData(null);
        }
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [cacheKey, enabled, loader, maxAgeMs]
  );

  const reload = useCallback(() => load("refresh"), [load]);
  const softLoad = useCallback(() => load("background"), [load]);

  useEffect(() => {
    void load(peekCache<T>(cacheKey) ? "background" : "initial");
  }, [load, cacheKey]);

  return { data, loading, refreshing, error, reload, softLoad };
}
