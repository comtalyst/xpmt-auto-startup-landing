export type HNFeed = 'top' | 'new' | 'best';

export type HNItem = {
  id: number;
  by?: string;
  descendants?: number;
  kids?: number[];
  score?: number;
  time?: number; // unix seconds
  title?: string;
  type?: string;
  url?: string;
};

const API_BASE = 'https://hacker-news.firebaseio.com/v0';

const FEED_ENDPOINT: Record<HNFeed, string> = {
  top: 'topstories',
  new: 'newstories',
  best: 'beststories',
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function cacheKey(key: string) {
  return hn-reader:v1:;
}

export function getCachedJson<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  try {
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; value: T };
    if (!parsed?.ts) return null;
    if (Date.now() - parsed.ts > ttlMs) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export function setCachedJson<T>(key: string, value: T) {
  try {
    localStorage.setItem(cacheKey(key), JSON.stringify({ ts: Date.now(), value }));
  } catch {
    // ignore (storage full / disabled)
  }
}

async function fetchJson<T>(url: string, abort?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal: abort });
  if (!res.ok) throw new Error(Request failed:  );
  return (await res.json()) as T;
}

export async function fetchStoryIds(feed: HNFeed, abort?: AbortSignal): Promise<number[]> {
  const endpoint = FEED_ENDPOINT[feed];
  return fetchJson<number[]>(/.json, abort);
}

export async function fetchItem(id: number, abort?: AbortSignal): Promise<HNItem> {
  return fetchJson<HNItem>(/item/.json, abort);
}

async function mapConcurrent<TIn, TOut>(
  inputs: TIn[],
  limit: number,
  worker: (input: TIn) => Promise<TOut>
): Promise<TOut[]> {
  const results: TOut[] = new Array(inputs.length);
  let idx = 0;

  async function runOne() {
    while (true) {
      const current = idx++;
      if (current >= inputs.length) return;
      results[current] = await worker(inputs[current]);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, inputs.length)) }, runOne);
  await Promise.all(workers);
  return results;
}

export async function fetchFeedItems(opts: {
  feed: HNFeed;
  limit?: number;
  concurrency?: number;
  ttlMs?: number;
  abort?: AbortSignal;
}): Promise<HNItem[]> {
  const { feed, limit = 30, concurrency = 10, ttlMs = DEFAULT_TTL_MS, abort } = opts;

  const idsCacheKey = ids:;
  const cachedIds = getCachedJson<number[]>(idsCacheKey, ttlMs);
  const ids = cachedIds ?? (await fetchStoryIds(feed, abort));
  if (!cachedIds) setCachedJson(idsCacheKey, ids);

  const slice = ids.slice(0, limit);

  const itemsCacheKey = items::;
  const cachedItems = getCachedJson<HNItem[]>(itemsCacheKey, ttlMs);
  if (cachedItems?.length) return cachedItems;

  const items = await mapConcurrent(slice, concurrency, async (id) => {
    // cache each item for longer; content rarely changes except score/comments
    const itemKey = item:;
    const cached = getCachedJson<HNItem>(itemKey, ttlMs);
    if (cached) return cached;
    const item = await fetchItem(id, abort);
    setCachedJson(itemKey, item);
    return item;
  });

  setCachedJson(itemsCacheKey, items);
  return items;
}

export function hnItemUrl(item: HNItem): string {
  return item.url ?? https://news.ycombinator.com/item?id=;
}

export function hnCommentsUrl(itemId: number): string {
  return https://news.ycombinator.com/item?id=;
}

export function formatRelativeTime(unixSeconds?: number): string {
  if (!unixSeconds) return '';
  const diffMs = unixSeconds * 1000 - Date.now();
  const diffSec = Math.round(diffMs / 1000);

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diffSec);

  if (abs < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour');
  const diffDay = Math.round(diffHr / 24);
  return rtf.format(diffDay, 'day');
}
