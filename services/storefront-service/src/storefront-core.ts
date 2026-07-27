import {
  PlatformEventSchema,
  ResellerShortCodeSchema,
  StorefrontSchema,
  shortCodeToSlug,
  type PlatformEvent,
  type Storefront,
} from '@platform/contracts';

/**
 * STOREFRONT DECISION CORE (STOREFRONT-READ-PATH-1). The pure per-storefront
 * transition, extracted so ONE decision logic serves both substrates — the
 * in-memory registry (CI) and the per-storefront Durable Object (prod) — exactly
 * as the attribution lock keeps `decideLock` and the reservation keeps
 * `decideReservation` pure and shared. The DO cannot import a `Map`; it imports
 * these functions and applies them to `this.state.storage`. No arithmetic on any
 * amount lives here — this is identity/discoverability, never money.
 *
 * An `entry` is the serialisable per-storefront state: the canon Storefront plus
 * the create command id (idempotency) and the aggregate version (bumps only on a
 * real discoverability change — the directory's ordering truth, SP#001-B). Every
 * `decide*` returns the DECISION (the caller returns to its caller) and, when the
 * state really changed, the `next` entry to PERSIST (Map.set here, storage.put in
 * the DO). No `next` = nothing to write (idempotent / unchanged / collision).
 */

export interface CreateStorefrontCommand {
  readonly commandId: string;
  readonly id: string;
  readonly resellerId: string;
  /** Validated to `ResellerShortCodeSchema`; the canon `slug` is DERIVED from it. */
  readonly shortCode: string;
  readonly name: string;
  readonly zone: string;
  readonly category: string;
  readonly correlationId: string;
  readonly at: string;
}

export type CreateDecision =
  | { readonly status: 'created'; readonly storefront: Storefront; readonly event: PlatformEvent }
  | { readonly status: 'idempotent'; readonly storefront: Storefront }
  | { readonly status: 'collision'; readonly existing: Storefront };

export type ToggleDecision =
  | { readonly status: 'changed'; readonly storefront: Storefront; readonly event: PlatformEvent }
  | { readonly status: 'unchanged'; readonly storefront: Storefront }
  | { readonly status: 'absent' };

/** The serialisable per-storefront durable state (one per idFromName(id)). */
export interface StorefrontEntry {
  readonly storefront: Storefront;
  readonly createCommandId: string;
  /** Aggregate version — bumps on each real discoverability change. */
  readonly version: number;
}

export class StorefrontShortCodeError extends Error {
  override readonly name = 'StorefrontShortCodeError';
}

