/**
 * VITRINE — §3.1 Storefront (la propriété de la revendeuse) + its PORT.
 *
 * CANON LANDED (v1.1.0, pin be2199c): StorefrontSchema carries the 7 §3.1
 * fields (tagline/bio/cover/avatar/theme/sections/featuredItems) additive and
 * defaulted — the promised pin-swap happened and the local shape is retired;
 * this module consumes the canon type + parses its demo data with the canon
 * schema in the conformance test (drift fails in vitest, never on a device).
 *
 * FLAG STOREFRONT-MEDIA-BACKING (named follow-on — NOT wired now): image
 * upload/hosting and the « vérification Séra » moderation backend DO NOT
 * EXIST. `cover.status` / `avatar.mode='photo'` are demo-fed states behind
 * this port; the K3 timers (§4.4) simulate the cycle honestly ([DEMO]-marked).
 * Swapping in the real media backend changes the ADAPTER, never the port.
 */

// CANON v1.1.0 (pin be2199c): StorefrontSchema now CARRIES the 7 §3.1 fields —
// the local shape is RETIRED; this surface consumes the canon type directly.
// Canon guards the boundary at name ≤ 120; the reseller app enforces 3–24 at
// ITS edit boundary (§3.1/QA §8.6) — the buyer only renders.
import type { Storefront } from '@platform/contracts';
import { DEMO_VOICE_URL, DEMO_VOICE_DURATION_MS } from './voice-asset';
import type { VitrineProduct } from './catalog';
// ENTETES-B — the app's own closed key list (this surface consumes the WIRE,
// not the canon package at runtime). Pinned to the EXECUTED canon import
// (STOREFRONT_HEADER_STYLES) by entetes.test.ts — a seventh canon style fails
// a buyer test instead of silently coercing to classique.
import { ENTETE_KEYS, type EnteteKey } from './entetes';
// THEMES-8b — same reasoning, same shape: the app's own closed habillage record
// is the runtime authority here, pinned to the EXECUTED canon import by
// themes-canon.test.ts, so a ninth canon habillage fails a buyer test rather
// than reaching `VITRINE_THEMES[key]` as `undefined`.
import { VITRINE_THEMES, DEFAULT_THEME, type VitrineThemeKey } from './themes';

export type { Storefront };

/** S8 trust data riding the vitrine (render-only, system-locked — never themed, never edited). */
export interface VitrineTrust {
  /** « N ventes livrées par Séra » — exact count, hidden below 1. */
  readonly deliveredCount: number;
  /** Review chip appears only at ≥ 3 verified reviews (§9.4 frozen threshold). */
  readonly rating: string;
  readonly reviewCount: number;
  /** Demo (test-data) trust → rendered with the honest « démo » discipline. */
  readonly demo: boolean;
}

/**
 * PER-PRODUCT VOICE NOTE — the reseller's optional recorded note about ONE
 * product (LOCAL shape; canon has none yet — see the canon-needs note below).
 * The BUYER only ever renders a `ready` note (a real, playable url): a note the
 * reseller just recorded is `pending` on her side (no server persists it), so
 * it is NOT buyer-visible — honesty law (queued = pending, never « en ligne »).
 * `recording`/`recorded` are reseller-only capture states, never seen here.
 *
 * CANON WOULD NEED (report, not built): one additive, defaulted field on
 * StorefrontSchema — `productNotes?: Record<pid, { status; url; durationMs }>`
 * (status enum below), mirroring how cover/avatar landed additive in v1.1.0.
 */
export type ProductVoiceStatus = 'none' | 'recording' | 'recorded' | 'pending' | 'ready';
export interface ProductVoiceNote {
  readonly status: ProductVoiceStatus;
  /** Playable source when `ready`; null until a real take exists. */
  readonly url: string | null;
  /** Displayed length (« 0:01 »). 0 until captured. */
  readonly durationMs: number;
}
/** pid → note. Absent pid = no note = the buyer renders NOTHING (no gap). */
export type ProductVoiceNotes = Readonly<Record<string, ProductVoiceNote>>;

