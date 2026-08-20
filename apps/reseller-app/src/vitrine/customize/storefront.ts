/**
 * PERSONNALISATION (K screens) — the §3.1 Storefront state + §4.3 actions.
 *
 * THE CANON LINE: slug/name/zone/public/curatedItems EXIST in platform
 * contracts (§5.6); tagline/bio/cover/avatar.photo/theme/sections/
 * featuredItems are the 7 net-new fields — canon 1.1.0 is IN REVIEW, so this
 * local shape is §3.1 verbatim and the pin lands as a SWAP, not a rebuild.
 * It mirrors the buyer PWA's `src/vitrine/profile.ts` byte-for-byte on field
 * names, bounds and defaults — one shape, two apps, zero drift by intent.
 *
 * FLAG STOREFRONT-MEDIA-BACKING: upload/hosting and « vérification Séra » DO
 * NOT exist. The K3 cycle none→uploading(1 400 ms)→pending(2 600 ms)→live is
 * the §4.4 DEMO simulation, honestly labelled; the real media backend swaps
 * the adapter, never this state shape.
 *
 * Personnalisation is PRESENTATION ONLY (loi 5): nothing here can touch a
 * price, a net, an attribution, or the signed link. System-locked: slug/QR,
 * prix signés, badge vérifié, protections, réputation, avis.
 */

/**
 * THEMES-8 (canon v3.9.0, founder order 2026-08-05: « add 4 more nice and
 * beautiful habillage colors and make sure there is a light pink in it »).
 *
 * MIRRORED from the buyer's `vitrine/themes.ts` byte-for-byte on the four token
 * values — one shape, two apps, zero drift by intent (same law as the Storefront
 * shape above; the Metro bundle bans a runtime @platform import, so a Node-side
 * conformance test pins this record to canon instead).
 *
 * Hibiscus is the founder's light pink. Its ACCENT is a rose rather than a
 * pastel because `on` must stay near-white for the deep surfaces — the light
 * pink is `soft`, which is what actually covers her vitrine. The full reasoning
 * and the measured contrast ratios live in the buyer module, beside the tokens.
 */
export type VitrineThemeKey =
  | 'laterite'
  | 'danfani'
  | 'indigo'
  | 'foret'
  | 'frangipanier'
  | 'lagune'
  | 'aubergine'
  | 'brique';

export const THEMES: Record<VitrineThemeKey, { name: string; accent: string; deep: string; soft: string; on: string }> = {
  laterite: { name: 'Latérite', accent: '#C2571B', deep: '#7A340E', soft: '#F7E7D8', on: '#FFF6EC' },
  danfani: { name: 'Dan Fani', accent: '#A31D4E', deep: '#701134', soft: '#F8E4EC', on: '#FCF4EE' },
  indigo: { name: 'Indigo', accent: '#3E4B8C', deep: '#232B54', soft: '#E7EAF6', on: '#F2F4FC' },
  foret: { name: 'Forêt', accent: '#0B5B47', deep: '#073B2E', soft: '#E4EFE9', on: '#F6F1E7' },
  frangipanier: { name: 'Frangipanier', accent: '#AD4F83', deep: '#641E47', soft: '#FCD9EA', on: '#FFF4F7' },
  lagune: { name: 'Lagune', accent: '#0F6E8C', deep: '#08475C', soft: '#E1F0F5', on: '#F0F9FC' },
  aubergine: { name: 'Aubergine', accent: '#6A2D6E', deep: '#431B47', soft: '#F1E7F3', on: '#F8F1F9' },
  brique: { name: 'Brique', accent: '#9E3D2E', deep: '#63241A', soft: '#F8E3DE', on: '#FFF3EF' },
};

export type CoverStatus = 'none' | 'uploading' | 'pending' | 'live' | 'error';

