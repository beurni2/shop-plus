/**
 * PANIER — continuity without an account (founder order 2026-08-22: what she
 * does on a boutique — gardés, panier — is still there when she comes back).
 *
 * The favorites.ts law applies whole: device-local, no account needed —
 * « dans votre panier » means on HER phone, and, when she is signed in, in
 * her account too (MON-COMPTE-PLUS, observerPanier below). Guarded against
 * an absent or throwing localStorage; a failed persist degrades to
 * session-only, never to a crash or a lying chip.
 *
 * KEYED PER BOUTIQUE, unlike the heart, on purpose: the same product version
 * can be listed by two resellers, and the panier is INTENT bound to this
 * boutique's own signed checkout — it must never surface on another
 * reseller's vitrine or bleed attribution across shops. The heart stays a
 * global « gardé » (decoration of taste); the panier is a per-shop shelf.
 *
 * NO COMBINED ORDER (§SP9: « preserving per-product truth, stock, and
 * economics — no combined cart »; PAYER-TOUT-1, founder ruling 2026-09-22):
 * this is a saved LIST. She may pay two or more of its articles in ONE
 * payment, but each article is still its own Quote, its own order, its own
 * parcel — the panier holds pids and nothing else, and the only total that
 * exists is the one the SERVICE states on the payment screens.
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

/** MON-COMPTE-PLUS (canon 3.24.0) — told of every article that enters or
 *  leaves a boutique's panier: her account's write-through. */
type Observateur = (slug: string, pid: string, present: boolean) => void;
let observateur: Observateur | null = null;
export function observerPanier(fn: Observateur | null): void {
  observateur = fn;
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
  observateur?.(slug, pid, on);
  return on;
}

/**
 * PAYER-TOUT-1 — the articles she PAID at once leave her panier, once the
 * operator has confirmed the payment (never before: a failed payment keeps
 * her panier as it was). A paid panier left standing would offer to pay it
 * again.
 */
export function retirerDuPanier(slug: string, pids: readonly string[]): void {
  const map = load();
  const avant = map.get(slug) ?? [];
  const next = avant.filter((p) => !pids.includes(p));
  if (next.length === 0) map.delete(slug);
  else map.set(slug, next);
  persist(map);
  for (const pid of avant) if (pids.includes(pid)) observateur?.(slug, pid, false);
}

/** Every boutique's panier on this phone — what signing in joins to her account. */
export function paniersDuTelephone(): readonly { readonly slug: string; readonly pid: string }[] {
  return [...load()].flatMap(([slug, pids]) => pids.map((pid) => ({ slug, pid })));
}

/** Test seam: forget the cache so a fresh load re-reads storage. */
export function resetPanierCache(): void {
  mem = null;
}
