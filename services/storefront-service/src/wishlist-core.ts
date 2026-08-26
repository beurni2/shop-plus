/**
 * ═══ LISTE-ENVIES-1 — THE WISHLIST'S PURE LAW (founder order, 2026-08-25) ═══
 *
 * « a buyer creates a products wishlist … a link is created for him … his
 * friends tap that link and it opens that boutique with his wishlist to order
 * the products for him. »
 *
 * WHAT A LISTE IS, PRECISELY: a named, shareable SELECTION of one boutique's
 * own products — a first name, a slug, and up to twenty pids. It is NOT a
 * cart (the no-combined-cart law stands: every product still orders through
 * its own signed fiche), it holds NO money and NO contact, and it can cause
 * nothing: ordering rides the existing checkout road untouched.
 *
 * WHAT « OFFERT » IS, PRECISELY: provider-confirmed payment truth and nothing
 * softer (Ten Laws #2). A pid is marked offert only when an order that named
 * this liste at creation reaches its CONFIRMED transition — the webhook's
 * word, relayed by the order's own outbox wire. No screen, no tap, no
 * « j'ai payé » claim can set it.
 *
 * SHAPE DISCIPLINE — the same law as the order road: exact-key allowlists
 * that refuse unknown fields BY NAME (a caller sending an amount must learn
 * so), and charset pins wherever a value becomes a Durable Object name or
 * rides into an audit id. Schema is SERVICE-LOCAL by design: nothing here
 * touches canon `contracts/` shapes.
 */

/** The token/editCle shape as MINTED: 32 chars over the 64-symbol URL-safe
 *  alphabet (192 bits, the `mintBuyerRef` law). Used to refuse a malformed
 *  token before it becomes a DO name. */
export const LISTE_TOKEN = /^[A-Za-z0-9_-]{32}$/;

/**
 * The shape `listeRef` must have when it rides an ORDER body. Deliberately
 * WIDER than LISTE_TOKEN (any bounded URL-safe string): the order road stores
 * it and the offert wire addresses a DO with it — an unknown liste answers a
 * 200 no-op there, so a stray value costs nothing — while a pin as tight as
 * the mint would couple the order road to this module's mint length forever.
 * NOT the shared ID_ALPHABET: that one requires an alphanumeric FIRST char,
 * and a minted token may legitimately start with `_` or `-`.
 */
export const LISTE_REF = /^[A-Za-z0-9_-]{1,64}$/;

/** Her liste's name — a first name or a short phrase (« Awa », « Mariage de
 *  Rasmata »). French letters with their accents, digits, space, hyphen and
 *  both apostrophes a phone keyboard produces. Bounded at 24: a NAME, never
 *  a message field. */
export const NOM_LISTE = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9'’ -]{1,24}$/;

/** Vitrine slugs are minted lowercase (`aicha-4821`); the PWA's own path
 *  regex admits exactly this class. */
const SLUG_SHAPE = /^[a-z0-9-]{1,64}$/;

/** The id alphabet every server-minted pid already satisfies. */
const PID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,191}$/;

/** Twenty products: generous for a real gift list, small enough that the
 *  projection stays one cheap read on a 2G link. */
export const LISTE_MAX_ARTICLES = 20;

/** The wire vocabulary each public door accepts. Anything else is REFUSED by
 *  name, never ignored — the order road's own law. */
export const LISTE_CREATE_FIELDS = ['slug', 'nom', 'pids'];
export const LISTE_UPDATE_FIELDS = ['editCle', 'nom', 'pids'];

export interface ListeArticle {
  readonly pid: string;
  /** Present the moment a CONFIRMED order for this pid named the liste —
   *  first-wins forever (a gift cannot un-happen). The orderId is kept for
   *  the audit; the PUBLIC projection reduces this to a boolean. */
  readonly offert?: { readonly orderId: string; readonly at: string };
}

export interface ListeRecord {
  readonly nom: string;
  readonly slug: string;
  readonly articles: readonly ListeArticle[];
  /** sha256 hex of the creator's edit key. The plaintext is returned ONCE at
   *  create and stored nowhere — the reseller-feed code-hash law. */
  readonly editCleHash: string;
  readonly createdAt: string;
}

export type ListeValidation<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string; readonly field?: string };

/** Dedupe preserving first position — a double-tapped checkbox is one wish. */
function dedupe(pids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pid of pids) {
    if (!seen.has(pid)) {
      seen.add(pid);
      out.push(pid);
    }
  }
  return out;
}