/**
 * The canon header keys, mirrored LOCALLY (Metro law: the RN bundle bans
 * runtime @platform imports, same as the Storefront shape below). A Node-side
 * conformance test pins this list to the canon `STOREFRONT_HEADER_STYLES`
 * export — drift fails in vitest, never on a device.
 * ENTETES-E0 (canon v2.3.0): the Beurni Boss five ride after the six.
 * ENTETES-H (canon v2.4.0, founder-authorized 2026-07-31): séries 2/3/5 append
 * twenty more. THE MIRROR GROWS WITH CANON; `PICKABLE_HEADER_STYLES` below does
 * NOT — none of the twenty has a buyer render unit or catalog strings yet, and
 * offering a seller a style that silently draws the default header would be a
 * worse failure than refusing it, because it looks like the app is broken.
 */
export const HEADER_STYLES = [
  'classique',
  'royale',
  'heritage',
  'chaleureux',
  'cristal',
  'dynamique',
  'masque',
  'harmattan',
  'balafon',
  'seance',
  'cauris',
  // ENTETES-H — séries 2, 3 and 5 (canon v2.4.0). Vocabulary only.
  'indigo',
  'couture',
  'safran',
  'grenat',
  'kraft',
  'audace',
  'fleurie',
  'prisme',
  'pop',
  'chrome',
  'neon',
  'perle',
  'artisan',
  'braise',
  'graffiti',
  'dunda',
  'karite',
  'bronze',
  'calebasse',
  'pagne',
  // ENTETES-L — séries 8 « luxe » + 9 « éditions » (canon v2.5.0)
  'fildor',
  'bazin',
  'couverture',
  'billet',
  'enseigne',
  'hologramme',
  // ENTETES-M — séries 10 « féminines » + 11 « jardins » (canon v2.6.0)
  'dentelle',
  'bougain',
  'flamboyant',
  'hibiscus',
  'papillons',
  'guirlande',
] as const;
export type HeaderStyleKey = (typeof HEADER_STYLES)[number];

/**
 * ENTETES-E0 — what the picker OFFERS: only styles whose buyer render exists
 * and whose picker strings live in the catalog. Still ELEVEN at canon v2.4.0:
 * the twenty keys of séries 2/3/5 are valid vocabulary and nothing more.
 *
 * THE LAW, restated because v2.4.0 is the first bump that tests it: vocabulary
 * may grow ahead of the picker; THE PICKER NEVER RUNS AHEAD OF THE RENDER. A
 * seller who picks « Dunda » and gets the default header has been told the app
 * works when it does not — a quieter, worse failure than the service refusing
 * an unknown key outright.
 */
export const PICKABLE_HEADER_STYLES = [
  'classique',
  'royale',
  'heritage',
  'chaleureux',
  'dynamique',
  'harmattan',
  'balafon',
  'seance',
  'cauris',
  // ENTETES-H — Indigo is the first of the twenty to become PICKABLE, and it
  // became pickable LAST: its render unit, its chunk, its catalog strings and
  // its framing silhouette all landed before this line was added.
  'indigo',
  'grenat',
  'kraft',
  'audace',
  'fleurie',
  'braise',
  'karite',
  'calebasse',
  'pagne',
  'bazin',
  'couverture',
  'billet',
  'enseigne',
  'hologramme',
  'dentelle',
  'bougain',
  'flamboyant',
  'hibiscus',
  'papillons',
  'guirlande',
] as const;

/** Her selected header with the `classique` fallback: an OLD service wire omits
 *  the field, and an unknown value must never select a card — both read as the
 *  shipped default rather than as a broken screen. */
export function headerStyleOf(sf: Storefront): HeaderStyleKey {
  const raw = sf.headerStyle ?? '';
  return (HEADER_STYLES as readonly string[]).includes(raw) ? (raw as HeaderStyleKey) : 'classique';
}

/** ENTETES-C — a saved framing, mirrored from canon `StorefrontPhotoFocusSchema`
 *  (integers 0–100 both axes — CSS object-position percentages). */
