import {
  PlatformEventSchema,
  ResellerShortCodeSchema,
  STOREFRONT_HEADER_STYLES,
  STOREFRONT_THEMES,
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

export type RemoveItemDecision =
  | { readonly status: 'removed'; readonly storefront: Storefront }
  /** Idempotent and HONEST: a pid her shop does not hold is already the outcome
   *  she asked for, so a lost answer replayed converges quietly. */
  | { readonly status: 'not_present'; readonly storefront: Storefront }
  | { readonly status: 'absent' };

/**
 * ═══ VITRINE-RETRAIT (founder, 2026-08-11) — SHE TAKES A PRODUCT OUT ═══
 *
 * « when they delete products from their ma vitrine these products still show
 * on their boutique. »
 *
 * THE HOLE THIS FILLS, stated exactly: membership was APPEND-ONLY. `decideAddItem`
 * could put a pid in `curatedItems` and NOTHING could take it out — `applyPresentation`
 * refuses any `curatedItems` that is not a PERMUTATION of what is held (« dropping
 * one would retire a product through a reorder »), which is the right rule and
 * always was. What was missing is the act that comment names: a removal with its
 * own screen and its own words. The reseller app's « retirer » wrote to a
 * SESSION-LOCAL event log that no wire ever carried, so her boutique kept the
 * product forever and the removal itself vanished when she reopened the app.
 *
 * IT REMOVES EVERY REFERENCE, NOT ONLY THE MEMBERSHIP. A pid can also be PINNED
 * (« à la une ») and placed in a SECTION. Dropping it from `curatedItems` alone
 * would leave a pin and a section row pointing at a product the shop no longer
 * holds — the buyer projection would carry ids the catalogue cannot describe, and
 * the arrangement screens would show a slot she cannot fill. So the pin and the
 * section entries go with it, in the same decision, atomically.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH, and why:
 *   · ORDERS ALREADY PLACED. Nothing here reaches an order; taking a product off
 *     a shelf is not a statement about a sale already made. (Boutik+'s own delete
 *     tells the supplier the same thing in the same words: « Les commandes déjà
 *     passées ne changent pas. »)
 *   · HER VOICE NOTE for that pid. It is her recording, keyed by product, and the
 *     buyer surface already renders notes only for products the shop holds — so a
 *     note for an absent pid shows nobody anything, and keeping it means putting
 *     the product back restores her voice with it. Deleting a recording she made
 *     is its own act, with its own words, and this is not it.
 *   · SUPPLY. The product still exists in Boutik+; she has removed it from HER
 *     shop, not from the platform.
 *
 * An empty section is LEFT EMPTY rather than deleted: « Section supprimée » is a
 * sentence she is shown when SHE deletes one, and a removal that silently took a
 * section with it would be this act quietly performing another.
 */
export function decideRemoveItem(
  current: StorefrontEntry | undefined,
  pid: string,
  at: string,
): { decision: RemoveItemDecision; next?: StorefrontEntry } {
  if (!current) return { decision: { status: 'absent' } };
  const sf = current.storefront;
  if (!sf.curatedItems.includes(pid)) {
    return { decision: { status: 'not_present', storefront: sf } };
  }
  /**
   * THE TWO ARRAYS ARE GUARDED, and this is not defensive habit (verifier
   * MAJOR). DO storage is read RAW — nothing re-parses an entry on the way out
   * — so a shop written before `featuredItems`/`sections` existed sits there as
   * a plain object missing them. `customer-projection.ts` records the same scar
   * verbatim: « a storefront written before this deploy sits in DO storage as a
   * plain object that never re-parses on read… it is not hypothetical. » Without
   * the guard, `.filter` on `undefined` throws and the removal answers an
   * unnamed 500 — she would be told nothing at all.
   */
  const storefront: Storefront = {
    ...sf,
    curatedItems: sf.curatedItems.filter((p) => p !== pid),
    featuredItems: (sf.featuredItems ?? []).filter((p) => p !== pid),
    sections: (sf.sections ?? []).map((s) => ({ ...s, pids: (s.pids ?? []).filter((p) => p !== pid) })),
    updatedAt: at,
  };
  return { decision: { status: 'removed', storefront }, next: { ...current, storefront } };
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
  /** VITRINE-QUARTIER-1 (founder defect report 2026-08-02: « nowhere to put his
   *  zone/quartier, everything defaults to Gounghin »). Her quartier was set at
   *  CREATE and no route could ever change it. Canon `StorefrontSchema.zone` is
   *  a trimmed non-empty free string, so an EMPTY zone is refused by name here
   *  rather than dying anonymously at the canon parse. */
  readonly zone?: string;
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
  /** ENTETES-B — her chosen boutique header. Wire-shaped like `theme` (a string
   *  checked against the CANON closed set below); absent = untouched. */
  readonly headerStyle?: string;
  /**
   * ENTETES-C — her framing of the cover photograph (canon
   * `StorefrontPhotoFocusSchema`: integers 0–100, CSS object-position
   * percentages). TRI-STATE on the wire: absent = untouched · `null` = CLEAR
   * (back to the style's contract framing) · a pair = set. Presentation only —
   * loi 5 holds: no money field can ride here.
   */
  readonly coverFocus?: { readonly x: number; readonly y: number } | null;
  /** ENTETES-C — the same tri-state framing for her portrait. */
  readonly avatarFocus?: { readonly x: number; readonly y: number } | null;
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
/** VITRINE-QUARTIER-1 — a DISPLAY bound like TAGLINE_MAX, deliberately NOT a
 *  gazetteer: canon keeps `zone` a free display string and the zone list is a
 *  named FOUNDER DECISION still open (StorefrontSchema's own comment). 40
 *  holds « Gounghin, Ouagadougou » (21) with room for the long quartiers. */
const ZONE_MAX = 40;
const SECTION_NAME_MAX = 20;
const FEATURED_CAP = 2;
const SECTIONS_CAP = 4;
/**
 * THEMES-8 (founder-found, 2026-08-05: « When I select one of the new 4
 * habillages, it says pas enregistré »).
 *
 * THIS LINE WAS A HAND-COPIED `new Set(['laterite','danfani','indigo','foret'])`
 * — and the comment immediately below it, written for the header set, already
 * named the rule it broke: « the CANON closed set, IMPORTED, never a
 * hand-copied list ». Canon grew to eight presets, this copy did not, and the
 * service answered `unknown_theme` for every one of the four new habillages.
 * The seller saw « Pas enregistré » and had no idea why.
 *
 * IMPORTED NOW, exactly like the headers beside it: the service refuses exactly
 * what canon refuses, by construction, and a ninth preset needs no edit here.
 */
const THEMES: ReadonlySet<string> = new Set<string>(STOREFRONT_THEMES);
/** ENTETES-B — the CANON closed set, imported, never a hand-copied list: the
 *  service refuses exactly what canon refuses, by construction. */
const HEADER_STYLES: ReadonlySet<string> = new Set<string>(STOREFRONT_HEADER_STYLES);

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
  const zone = patch.zone?.trim();
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
  // A shop must keep a quartier (canon: trimmed non-empty) — refused by NAME so
  // her screen can say so, never the anonymous canon-parse fallback.
  if (zone !== undefined && zone.length === 0) {
    return { decision: { status: 'refused', reason: 'zone_required' } };
  }
  if (zone !== undefined && zone.length > ZONE_MAX) {
    return { decision: { status: 'refused', reason: 'zone_too_long' } };
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
  if (patch.headerStyle !== undefined && !HEADER_STYLES.has(patch.headerStyle)) {
    return { decision: { status: 'refused', reason: 'unknown_header_style' } };
  }
  // ENTETES-C — a SET pair must be canon-shaped BEFORE the merge: integers,
  // 0–100, both axes (one reason for both fields — the screen says the same
  // true thing either way). `null` is the CLEAR order and is always well-formed.
  const validFocus = (f: { readonly x: number; readonly y: number } | null | undefined): boolean =>
    f === undefined ||
    f === null ||
    (typeof f === 'object' &&
      Number.isInteger(f.x) && f.x >= 0 && f.x <= 100 &&
      Number.isInteger(f.y) && f.y >= 0 && f.y <= 100);
  if (!validFocus(patch.coverFocus) || !validFocus(patch.avatarFocus)) {
    return { decision: { status: 'refused', reason: 'bad_focus' } };
  }
  // Framing NOTHING is a lie on her screen: a SET requires the photo it frames.
  // (CLEAR is always allowed — removing a stale framing needs no photo.)
  const hasCoverPhoto = sf.cover.status !== 'none' && typeof sf.cover.url === 'string' && sf.cover.url !== '';
  const hasAvatarPhoto = sf.avatar.mode === 'photo' && typeof sf.avatar.url === 'string' && sf.avatar.url !== '';
  if (patch.coverFocus != null && !hasCoverPhoto) {
    return { decision: { status: 'refused', reason: 'no_photo_to_frame' } };
  }
  if (patch.avatarFocus != null && !hasAvatarPhoto) {
    return { decision: { status: 'refused', reason: 'no_photo_to_frame' } };
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

  // ENTETES-C — the tri-state merge. SET builds a CLEAN pair (only x and y, so
  // an extra wire key can never reach the store); CLEAR builds the sub-object
  // WITHOUT the key (never `focus: undefined` — canon is `.strict()` and JSON
  // round-trips must stay byte-stable); absent leaves the sub-object untouched.
  const withFocus = <T extends { readonly focus?: { readonly x: number; readonly y: number } | undefined }>(
    part: T,
    order: { readonly x: number; readonly y: number } | null | undefined,
  ): T => {
    if (order === undefined) return part;
    const { focus: _cleared, ...rest } = part;
    return order === null ? (rest as T) : ({ ...rest, focus: { x: order.x, y: order.y } } as T);
  };

  const merged = {
    ...sf,
    ...(name !== undefined ? { name } : {}),
    ...(tagline !== undefined ? { tagline } : {}),
    ...(bio !== undefined ? { bio } : {}),
    ...(zone !== undefined ? { zone } : {}),
    ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
    ...(patch.featuredItems !== undefined ? { featuredItems: [...patch.featuredItems] } : {}),
    ...(sections !== undefined ? { sections } : {}),
    ...(patch.curatedItems !== undefined ? { curatedItems: [...patch.curatedItems] } : {}),
    ...(patch.headerStyle !== undefined ? { headerStyle: patch.headerStyle } : {}),
    ...(patch.coverFocus !== undefined ? { cover: withFocus(sf.cover, patch.coverFocus) } : {}),
    ...(patch.avatarFocus !== undefined ? { avatar: withFocus(sf.avatar, patch.avatarFocus) } : {}),
  };

  // NOTHING REALLY CHANGED ⇒ no write, no updatedAt move. Compared field by
  // field (never a stringify of the whole object): a key-order accident must not
  // read as a change, and a real change must not hide behind one.
  const same =
    merged.name === sf.name &&
    merged.tagline === sf.tagline &&
    merged.bio === sf.bio &&
    merged.zone === sf.zone &&
    merged.theme === sf.theme &&
    merged.headerStyle === sf.headerStyle &&
    // ENTETES-C — tiny objects, spread-built from the stored sub-object, so the
    // key order is stable and a stringify compares values, never accidents.
    JSON.stringify(merged.cover) === JSON.stringify(sf.cover) &&
    JSON.stringify(merged.avatar) === JSON.stringify(sf.avatar) &&
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
  | { readonly status: 'absent' }
  | { readonly status: 'refused'; readonly reason: 'url_not_absolute' };

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
 *
 * ═══ MEDIA-2 — A RELATIVE URL IS REFUSED HERE, NOT MERELY AVOIDED IN CONFIG ═══
 *
 * `MEDIA_PUBLIC_BASE` shipped empty, so the stored URL was `/media/{key}`: React
 * Native's <Image> cannot resolve a relative URI, and a browser resolved it
 * against the PWA's own origin and 404'd. Setting the var fixes today; refusing
 * the shape here means an empty var can never silently re-break it — the record
 * simply cannot hold an address a client is unable to fetch. The canon schema
 * does not enforce this (`url` is `z.string().min(1)`), so it is enforced here.
 */
export function decideSetMedia(
  current: StorefrontEntry | undefined,
  kind: 'cover' | 'avatar',
  url: string,
  at: string,
): { decision: SetMediaDecision; next?: StorefrontEntry } {
  if (!current) return { decision: { status: 'absent' } };
  if (!/^https?:\/\//.test(url)) {
    return { decision: { status: 'refused', reason: 'url_not_absolute' } };
  }
  const sf = current.storefront;
  // ENTETES-C — a NEW photo starts UNFRAMED (the canon comment is the law: a
  // stale framing must never crop a new photo). The sub-object is rebuilt from
  // scratch here, so any existing `focus` on THIS kind is dropped by
  // construction; the OTHER kind's framing is untouched.
  const merged =
    kind === 'cover'
      ? { ...sf, cover: { status: 'live' as const, url }, updatedAt: at }
      : { ...sf, avatar: { mode: 'photo' as const, url }, updatedAt: at };
  const storefront = StorefrontSchema.parse(merged);
  return { decision: { status: 'set', storefront }, next: { ...current, storefront } };
}

/* ----------------------------------------------------- VOIX-PRODUIT ----- */

export type SetVoiceNoteDecision =
  | { readonly status: 'set'; readonly storefront: Storefront }
  | { readonly status: 'absent' }
  | { readonly status: 'refused'; readonly reason: 'url_not_absolute' | 'pid_blank' | 'duration_invalid' };

/**
 * HER VOICE NOTE ON ONE PRODUCT — written BY THE SERVICE, never by the app.
 *
 * Same law as the cover (PUBLISH-PRICE-1 applied to media): the app hands over
 * BYTES; the address of what was stored is the service's to author. There is no
 * patch field an app could use to claim a note it never uploaded.
 *
 * WHY A SECOND FUNCTION AND NOT AN OVERLOAD OF `decideSetMedia`: a voice note
 * needs a `pid` and a `durationMs` that are meaningless for a cover, and it
 * writes a different field. Threading two optional arguments through the photo
 * path so one caller can ignore them would make both harder to read than
 * keeping them apart.
 *
 * `ready`, NOT `pending`, AND THAT IS DELIBERATE. This is reachable only from a
 * completed upload of sniffed, bounded, stored bytes, and `REQUIRES_REVIEW.voice`
 * is false — exactly the condition under which a cover becomes `live`. `pending`
 * is the PHONE's honest state while the bytes are in flight (loi 7: queued is
 * pending, never done); once the service holds them and can address them, the
 * note is playable and saying otherwise would be its own small lie.
 *
 * A RELATIVE URL IS REFUSED HERE, not merely avoided in config — the MEDIA-2
 * lesson, applied to audio: React Native cannot resolve a relative URI and a
 * browser resolves it against the wrong origin, so the record simply cannot
 * hold an address a client is unable to fetch.
 *
 * REPLACEMENT IS THE ONLY UPDATE. Re-recording overwrites this pid's note; the
 * other pids' notes are untouched by construction. There is no remove path
 * here, and one is not faked — MEDIA-2's « Retirer la couverture » removed
 * nothing and lied about it, and that is not repeated.
 */
export function decideSetVoiceNote(
  current: StorefrontEntry | undefined,
  pid: string,
  url: string,
  durationMs: number,
  at: string,
): { decision: SetVoiceNoteDecision; next?: StorefrontEntry } {
  if (!current) return { decision: { status: 'absent' } };
  if (pid.trim() === '') return { decision: { status: 'refused', reason: 'pid_blank' } };
  if (!/^https?:\/\//.test(url)) {
    return { decision: { status: 'refused', reason: 'url_not_absolute' } };
  }
  if (!Number.isInteger(durationMs) || durationMs < 0) {
    return { decision: { status: 'refused', reason: 'duration_invalid' } };
  }
  const sf = current.storefront;
  const storefront = StorefrontSchema.parse({
    ...sf,
    productNotes: { ...sf.productNotes, [pid]: { status: 'ready' as const, url, durationMs } },
    updatedAt: at,
  });
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