/** The bare canon slug (`seller-0001`) DERIVED from a valid short code, shape enforced. */
export function slugFromShortCode(shortCode: string): string {
  const parsed = ResellerShortCodeSchema.safeParse(shortCode);
  if (!parsed.success) {
    throw new StorefrontShortCodeError(`invalid reseller short code: ${JSON.stringify(shortCode)}`);
  }
  // shortCodeToSlug → `/v/seller-0001`; the storefront `slug` is the bare tail.
  return shortCodeToSlug(parsed.data).replace(/^\/v\//, '');
}

function createdEvent(sf: Storefront, correlationId: string): PlatformEvent {
  return PlatformEventSchema.parse({
    name: 'storefront.created.v1',
    envelope: {
      command_id: `sf-create-${sf.id}`,
      correlation_id: correlationId,
      aggregateVersion: 1,
      actor: 'storefront-service:aggregate',
      serverTime: sf.createdAt,
      version: '1',
    },
    payload: {
      storefront_id: sf.id,
      reseller_id: sf.resellerId,
      slug: sf.slug,
      name: sf.name,
      zone: sf.zone,
      category: sf.category,
    },
  });
}

function publishedEvent(sf: Storefront, correlationId: string, at: string, seq: number): PlatformEvent {
  return PlatformEventSchema.parse({
    name: 'storefront.published.v1',
    envelope: {
      command_id: `sf-publish-${sf.id}-${seq}`,
      correlation_id: correlationId,
      aggregateVersion: seq,
      actor: 'storefront-service:aggregate',
      serverTime: at,
      version: '1',
    },
    payload: {
      storefront_id: sf.id,
      discoverable: sf.discoverable,
    },
  });
}

/**
 * CREATE — idempotent on the create command_id; a different command_id can never
 * re-create an existing storefront (collision, surfaced). A first create derives
 * the slug (shape-enforced or throws) and builds the canon Storefront
 * (discoverable=false — a real publish makes it discoverable).
 */
export function decideCreate(
  current: StorefrontEntry | undefined,
  cmd: CreateStorefrontCommand,
): { decision: CreateDecision; next?: StorefrontEntry } {
  if (current) {
    if (current.createCommandId === cmd.commandId) {
      return { decision: { status: 'idempotent', storefront: current.storefront } };
    }
    return { decision: { status: 'collision', existing: current.storefront } };
  }
  const slug = slugFromShortCode(cmd.shortCode); // shape-enforced or throws
  const storefront: Storefront = StorefrontSchema.parse({
    id: cmd.id,
    resellerId: cmd.resellerId,
    slug,
    discoverable: false,
    curatedItems: [],
    name: cmd.name,
    zone: cmd.zone,
    category: cmd.category,
    createdAt: cmd.at,
    updatedAt: cmd.at,
  });
  const next: StorefrontEntry = { storefront, createCommandId: cmd.commandId, version: 1 };
  return { decision: { status: 'created', storefront, event: createdEvent(storefront, cmd.correlationId) }, next };
}

/**
 * TOGGLE discoverability. Absent → surfaced (never a phantom write). No real
 * change → unchanged (no event, `updatedAt` untouched). A real change bumps the
 * version, moves `updatedAt`, and fires `storefront.published.v1` ONCE.
 */
export function decideToggle(
  current: StorefrontEntry | undefined,
  discoverable: boolean,
  correlationId: string,
  at: string,
): { decision: ToggleDecision; next?: StorefrontEntry } {
  if (!current) return { decision: { status: 'absent' } };
  if (current.storefront.discoverable === discoverable) {
    return { decision: { status: 'unchanged', storefront: current.storefront } };
  }
  const version = current.version + 1;
  const storefront: Storefront = { ...current.storefront, discoverable, updatedAt: at };
  const next: StorefrontEntry = { storefront, createCommandId: current.createCommandId, version };
  return { decision: { status: 'changed', storefront, event: publishedEvent(storefront, correlationId, at, version) }, next };
}

/* ------------------------------------------ REAL-PRODUCT-RENDER-1 (a2) -- */

export type AddItemDecision =
  | { readonly status: 'added'; readonly storefront: Storefront }
  | { readonly status: 'already_present'; readonly storefront: Storefront }
  | { readonly status: 'absent' };

/**
 * MEMBERSHIP — publishing a listing puts its product IN her shop (founder ruling).
 *
 * `curatedItems` is the canon, buyer-facing MEMBERSHIP statement — what is in her
 * shop — and it is authoritative for the buyer. Curation (the « à la une et ordre »
 * screen) is about ARRANGEMENT over the articles already present, not about
 * membership: a seller who publishes a product and then finds an empty shop, with a
 * second screen to hunt for, is a design failure.
 *
 * APPEND-IF-ABSENT, POSITION PRESERVED. A pid already present is left exactly where
 * it is and reports `already_present` — republishing must never silently rearrange a
 * shop she arranged. Appending is the ONLY mutation here: nothing reorders, nothing
 * removes, and `updatedAt` moves only on a real change.
 */
export function decideAddItem(
  current: StorefrontEntry | undefined,
  pid: string,
  at: string,
): { decision: AddItemDecision; next?: StorefrontEntry } {
  if (!current) return { decision: { status: 'absent' } };
  if (current.storefront.curatedItems.includes(pid)) {
    return { decision: { status: 'already_present', storefront: current.storefront } };
  }
  const storefront: Storefront = {
    ...current.storefront,
    curatedItems: [...current.storefront.curatedItems, pid], // appended, never reordered
    updatedAt: at,
  };
  return { decision: { status: 'added', storefront }, next: { ...current, storefront } };
}

/* ------------------------------------------ PERSONNALISER-REAL-1 -------- */

/**
 * THE PRESENTATION SHE OWNS. Every field here is loi-5 PRESENTATION: a name, a
 * tagline, a bio, a habillage, what she pins, how she groups. Nothing in this
 * patch can reach a price, a net, an attribution or the signed link — the money
 * fields are not in the shape, so they are unrepresentable rather than merely
 * unsent (the `PublishListingRequest` precedent).
 *
 * Every field is OPTIONAL and absent means UNTOUCHED, never cleared: the K
 * screens save one thing at a time (K2 identity, K4 habillage, K5 à la une, K6
 * sections), and a patch that silently blanked what it did not mention would
 * lose her work on every save.
 */
export interface IdentityPatch {
  readonly name?: string;
  readonly tagline?: string;
  readonly bio?: string;
  readonly theme?: string;
  readonly featuredItems?: readonly string[];
  readonly sections?: readonly { readonly id: string; readonly name: string; readonly pids: readonly string[] }[];
  /**
   * HER ARRANGEMENT — REORDER ONLY, never membership (verifier finding).
   *
   * K5's ▲▼ writes `curatedItems`, and leaving it out of the patch made that one
   * control a SILENT no-op: she reordered, saw it applied, and lost it on leaving
   * — the exact defect this slice exists to kill, surviving on one path.
   *
   * But `curatedItems` is the canon MEMBERSHIP statement: publishing a listing
   * appends to it, auto-hide never touches it. So this route accepts a
   * PERMUTATION of the current items and nothing else — same members, new order.
   * A patch that would add or drop a pid is REFUSED, because membership is earned
   * by publishing and lost by a deliberate act on its own screen, never by a
   * reorder that happens to arrive short.
   */
  readonly curatedItems?: readonly string[];
}

export type SaveIdentityDecision =
  | { readonly status: 'saved'; readonly storefront: Storefront }
  | { readonly status: 'unchanged'; readonly storefront: Storefront }
  | { readonly status: 'absent' }
  | { readonly status: 'refused'; readonly reason: string };

/** §3.1 bounds — enforced HERE, at the authority, not only at the edit boundary.
 *  A service that stores must bound: an app is one client of many, and the app's
 *  own limits stop existing the moment a second caller shows up (MONEY-SHAPE-1's
 *  lesson, applied to presentation). */
const NAME_MIN = 3;
const NAME_MAX = 24;
const TAGLINE_MAX = 40;
const BIO_MAX = 160;
const SECTION_NAME_MAX = 20;
const FEATURED_CAP = 2;
const SECTIONS_CAP = 4;
const THEMES: ReadonlySet<string> = new Set(['laterite', 'danfani', 'indigo', 'foret']);

/**
 * SAVE HER PRESENTATION. Absent → surfaced (never a phantom write). No real
 * change → `unchanged`, and `updatedAt` does NOT move — the same discipline
 * `decideToggle` holds, so the directory's ordering truth never drifts on a
 * no-op save. A real change writes the canon Storefront through
 * `StorefrontSchema`, so a patch that would produce a non-canon shape is
 * REFUSED with its reason rather than persisted and discovered later.
 */
export function decideSaveIdentity(
  current: StorefrontEntry | undefined,
  patch: IdentityPatch,
  at: string,
): { decision: SaveIdentityDecision; next?: StorefrontEntry } {
  if (!current) return { decision: { status: 'absent' } };
  const sf = current.storefront;

  // TRIM FIRST (verifier finding). Canon's string type is a REGEX that refuses
  // surrounding whitespace, not a trimming transform — so « Chez Bernard » with a
  // trailing space (one keystroke away on any phone keyboard) cleared every bound
  // and then died at the canon parse, surfacing as « réessayez dans un moment »,
  // advice that could never work. Trimming is what she meant, and it is what
  // canon requires; the trimmed value is what gets stored.
  const name = patch.name?.trim();
  const tagline = patch.tagline?.trim();
  const bio = patch.bio?.trim();
  const sections = patch.sections?.map((s) => ({ ...s, name: s.name.trim(), pids: [...s.pids] }));

  // Bounds next, each refusal NAMED: « votre nom est trop court » and « vous
  // avez déjà 2 articles à la une » need different words on her screen.
  if (name !== undefined && name.length < NAME_MIN) {
    return { decision: { status: 'refused', reason: 'name_too_short' } };
  }
  if (name !== undefined && name.length > NAME_MAX) {
    return { decision: { status: 'refused', reason: 'name_too_long' } };
  }
  if (tagline !== undefined && tagline.length > TAGLINE_MAX) {
    return { decision: { status: 'refused', reason: 'tagline_too_long' } };
  }
  if (bio !== undefined && bio.length > BIO_MAX) {
    return { decision: { status: 'refused', reason: 'bio_too_long' } };
  }
  // A SECTION NAME IS HERS TOO — bounded and named here rather than collapsing
  // into the anonymous `not_canon_shape` the canon parse would give it. An empty
  // one is refused as its own reason: mid-retype she should not be told to retry.
  if (sections !== undefined && sections.some((s) => s.name.length === 0)) {
    return { decision: { status: 'refused', reason: 'section_name_empty' } };
  }
  if (sections !== undefined && sections.some((s) => s.name.length > SECTION_NAME_MAX)) {
    return { decision: { status: 'refused', reason: 'section_name_too_long' } };
  }
  if (patch.theme !== undefined && !THEMES.has(patch.theme)) {
    return { decision: { status: 'refused', reason: 'unknown_theme' } };
  }
  if (patch.featuredItems !== undefined && patch.featuredItems.length > FEATURED_CAP) {
    return { decision: { status: 'refused', reason: 'featured_over_cap' } };
  }
  if (sections !== undefined && sections.length > SECTIONS_CAP) {
    return { decision: { status: 'refused', reason: 'sections_over_cap' } };
  }
  // REORDER, NEVER MEMBERSHIP: the patch's curatedItems must be a permutation of
  // what she already has. Adding a pid here would list a product no publish ever
  // signed; dropping one would retire a product through a reorder. Both are acts
  // that belong to their own screens, with their own words.
  if (patch.curatedItems !== undefined) {
    const asked = [...patch.curatedItems].sort();
    const held = [...sf.curatedItems].sort();
    const isPermutation = asked.length === held.length && asked.every((pid, i) => pid === held[i]);
    if (!isPermutation) return { decision: { status: 'refused', reason: 'curation_not_a_reorder' } };
  }

  const merged = {
    ...sf,
    ...(name !== undefined ? { name } : {}),
    ...(tagline !== undefined ? { tagline } : {}),
    ...(bio !== undefined ? { bio } : {}),
    ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
    ...(patch.featuredItems !== undefined ? { featuredItems: [...patch.featuredItems] } : {}),
    ...(sections !== undefined ? { sections } : {}),
    ...(patch.curatedItems !== undefined ? { curatedItems: [...patch.curatedItems] } : {}),
  };

  // NOTHING REALLY CHANGED ⇒ no write, no updatedAt move. Compared field by
  // field (never a stringify of the whole object): a key-order accident must not
  // read as a change, and a real change must not hide behind one.
  const same =
    merged.name === sf.name &&
    merged.tagline === sf.tagline &&
    merged.bio === sf.bio &&
    merged.theme === sf.theme &&
    JSON.stringify(merged.featuredItems) === JSON.stringify(sf.featuredItems) &&
    JSON.stringify(merged.curatedItems) === JSON.stringify(sf.curatedItems) &&
    JSON.stringify(merged.sections) === JSON.stringify(sf.sections);
  if (same) return { decision: { status: 'unchanged', storefront: sf } };

  let storefront: Storefront;
  try {
    storefront = StorefrontSchema.parse({ ...merged, updatedAt: at });
  } catch {
    // The canon schema is the last word on shape. A refusal she can retry beats
    // a stored storefront the buyer read path would later choke on.
    return { decision: { status: 'refused', reason: 'not_canon_shape' } };
  }
  return { decision: { status: 'saved', storefront }, next: { ...current, storefront } };
}

/* ------------------------------------------ PERSONNALISER-MEDIA-1 ------- */

export type SetMediaDecision =
  | { readonly status: 'set'; readonly storefront: Storefront }
  | { readonly status: 'absent' };

/**
 * HER COVER / HER AVATAR — the URL is written BY THE SERVICE, never by the app.
 *
 * The same law the price obeys (PUBLISH-PRICE-1): the app may hand over BYTES,
 * the thing it genuinely owns, and the service decides what address those bytes
 * live at. If the app could patch `cover.url`, it could point her shop's cover at
 * any URL on the internet without uploading anything — so the field is not in
 * `IdentityPatch` at all, and this decision is reachable ONLY from a completed
 * upload of validated bytes.
 *
 * `cover` carries the canon status; `avatar` flips to `photo` mode. Absent
 * storefront → surfaced, never a phantom write.
 */
export function decideSetMedia(
  current: StorefrontEntry | undefined,
  kind: 'cover' | 'avatar',
  url: string,
  at: string,
): { decision: SetMediaDecision; next?: StorefrontEntry } {
  if (!current) return { decision: { status: 'absent' } };
  const sf = current.storefront;
  const merged =
    kind === 'cover'
      ? { ...sf, cover: { status: 'live' as const, url }, updatedAt: at }
      : { ...sf, avatar: { mode: 'photo' as const, url }, updatedAt: at };
  const storefront = StorefrontSchema.parse(merged);
  return { decision: { status: 'set', storefront }, next: { ...current, storefront } };
}

/* --------------------------------------------- STOREFRONT-DELETE-1 ------ */

export type DeleteDecision =
  | { readonly status: 'deleted'; readonly slug: string }
  | { readonly status: 'absent' };

/**
 * DELETE — the operator cleanup act (the route this was built for: the two
 * orphan live shops created before the DELETE surface existed). Absent →
 * surfaced, never a phantom success. Deleted carries the SLUG so the caller can
 * clear the slug pointer — the entry is the only place the slug is known.
 *
 * DELIBERATELY EVENT-FREE: canon names no `storefront.deleted.v1`, and canon
 * event names are not invented here (a §7 stop if one is ever wanted). Listing
 * cleanup is likewise OUT of this decision: a deleted shop's reads die at the
 * slug (`getBySlug` → honest 404), so anything a listing points at is already
 * unreachable — and the orphans this serves have no listings at all.
 */
export function decideDelete(current: StorefrontEntry | undefined): { decision: DeleteDecision; erase: boolean } {
  if (!current) return { decision: { status: 'absent' }, erase: false };
  return { decision: { status: 'deleted', slug: current.storefront.slug }, erase: true };
}