export interface PhotoFocus {
  readonly x: number;
  readonly y: number;
}

/**
 * ENTETES-C — the framing a cover/avatar part carries, with the classique-style
 * fallback handling: absent or garbage (an old wire, a hostile wire) reads as
 * `undefined` — the header's own contract framing — never a broken screen.
 */
export function focusOf(part: { readonly focus?: unknown }): PhotoFocus | undefined {
  const f = part.focus;
  if (f === null || typeof f !== 'object') return undefined;
  const { x, y } = f as { x?: unknown; y?: unknown };
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 100 &&
    typeof y === 'number' && Number.isInteger(y) && y >= 0 && y <= 100
    ? { x, y }
    : undefined;
}

/**
 * ENTETES-C — the LOCAL optimistic mirror of the service's tri-state merge:
 * `null` clears (the key is REMOVED, never set undefined) · a pair sets a CLEAN
 * {x, y}. Used by the framing sheet so what she sees between save and re-read
 * is exactly what the service will hold.
 */
export function withFocus<T extends { readonly focus?: PhotoFocus }>(part: T, order: PhotoFocus | null): T {
  const { focus: _cleared, ...rest } = part;
  return order === null ? (rest as T) : ({ ...rest, focus: { x: order.x, y: order.y } } as T);
}

export interface StorefrontSection {
  readonly id: string;
  readonly name: string; // 1–20
  readonly pids: readonly string[]; // un pid vit dans ≤ 1 section
}

/** §3.1 — the reseller-owned presentation object (RN side).
 * LOCAL MIRROR of canon v1.1.0 StorefrontSchema (be2199c): the RN bundle bans
 * runtime @platform imports (Metro-safe law), so the shape is mirrored here and
 * a Node-side conformance test parses it with the REAL canon schema — drift
 * fails in vitest, never on a device. Canon bounds name at ≤ 120; THIS app
 * enforces 3–24 at the edit boundary (§3.1/QA §8.6, NAME_MIN/NAME_MAX). */
export interface Storefront {
  readonly id: string;
  readonly resellerId: string;
  readonly category: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly slug: string; // VERROUILLÉ — jamais régénéré, même après renommage
  readonly name: string; // 3–24, requis
  readonly tagline: string; // 0–40
  readonly bio: string; // 0–160
  readonly zone: string;
  readonly theme: VitrineThemeKey;
  /** PERSONNALISER-MEDIA-1 — `url` mirrors canon `StorefrontCoverSchema`. It is
   *  written BY THE SERVICE from a completed upload; the app never patches it.
   *  ENTETES-C — `focus` mirrors canon `StorefrontPhotoFocusSchema` (integers
   *  0–100, CSS object-position percentages): HER saved framing of THIS photo.
   *  Absent = the header's own contract framing; a fresh upload starts unframed
   *  (the service clears it — a stale framing must never crop a new photo). */
  readonly cover: { readonly status: CoverStatus; readonly url?: string; readonly focus?: PhotoFocus };
  readonly avatar: { readonly mode: 'monogram' | 'photo'; readonly url?: string; readonly focus?: PhotoFocus };
  readonly curatedItems: readonly string[];
  readonly featuredItems: readonly string[]; // ≤ 2, ordre d'épinglage
  readonly sections: readonly StorefrontSection[]; // ≤ 4
  /** canon §5.6: privée = absente de Découvrir; le lien résout toujours (loi 4). */
  readonly discoverable: boolean;
  /** ENTETES-B — her chosen header (canon closed set). OPTIONAL on purpose: an
   *  OLD deployed service omits it on the wire; `headerStyleOf` reads the
   *  absence (and any unknown value) as `classique`. */
  readonly headerStyle?: string;
  /** VOIX-PRODUIT — pid → her recorded note, mirroring canon
   *  `StorefrontVoiceNoteSchema`. OPTIONAL for the same reason `headerStyle` is:
   *  a service deployed before this field omits it on the wire, and absent must
   *  read as « aucune note » rather than crash the screen. The URL is written BY
   *  THE SERVICE from a completed upload; the app never patches it. */
  readonly productNotes?: Readonly<
    Record<string, { readonly status: 'pending' | 'ready'; readonly url?: string; readonly durationMs: number }>
  >;
}

