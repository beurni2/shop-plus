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

export interface StorefrontProfilePort {
  /** Resolve a slug to its storefront — undefined = honest not-found (V5). A
   * PRIVATE storefront still resolves (loi 4: no « boutique fermée » exists). */
  resolve(slug: string): { storefront: Storefront; trust: VitrineTrust } | undefined;
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
 * The demo adapter. `aicha-4821` resolves to the DEFAULT profile; the audit
 * harness swaps in the customised profile via `demoProfileVariant`. Unknown
 * slugs are honest not-found. (VITRINE-REAL-BACKING / the storefront-service
 * feed replaces this adapter; the port does not change.)
 */
export function demoStorefrontPort(variant: 'default' | 'customised' | 'empty' = 'default'): StorefrontProfilePort {
  return {
    resolve(slug: string) {
      if (slug !== 'aicha-4821') return undefined;
      if (variant === 'customised') return { storefront: AICHA_CUSTOMISED, trust: AICHA_TRUST };
      if (variant === 'empty') {
        // V6 — before the first article: identity present, zero products, no
        // review chip yet (< 3 avis — a new reseller's honest day 1).
        return {
          storefront: { ...AICHA_DEFAULT, curatedItems: [] },
          trust: { deliveredCount: 0, rating: '', reviewCount: 0, demo: true },
        };
      }
      return { storefront: AICHA_DEFAULT, trust: AICHA_TRUST };
    },
  };
}
