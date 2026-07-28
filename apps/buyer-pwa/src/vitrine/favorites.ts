/**
 * FAVORIS — the heart is REAL or it is not built (NORTH-STAR-1, founder order).
 *
 * The founder ordered the mockup's wishlist hearts. A heart that only decorates
 * would be a dead button — the one thing an « honest states » page may never
 * carry — so this is a working, device-local wishlist: her saved articles live
 * in localStorage on HER phone. No account, no backend, no sync claim: « gardé »
 * means gardé ici, which is exactly what it does.
 *
 * localStorage can be absent (node tests) or throwing (private mode, full disk);
 * every touch is guarded and the in-memory set keeps the session working — a
 * failed persist degrades to session-only, never to a crash or a lying heart.
 */
const KEY = 'shopplus.favoris.v1';

let mem: Set<string> | null = null;

function load(): Set<string> {
  if (mem) return mem;
  mem = new Set<string>();
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (raw) for (const pid of JSON.parse(raw) as string[]) mem.add(pid);
  } catch {
    /* unreadable store → start empty; the set still works for this session */
  }
  return mem;
}

function persist(set: Set<string>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* private mode / full disk → session-only; the UI state stays true */
  }
}

export function isFavorite(pid: string): boolean {
  return load().has(pid);
}

/** Toggle; returns the NEW state so the caller can flip the heart it tapped. */
export function toggleFavorite(pid: string): boolean {
  const set = load();
  const on = !set.has(pid);
  if (on) set.add(pid);
  else set.delete(pid);
  persist(set);
  return on;
}

/** Test seam: forget the cache so a fresh load re-reads storage. */
export function resetFavoritesCache(): void {
  mem = null;
}