export interface StorefrontProfilePort {
  /** Resolve a slug to its storefront — undefined = honest not-found (V5). A
   * PRIVATE storefront still resolves (loi 4: no « boutique fermée » exists).
   * `notes` carries the per-product voice notes (only `ready` ones play).
   *
   * ASYNC (STOREFRONT-READ-PATH-1): a real HTTP adapter fetches the storefront
   * from storefront-service; the demo adapter resolves synchronously but returns
   * the same Promise shape so callers await ONE seam. undefined still = the
   * honest not-found the flow renders (VitrineEtat 'invalid'). */
  resolve(slug: string): Promise<
    | {
        storefront: Storefront;
        trust: VitrineTrust;
        notes: ProductVoiceNotes;
        /**
         * BUYER-LIVE-WIRE-3 — the products the SERVICE described, carried through
         * to the renderer. Absent ⇒ the demo seed path (the offline harness).
         *
         * THE DEFECT THIS CLOSES: the service has emitted this array since
         * REAL-PRODUCT-RENDER-1 and NOTHING READ IT. The renderer mapped
         * `curatedItems` through the DEMO SEED, so a real `productVersionId` —
         * which is not a seed pid — resolved to nothing and a shop with a genuine
         * published product rendered ZERO TILES. The shapes are identical by
         * design (`VitrineProductRecord` ≡ `VitrineProduct`), so this is carried
         * with zero transformation, exactly as `catalog.ts` always intended.
         */
        products?: readonly VitrineProduct[];
      }
    | undefined
  >;
}

/* ------------------------------------------------------------------ DEMO -- */

/** V1 — jour 1, the default that must suffice (§5 V1: most resellers never customise). */
const AICHA_DEFAULT: Storefront = {
  id: 'sf_aicha',
  resellerId: 'res_aicha',
  slug: 'aicha-4821',
  name: 'Chez Aïcha Mode',
  tagline: '',
  bio: '',
  zone: 'Gounghin, Ouagadougou',
  category: 'mode',
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-19T08:00:00.000Z',
  theme: 'laterite',
  cover: { status: 'none' },
  avatar: { mode: 'monogram' },
  curatedItems: ['p1', 'p2', 'p4', 'p5', 'p7', 'p8', 'k1', 'p3'],
  featuredItems: [],
  sections: [],
  // canon §5.6 field (privée = absent from Découvrir; the LINK still resolves — loi 4)
  discoverable: true,
  // ENTETES-B — jour 1: the shipped default header, exactly as canon backfills it
  headerStyle: 'classique',
  // VOIX-PRODUIT — the canon default. The DEMO's own notes live in
  // AICHA_VOICE_NOTES beside the profile, never on the storefront record, so
  // this stays what canon backfills for a real shop: no note.
  productNotes: {},
};

/** V2 — the customised variant (Indigo · cover · à la une · sections), §5 V2 exact. */
const AICHA_CUSTOMISED: Storefront = {
  ...AICHA_DEFAULT,
  tagline: 'Le wax et le cuir, choisis à la main',
  bio: 'Je choisis chaque pièce moi-même chez des vendeurs vérifiés — livrée scellée par Séra, inspectée avant de payer.',
  theme: 'indigo',
  // ENTETES-C — NON-default framings on purpose (the ENTETES-B headerStyle
  // rule): a test driving the customised variant sees HER values ride the
  // port, not the defaults agreeing with themselves. The avatar stays
  // monogram and the cover url-less, exactly as before — the framing is
  // carried data here, exercised on the render by the tests' own fixtures.
  cover: { status: 'live', focus: { x: 30, y: 70 } },
  avatar: { mode: 'monogram', focus: { x: 40, y: 20 } },
  // ENTETES-B — a NON-classique key on purpose, so every path a test drives
  // through the customised variant exercises the field-driven header honestly.
  headerStyle: 'royale',
  featuredItems: ['p1', 'p5'],
  sections: [
    { id: 's1', name: 'Mode & tissus', pids: ['p2', 'p7', 'p8'] },
    { id: 's2', name: 'Sacs & chaussures', pids: ['p4', 'p3'] },
    { id: 's3', name: 'Maison & beauté', pids: ['p5', 'k1'] },
  ],
};

const AICHA_TRUST: VitrineTrust = { deliveredCount: 16, rating: '4,8', reviewCount: 12, demo: true };

