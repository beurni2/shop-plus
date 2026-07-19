/**
 * VITRINE — §3.1 Storefront (la propriété de la revendeuse) + its PORT.
 *
 * THE CANON LINE (do not blur it): `slug`, `name`, `zone`, `public`,
 * `curatedItems` EXIST in platform contracts (§5.6 StorefrontSchema —
 * curatedItems is the platform's one ordering primitive). The SEVEN NET-NEW
 * fields — `tagline`, `bio`, `cover`, `avatar.photo`, `theme`, `sections`,
 * `featuredItems` — are a contracts change IN FLIGHT (§7 territory). This
 * module builds against the §3.1 shape LOCALLY, shaped so the canon pin is a
 * SWAP, not a rebuild: one type, one port, demo adapters behind it. It invents
 * no competing shape — the field names, bounds and defaults are §3.1 verbatim.
 *
 * FLAG STOREFRONT-MEDIA-BACKING (named follow-on — NOT wired now): image
 * upload/hosting and the « vérification Séra » moderation backend DO NOT
 * EXIST. `cover.status` / `avatar.mode='photo'` are demo-fed states behind
 * this port; the K3 timers (§4.4) simulate the cycle honestly ([DEMO]-marked).
 * Swapping in the real media backend changes the ADAPTER, never the port.
 */

import type { VitrineThemeKey } from './themes';

export interface StorefrontCover {
  readonly status: 'none' | 'uploading' | 'pending' | 'live' | 'error';
  readonly url?: string;
}

export interface StorefrontAvatar {
  readonly mode: 'monogram' | 'photo';
  readonly url?: string;
}

export interface StorefrontSection {
  readonly id: string;
  /** 1–20 chars (§3.1). */
  readonly name: string;
  readonly pids: readonly string[];
}

/** §3.1 Storefront — the reseller-owned presentation object. */
export interface Storefront {
  /** Canon §5.6 field — carried so the vitrine arrival can lock attribution
   * (A8 identity-scope) exactly as before; never rendered to the buyer. */
  readonly resellerId: string;
  /** VERROUILLÉ — never regenerated, even after renaming (loi 3). */
  readonly slug: string;
  /** 3–24 chars, required. */
  readonly name: string;
  /** 0–40 chars, default '' (phrase d'accueil). */
  readonly tagline: string;
  /** 0–160 chars, default '' (présentation). */
  readonly bio: string;
  /** « Gounghin, Ouagadougou » — a landmark, never an address. */
  readonly zone: string;
  readonly theme: VitrineThemeKey;
  readonly cover: StorefrontCover;
  readonly avatar: StorefrontAvatar;
  /** EXISTING canon primitive — the full grid order (K5 ▲▼ edits it). */
  readonly curatedItems: readonly string[];
  /** ≤ 2, ordered by pin time — same FORM as curatedItems (new field, existing primitive). */
  readonly featuredItems: readonly string[];
  /** ≤ 4 sections; a pid lives in ≤ 1 section; an empty section is invisible. */
  readonly sections: readonly StorefrontSection[];
  /** Existing Shop+ toggle — privée = absent from Découvrir, link ALWAYS resolves (loi 4). */
  readonly public: boolean;
}

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
  resellerId: 'res_aicha',
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
  public: true,
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