/** §3.1 bounds (mechanically asserted in §8.6/8.8/8.9 tests). */
export const NAME_MIN = 3;
export const NAME_MAX = 24;
export const TAGLINE_MAX = 40;
export const BIO_MAX = 160;
/** VITRINE-QUARTIER-1 — display bound, mirrored from the service. NOT a
 *  gazetteer: the zone list stays an open founder decision; the string stays free. */
export const ZONE_MAX = 40;
export const FEATURED_CAP = 2;
// SECTION_NAME_MAX / SECTIONS_CAP left with the K6 editor (founder order
// 2026-08-13, « remove 'Sections' from personnaliser ») — the `sections` FIELD
// stays canon; only its editor is gone. The service still holds both bounds.

// §4.4's COVER_UPLOAD_MS / COVER_VERIFY_MS are GONE with the simulation they timed.
// The K3 cycle is a real pick, a real upload and a real read-back now, so
// « uploading » lasts exactly as long as the network takes — there is no decreed
// duration left to pin, and a constant nothing reads is a claim nothing checks.

/** SEED-NEUTRE (founder, 2026-08-17: « fix these 2 things ») — the first-run
 *  seed is EMPTY, not the demo's. It carried « Chez Aïcha Mode / Gounghin »
 *  with the demo slug and demo curated pids, which is exactly what a reseller
 *  with no shop would have PUBLISHED had she pressed « Mettre en ligne »
 *  without editing. Blank name/zone land on K2's existing required states,
 *  the publish handler refuses them with a plain sentence, and the canon
 *  schema (TrimmedNonEmptyString) refuses them server-side regardless. */
export const DEFAULT_STOREFRONT: Storefront = {
  id: 'sf_nouvelle',
  resellerId: 'rs_nouvelle',
  category: 'mode',
  createdAt: '2026-08-17T08:00:00.000Z',
  updatedAt: '2026-08-17T08:00:00.000Z',
  slug: '',
  name: '',
  tagline: '',
  bio: '',
  zone: '',
  theme: 'laterite',
  cover: { status: 'none' },
  avatar: { mode: 'monogram' },
  curatedItems: [],
  featuredItems: [],
  sections: [],
  discoverable: false,
  headerStyle: 'classique',
};

/* ---------------------------------------------------- §4.3 pure actions -- */

export type ActionResult =
  | { readonly ok: true; readonly next: Storefront; readonly toastKey?: string }
  | { readonly ok: false; readonly toastKey: string };

/** K2 « Enregistrer » — publication immédiate (name ≥ 3 enforced by the form).
 * VITRINE-QUARTIER-1: the quartier saves with the rest of the identity — and a
 * blank one is REFUSED like a blank name (canon `zone` is trimmed non-empty;
 * silently keeping the old value would tell her the clear saved). */
export function saveIdentity(sf: Storefront, patch: { name: string; tagline: string; bio: string; zone: string }): ActionResult {
  const name = patch.name.slice(0, NAME_MAX);
  if (name.trim().length < NAME_MIN) return { ok: false, toastKey: 'k.identite.nom_requis' };
  const zone = patch.zone.slice(0, ZONE_MAX).trim();
  if (zone.length === 0) return { ok: false, toastKey: 'k.identite.zone_requise' };
  return {
    ok: true,
    next: { ...sf, name, zone, tagline: patch.tagline.slice(0, TAGLINE_MAX), bio: patch.bio.slice(0, BIO_MAX) },
    toastKey: 'k.toast_enregistre',
  };
}

