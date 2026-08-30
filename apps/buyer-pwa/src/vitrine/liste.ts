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

/** The door's article ceiling, mirrored so the sheet can refuse INLINE (« 20
 *  articles au plus ») instead of spending the wire on a certain refusal. */
export const LISTE_MAX_ARTICLES = 20;

/** The liste as the service projects it — the ONLY shape a friend ever sees.
 *  LISTE-ADRESSE: `livraison` says WHETHER the creator stored an address —
 *  a bare boolean, never a byte of the address itself. */
export interface ListePublique {
  readonly nom: string;
  readonly slug: string;
  readonly articles: readonly { readonly pid: string; readonly offert: boolean }[];
  readonly livraison: boolean;
}

/** LISTE-ADRESSE — what the creator stores at creation: the three facts her
 *  delivery needs (the checkout contact's own laws) plus the exact zone
 *  string a checkout from this boutique would compose. It rides the CREATE
 *  only; the service keeps it off every public read.
 *  LISTE-VOIX — `audioB64` is her VOICE repère's raw bytes off the recorder
 *  (the checkout contact's own `audioB64` law): bytes at create only — the
 *  service mints an opaque ref behind its own write key and stores THAT;
 *  no audio byte and no ref ever appears on any public read. */
export interface ListeLivraison {
  readonly telephone: string;
  readonly quartier: string;
  readonly repere: string;
  readonly zone: string;
  readonly audioB64?: string;
  /** GEO-ACHAT-1 (liste half) — her GPS pin, one optional tap on the create
   *  sheet (the checkout contact's own pin law): rides the CREATE only,
   *  private to the delivery machine, never on any public read. */
  readonly pin?: { readonly lat: number; readonly lng: number; readonly accuracy?: number };
}

/** What a successful create hands back: the share token, the edit key (kept
 *  locally, shown to nobody), and the liste as created. */
export interface ListeCreee {
  readonly token: string;
  readonly editCle: string;
  readonly liste: ListePublique;
}

/** LISTE-VOIX — `noteVocale` is the service's create-only word on what became
 *  of her recorded repère (the order road's own discipline): `gardee`, or
 *  `perdue` when the media backend refused — the liste itself is UNTOUCHED
 *  either way, and only `perdue` is ever spoken to her. */
export type ListeCreation =
  | { readonly status: 'creee'; readonly liste: ListeCreee; readonly noteVocale?: 'gardee' | 'perdue' }
  | { readonly status: 'refus' }
  | { readonly status: 'hors-ligne' };
export type ListeLecture = { readonly status: 'liste'; readonly liste: ListePublique } | { readonly status: 'introuvable' } | { readonly status: 'hors-ligne' };
export type ListeModification = { readonly status: 'modifiee'; readonly liste: ListePublique } | { readonly status: 'refus' } | { readonly status: 'hors-ligne' };
export type ListeFermeture = { readonly status: 'fermee' } | { readonly status: 'refus' } | { readonly status: 'hors-ligne' };

/** LISTE-CADEAUX — one granted wish, as the service composes it: the pid,
 *  the journey facts the ?cadeau page already reads (absent = the order
 *  could not answer just now — « suivi indisponible », never a dead row),
 *  and the remise code ONLY once the service's own reveal conditions hold
 *  (arrival recorded, door leg settled — decided server-side, displayed
 *  here). No orderId, no amount, no contact ever crosses this wire. */
export interface CadeauListe {
  readonly pid: string;
  readonly suivi?: {
    readonly state: string;
    readonly acceptedAt?: string;
    readonly readyAt?: string;
    readonly departedAt?: string;
    readonly arrivedAt?: string;
    readonly livree?: boolean;
  };
  readonly code?: string;
}
export type ListeCadeauxLecture =
  | { readonly status: 'cadeaux'; readonly nom: string; readonly cadeaux: readonly CadeauListe[] }
  | { readonly status: 'introuvable' }
  | { readonly status: 'hors-ligne' };

