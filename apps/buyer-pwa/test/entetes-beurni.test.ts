// node env has no localStorage; the vitrine's favourites pins need a fake.
const __m = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => __m.get(k) ?? null,
  setItem: (k: string, v: string) => void __m.set(k, v),
  removeItem: (k: string) => void __m.delete(k),
  clear: () => __m.clear(),
  key: (i: number) => [...__m.keys()][i] ?? null,
  get length() { return __m.size; },
} as Storage;
import { describe, expect, it } from 'vitest';
import { t } from '../src/i18n';
import { NNBSP } from '../src/cliente/money';
import {
  ENTETES_STYLES,
  nameTail,
  renderEntete,
  type EnteteKey,
} from '../src/vitrine/entetes';

/**
 * ENTETES-E — the Beurni Boss five (masque · harmattan · balafon · seance ·
 * cauris), against the normative handoff at design/shopplus-beurni-boss.
 *
 * Every assertion EXECUTES the renderer and reads its OUTPUT (the ENTETES-A
 * law: source greps are vacuous). The fixtures are the acceptance matrix's
 * F1–F6, in the repo's native shapes.
 */

/* --------------------------------------------------------------- fixtures -- */

const AVATAR = 'https://svc.example/media/storefronts/sf-bb/avatar/a.jpg';

const BASE = {
  id: 'sf-bb', resellerId: 'rs-bb', slug: 'beurni-1',
  name: 'Beurni Boss', zone: 'Gounghin, Ouagadougou', category: 'Général',
  tagline: '', bio: '', theme: 'laterite' as const,
  cover: { status: 'none' as const },
  avatar: { mode: 'photo' as const, url: AVATAR },
  curatedItems: ['pv-1'], featuredItems: [], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};
/** F5/F6 — no photo at all. */
const SANS_PHOTO = { ...BASE, avatar: { mode: 'monogram' as const } };
/** F4 — the 24-char name + the long zone, the anti-orphan stress case. */
const LONGUE = { ...BASE, name: 'Atelier Élégance-Burkina', zone: 'Secteur 30, Bobo-Dioulasso' };

/** F1 — COMPLET + AVIS. */
const F1 = { deliveredCount: 128, rating: '4,9', reviewCount: 28, demo: false };
/** F2 — MINIMAL. */
const F2 = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
/** F3 — COMPLET SANS AVIS (1 delivery, 2 reviews — below the floor of 3). */
const F3 = { deliveredCount: 1, rating: '5', reviewCount: 2, demo: false };
/** F4 trust — the big numbers that must group with NNBSP. */
const F4 = { deliveredCount: 1287, rating: '4,75', reviewCount: 307, demo: false };

const FIVE: readonly EnteteKey[] = ['masque', 'harmattan', 'balafon', 'seance', 'cauris'];

const ROOT: Record<string, string> = {
  masque: 'vt-ma', harmattan: 'vt-ha', balafon: 'vt-ba', seance: 'vt-se', cauris: 'vt-ca',
};
/** The style's own MINIMAL pattern class — what fills the frame sans photo. */
const MOTIF: Record<string, string> = {
  masque: 'ma-frame-motif', harmattan: 'ha-frame-motif', balafon: 'ba-frame-motif',
  seance: 'se-frame-motif', cauris: 'ca-frame-motif',
};
/** Handoff §5 — the portrait bias each style's SHEET crops the avatar on. */
const AVATAR_POS: Record<string, string> = {
  masque: '50% 26%', harmattan: '50% 24%', balafon: '50% 24%',
  seance: '50% 24%', cauris: '50% 24%',
};

const head = (key: EnteteKey, sf: unknown, trust: unknown, fromProduct = false): string =>
  renderEntete(key, sf as never, trust as never, { fromProduct });

/** Visible copy only — tags stripped (proves what reaches her eyes). */
const visible = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------- 1 · identity + strings -- */

