/**
 * PANIER — continuity without an account (founder order 2026-08-22: what she
 * does on a boutique — gardés, panier — is still there when she comes back).
 *
 * The favorites.ts law applies whole: device-local, no account, no backend,
 * no sync claim — « dans votre panier » means on HER phone. Guarded against
 * an absent or throwing localStorage; a failed persist degrades to
 * session-only, never to a crash or a lying chip.
 *
 * KEYED PER BOUTIQUE, unlike the heart, on purpose: the same product version
 * can be listed by two resellers, and the panier is INTENT bound to this
 * boutique's own signed checkout — it must never surface on another
 * reseller's vitrine or bleed attribution across shops. The heart stays a
 * global « gardé » (decoration of taste); the panier is a per-shop shelf.
 *
 * NO COMBINED CART (§SP9: « preserving per-product truth, stock, and
 * economics — no combined cart »): this is a saved LIST. Each article checks
 * out through its own product page, its own Quote, its own order — the
 * panier holds pids and nothing else, and no total exists anywhere.
 */
const KEY = 'shopplus.panier.v1';

let mem: Map<string, string[]> | null = null;

function load(): Map<string, string[]> {
  if (mem) return mem;
  mem = new Map<string, string[]>();
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      for (const [slug, pids] of Object.entries(parsed)) {
        if (Array.isArray(pids)) mem.set(slug, [...new Set(pids.filter((p) => typeof p === 'string'))]);
      }
    }
  } catch {
    /* unreadable store → start empty; the map still works for this session */
  }
  return mem;
}

function persist(map: Map<string, string[]>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(map)));
    }
  } catch {
    /* private mode / full disk → session-only; the UI state stays true */
  }
}

/** The boutique's saved list, in the order she added. */
export function panierOf(slug: string): readonly string[] {
  return load().get(slug) ?? [];
}

export function inPanier(slug: string, pid: string): boolean {
  return panierOf(slug).includes(pid);
}

/** Toggle; returns the NEW state so the caller can flip the chip it tapped. */
export function togglePanier(slug: string, pid: string): boolean {
  const map = load();
  const list = map.get(slug) ?? [];
  const on = !list.includes(pid);
  const next = on ? [...list, pid] : list.filter((p) => p !== pid);
  if (next.length === 0) map.delete(slug);
  else map.set(slug, next);
  persist(map);
  return on;
}

/** Test seam: forget the cache so a fresh load re-reads storage. */
export function resetPanierCache(): void {
  mem = null;
}
