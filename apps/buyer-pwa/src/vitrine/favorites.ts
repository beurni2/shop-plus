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

/**
 * MON-COMPTE-PLUS (canon 3.24.0) — WHERE she hearted it. The heart stays one
 * global « gardé » per product on this phone; her account keeps each heart
 * as a boutique and a product, so « Mon compte » shows it under the boutique
 * she tapped it in. Kept beside the set, never inside it: a heart from before
 * this law has no boutique until she next opens one that lists it.
 */
const BOUTIQUES_KEY = 'shopplus.favoris-boutiques.v1';
let boutiques: Map<string, string> | null = null;

function loadBoutiques(): Map<string, string> {
  if (boutiques) return boutiques;
  boutiques = new Map<string, string>();
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(BOUTIQUES_KEY);
    if (raw) {
      for (const [pid, slug] of Object.entries(JSON.parse(raw) as Record<string, unknown>)) {
        if (typeof slug === 'string' && slug !== '') boutiques.set(pid, slug);
      }
    }
  } catch {
    /* unreadable store → no boutique known; the hearts themselves still work */
  }
  return boutiques;
}

function persistBoutiques(map: Map<string, string>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(BOUTIQUES_KEY, JSON.stringify(Object.fromEntries(map)));
  } catch {
    /* session-only, as the set */
  }
}

/** Told of every heart that changes AND has a boutique — her account's write-through. */
type Observateur = (slug: string, pid: string, present: boolean) => void;
let observateur: Observateur | null = null;
export function observerFavoris(fn: Observateur | null): void {
  observateur = fn;
}

/** Toggle; returns the NEW state so the caller can flip the heart it tapped.
 *  `slug` is the boutique the heart was tapped in. */
export function toggleFavorite(pid: string, slug?: string): boolean {
  const set = load();
  const map = loadBoutiques();
  const on = !set.has(pid);
  const avant = map.get(pid);
  if (on) {
    set.add(pid);
    if (slug !== undefined && slug !== '') map.set(pid, slug);
  } else {
    set.delete(pid);
    map.delete(pid);
  }
  persist(set);
  persistBoutiques(map);
  const ou = on ? map.get(pid) : avant;
  if (ou !== undefined) observateur?.(ou, pid, on);
  return on;
}

/** The hearts whose boutique is known — what her account can show. */
export function favorisSitues(): readonly { readonly slug: string; readonly pid: string }[] {
  const map = loadBoutiques();
  return [...load()].flatMap((pid) => {
    const slug = map.get(pid);
    return slug !== undefined ? [{ slug, pid }] : [];
  });
}

/** A boutique she opened lists these products: a heart with no boutique yet
 *  takes this one, and her account is told. */
export function situerFavoris(slug: string, pids: readonly string[]): void {
  const set = load();
  const map = loadBoutiques();
  const neufs = pids.filter((pid) => set.has(pid) && !map.has(pid));
  if (neufs.length === 0 || slug === '') return;
  for (const pid of neufs) map.set(pid, slug);
  persistBoutiques(map);
  for (const pid of neufs) observateur?.(slug, pid, true);
}

/** Test seam: forget the cache so a fresh load re-reads storage. */
export function resetFavoritesCache(): void {
  mem = null;
  boutiques = null;
}