describe('ENTETES-E — each unit renders her identity and the exact handoff strings', () => {
  for (const key of FIVE) {
    it(`${key}: root, roles, name, zone line, « Bienvenue », the three trust labels verbatim`, () => {
      const html = head(key, BASE, F1);
      expect(html).toContain(`class="vt-ent ${ROOT[key]}"`);
      expect(html).toContain('data-role="vitrine-hero"');
      expect(html).toContain('data-role="vitrine-identity"');
      expect(html).toContain('data-role="vitrine-trust"');
      expect(html).toContain('data-role="vitrine-cover"');
      // the anti-orphan tail carries the name (Beurni&nbsp; + accent « Boss »)
      expect(html).toContain('<span class="vt-ent-tail"><span class="vt-ent-acc"><v>Boss</v></span></span>');
      expect(html).toContain('Beurni&nbsp;');
      expect(html).toContain('<v>Gounghin, Ouagadougou</v>');
      // the five use the handoff's TWO-LINE variant: « Vendeuse vérifiée »
      // bare (derived from the one catalog string), zone on its own line
      expect(html).toContain(t('vit.verifiee').replace(/\s*·\s*$/, ''));
      expect(html).toContain(t('vit.bienvenue')); // « Bienvenue »
      // the three labels, word for word — the third is the founder's verbatim
      expect(html).toContain(t('vit.chip_sera')); // « Livraison Séra vérifiée & scellée »
      expect(html).toContain(t('vit.chip_paiement')); // « Paiement protégé »
      expect(html).toContain('Les meilleurs prix garantis');
      expect(html).toContain(t('vit.cell_sera_sub'));
      expect(html).toContain(t('vit.cell_paiement_sub'));
      expect(html).toContain(t('vit.cell_prix_sub'));
    });

    it(`${key}: both controls exist from a product; share alone (shifted) on a direct landing`, () => {
      const fromProduct = head(key, BASE, F1, true);
      expect(fromProduct).toContain('data-action="retour"');
      expect(fromProduct).toContain('data-action="partager"');
      const direct = head(key, BASE, F1, false);
      expect(direct).not.toContain('data-action="retour"');
      expect(direct).toContain('data-action="partager"');
      const offset = (h: string): string => /vt-ent-share[^>]*style="([^"]+)"/.exec(h)?.[1] ?? '';
      expect(offset(direct)).not.toBe('');
      expect(offset(fromProduct)).not.toBe(offset(direct));
    });
  }
});

/* ------------------------------------------------------------ 2 · honesty -- */

describe('ENTETES-E — the frozen honesty rules, per style, on executed output', () => {
  for (const key of FIVE) {
    it(`${key}: F1 (COMPLET + AVIS) — « 128 ventes livrées par Séra » and « 4,9 · 28 avis », no badge`, () => {
      const html = head(key, BASE, F1);
      expect(html).toContain('data-role="reputation"');
      expect(html).toContain('<v>128</v>');
      expect(html).toContain(t('vit.ventes_livrees'));
      expect(html).toContain('data-role="chip-avis"');
      expect(html).toContain(`<v>4,9</v> · <v>28</v> ${t('vit.avis')}`);
      expect(html).not.toContain('data-role="chip-nouvelle"');
      expect(html).not.toContain(t('vit.nouvelle_vendeuse'));
    });

    it(`${key}: F2 (MINIMAL) — « Nouvelle vendeuse » only, and NOT ONE NUMBER on screen`, () => {
      const html = head(key, BASE, F2);
      expect(html).toContain('data-role="chip-nouvelle"');
      expect(visible(html)).toContain('Nouvelle');
      expect(visible(html)).toContain('vendeuse');
      expect(html).not.toContain('data-role="reputation"');
      expect(html).not.toContain('data-role="chip-avis"');
      expect(html).not.toContain(t('vit.ventes_livrees'));
      // the fake-proof ban: nothing resembling the mockups' « +1,2k clientes »
      expect(html).not.toMatch(/clientes satisfaites/i);
      expect(html).not.toMatch(/1[,.]?2\s?k/i);
      // strip markup + the platform's « 100% sécurisé » sub: no digit remains
      const copy = visible(html).split(t('vit.cell_paiement_sub')).join(' ');
      expect(copy).not.toMatch(/\d/);
      // negative control — the same extractor DOES find real history
      const withHistory = visible(head(key, BASE, F1)).split(t('vit.cell_paiement_sub')).join(' ');
      expect(withHistory).toMatch(/128/);
      expect(withHistory).toMatch(/4,9/);
    });

    it(`${key}: F3 (COMPLET SANS AVIS) — proof at 1 delivery, NO rating chip at 2 reviews, no badge`, () => {
      const html = head(key, BASE, F3);
      expect(html).toContain('data-role="reputation"');
      expect(html).toContain('<v>1</v>');
      expect(html).not.toContain('data-role="chip-avis"');
      expect(visible(html)).not.toContain('5 ·'); // the rating leaks nowhere
      expect(html).not.toContain('data-role="chip-nouvelle"');
      // the boundary the floor freezes: exactly 3 reviews EARNS the chip
      const at3 = head(key, BASE, { ...F3, reviewCount: 3, rating: '5' });
      expect(at3).toContain('data-role="chip-avis"');
    });

    it(`${key}: F4 — 1287 deliveries group as « 1 287 » (NNBSP, the byte-stable formatter)`, () => {
      const html = head(key, LONGUE, F4);
      expect(html).toContain(`<v>1${NNBSP}287</v>`);
      expect(html).toContain(`<v>4,75</v> · <v>307</v> ${t('vit.avis')}`);
    });
  }
});

