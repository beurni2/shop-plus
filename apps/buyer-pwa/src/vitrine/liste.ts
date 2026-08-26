/**
 * ═══ LISTE-ENVIES-1 — the wishlist's client side (founder order 2026-08-25) ═══
 *
 * « a buyer creates a products wishlist … a link is created for him … his
 * friends tap that link and it opens that boutique with his wishlist to order
 * the products for him. »
 *
 * TWO ROADS, ONE MODULE:
 *  · THE CREATOR — picks products on the vitrine, names the liste, and the
 *    SERVICE mints the shareable token (`POST /listes`). Her handle to it —
 *    token + edit key — is kept in a device-local store on the favorites.ts
 *    law: guarded localStorage, session-degrade, no account, no sync claim.
 *  · THE FRIEND — arrives on `/v/{slug}?liste={token}` and READS the liste
 *    (`GET /listes/{token}`): a name, the pids, and « offert » as a boolean.
 *    « Offert » is PROVIDER-CONFIRMED payment truth relayed by the service —
 *    nothing on any phone can set it, and this module only ever displays it.
 *
 * NO MONEY LIVES HERE. The liste holds pids; every product still orders
 * through its own signed fiche and its own Quote (the panier's own
 * no-combined-cart law). The one new byte on the checkout road is the opaque
 * `listeRef` the fiche forwards so the service can mark the gift — threaded
 * through `fetchClienteQuote`, never composed here.
 */

/** The token/edit-key shape as the service mints it (192 bits, URL-safe). A
 *  param that fails this is treated as no liste at all — never sent. */
export const LISTE_TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** The liste as the service projects it — the ONLY shape a friend ever sees. */
export interface ListePublique {
  readonly nom: string;
  readonly slug: string;
  readonly articles: readonly { readonly pid: string; readonly offert: boolean }[];
}

/** What a successful create hands back: the share token, the edit key (kept
 *  locally, shown to nobody), and the liste as created. */
export interface ListeCreee {
  readonly token: string;
  readonly editCle: string;
  readonly liste: ListePublique;
}

export type ListeCreation = { readonly status: 'creee'; readonly liste: ListeCreee } | { readonly status: 'refus' } | { readonly status: 'hors-ligne' };
export type ListeLecture = { readonly status: 'liste'; readonly liste: ListePublique } | { readonly status: 'introuvable' } | { readonly status: 'hors-ligne' };
export type ListeModification = { readonly status: 'modifiee'; readonly liste: ListePublique } | { readonly status: 'refus' } | { readonly status: 'hors-ligne' };

export interface ListePort {
  /** LISTE-MERCI — `telephone` is the creator's WhatsApp opt-in (optional).
   *  It rides the create ONLY; the service normalises it to wa.me digits,
   *  stores it OFF the public projection, and serves it to nobody but a
   *  provider-confirmed purchaser of this liste. */
  creer(slug: string, nom: string, pids: readonly string[], telephone?: string): Promise<ListeCreation>;
  lire(token: string): Promise<ListeLecture>;
  /** LISTE-RETRAIT — the creator's edit: the pids she KEEPS (the service
   *  replaces the selection, preserving « offert » marks on survivors). The
   *  edit key rides the body and the SAME link stays valid — removal never
   *  mints anything. Every refusal (wrong key ≡ absent liste, empty pids,
   *  hors-boutique) collapses to `refus`: the sheet's inline mirrors already
   *  said everything sayable before the wire was spent. */
  modifier(token: string, editCle: string, pids: readonly string[]): Promise<ListeModification>;
}

/** Parse a wire liste defensively — a 200 with an unreadable shape is
 *  `introuvable`-class, never a crash on a shared link. */
function lireListeWire(value: unknown): ListePublique | undefined {
  const r = value as { nom?: unknown; slug?: unknown; articles?: unknown } | null;
  if (r === null || typeof r !== 'object') return undefined;
  if (typeof r.nom !== 'string' || typeof r.slug !== 'string' || !Array.isArray(r.articles)) return undefined;
  const articles: { pid: string; offert: boolean }[] = [];
  for (const a of r.articles as { pid?: unknown; offert?: unknown }[]) {
    if (typeof a?.pid !== 'string') return undefined;
    articles.push({ pid: a.pid, offert: a.offert === true });
  }
  return { nom: r.nom, slug: r.slug, articles };
}

/** The REAL adapter — the storefront-service liste doors. */
export function httpListePort(base: string): ListePort {
  return {
    async creer(slug, nom, pids, telephone): Promise<ListeCreation> {
      let res: Response;
      try {
        res = await fetch(`${base}/listes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The service's exact-key allowlist, built as ONE literal — the
          // quote-port law: an unknown key is refused by name over there,
          // and no other key can ride from here. An absent opt-in is absent
          // bytes, never an empty string.
          body: JSON.stringify({ slug, nom, pids, ...(telephone !== undefined && telephone !== '' ? { telephone } : {}) }),
        });
      } catch {
        return { status: 'hors-ligne' };
      }
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; token?: unknown; editCle?: unknown; liste?: unknown }
        | null;
      if (!res.ok || body?.ok !== true) return { status: 'refus' };
      const liste = lireListeWire(body.liste);
      if (liste === undefined || typeof body.token !== 'string' || typeof body.editCle !== 'string') {
        return { status: 'refus' };
      }
      return { status: 'creee', liste: { token: body.token, editCle: body.editCle, liste } };
    },
    async lire(token): Promise<ListeLecture> {
      let res: Response;
      try {
        res = await fetch(`${base}/listes/${encodeURIComponent(token)}`);
      } catch {
        return { status: 'hors-ligne' };
      }
      if (!res.ok) return { status: 'introuvable' };
      const body = (await res.json().catch(() => null)) as { ok?: boolean; liste?: unknown } | null;
      const liste = body?.ok === true ? lireListeWire(body.liste) : undefined;
      return liste === undefined ? { status: 'introuvable' } : { status: 'liste', liste };
    },
    async modifier(token, editCle, pids): Promise<ListeModification> {
      let res: Response;
      try {
        res = await fetch(`${base}/listes/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The update door's exact-key allowlist as ONE literal — `nom` is
          // deliberately absent (absent = keep the stored name); no other key
          // can ride from here.
          body: JSON.stringify({ editCle, pids }),
        });
      } catch {
        return { status: 'hors-ligne' };
      }
      const body = (await res.json().catch(() => null)) as { ok?: boolean; liste?: unknown } | null;
      if (!res.ok || body?.ok !== true) return { status: 'refus' };
      const liste = lireListeWire(body.liste);
      return liste === undefined ? { status: 'refus' } : { status: 'modifiee', liste };
    },
  };
}