function readPids(value: unknown): ListeValidation<string[]> {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, error: 'bad_field', field: 'pids' };
  for (const pid of value) {
    if (typeof pid !== 'string' || !PID_SHAPE.test(pid)) return { ok: false, error: 'bad_field', field: 'pids' };
  }
  const pids = dedupe(value as string[]);
  if (pids.length > LISTE_MAX_ARTICLES) return { ok: false, error: 'trop_d_articles', field: 'pids' };
  return { ok: true, value: pids };
}

export interface ListeCreateCommand {
  readonly slug: string;
  readonly nom: string;
  readonly pids: readonly string[];
}

export function validateListeCreate(body: unknown): ListeValidation<ListeCreateCommand> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'malformed' };
  const r = body as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    if (!LISTE_CREATE_FIELDS.includes(key)) return { ok: false, error: 'unknown_field', field: key };
  }
  if (typeof r['slug'] !== 'string' || !SLUG_SHAPE.test(r['slug'])) return { ok: false, error: 'bad_field', field: 'slug' };
  if (typeof r['nom'] !== 'string' || !NOM_LISTE.test(r['nom'])) return { ok: false, error: 'bad_field', field: 'nom' };
  const pids = readPids(r['pids']);
  if (!pids.ok) return pids;
  return { ok: true, value: { slug: r['slug'], nom: r['nom'], pids: pids.value } };
}

export interface ListeUpdateCommand {
  readonly editCle: string;
  /** Absent = keep the stored name. */
  readonly nom?: string;
  readonly pids: readonly string[];
}

export function validateListeUpdate(body: unknown): ListeValidation<ListeUpdateCommand> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'malformed' };
  const r = body as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    if (!LISTE_UPDATE_FIELDS.includes(key)) return { ok: false, error: 'unknown_field', field: key };
  }
  if (typeof r['editCle'] !== 'string' || !LISTE_TOKEN.test(r['editCle'])) return { ok: false, error: 'bad_field', field: 'editCle' };
  if (r['nom'] !== undefined && (typeof r['nom'] !== 'string' || !NOM_LISTE.test(r['nom']))) {
    return { ok: false, error: 'bad_field', field: 'nom' };
  }
  const pids = readPids(r['pids']);
  if (!pids.ok) return pids;
  return {
    ok: true,
    value: { editCle: r['editCle'], ...(r['nom'] !== undefined ? { nom: r['nom'] } : {}), pids: pids.value },
  };
}

/**
 * THE PUBLIC PROJECTION — the only shape a liste read ever answers. An
 * ALLOWLIST built field by field, never a spread: the record's editCleHash
 * and each mark's orderId stay inside the object, and « offert » leaves as a
 * boolean alone (a friend sees « déjà offert », never whose order did it —
 * SP-I03's customer-surface discipline applied to this new surface).
 */
export function projectListe(record: ListeRecord): {
  nom: string;
  slug: string;
  articles: { pid: string; offert: boolean }[];
} {
  return {
    nom: record.nom,
    slug: record.slug,
    articles: record.articles.map((a) => ({ pid: a.pid, offert: a.offert !== undefined })),
  };
}

/**
 * THE CREATOR'S EDIT, applied — the new selection replaces the old, and every
 * surviving pid KEEPS its offert mark: an edit rearranges wishes, it never
 * un-gives a gift.
 */
export function applyListeUpdate(record: ListeRecord, update: { nom?: string; pids: readonly string[] }): ListeRecord {
  const marks = new Map(record.articles.map((a) => [a.pid, a.offert]));
  return {
    ...record,
    nom: update.nom ?? record.nom,
    articles: update.pids.map((pid) => {
      const offert = marks.get(pid);
      return offert !== undefined ? { pid, offert } : { pid };
    }),
  };
}

/**
 * THE OFFERT MARK, applied FIRST-WINS per pid. `absent` (the pid is not on
 * the liste — edited away, or an order that predates an edit) and `already`
 * are both COMPLETE outcomes for the wire: the caller answers 200 and stops
 * retrying, because no retry can change either.
 */
export function applyOffert(
  record: ListeRecord,
  pid: string,
  orderId: string,
  at: string,
): { readonly record: ListeRecord; readonly status: 'marked' | 'already' | 'absent' } {
  const index = record.articles.findIndex((a) => a.pid === pid);
  if (index === -1) return { record, status: 'absent' };
  if (record.articles[index]!.offert !== undefined) return { record, status: 'already' };
  const articles = record.articles.map((a, i) => (i === index ? { ...a, offert: { orderId, at } } : a));
  return { record: { ...record, articles }, status: 'marked' };
}