/**
 * ABSENT trust — what a REAL storefront carries until it earns its own
 * (BUYER-REAL-HONESTY-1). Zero deliveries, no rating, zero reviews, and
 * `demo:false` because none of it is demo data: it is the honest absence of
 * history. The render turns this into the « Nouvelle vendeuse » state — never
 * blank space, and NEVER another reseller's sixteen deliveries.
 */
const ABSENT_TRUST: VitrineTrust = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };

/**
 * V-demo voice notes — two products carry a `ready` note ([DEMO] placeholder
 * tone, STOREFRONT-MEDIA-BACKING). p1 is featured, p5 is a regular tile, so the
 * « Note vocale » affordance is demonstrable on a featured tile, a grid tile, and
 * both their product pages. Everything else has no note → the buyer sees
 * nothing (no placeholder gap). Swapping in the real media backend replaces
 * these urls; the shape and the player never change.
 */
// FOUNDER ORDER (2026-07-22): EVERY curated product carries a ready [DEMO]
// note, so the « Note vocale » card is present and playable on every shared C1 —
// not just p1/p5. Same placeholder asset; the media backend swaps the url.
const AICHA_VOICE_NOTES: ProductVoiceNotes = {
  p1: { status: 'ready', url: DEMO_VOICE_URL, durationMs: DEMO_VOICE_DURATION_MS },
  p2: { status: 'ready', url: DEMO_VOICE_URL, durationMs: DEMO_VOICE_DURATION_MS },
  p3: { status: 'ready', url: DEMO_VOICE_URL, durationMs: DEMO_VOICE_DURATION_MS },
  p4: { status: 'ready', url: DEMO_VOICE_URL, durationMs: DEMO_VOICE_DURATION_MS },
  p5: { status: 'ready', url: DEMO_VOICE_URL, durationMs: DEMO_VOICE_DURATION_MS },
  p7: { status: 'ready', url: DEMO_VOICE_URL, durationMs: DEMO_VOICE_DURATION_MS },
  p8: { status: 'ready', url: DEMO_VOICE_URL, durationMs: DEMO_VOICE_DURATION_MS },
  k1: { status: 'ready', url: DEMO_VOICE_URL, durationMs: DEMO_VOICE_DURATION_MS },
};

/** The DIRECT-landing signed product (no vitrine round trip) carries a demo note
 * too, so the product-page player is demonstrable on the default route. Same
 * [DEMO] asset; the real backend attaches the real note to the real listing. */
export const DEMO_LANDING_VOICE: ProductVoiceNote = {
  status: 'ready',
  url: DEMO_VOICE_URL,
  durationMs: DEMO_VOICE_DURATION_MS,
};

/**
 * The demo adapter. `aicha-4821` resolves to the DEFAULT profile; the audit
 * harness swaps in the customised profile via `demoProfileVariant`. Unknown
 * slugs are honest not-found. (VITRINE-REAL-BACKING / the storefront-service
 * feed replaces this adapter; the port does not change.)
 */
export function demoStorefrontPort(variant: 'default' | 'customised' | 'empty' | 'private' = 'default'): StorefrontProfilePort {
  return {
    // async only to satisfy the widened port seam — the demo data is in-process,
    // so this resolves on the next microtask with no network (the offline harness).
    async resolve(slug: string) {
      if (slug !== 'aicha-4821') return undefined;
      if (variant === 'customised') return { storefront: AICHA_CUSTOMISED, trust: AICHA_TRUST, notes: AICHA_VOICE_NOTES };
      // privée (canon §5.6, loi 4): absent from Découvrir (discoverable:false),
      // but the SIGNED LINK still resolves — there is no « boutique fermée ». The
      // product page mounts exactly as for a public store; only the directory
      // (allBoutiques, projected on `discoverable`) hides her.
      if (variant === 'private') return { storefront: { ...AICHA_DEFAULT, discoverable: false }, trust: AICHA_TRUST, notes: AICHA_VOICE_NOTES };
      if (variant === 'empty') {
        // V6 — before the first article: identity present, zero products, no
        // review chip yet (< 3 avis — a new reseller's honest day 1), no notes.
        return {
          storefront: { ...AICHA_DEFAULT, curatedItems: [] },
          trust: { deliveredCount: 0, rating: '', reviewCount: 0, demo: true },
          notes: {},
        };
      }
      return { storefront: AICHA_DEFAULT, trust: AICHA_TRUST, notes: AICHA_VOICE_NOTES };
    },
  };
}