export interface ListePort {
  /** LISTE-MERCI — `telephone` is the creator's WhatsApp opt-in (optional).
   *  It rides the create ONLY; the service normalises it to wa.me digits,
   *  stores it OFF the public projection, and serves it to nobody but a
   *  provider-confirmed purchaser of this liste. */
  creer(slug: string, nom: string, pids: readonly string[], telephone?: string, livraison?: ListeLivraison): Promise<ListeCreation>;
  lire(token: string): Promise<ListeLecture>;
  /** LISTE-REFAIRE — the creator's redo: the pids she KEEPS (the service
   *  replaces the selection, preserving « offert » marks on survivors) and
   *  her possibly-edited name. The edit key rides the body and the SAME
   *  link stays valid — redoing never mints anything. Every refusal (wrong
   *  key ≡ absent liste, empty pids, hors-boutique) collapses to `refus`:
   *  the sheet's inline mirrors already said everything sayable before the
   *  wire was spent. */
  modifier(token: string, editCle: string, pids: readonly string[], nom?: string): Promise<ListeModification>;
  /** LISTE-FERMER — « remove all his items to terminate the wishlist »: the
   *  edit-key-gated close. The service's refusal is DELIBERATELY uniform
   *  (wrong key ≡ absent liste), so on a 404 the adapter re-reads the PUBLIC
   *  entry once to tell « already closed » (the liste is gone → `fermee`,
   *  idempotent for a retried tap) from « refused » (it still answers →
   *  `refus`, and the handle is NOT abandoned). */
  fermer(token: string, editCle: string): Promise<ListeFermeture>;
  /** LISTE-CADEAUX — her gifts, edit-key-gated: which wishes were granted,
   *  where each delivery stands, and the remise code once the service
   *  reveals it. A wrong key and an absent liste are one `introuvable`. */
  cadeaux(token: string, editCle: string): Promise<ListeCadeauxLecture>;
}

/** Parse a wire liste defensively — a 200 with an unreadable shape is
 *  `introuvable`-class, never a crash on a shared link. */
function lireListeWire(value: unknown): ListePublique | undefined {
  const r = value as { nom?: unknown; slug?: unknown; articles?: unknown; livraison?: unknown } | null;
  if (r === null || typeof r !== 'object') return undefined;
  if (typeof r.nom !== 'string' || typeof r.slug !== 'string' || !Array.isArray(r.articles)) return undefined;
  const articles: { pid: string; offert: boolean }[] = [];
  for (const a of r.articles as { pid?: unknown; offert?: unknown }[]) {
    if (typeof a?.pid !== 'string') return undefined;
    articles.push({ pid: a.pid, offert: a.offert === true });
  }
  // strict, like offert: a truthy non-boolean must never open the pay-only road
  return { nom: r.nom, slug: r.slug, articles, livraison: r.livraison === true };
}

/** Parse the cadeaux wire defensively, field by field — an unreadable row
 *  degrades to its pid (or drops if even that is missing), an unreadable
 *  answer to `undefined`: a shape surprise must never crash HER sheet. */
function lireCadeauxWire(value: unknown): { nom: string; cadeaux: CadeauListe[] } | undefined {
  const r = value as { ok?: unknown; nom?: unknown; cadeaux?: unknown } | null;
  if (r === null || typeof r !== 'object' || r.ok !== true || typeof r.nom !== 'string' || !Array.isArray(r.cadeaux)) {
    return undefined;
  }
  const cadeaux: CadeauListe[] = [];
  for (const c of r.cadeaux as { pid?: unknown; suivi?: unknown; code?: unknown }[]) {
    if (typeof c?.pid !== 'string') continue;
    const s = c.suivi as
      | { state?: unknown; acceptedAt?: unknown; readyAt?: unknown; departedAt?: unknown; arrivedAt?: unknown; livree?: unknown }
      | undefined
      | null;
    const suivi =
      s !== null && typeof s === 'object' && typeof s.state === 'string'
        ? {
            state: s.state,
            ...(typeof s.acceptedAt === 'string' ? { acceptedAt: s.acceptedAt } : {}),
            ...(typeof s.readyAt === 'string' ? { readyAt: s.readyAt } : {}),
            ...(typeof s.departedAt === 'string' ? { departedAt: s.departedAt } : {}),
            ...(typeof s.arrivedAt === 'string' ? { arrivedAt: s.arrivedAt } : {}),
            ...(s.livree === true ? { livree: true } : {}),
          }
        : undefined;
    cadeaux.push({
      pid: c.pid,
      ...(suivi !== undefined ? { suivi } : {}),
      ...(typeof c.code === 'string' && c.code !== '' ? { code: c.code } : {}),
    });
  }
  return { nom: r.nom, cadeaux };
}