/* -------------------------------------------- 3 · portrait, or the pattern -- */

describe('ENTETES-E — her portrait in the style frame, or the monogram pattern; never a void', () => {
  for (const key of FIVE) {
    it(`${key}: a real portrait draws the avatar <img>; the sheet biases it at ${AVATAR_POS[key]}`, () => {
      const html = head(key, BASE, F1);
      expect(html).toContain('data-etat="live"');
      expect(html).toContain(`src="${AVATAR}"`);
      expect(html).toContain(`alt="${t('vit.avatar_alt')}"`);
      // the crop bias lives in the SHEET (her inline focus must stay the only
      // inline emitter) — pinned here against the style's own rule
      expect(ENTETES_STYLES).toContain(`object-position: ${AVATAR_POS[key]}`);
      expect(html).not.toContain(MOTIF[key]!);
    });

    it(`${key}: her ENTETES-C framing rides the <img> inline and wins over the sheet`, () => {
      const framed = { ...BASE, avatar: { mode: 'photo' as const, url: AVATAR, focus: { x: 10, y: 90 } } };
      const html = head(key, framed, F1);
      expect(html).toContain('style="object-position:10% 90%"');
      // …and an unframed portrait emits NO inline style at all
      expect(head(key, BASE, F1)).not.toContain('style="object-position:');
    });

    it(`${key}: no photo ⇒ no <img>, the style's own pattern + HER initial (never a « B », never a void)`, () => {
      const html = head(key, SANS_PHOTO, F2);
      expect(html).toContain('data-etat="none"');
      expect(html).not.toContain('<img');
      expect(html).toContain(MOTIF[key]!);
      // the monogram is the SHOP's initial — « Beurni Boss » ⇒ B here, but a
      // different shop shows ITS initial, not the handoff's demo « B »
      const awa = head(key, { ...SANS_PHOTO, name: 'Chez Awa' }, F2);
      expect(awa).toMatch(/-mono">A</);
    });

    it(`${key}: a photo-mode avatar with NO url falls back to the pattern, never a broken <img>`, () => {
      const html = head(key, { ...BASE, avatar: { mode: 'photo' as const } }, F1);
      expect(html).not.toContain('<img');
      expect(html).toContain(MOTIF[key]!);
    });

    it(`${key}: the avatar URL and her name are ESCAPED — a record is not a licence to inject`, () => {
      const hostile = {
        ...BASE,
        name: 'Chez <script>alert(1)</script>',
        avatar: { mode: 'photo' as const, url: 'https://x/a.jpg" onerror="alert(1)' },
      };
      const html = head(key, hostile, F1);
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('onerror="alert');
      expect(html).toContain('&lt;script&gt;');
    });
  }
});

/* ------------------------------------------------- 4 · the anti-orphan tail -- */

describe('ENTETES-E — nameTail: the deterministic anti-orphan rule, executed', () => {
  it('a short two-word name: nbsp joint — the accent word can never stand alone', () => {
    expect(nameTail('Beurni Boss')).toBe(
      '<v>Beurni&nbsp;</v><span class="vt-ent-tail"><span class="vt-ent-acc"><v>Boss</v></span></span>',
    );
  });
  it('a long hyphened name: the last WORD wraps whole (no hyphen break), joint stays breakable', () => {
    expect(nameTail('Atelier Élégance-Burkina')).toBe(
      '<v>Atelier </v><span class="vt-ent-tail"><v>Élégance-</v><span class="vt-ent-acc"><v>Burkina</v></span></span>',
    );
  });
  it('a single-word name IS its own tail (the whole name takes the accent)', () => {
    expect(nameTail('Beurni')).toBe('<span class="vt-ent-tail"><span class="vt-ent-acc"><v>Beurni</v></span></span>');
  });
  it('normalisation: trim + collapse; escaping: hostile bytes neutralised', () => {
    expect(nameTail('  Chez   Awa ')).toBe(
      '<v>Chez&nbsp;</v><span class="vt-ent-tail"><span class="vt-ent-acc"><v>Awa</v></span></span>',
    );
    expect(nameTail('A <b>')).toBe(
      '<v>A&nbsp;</v><span class="vt-ent-tail"><span class="vt-ent-acc"><v>&lt;b&gt;</v></span></span>',
    );
  });
  it('the sheet makes the tail nowrap (inline-block), for all five at once', () => {
    const rule = ENTETES_STYLES.slice(ENTETES_STYLES.indexOf('.vt-ent .vt-ent-tail {'));
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/display:\s*inline-block;\s*white-space:\s*nowrap/);
  });
  it('the 14-char and 19-char size tiers ride the render as classes', () => {
    for (const key of FIVE) {
      expect(head(key, BASE, F1)).not.toMatch(/vt-ent-long|vt-ent-xlong/); // 11 chars
      expect(head(key, { ...BASE, name: 'Chez Wendkuni Or' }, F1)).toContain('vt-ent-long'); // 16
      expect(head(key, LONGUE, F1)).toContain('vt-ent-xlong'); // 24
    }
  });
});