/**
 * The HARNESS adapter — in-memory, so a preview with no service still walks
 * the whole road (the demoQuotePort law). Tokens come from the OS CSPRNG
 * exactly as the service mints them; with no CSPRNG the create refuses BY
 * NAME rather than minting a weaker random (the no_secure_random ladder).
 */
const REF_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
function mintDemoToken(): string | undefined {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') return undefined;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let out = '';
  for (const b of bytes) out += REF_ALPHABET[b & 63];
  return out;
}

export function demoListePort(): ListePort {
  const held = new Map<string, { editCle: string; liste: ListePublique }>();
  return {
    async creer(slug, nom, pids): Promise<ListeCreation> {
      const token = mintDemoToken();
      const editCle = mintDemoToken();
      if (token === undefined || editCle === undefined) return { status: 'refus' };
      const liste: ListePublique = { nom, slug, articles: pids.map((pid) => ({ pid, offert: false })) };
      held.set(token, { editCle, liste });
      return { status: 'creee', liste: { token, editCle, liste } };
    },
    async lire(token): Promise<ListeLecture> {
      const garde = held.get(token);
      return garde === undefined ? { status: 'introuvable' } : { status: 'liste', liste: garde.liste };
    },
    async modifier(token, editCle, pids): Promise<ListeModification> {
      const garde = held.get(token);
      // The door's bounds this harness CAN honestly mirror: wrong key ≡
      // absent liste as ONE refusal, the 1–20 selection band, and « offert »
      // surviving on every pid she keeps (an edit rearranges wishes, it never
      // un-gives a gift). What it does NOT enforce, stated: the membership
      // law (`pids ⊆ curatedItems`) — this harness holds no catalogue, the
      // UI only ever submits pids read off the liste, and the REAL door's
      // check is e2e-covered on the service.
      if (garde === undefined || garde.editCle !== editCle || pids.length === 0 || pids.length > 20) return { status: 'refus' };
      const marks = new Map(garde.liste.articles.map((a) => [a.pid, a.offert]));
      const liste: ListePublique = {
        ...garde.liste,
        articles: pids.map((pid) => ({ pid, offert: marks.get(pid) === true })),
      };
      held.set(token, { editCle, liste });
      return { status: 'modifiee', liste };
    },
  };
}

/** The `resolveStorefrontPort` twin: the REAL adapter iff a service base is
 *  configured at build time, the in-memory harness otherwise. */
export function resolveListePort(): ListePort {
  const env = (import.meta as { env?: { VITE_STOREFRONT_BASE?: string } }).env;
  const base = env?.VITE_STOREFRONT_BASE;
  return base ? httpListePort(base) : demoListePort();
}

/* ─────────────────── the creator's own record, device-local ─────────────── */

/**
 * HER HANDLE TO THE LISTE SHE MADE — token, edit key, and enough to redraw
 * the link card without a network read. Keyed PER BOUTIQUE (the panier's
 * reasoning: a liste is intent bound to one shop), newest wins: remaking the
 * liste replaces the handle, and the old link simply keeps working on the
 * service side. The favorites.ts storage law applies whole: guarded, mem
 * cache, session-degrade, never a crash.
 */
const KEY = 'shopplus.listes.v1';

export interface ListeGardee {
  readonly token: string;
  readonly editCle: string;
  readonly nom: string;
  readonly pids: readonly string[];
  readonly createdAt: string;
}

let mem: Map<string, ListeGardee> | null = null;

function load(): Map<string, ListeGardee> {
  if (mem) return mem;
  mem = new Map<string, ListeGardee>();
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, ListeGardee>;
      for (const [slug, gardee] of Object.entries(parsed)) {
        if (typeof gardee?.token === 'string' && typeof gardee?.editCle === 'string') mem.set(slug, gardee);
      }
    }
  } catch {
    /* unreadable store → start empty; the map still works for this session */
  }
  return mem;
}

function persist(map: Map<string, ListeGardee>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(map)));
    }
  } catch {
    /* private mode / full disk → session-only; the UI state stays true */
  }
}

export function listeGardee(slug: string): ListeGardee | undefined {
  return load().get(slug);
}

export function garderListe(slug: string, gardee: ListeGardee): void {
  const map = load();
  map.set(slug, gardee);
  persist(map);
}

/** Test seam: forget the cache so a fresh load re-reads storage. */
export function resetListesCache(): void {
  mem = null;
}