/* --------------------------------------------------------- REAL (partial) -- */

/**
 * A described product needs the five fields the tile renders — nothing else.
 *
 * CATEGORY-WIRE-1 adds NO sixth requirement, on purpose. `category` arrives
 * from canon v3.0.0, so an older deployed Worker omits it; requiring it would
 * make every product on that Worker fail this check and VANISH from her page.
 * A young field must never be able to empty a shop.
 *
 * A MALFORMED CATEGORY IS NOT THE PRODUCT'S FAULT EITHER (verifier finding).
 * This function briefly rejected a non-string category — and rejecting HERE
 * means `filter` DROPS THE WHOLE RECORD, so `category: 5` deleted the product
 * from her grid and sent her signed link to the not-found screen. That is the
 * same shop-emptying failure the paragraph above refuses, reached by a bad
 * value instead of an absent one, and the comment that used to sit here
 * claimed the opposite ("falls back to the conservative row"). It does not
 * fall back; it disappears. So the category is NOT validated here at all — it
 * is STRIPPED at the boundary below, exactly as `headerStyle` and the
 * cover/avatar `focus` already are, and a stripped category is an absent one:
 * the conservative row.
 */
function looksLikeProduct(v: unknown): v is VitrineProduct {
  if (v === null || typeof v !== 'object') return false;
  const p = v as VitrineProduct;
  return (
    typeof p.pid === 'string' &&
    typeof p.name === 'string' &&
    typeof p.priceFcfa === 'number' &&
    typeof p.inStock === 'boolean' &&
    Array.isArray(p.assetRefs)
  );
}

/**
 * CATEGORY-WIRE-1 — the category normalised at the ONE network boundary, on the
 * `headerStyleFromWire` precedent. A non-string (or absent) category becomes an
 * ABSENT key rather than a dropped product: `inspectionPour` then returns the
 * conservative §6.2 row and §6.1 refuses Option B, which is the fail-closed
 * behaviour the whole field was specified to have. Downstream never sees a
 * `category` that is not a string, so no consumer needs to re-check it.
 */
function productFromWire(p: VitrineProduct): VitrineProduct {
  // VIDEO-PRODUIT — same boundary law as `category`: a non-string (or absent)
  // videoRef becomes an ABSENT key; downstream never re-checks it.
  const { category, videoRef, ...rest } = p;
  return {
    ...rest,
    ...(typeof category === 'string' ? { category } : {}),
    ...(typeof videoRef === 'string' && videoRef !== '' ? { videoRef } : {}),
  };
}

/** A storefront looks real when the service handed back at least an id + slug. */
function looksLikeStorefront(v: unknown): v is Storefront {
  return typeof v === 'object' && v !== null && typeof (v as Storefront).id === 'string' && typeof (v as Storefront).slug === 'string';
}

/* Test seams — CATEGORY-WIRE-1 r2. Both are boundary logic a verifier proved
 * was unasserted; exported so a test can drive them directly rather than
 * through a full mount, which is what let two mutations stay green. */
export const looksLikeProductForTest = looksLikeProduct;
export const productFromWireForTest = productFromWire;

/**
 * ENTETES-B — the wire's headerStyle, validated AT THE PORT BOUNDARY. An OLD
 * deployed service omits the field entirely, and this static page must keep
 * rendering (classique, the shipped default) rather than break on the absence;
 * an unknown value falls back the same way — never an unstyled header.
 */
function headerStyleFromWire(raw: unknown): EnteteKey {
  return typeof raw === 'string' && (ENTETE_KEYS as readonly string[]).includes(raw) ? (raw as EnteteKey) : 'classique';
}

/**
 * THEMES-8b (verifier finding) — the wire's `theme`, validated at the SAME
 * boundary, and for a harder reason than the header's.
 *
 * `headerStyle` had this guard from its first day; `theme` never did, and the
 * difference is a crash. `applyTheme` reads `VITRINE_THEMES[key].accent`
 * (themes.ts) and `render.ts` reads `VITRINE_THEMES[sf.theme]` at four more
 * sites — an unknown key is `undefined` there, so `.accent` throws, and the
 * throw happens BEFORE `root.innerHTML` is assigned (flows.ts). The buyer would
 * get a blank page: not the offline state, not a default habillage, nothing.
 *
 * THAT IS REACHABLE BECAUSE THE THREE ARTIFACTS DEPLOY SEPARATELY. The service
 * can be ahead of a cached PWA bundle by one habillage — the mirror image of
 * « Pas enregistré », which was this same skew pointing the other way. Guarded
 * here, an unknown habillage costs the seller her colours and nothing else.
 */