/** K4 — theme is immediate (§4.3); re-tint is a state swap (< 300 ms, no layout change). */
export function setTheme(sf: Storefront, theme: VitrineThemeKey): Storefront {
  return { ...sf, theme };
}

/** K5 étoile — pin/unpin writes featuredItems (ordre = ordre d'épinglage).
 * Cap 2 → refus toast; un épuisé ne peut pas être à la une (refus toast) —
 * the pin PERSISTS on an article that later goes out of stock (auto-retrait à
 * l'affichage only), so the guard here fires only on a NEW pin. */
export function togglePin(sf: Storefront, pid: string, inStock: boolean): ActionResult {
  if (sf.featuredItems.includes(pid)) {
    return { ok: true, next: { ...sf, featuredItems: sf.featuredItems.filter((p) => p !== pid) } };
  }
  if (!inStock) return { ok: false, toastKey: 'k.une.refus_epuise' };
  if (sf.featuredItems.length >= FEATURED_CAP) return { ok: false, toastKey: 'k.une.refus_cap' };
  return { ok: true, next: { ...sf, featuredItems: [...sf.featuredItems, pid] } };
}

/** K5 ▲▼ — swap curatedItems[i] with its neighbour (reflected verbatim buyer-side). */
export function moveItem(sf: Storefront, pid: string, dir: -1 | 1): Storefront {
  const items = [...sf.curatedItems];
  const i = items.indexOf(pid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return sf;
  [items[i], items[j]] = [items[j]!, items[i]!];
  return { ...sf, curatedItems: items };
}

// createSection / toggleSectionPid / renameSection / deleteSection left with
// the K6 editor (SECTIONS RETIRÉES, founder order 2026-08-13). The canon
// `sections` field and `StorefrontSection` shape STAY: a shop already holding
// sections keeps them (the wire's absent-means-untouched law). Nothing DRAWS
// them any more — the buyer page stopped on 2026-08-19.

/**
 * K3 — move the cover to a LOCAL status without forgetting where the photo is.
 *
 * MEDIA-2 round 3: this dropped `url` on every transition. MEDIA-1 had added
 * `url?` to the cover shape and never updated this constructor, so a live cover
 * that failed to be REPLACED walked live → uploading → error → none and lost the
 * address of the photograph her cliente was still looking at. Her app then said
 * « Ajouter une couverture » over a shop that had one, with no way back inside the
 * screen: the adoption effect is keyed on `updatedAt`, which never moved.
 */
export function coverTo(sf: Storefront, status: CoverStatus): Storefront {
  return { ...sf, cover: { ...sf.cover, status } };
}

/** §3.2 seed (pure data — testable Node-side) (the vitrine catalog — mirrors the buyer module; VITRINE-REAL-BACKING
 * swaps this for the live listings without touching the screens). */
export const K_SEED: readonly { pid: string; name: string; priceFcfa: number; inStock: boolean }[] = [
  { pid: 'p1', name: 'Robe brodée bogolan', priceFcfa: 11_500, inStock: true },
  { pid: 'p2', name: 'Pagne wax 6 yards', priceFcfa: 20_500, inStock: true },
  { pid: 'p4', name: 'Sandales cuir homme', priceFcfa: 9_200, inStock: true },
  { pid: 'p5', name: 'Coffret karité pur', priceFcfa: 6_900, inStock: true },
  { pid: 'p7', name: 'Foulard Faso Dan Fani', priceFcfa: 6_300, inStock: true },
  { pid: 'p8', name: 'Chemise Faso Dan Fani', priceFcfa: 13_800, inStock: true },
  { pid: 'k1', name: 'Pack Cuisine Départ', priceFcfa: 14_000, inStock: true },
  { pid: 'p3', name: 'Sac cuir artisanal', priceFcfa: 17_000, inStock: false },
];