/* --------------------------------------------------- 5 · sheet discipline -- */

describe('ENTETES-E — the five sheets keep the house laws', () => {
  const START = ENTETES_STYLES.indexOf('ENTETES-E · the Beurni Boss five');
  const SHEET_E = ENTETES_STYLES.slice(START);

  it('the section exists and every rule is scoped under a .vt-* root', () => {
    expect(START).toBeGreaterThan(0);
    for (const line of SHEET_E.split('\n')) {
      const m = /^\s{2}(\.[^\s{]+[^{]*)\{/.exec(line);
      if (m) expect(m[1], line).toMatch(/^\.vt-(ent|ma|ha|ba|se|ca)[ .]/);
    }
  });

  it('no animation, no transition, no backdrop-filter, no blur in the five (handoff interdits)', () => {
    expect(SHEET_E).not.toMatch(/animation|@keyframes|backdrop-filter|blur\(/);
    expect(SHEET_E).not.toMatch(/transition/);
  });

  it('no runtime texture: the only url() in the whole sheet is none at all', () => {
    expect(SHEET_E).not.toMatch(/url\(/);
  });

  it('decorative layers cannot intercept taps (the shared aria-hidden rule)', () => {
    expect(ENTETES_STYLES).toContain('.vt-ent [aria-hidden="true"] { pointer-events: none; }');
  });

  it('the five heroes and strips carry the handoff heights (246/248 · 74/72)', () => {
    expect(ENTETES_STYLES).toMatch(/\.vt-ma \.ma-scene \{ position: relative; height: 246px; \}/);
    expect(ENTETES_STYLES).toMatch(/\.vt-ha \.ha-scene \{ position: relative; height: 246px; \}/);
    expect(ENTETES_STYLES).toMatch(/\.vt-ba \.ba-scene \{ position: relative; height: 248px; \}/);
    expect(ENTETES_STYLES).toMatch(/\.vt-se \.se-scene \{ position: relative; height: 246px; \}/);
    expect(ENTETES_STYLES).toMatch(/\.vt-ca \.ca-scene \{ position: relative; height: 248px; \}/);
  });
});

/* -------------------------------------- 6 · the six are behaviourally inert -- */

describe('ENTETES-E — the six existing styles absorbed NOTHING from this slice', () => {
  const SIX: readonly EnteteKey[] = ['royale', 'heritage', 'chaleureux', 'cristal', 'dynamique'];
  const richSf = { ...BASE, cover: { status: 'live' as const, url: 'https://svc.example/c.jpg' } };

  for (const key of SIX) {
    it(`${key}: no tail markup, no xlong tier, no « Bienvenue », counts stay raw bytes`, () => {
      const html = head(key, { ...richSf, name: 'Atelier Élégance-Burkina' }, F4, true);
      expect(html).not.toContain('vt-ent-tail');
      expect(html).not.toContain('vt-ent-xlong');
      expect(html).not.toContain(t('vit.bienvenue'));
      // the six render the count exactly as before — ungrouped
      expect(html).toContain('<v>1287</v>');
      expect(html).not.toContain(`1${NNBSP}287`);
    });
  }

  it('classique: byte-identical through the dispatch, still the hero + chips', () => {
    const out = head('classique', richSf, F1, true);
    expect(out).toContain('class="vt-hero"');
    expect(out).not.toContain('vt-ent-tail');
  });
});