function themeFromWire(raw: unknown): VitrineThemeKey {
  return typeof raw === 'string' && Object.prototype.hasOwnProperty.call(VITRINE_THEMES, raw)
    ? (raw as VitrineThemeKey)
    : DEFAULT_THEME;
}

/**
 * ENTETES-C — a wire `focus`, validated the same way (the `headerStyleFromWire`
 * pattern): a canon-shaped pair — integers 0–100, exactly {x, y} — passes
 * through; anything else (floats, strings, lone axes, extra keys, a hostile
 * wire) yields `undefined`, so downstream code never sees garbage.
 */
export function focusFromWire(raw: unknown): { x: number; y: number } | undefined {
  if (raw === null || typeof raw !== 'object' || Object.keys(raw).length !== 2) return undefined;
  const { x, y } = raw as { x?: unknown; y?: unknown };
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 100 &&
    typeof y === 'number' && Number.isInteger(y) && y >= 0 && y <= 100
    ? { x, y }
    : undefined;
}

/** The CSS `object-position` a stored framing renders as — `undefined` when
 *  there is none, so the style's own contract framing stays in charge. Shared
 *  by the classique render and the five headers (ONE reading, no drift). */
export function focusPosition(raw: unknown): string | undefined {
  const f = focusFromWire(raw);
  return f === undefined ? undefined : `${f.x}% ${f.y}%`;
}

/** ENTETES-C — strip a non-canon `focus` OFF a wire sub-object (cover/avatar)
 *  so the resolved storefront carries either a valid pair or no key at all. */
function sanitizeFocus<T extends { readonly focus?: unknown }>(part: T): T {
  const f = focusFromWire(part.focus);
  const { focus: _dropped, ...rest } = part;
  return (f === undefined ? rest : { ...rest, focus: f }) as T;
}

/**
 * The REAL storefront adapter (STOREFRONT-READ-PATH-1). It fetches the storefront
 * from storefront-service (`GET {base}/s/{slug}` → the buyer-safe StorefrontView)
 * and returns it as the real storefront.
 *
 * BUYER-REAL-HONESTY-1 — trust and notes are ABSENT, never borrowed. This
 * adapter previously returned `{...AICHA_TRUST}` and `AICHA_VOICE_NOTES` for
 * EVERY real storefront, so a real reseller's page displayed sixteen deliveries,
 * 4,8 stars and twelve reviews she never earned — and played ANOTHER RESELLER'S
 * recorded voice as if it were hers. Both are removed at the source:
 *   · TRUST → `ABSENT_TRUST` (no producer exists server-side; absence is the
 *     truth, and the render states it as « Nouvelle vendeuse »).
 *   · NOTES → `{}` (they need the canon `productNotes?` field, §7 — the founder's
 *     call). No note ⇒ the existing, honest sans-voix state; no player, no gap.
 * Swap each in when its producer lands; the shape and the callers never change.
 * The DEMO port keeps its demo trust and demo notes untouched (offline harness).
 *
 * A 404 (unknown slug) or a network failure both resolve to `undefined` — the
 * SAME honest not-found the flow renders as VitrineEtat 'invalid'; never a throw
 * up the mount path, never a neighbouring store.
 */
/**
 * VOIX-PRODUIT — the wire's `productNotes` turned into the shape the render
 * already speaks, defensively.
 *
 * WHY A PARSER AND NOT A CAST: this is a network boundary. The buyer plays
 * whatever url lands here, so a missing, blank or non-string url must drop the
 * ENTRY — not reach an <audio> element that then fails silently and leaves her
 * tapping a dead button. Everything that survives is `ready` WITH a real url,
 * which is exactly what the existing render contract means by a playable note.
 *
 * `durationMs` is normalised rather than trusted: it drives « 0:08 », and a
 * negative or fractional value would print nonsense next to a real recording.
 */