/** The REAL adapter — the storefront-service liste doors. */
export function httpListePort(base: string): ListePort {
  // A closure, not a method, so `fermer`'s already-closed re-read cannot
  // break under destructuring (`this`-free by construction).
  const lire = async (token: string): Promise<ListeLecture> => {
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
  };
  return {
    async creer(slug, nom, pids, telephone, livraison): Promise<ListeCreation> {
      let res: Response;
      try {
        res = await fetch(`${base}/listes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The service's exact-key allowlist, built as ONE literal — the
          // quote-port law: an unknown key is refused by name over there,
          // and no other key can ride from here. An absent opt-in or an
          // absent address is absent bytes, never an empty shape.
          body: JSON.stringify({
            slug, nom, pids,
            ...(telephone !== undefined && telephone !== '' ? { telephone } : {}),
            ...(livraison !== undefined ? { livraison } : {}),
          }),
        });
      } catch {
        return { status: 'hors-ligne' };
      }
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; token?: unknown; editCle?: unknown; liste?: unknown; noteVocale?: unknown }
        | null;
      if (!res.ok || body?.ok !== true) return { status: 'refus' };
      const liste = lireListeWire(body.liste);
      if (liste === undefined || typeof body.token !== 'string' || typeof body.editCle !== 'string') {
        return { status: 'refus' };
      }
      return {
        status: 'creee',
        liste: { token: body.token, editCle: body.editCle, liste },
        ...(body.noteVocale === 'gardee' || body.noteVocale === 'perdue' ? { noteVocale: body.noteVocale } : {}),
      };
    },
    lire,
    async modifier(token, editCle, pids, nom): Promise<ListeModification> {
      let res: Response;
      try {
        res = await fetch(`${base}/listes/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The update door's exact-key allowlist as ONE literal — an absent
          // `nom` is absent bytes (keep the stored name); no other key can
          // ride from here.
          body: JSON.stringify({ editCle, ...(nom !== undefined && nom !== '' ? { nom } : {}), pids }),
        });
      } catch {
        return { status: 'hors-ligne' };
      }
      const body = (await res.json().catch(() => null)) as { ok?: boolean; liste?: unknown } | null;
      if (!res.ok || body?.ok !== true) return { status: 'refus' };
      const liste = lireListeWire(body.liste);
      return liste === undefined ? { status: 'refus' } : { status: 'modifiee', liste };
    },
    async fermer(token, editCle): Promise<ListeFermeture> {
      let res: Response;
      try {
        res = await fetch(`${base}/listes/${encodeURIComponent(token)}/fermer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ editCle }),
        });
      } catch {
        return { status: 'hors-ligne' };
      }
      if (res.ok) return { status: 'fermee' };
      // The door's 404 is DELIBERATELY uniform (wrong key ≡ absent liste —
      // no oracle server-side). On HER OWN device the distinction matters:
      // a retried close must land « fermée » while a live liste must never
      // be abandoned. ONE public re-read tells them apart.
      if (res.status === 404) {
        const relu = await lire(token);
        if (relu.status === 'introuvable') return { status: 'fermee' };
      }
      return { status: 'refus' };
    },
    async cadeaux(token, editCle): Promise<ListeCadeauxLecture> {
      let res: Response;
      try {
        res = await fetch(`${base}/listes/${encodeURIComponent(token)}/cadeaux`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ editCle }),
        });
      } catch {
        return { status: 'hors-ligne' };
      }
      if (!res.ok) return { status: 'introuvable' };
      const lu = lireCadeauxWire(await res.json().catch(() => null));
      return lu === undefined ? { status: 'introuvable' } : { status: 'cadeaux', nom: lu.nom, cadeaux: lu.cadeaux };
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
    async creer(slug, nom, pids, _telephone, livraison): Promise<ListeCreation> {
      const token = mintDemoToken();
      const editCle = mintDemoToken();
      if (token === undefined || editCle === undefined) return { status: 'refus' };
      // the harness mirrors the projection: the boolean, never the address
      const liste: ListePublique = {
        nom, slug,
        articles: pids.map((pid) => ({ pid, offert: false })),
        livraison: livraison !== undefined,
      };
      held.set(token, { editCle, liste });
      return { status: 'creee', liste: { token, editCle, liste } };
    },
    async lire(token): Promise<ListeLecture> {
      const garde = held.get(token);
      return garde === undefined ? { status: 'introuvable' } : { status: 'liste', liste: garde.liste };
    },
    async modifier(token, editCle, pids, nom): Promise<ListeModification> {
      const garde = held.get(token);
      // The door's bounds this harness CAN honestly mirror: wrong key ≡
      // absent liste as ONE refusal, the 1–20 selection band, an absent nom
      // keeping the stored one, and « offert » surviving on every pid she
      // keeps (an edit rearranges wishes, it never un-gives a gift). What it
      // does NOT enforce, stated: the membership law (`pids ⊆ curatedItems`)
      // — this harness holds no catalogue, the UI only ever submits pids
      // read off rendered rows, and the REAL door's check is e2e-covered on
      // the service.
      if (garde === undefined || garde.editCle !== editCle || pids.length === 0 || pids.length > LISTE_MAX_ARTICLES) return { status: 'refus' };
      const marks = new Map(garde.liste.articles.map((a) => [a.pid, a.offert]));
      const liste: ListePublique = {
        ...garde.liste,
        ...(nom !== undefined && nom !== '' ? { nom } : {}),
        articles: pids.map((pid) => ({ pid, offert: marks.get(pid) === true })),
      };
      held.set(token, { editCle, liste });
      return { status: 'modifiee', liste };
    },
    async fermer(token, editCle): Promise<ListeFermeture> {
      const garde = held.get(token);
      // The door's law this harness CAN mirror: wrong key ≡ absent liste as
      // one refusal; a matching key deletes everything, and a RETRIED close
      // of an already-gone liste lands « fermée » (the http adapter's
      // re-read semantics, collapsed — the harness knows its own truth).
      if (garde === undefined) return { status: 'fermee' };
      if (garde.editCle !== editCle) return { status: 'refus' };
      held.delete(token);
      return { status: 'fermee' };
    },
    async cadeaux(token, editCle): Promise<ListeCadeauxLecture> {
      const garde = held.get(token);
      if (garde === undefined || garde.editCle !== editCle) return { status: 'introuvable' };
      // The harness holds no orders and can mint no provider truth, so its
      // offert marks are forever false and this list is honestly EMPTY —
      // the sheet's « pas encore de cadeau » face. The journeys and the
      // code live on the REAL service alone (e2e-covered there).
      return { status: 'cadeaux', nom: garde.liste.nom, cadeaux: [] };
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
 * reasoning: a liste is intent bound to one shop), newest wins. Since
 * LISTE-REFAIRE, redoing a liste UPDATES it in place — same token, same
 * link; the handle is only ever REPLACED by a fresh create, which happens
 * with no liste yet or from a dead handle's introuvable way-out. The favorites.ts storage law applies whole: guarded, mem
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

/** LISTE-FERMER — the handle follows the truth: a closed liste's token and
 *  edit key have nothing left to open, so the device forgets them and the
 *  card returns to the invitation. Only the CLOSE road calls this — a mere
 *  read failure never costs her the key. */
export function oublierListe(slug: string): void {
  const map = load();
  map.delete(slug);
  persist(map);
}

/** Test seam: forget the cache so a fresh load re-reads storage. */
export function resetListesCache(): void {
  mem = null;
}
