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
  resolve(slug: string): Promise<{ storefront: Storefront; trust: VitrineTrust; notes: ProductVoiceNotes } | undefined>;
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
};

/** V2 — the customised variant (Indigo · cover · à la une · sections), §5 V2 exact. */
const AICHA_CUSTOMISED: Storefront = {
  ...AICHA_DEFAULT,
  tagline: 'Le wax et le cuir, choisis à la main',
  bio: 'Je choisis chaque pièce moi-même chez des vendeurs vérifiés — livrée scellée par Séra, inspectée avant de payer.',
  theme: 'indigo',
  cover: { status: 'live' },
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
 * « La voix » affordance is demonstrable on a featured tile, a grid tile, and
 * both their product pages. Everything else has no note → the buyer sees
 * nothing (no placeholder gap). Swapping in the real media backend replaces
 * these urls; the shape and the player never change.
 */
// FOUNDER ORDER (2026-07-22): EVERY curated product carries a ready [DEMO]
// note, so « La voix d'Aïcha » is present and playable on every shared C1 —
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

/** A storefront looks real when the service handed back at least an id + slug. */
function looksLikeStorefront(v: unknown): v is Storefront {
  return typeof v === 'object' && v !== null && typeof (v as Storefront).id === 'string' && typeof (v as Storefront).slug === 'string';
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
      // REAL storefront → ABSENT trust, NO notes. Never another reseller's proof.
      return { storefront: view, trust: ABSENT_TRUST, notes: {} };
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
