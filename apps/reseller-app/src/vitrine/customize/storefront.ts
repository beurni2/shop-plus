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

export type VitrineThemeKey = 'laterite' | 'danfani' | 'indigo' | 'foret';

export const THEMES: Record<VitrineThemeKey, { name: string; accent: string; deep: string; soft: string; on: string }> = {
  laterite: { name: 'Latérite', accent: '#C2571B', deep: '#7A340E', soft: '#F7E7D8', on: '#FFF6EC' },
  danfani: { name: 'Dan Fani', accent: '#A31D4E', deep: '#701134', soft: '#F8E4EC', on: '#FCF4EE' },
  indigo: { name: 'Indigo', accent: '#3E4B8C', deep: '#232B54', soft: '#E7EAF6', on: '#F2F4FC' },
  foret: { name: 'Forêt', accent: '#0B5B47', deep: '#073B2E', soft: '#E4EFE9', on: '#F6F1E7' },
};

export type CoverStatus = 'none' | 'uploading' | 'pending' | 'live' | 'error';

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
  readonly cover: { readonly status: CoverStatus };
  readonly avatar: { readonly mode: 'monogram' | 'photo' };
  readonly curatedItems: readonly string[];
  readonly featuredItems: readonly string[]; // ≤ 2, ordre d'épinglage
  readonly sections: readonly StorefrontSection[]; // ≤ 4
  /** canon §5.6: privée = absente de Découvrir; le lien résout toujours (loi 4). */
  readonly discoverable: boolean;
}

/** §3.1 bounds (mechanically asserted in §8.6/8.8/8.9 tests). */
export const NAME_MIN = 3;
export const NAME_MAX = 24;
export const TAGLINE_MAX = 40;
export const BIO_MAX = 160;
export const SECTION_NAME_MAX = 20;
export const FEATURED_CAP = 2;
export const SECTIONS_CAP = 4;

/** §4.4 timers — the [DEMO] K3 cycle. */
export const COVER_UPLOAD_MS = 1_400;
export const COVER_VERIFY_MS = 2_600;

export const DEFAULT_STOREFRONT: Storefront = {
  id: 'sf_aicha',
  resellerId: 'res_aicha',
  category: 'mode',
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-19T08:00:00.000Z',
  slug: 'aicha-4821',
  name: 'Chez Aïcha Mode',
  tagline: '',
  bio: '',
  zone: 'Gounghin, Ouagadougou',
  theme: 'laterite',
  cover: { status: 'none' },
  avatar: { mode: 'monogram' },
  curatedItems: ['p1', 'p2', 'p4', 'p5', 'p7', 'p8', 'k1', 'p3'],
  featuredItems: [],
  sections: [],
  discoverable: true,
};

/* ---------------------------------------------------- §4.3 pure actions -- */

export type ActionResult =
  | { readonly ok: true; readonly next: Storefront; readonly toastKey?: string }
  | { readonly ok: false; readonly toastKey: string };

/** K2 « Enregistrer » — publication immédiate (name ≥ 3 enforced by the form). */
export function saveIdentity(sf: Storefront, patch: { name: string; tagline: string; bio: string }): ActionResult {
  const name = patch.name.slice(0, NAME_MAX);
  if (name.trim().length < NAME_MIN) return { ok: false, toastKey: 'k.identite.nom_requis' };
  return {
    ok: true,
    next: { ...sf, name, tagline: patch.tagline.slice(0, TAGLINE_MAX), bio: patch.bio.slice(0, BIO_MAX) },
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

/** K6 « + Créer une section » — < 4 only; nom pré-rempli. */
export function createSection(sf: Storefront, id: string, prefillName: string): ActionResult {
  if (sf.sections.length >= SECTIONS_CAP) return { ok: false, toastKey: 'k.sections.refus_cap' };
  return { ok: true, next: { ...sf, sections: [...sf.sections, { id, name: prefillName, pids: [] }] } };
}

/** K6b coche — a product joins/leaves the section; ≤ 1 section per product
 * (joining removes it from any other section). */
export function toggleSectionPid(sf: Storefront, sectionId: string, pid: string): Storefront {
  const sections = sf.sections.map((s) => {
    if (s.id === sectionId) {
      return s.pids.includes(pid) ? { ...s, pids: s.pids.filter((p) => p !== pid) } : { ...s, pids: [...s.pids, pid] };
    }
    return { ...s, pids: s.pids.filter((p) => p !== pid) };
  });
  return { ...sf, sections };
}

export function renameSection(sf: Storefront, sectionId: string, name: string): Storefront {
  return {
    ...sf,
    sections: sf.sections.map((s) => (s.id === sectionId ? { ...s, name: name.slice(0, SECTION_NAME_MAX) } : s)),
  };
}

/** K6b « Supprimer » — les articles restent en boutique (only the grouping dies). */
export function deleteSection(sf: Storefront, sectionId: string): ActionResult {
  return { ok: true, next: { ...sf, sections: sf.sections.filter((s) => s.id !== sectionId) }, toastKey: 'k.sections.toast_supprimee' };
}

/** K3 — the [DEMO] cover cycle steps (§4.4); timing owned by the screen. */
export function coverTo(sf: Storefront, status: CoverStatus): Storefront {
  return { ...sf, cover: { status } };
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