function notesFromWire(raw: unknown): ProductVoiceNotes {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, ProductVoiceNote> = {};
  for (const [pid, value] of Object.entries(raw as Record<string, unknown>)) {
    if (pid === '' || value === null || typeof value !== 'object') continue;
    const { url, durationMs } = value as { url?: unknown; durationMs?: unknown };
    if (typeof url !== 'string' || url === '') continue;
    const ms = typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0 ? Math.floor(durationMs) : 0;
    out[pid] = { status: 'ready', url, durationMs: ms };
  }
  return out;
}

export function httpStorefrontPort(baseUrl: string): StorefrontProfilePort {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    async resolve(slug: string) {
      let res: Response;
      try {
        res = await fetch(`${base}/s/${encodeURIComponent(slug)}`, { headers: { Accept: 'application/json' } });
      } catch {
        return undefined; // offline / unreachable → honest not-found (never a throw)
      }
      if (!res.ok) return undefined; // 404 and any non-2xx → honest not-found
      const view: unknown = await res.json().catch(() => null);
      if (!looksLikeStorefront(view)) return undefined;
      // BUYER-LIVE-WIRE-3 — the service's `products` ride through. Defensive on
      // shape because this is a network boundary: a non-array is treated as
      // ABSENT (the seed path) rather than crashing the mount, and each record is
      // checked for the five fields the tile actually renders.
      const raw = (view as { products?: unknown }).products;
      const products = Array.isArray(raw) ? raw.filter(looksLikeProduct).map(productFromWire) : undefined;
      // ENTETES-B — the field is normalised HERE, once, so every consumer of the
      // resolved storefront reads a valid key (old wire without it ⇒ classique).
      // ENTETES-C — the framing gets the same treatment: a non-canon `focus` on
      // cover/avatar is STRIPPED at this one boundary, never seen downstream.
      const withHeader = {
        ...view,
        headerStyle: headerStyleFromWire((view as { headerStyle?: unknown }).headerStyle),
        // THEMES-8b — normalised HERE, once, like the header beside it: every
        // downstream reader indexes VITRINE_THEMES with a key that exists.
        theme: themeFromWire((view as { theme?: unknown }).theme),
      } as Storefront;
      const rawCover = (withHeader as { cover?: unknown }).cover;
      const rawAvatar = (withHeader as { avatar?: unknown }).avatar;
      const storefront: Storefront = {
        ...withHeader,
        ...(rawCover !== null && typeof rawCover === 'object' ? { cover: sanitizeFocus(rawCover as Storefront['cover']) } : {}),
        ...(rawAvatar !== null && typeof rawAvatar === 'object' ? { avatar: sanitizeFocus(rawAvatar as Storefront['avatar']) } : {}),
      };
      // VOIX-PRODUIT — HER OWN notes now arrive on the wire, so the `{}` that
      // BUYER-REAL-HONESTY-1 put here is replaced by the real thing rather than
      // relaxed. The honesty rule it enforced is UNCHANGED and is what this
      // parser keeps: a note is rendered only if it is THIS shop's and playable.
      // The service already ships ready-only, so this is the second line —
      // network boundary, hostile shape, same discipline as `products`.
      // TRUST STAYS ABSENT: no producer for it exists server-side, and borrowing
      // another reseller's deliveries is the very defect that rule was written
      // for. Only the notes half is filled in.
      const notes = notesFromWire((view as { productNotes?: unknown }).productNotes);
      return { storefront, trust: ABSENT_TRUST, notes, ...(products !== undefined ? { products } : {}) };
    },
  };
}

/**
 * Choose the storefront port by the environment (the `resolveMediaStore` /
 * `resolveStorefrontStore` client analogue): the REAL HTTP adapter iff a service
 * base is configured at build time, the in-process DEMO adapter otherwise. Read
 * defensively so vitest (no Vite env) and any non-Vite context resolve to demo —
 * the harness must work with no service reachable.
 */
export function resolveStorefrontPort(): StorefrontProfilePort {
  const env = (import.meta as { env?: { VITE_STOREFRONT_BASE?: string } }).env;
  const base = env?.VITE_STOREFRONT_BASE;
  return base ? httpStorefrontPort(base) : demoStorefrontPort();
}
