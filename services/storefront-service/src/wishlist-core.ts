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

import { whatsappDigits } from './customer-projection.js';

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
 *  name, never ignored — the order road's own law. LISTE-MERCI added the
 *  optional `telephone` to the CREATE: the creator's WhatsApp opt-in.
 *  LISTE-ADRESSE added the optional `livraison`: her private delivery info. */
export const LISTE_CREATE_FIELDS = ['slug', 'nom', 'pids', 'telephone', 'livraison'];
export const LISTE_UPDATE_FIELDS = ['editCle', 'nom', 'pids'];

/**
 * ═══ LISTE-ADRESSE-1 — HER PRIVATE DELIVERY INFO (founder order, 2026-08-27) ═══
 *
 * « put his delivery informations … and keep it private in the background so
 * that if a friend decides to buy an item for him he only proceeds with the
 * payment only … and the friend buying the item never sees the delivery
 * information. »
 *
 * The four exact keys, each mirroring the law of the field it will become:
 *  · `telephone` / `quartier` / `repere` — the BuyerContact laws verbatim
 *    (phone non-empty ≤32, quartier non-empty ≤120, repère ≤200 and may be
 *    ''): at order time these BECOME the order's dispatch contact, so a value
 *    the contact door would refuse must refuse HERE, at her own door, loudly.
 *  · `zone` — the exact `zoneTo` string the fiche's own checkout would have
 *    composed (« {quartier}, {ville} », bounded to the quote road's 128).
 *    The VITRINE composes it exactly as the fiche does for any buyer — the
 *    same trust model as the normal road, where the payer names their
 *    destination. The quote router prices the friend's gift FROM this value,
 *    and the order door refuses any quote whose zone disagrees with it.
 *
 * PRIVACY: stored on the record, NEVER on `projectListe` (which says only
 * `livraison: true` — a boolean, like « offert »). Its exits are internal:
 * the quote router reads the zone to price, the order door reads the whole
 * to attach the contact. No public route serves any byte of it.
 */
export interface ListeLivraison {
  readonly telephone: string;
  readonly quartier: string;
  readonly repere: string;
  readonly zone: string;
}

export function readListeLivraison(value: unknown): ListeLivraison | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const allowed = new Set(['telephone', 'quartier', 'repere', 'zone']);
  for (const key of Object.keys(r)) {
    if (!allowed.has(key)) return null;
  }
  const telephone = r['telephone'];
  const quartier = r['quartier'];
  const repere = r['repere'];
  const zone = r['zone'];
  if (typeof telephone !== 'string' || telephone.trim() === '' || telephone.length > 32) return null;
  if (typeof quartier !== 'string' || quartier.trim() === '' || quartier.length > 120) return null;
  if (typeof repere !== 'string' || repere.length > 200) return null;
  if (typeof zone !== 'string' || zone.trim() === '' || zone.length > 128) return null;
  return { telephone, quartier, repere, zone };
}

/** What a telephone may look like ON THE WIRE before normalisation: digits
 *  with the separators a phone keyboard produces. The stored value is the
 *  `whatsappDigits` normal form, decided at validation — a number that
 *  function cannot vouch for is REFUSED at create (bad_field), because the
 *  one thing it will ever become is a wa.me link, and a dead WhatsApp link
 *  on the purchaser's screen is the failure CONTACT-WHATSAPP-1 banned. */
export const TELEPHONE_WIRE = /^[+\d][\d\s.\-()]{0,31}$/;

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
  /**
   * LISTE-MERCI — the creator's WhatsApp opt-in: her number in wa.me digit
   * form (`whatsappDigits` normalised at create). PRESENT = she asked to be
   * told when a wish is granted; ABSENT = she did not, and no road serves a
   * number. It NEVER rides `projectListe` — the public link is passed hand
   * to hand, and a phone on it would be harvestable. Its one exit is the
   * order's own buyer-token-gated merci read, served only to a purchaser
   * whose payment is provider-confirmed.
   */
  readonly notification?: { readonly telephone: string };
  /**
   * LISTE-ADRESSE — her private delivery info (see `readListeLivraison`).
   * PRESENT = a friend's gift attaches it in the background and their
   * checkout never asks for an address; ABSENT = the friend fills delivery
   * as any buyer would. Never on `projectListe` beyond the bare boolean.
   */
  readonly livraison?: ListeLivraison;
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
  /** LISTE-MERCI — the opt-in number, already in wa.me digit form. Absent =
   *  no opt-in; the record stores no number and no road serves one. */
  readonly telephone?: string;
  /** LISTE-ADRESSE — her private delivery info. Absent = none stored. */
  readonly livraison?: ListeLivraison;
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
  // LISTE-MERCI — a PRESENT telephone must normalise to wa.me digits or the
  // create refuses BY NAME: the only thing this value will ever become is a
  // WhatsApp link, and a number `whatsappDigits` cannot vouch for would be a
  // dead link on the purchaser's screen (the CONTACT-WHATSAPP-1 law, applied
  // loudly at the door instead of silently at render).
  let telephone: string | undefined;
  if (r['telephone'] !== undefined && r['telephone'] !== null && r['telephone'] !== '') {
    if (typeof r['telephone'] !== 'string' || !TELEPHONE_WIRE.test(r['telephone'])) {
      return { ok: false, error: 'bad_field', field: 'telephone' };
    }
    telephone = whatsappDigits(r['telephone']);
    if (telephone === undefined) return { ok: false, error: 'bad_field', field: 'telephone' };
  }
  // LISTE-ADRESSE — a PRESENT livraison must satisfy every law of the contact
  // it will become, or the create refuses BY NAME at her own door (the
  // CONTACT-WHATSAPP-1 posture: loudly now, never a dead delivery later).
  let livraison: ListeLivraison | undefined;
  if (r['livraison'] !== undefined && r['livraison'] !== null) {
    const lue = readListeLivraison(r['livraison']);
    if (lue === null) return { ok: false, error: 'bad_field', field: 'livraison' };
    livraison = lue;
  }
  return {
    ok: true,
    value: {
      slug: r['slug'],
      nom: r['nom'],
      pids: pids.value,
      ...(telephone !== undefined ? { telephone } : {}),
      ...(livraison !== undefined ? { livraison } : {}),
    },
  };
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
  livraison: boolean;
} {
  return {
    nom: record.nom,
    slug: record.slug,
    articles: record.articles.map((a) => ({ pid: a.pid, offert: a.offert !== undefined })),
    // LISTE-ADRESSE — WHETHER an address exists, never a byte of it: the
    // friend's checkout needs only the road decision (pay-only vs fill
    // delivery), exactly as « offert » leaves as a bare boolean.
    livraison: record.livraison !== undefined,
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
 * ═══ LISTE-CADEAUX — HER GIFTS, FOR HER EYES ONLY (founder order, 2026-08-27) ═══
 *
 * The offert marks' orderIds, which `projectListe` deliberately withholds
 * from the PUBLIC read, projected for exactly ONE caller: the edit-key-gated
 * cadeaux door. The edit key is the creator's own credential (192 bits, hash
 * -compared inside the object), so what the public projection hides from the
 * passed-around link is exactly what this one shows to the person who made
 * the liste — the same fact, two audiences, decided by the key.
 */
export function listeCadeaux(record: ListeRecord): { pid: string; orderId: string }[] {
  const out: { pid: string; orderId: string }[] = [];
  for (const a of record.articles) {
    if (a.offert !== undefined) out.push({ pid: a.pid, orderId: a.offert.orderId });
  }
  return out;
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
