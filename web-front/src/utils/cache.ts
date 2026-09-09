type CacheEntry<T> = {
  data: T;
  at: number;
};

const store = new Map<string, CacheEntry<unknown>>();

export function getCache<T>(key: string, maxAgeMs: number): T | null {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (!hit) return null;
  if (Date.now() - hit.at > maxAgeMs) return null;
  return hit.data;
}

export function peekCache<T>(key: string): T | null {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  return hit?.data ?? null;
}

export function setCache<T>(key: string, data: T) {
  store.set(key, { data, at: Date.now() });
}

export function clearCache(key?: string) {
  if (key) store.delete(key);
  else store.clear();
}
