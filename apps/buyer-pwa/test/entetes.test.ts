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
import {
  ENTETE_KEYS,
  ENTETES_STYLES,
  renderEntete,
  resolveEntete,
  type EnteteKey,
} from '../src/vitrine/entetes';
import { renderVitrineEmpty, renderVitrineReady } from '../src/vitrine/render';

/**
 * ENTETES-A — the five selectable headers.
 *
 * EVERY assertion here EXECUTES the renderer and reads its OUTPUT. This project
 * has already proved that a readFileSync + toContain grep on source text is a
 * vacuous test (it stays green when the branch it claims to protect is deleted),
 * so nothing below inspects a source file: the honesty rules are checked on the
 * bytes a cliente's browser would actually receive, once per style.
 */

/* --------------------------------------------------------------- fixtures -- */

const BASE = {
  id: 'sf-ent', resellerId: 'rs-ent', slug: 'chez-ent-1',
  name: 'Chez Awa', zone: 'Gounghin, Ouagadougou', category: 'Général',
  tagline: 'Bienvenue', bio: 'Du bon tissu, choisi à la main.', theme: 'foret' as const,
  cover: { status: 'none' as const },
  avatar: { mode: 'monogram' as const },
  curatedItems: ['pv-1'], featuredItems: [], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};
const PHOTO = 'https://svc.example/media/storefronts/sf-ent/cover/a.jpg';
const WITH_COVER = { ...BASE, cover: { status: 'live' as const, url: PHOTO } };

/** The contract's COMPLET demo trust — 12 deliveries, 4,8 over 17 reviews. */
const REAL = { deliveredCount: 12, rating: '4,8', reviewCount: 17, demo: false };
/** What a REAL new storefront actually carries: no history at all. */
const ZERO = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
/** Below the frozen floor of 3 — a rating exists but has NOT earned its stars. */
const BELOW_FLOOR = { deliveredCount: 4, rating: '4,8', reviewCount: 2, demo: false };

const PRODUCTS = [
  { pid: 'pv-1', name: 'Bazin riche', priceFcfa: 9_400, inStock: true, assetRefs: [] as string[] },
];

/** The five — « classique » is the untouched default and is pinned separately. */
const FIVE: readonly EnteteKey[] = ['royale', 'heritage', 'chaleureux', 'cristal', 'dynamique'];

/** The style's own MINIMAL pattern class (HANDOFF §3) — what fills the photo
 *  region when she has no cover. One per style; never a shared placeholder. */
const MOTIF: Record<string, string> = {
  royale: 'ry-med-motif',
  heritage: 'he-photo-motif',
  chaleureux: 'ch-galet-motif',
  cristal: 'cr-frame-motif',
  dynamique: 'dy-photo-motif',
};

/** HANDOFF §5 — the portrait bias each style crops its cover photograph on. */
const OBJECT_POS: Record<string, string> = {
  royale: '42% 28%',
  heritage: '50% 18%',
  chaleureux: '50% 24%',
  cristal: '50% 22%',
  dynamique: '58% 30%',
};

/** Each style's root class — the scope its whole sheet hangs off. */
const ROOT: Record<string, string> = {
  royale: 'vt-ry',
  heritage: 'vt-he',
  chaleureux: 'vt-ch',
  cristal: 'vt-cr',
  dynamique: 'vt-dy',
};

/** The three split-column layouts that drop to a fixed size past 14 chars. */
const LONG_NAME_STYLES: readonly EnteteKey[] = ['royale', 'chaleureux', 'dynamique'];

const head = (key: EnteteKey, sf: unknown, trust: unknown, fromProduct = false): string =>
  renderEntete(key, sf as never, trust as never, { fromProduct });

/** Visible copy only — tags stripped. Used to prove no NUMBER reaches the
 *  screen, which markup-level greps cannot show (svg paths and px offsets are
 *  full of digits and none of them is a claim about her). */
const visible = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------- 1 · renders -- */

describe('ENTETES-A — every key renders her identity and the trust row word for word', () => {
  for (const key of FIVE) {
    it(`${key}: name, zone line and the three trust labels`, () => {
      const html = head(key, WITH_COVER, REAL);
      expect(html).toContain('data-role="vitrine-hero"');
      expect(html).toContain('data-role="vitrine-identity"');
      expect(html).toContain('data-role="vitrine-trust"');
      // her identity, from the real fields only
      expect(html).toContain('<v>Chez Awa</v>');
      expect(html).toContain('<v>Gounghin, Ouagadougou</v>');
      expect(html).toContain(t('vit.verifiee')); // « Vendeuse vérifiée · »
      expect(html).toContain('<v>Bienvenue</v>'); // tagline present ⇒ rendered
      // §2.6 — the six trust labels, reproduced word for word
      expect(html).toContain(t('vit.chip_sera'));
      expect(html).toContain(t('vit.cell_sera_sub'));
      expect(html).toContain(t('vit.chip_paiement'));
      expect(html).toContain(t('vit.cell_paiement_sub'));
      expect(html).toContain(t('vit.cell_prix_sub'));
      // …and Héritage is the ONE style carrying the short prix label
      if (key === 'heritage') {
        expect(html).toContain(t('vit.cell_prix_court')); // « Meilleurs prix garantis »
        expect(html).not.toContain(t('vit.cell_prix')); // never the long form
      } else {
        expect(html).toContain(t('vit.cell_prix')); // « Les meilleurs prix garantis »
      }
    });

    it(`${key}: an ABSENT optional field is removed from the flow, with no reserved space`, () => {
      // §2.4 — no placeholder, no empty node standing in for a tagline or a bio.
      const bare = { ...WITH_COVER, tagline: '', bio: '' };
      const html = head(key, bare, REAL);
      expect(html).not.toContain('Bienvenue');
      expect(html).not.toContain('Du bon tissu');
      // the identity itself still renders — absence removes the field, not the header
      expect(html).toContain('<v>Chez Awa</v>');
      expect(html).toContain('data-role="vitrine-trust"');
    });

    it(`${key}: both controls are present and neither is below the touch floor`, () => {
      const fromProduct = head(key, WITH_COVER, REAL, true);
      expect(fromProduct).toContain('data-action="retour"');
      expect(fromProduct).toContain('data-action="partager"');
      expect(fromProduct).toContain(`aria-label="${t('vit.retour_aria')}"`);
      // §2.5 — no product provenance ⇒ no back button, and share takes the corner
      const direct = head(key, WITH_COVER, REAL, false);
      expect(direct).not.toContain('data-action="retour"');
      expect(direct).toContain('data-action="partager"');
      // the share button MOVES when the back button is not there (contract shR3/shR5)
      const offset = (h: string): string => /vt-ent-share[^>]*style="([^"]+)"/.exec(h)?.[1] ?? '';
      expect(offset(direct)).not.toBe('');
      expect(offset(fromProduct)).not.toBe(offset(direct));
    });
  }

  it('the touch floor is 44px in the sheet, for every style at once (§6)', () => {
    const btn = ENTETES_STYLES.slice(ENTETES_STYLES.indexOf('.vt-ent-btn {'));
    expect(btn.slice(0, btn.indexOf('}'))).toMatch(/width:\s*44px;\s*height:\s*44px/);
  });
});

/* ------------------------------------------------------------- 2 · honesty -- */

describe('ENTETES-A — the frozen honesty rules hold, per style, on executed output', () => {
  for (const key of FIVE) {
    it(`${key}: ZERO history ⇒ « Nouvelle vendeuse », no proof, and NOT ONE NUMBER on screen`, () => {
      const html = head(key, WITH_COVER, ZERO);
      // §2.3 — the badge is the zero-history state, and it is the ONLY one
      expect(html).toContain('data-role="chip-nouvelle"');
      expect(html).toContain(t('vit.nouvelle_vendeuse'));
      // §2.1 / §2.2 — no delivery count, no stars: she has earned neither
      expect(html).not.toContain('data-role="reputation"');
      expect(html).not.toContain('data-role="chip-avis"');
      expect(html).not.toContain(t('vit.ventes_livrees'));
      expect(html).not.toContain(t('vit.avis_verifies'));
      // Shop+ law 5 — and the visuals' « +1,2k clientes satisfaites » does not exist
      expect(html).not.toMatch(/clientes satisfaites/i);
      expect(html).not.toMatch(/1[,.]?2\s?k/i);
      // THE REAL PROOF: strip the markup and the platform's own « 100% sécurisé »
      // label, and NO DIGIT is left — a shop with no history shows no number.
      const copy = visible(html).split(t('vit.cell_paiement_sub')).join(' ');
      expect(copy).not.toMatch(/\d/);
      // NEGATIVE CONTROL — the same extractor on the SAME style with real
      // history DOES find her numbers. Without this line the assertion above
      // would pass just as happily on a broken extractor that always returns ''.
      const withHistory = visible(head(key, WITH_COVER, REAL))
        .split(t('vit.cell_paiement_sub'))
        .join(' ');
      expect(withHistory).toMatch(/12/);
      expect(withHistory).toMatch(/4,8/);
    });

    it(`${key}: REAL history ⇒ her true counts, and the badge is gone`, () => {
      const html = head(key, WITH_COVER, REAL);
      expect(html).toContain('data-role="reputation"');
      expect(html).toContain('<v>12</v>');
      // Cristal renders the contract's two-line split (« {N} ventes » bold /
      // « livrées par Séra ») — the phrase is present but not contiguous there.
      if (key === 'cristal') {
        expect(html).toContain('ventes</b>');
        expect(html).toContain('livrées par Séra');
      } else {
        expect(html).toContain(t('vit.ventes_livrees'));
      }
      expect(html).toContain('data-role="chip-avis"');
      expect(html).toContain('<v>4,8</v>');
      expect(html).toContain('<v>17</v>');
      // §2.3 — proof and the badge NEVER coexist
      expect(html).not.toContain('data-role="chip-nouvelle"');
      expect(html).not.toContain(t('vit.nouvelle_vendeuse'));
    });

    it(`${key}: 2 reviews is below the frozen floor ⇒ no stars, and the rating leaks NOWHERE`, () => {
      const html = head(key, WITH_COVER, BELOW_FLOOR);
      expect(html).not.toContain('data-role="chip-avis"');
      expect(html).not.toContain('4,8'); // not in a chip, not in an attribute, not anywhere
      expect(html).not.toContain(t('vit.avis_verifies'));
      expect(html).not.toContain('<v>2</v>'); // and never the count that did not qualify
      // …while the deliveries she DID earn still render (the two rules are separate)
      expect(html).toContain('data-role="reputation"');
      expect(html).toContain('<v>4</v>');
      // 4 deliveries is history, so the badge stays away
      expect(html).not.toContain('data-role="chip-nouvelle"');
    });

    it(`${key}: exactly 1 delivery is proof; exactly 3 reviews earns the stars (the boundaries)`, () => {
      const one = head(key, WITH_COVER, { deliveredCount: 1, rating: '5,0', reviewCount: 3, demo: false });
      expect(one).toContain('data-role="reputation"');
      expect(one).toContain('<v>1</v>');
      expect(one).toContain('data-role="chip-avis"');
      expect(one).toContain('<v>3</v>');
      // and one review short of the floor is still no stars
      const two = head(key, WITH_COVER, { deliveredCount: 1, rating: '5,0', reviewCount: 2, demo: false });
      expect(two).not.toContain('data-role="chip-avis"');
      expect(two).not.toContain('5,0');
    });
  }
});

/* --------------------------------------------------------------- 3 · cover -- */

describe('ENTETES-A — her photograph, or the style’s own pattern; never a claim to either', () => {
  for (const key of FIVE) {
    it(`${key}: a real cover draws the <img> at this style's object-position`, () => {
      const html = head(key, WITH_COVER, REAL);
      expect(html).toContain('data-role="vitrine-cover"');
      expect(html).toContain('data-etat="live"');
      expect(html).toContain('class="vt-cover-img"');
      expect(html).toContain(`src="${PHOTO}"`);
      // HANDOFF §5 — the portrait bias is this style's, not a shared default
      expect(html).toContain(`object-position:${OBJECT_POS[key]}`);
      // …and the ornamental pattern is NOT drawn behind a real photograph
      expect(html).not.toContain(MOTIF[key]!);
    });

    it(`${key}: no cover ⇒ no <img> at all, and the style's OWN pattern fills the frame`, () => {
      const html = head(key, BASE, REAL);
      expect(html).toContain('data-etat="none"');
      expect(html).not.toContain('vt-cover-img');
      expect(html).not.toContain('src=""');
      expect(html).not.toContain('<img');
      expect(html).toContain(MOTIF[key]!);
      // the filigree monogram rides the pattern (§3 MINIMAL), from her real name
      expect(html).toMatch(/-mono[^>]*>A</);
      // …and no other style's pattern is borrowed
      for (const other of FIVE) {
        if (other !== key) expect(html).not.toContain(MOTIF[other]!);
      }
    });

    it(`${key}: the cover URL is ESCAPED — a storefront record is not a licence to inject`, () => {
      const nasty = 'https://h/a.jpg" onerror="alert(1)';
      const html = head(key, { ...BASE, cover: { status: 'live' as const, url: nasty } }, REAL);
      expect(html).not.toContain('onerror="alert(1)"');
      expect(html).toContain('&quot;');
    });

    it(`${key}: a live cover with NO url falls back to the pattern, never a broken <img>`, () => {
      const html = head(key, { ...BASE, cover: { status: 'live' as const } }, REAL);
      expect(html).not.toContain('<img');
      expect(html).toContain(MOTIF[key]!);
      expect(html).toContain('data-etat="none"');
    });
  }

  it('her NAME is escaped too, in every style', () => {
    for (const key of FIVE) {
      const html = head(key, { ...BASE, name: 'Chez <script>x</script>' }, REAL);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    }
  });
});

/* ------------------------------------------------------------ 4 · resolver -- */

describe('ENTETES-A — ?entete= is the founder’s preview lever and nothing more', () => {
  it('every key round-trips from the query string', () => {
    for (const key of ENTETE_KEYS) {
      expect(resolveEntete(`?entete=${key}`)).toBe(key);
      expect(resolveEntete(`?slug=x&entete=${key}&other=1`)).toBe(key);
    }
  });

  it('garbage, absent, empty and near-misses all fall back to classique', () => {
    expect(resolveEntete('')).toBe('classique');
    expect(resolveEntete('?')).toBe('classique');
    expect(resolveEntete('?entete=')).toBe('classique');
    expect(resolveEntete('?entete=ROYALE')).toBe('classique'); // exact match only
    expect(resolveEntete('?entete=royal')).toBe('classique');
    expect(resolveEntete('?entete=../../etc')).toBe('classique');
    expect(resolveEntete('?demo-vitrine=aicha-4821')).toBe('classique');
    expect(resolveEntete('?entete=<script>')).toBe('classique');
  });

  it('the closed list is the canon thirty-one — the built eleven first, in order, then vocabulary', () => {
    expect([...ENTETE_KEYS]).toEqual([
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
      // ENTETES-H — vocabulary (canon v2.4.0). NAMEABLE, not drawn: a stored
      // storefront may carry one, and renderEntete falls back to classique
      // until its unit lands.
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
    ]);
    // the BUILT eleven keep their EXACT positions — this is what guarantees a
    // stored value can never come back as a different header after a canon bump
    expect([...ENTETE_KEYS].slice(0, 11)).toEqual([
      'classique', 'royale', 'heritage', 'chaleureux', 'cristal', 'dynamique',
      'masque', 'harmattan', 'balafon', 'seance', 'cauris',
    ]);
  });
});

/* --------------------------------------------------- 5 · classique untouched -- */

describe('ENTETES-A — classique is BYTE-IDENTICAL, and it is what every caller gets', () => {
  const opts = { fromProduct: false };

  it('the DEFAULT parameter path equals an explicit classique, on the ready screen', () => {
    // Every existing caller passes no key at all. If these two strings differ by
    // one byte, the shipped default changed — which this slice forbids.
    const byDefault = renderVitrineReady(WITH_COVER as never, REAL, opts, {}, PRODUCTS);
    const explicit = renderVitrineReady(WITH_COVER as never, REAL, opts, {}, PRODUCTS, 'classique');
    expect(byDefault).toBe(explicit);
    // …and it really is the classique hero, not an empty string agreeing with itself
    expect(byDefault).toContain('class="vt-hero"');
    expect(byDefault).toContain('data-role="vitrine-trust"');
    expect(byDefault.length).toBeGreaterThan(1000);
  });

  it('the DEFAULT parameter path equals an explicit classique, on the empty screen', () => {
    const byDefault = renderVitrineEmpty(WITH_COVER as never, ZERO, { fromProduct: true });
    const explicit = renderVitrineEmpty(WITH_COVER as never, ZERO, { fromProduct: true }, 'classique');
    expect(byDefault).toBe(explicit);
    expect(byDefault).toContain('data-role="vitrine-vide"');
    // the empty screen carries the hero ALONE — no trust row, exactly as before
    expect(byDefault).toContain('class="vt-hero"');
    expect(byDefault).not.toContain('data-role="vitrine-trust"');
  });

  it('classique keeps the 4-argument hero shape: compact suppresses, plain does not', () => {
    const plain = renderEntete('classique', WITH_COVER as never, REAL, {}, '');
    const compact = renderEntete('classique', WITH_COVER as never, REAL, { compact: true }, '');
    expect(plain).toContain('data-role="vitrine-trust"'); // ready ⇒ hero + chips
    expect(compact).not.toContain('data-role="vitrine-trust"'); // vide ⇒ hero alone
    expect(compact).not.toContain('Bienvenue'); // compact drops the tagline, as today
    expect(plain).toContain('Bienvenue');
  });

  it('a NEW key changes the header and NOTHING below it', () => {
    // The band, the footer and the grid are shared: swapping the header must not
    // touch a single byte of the page under it.
    const tail = (html: string): string => html.slice(html.indexOf('data-role="vitrine-bande"'));
    const classique = renderVitrineReady(WITH_COVER as never, REAL, opts, {}, PRODUCTS, 'classique');
    for (const key of FIVE) {
      const swapped = renderVitrineReady(WITH_COVER as never, REAL, opts, {}, PRODUCTS, key);
      expect(swapped).not.toBe(classique); // the header really did change
      expect(tail(swapped)).toBe(tail(classique)); // …and the tail did not
      expect(swapped).toContain('data-role="vitrine-a-la-une"'); // à la une survives
    }
  });
});

/* ------------------------------------------------------------ 6 · long name -- */

describe('ENTETES-A — a 24-character name drops to the fixed reduced size (§4)', () => {
  const LONG = 'Mariam Ouédraogo-Kaboré'; // the contract's own casse fixture
  const SHORT = 'Chez Awa';

  it('the fixture really is the long case and the short one really is not', () => {
    expect(LONG.length).toBeGreaterThan(14);
    expect(SHORT.length).toBeLessThanOrEqual(14);
  });

  for (const key of LONG_NAME_STYLES) {
    it(`${key}: > 14 characters carries the reduced-size class; a short name does not`, () => {
      const long = head(key, { ...BASE, name: LONG }, REAL);
      expect(long).toContain('vt-ent-long');
      expect(long).toContain('<v>Mariam Ouédraogo-Kaboré</v>');
      const short = head(key, { ...BASE, name: SHORT }, REAL);
      expect(short).not.toContain('vt-ent-long');
    });
  }

  it('Héritage and Cristal keep their clamp — they are the wide columns (§4)', () => {
    for (const key of ['heritage', 'cristal'] as const) {
      expect(head(key, { ...BASE, name: LONG }, REAL)).not.toContain('vt-ent-long');
    }
  });

  it('the sheet gives each split-column style its own reduced size: 25 / 21 / 19', () => {
    expect(ENTETES_STYLES).toContain('.vt-ry .ry-name.vt-ent-long { font-size: 25px; }');
    expect(ENTETES_STYLES).toContain('.vt-ch .ch-name.vt-ent-long { font-size: 21px; }');
    expect(ENTETES_STYLES).toContain('.vt-dy .dy-name.vt-ent-long { font-size: 19px; }');
  });
});

/* -------------------------------------------------------------- 7 · scoping -- */

describe('ENTETES-A — five styles on one page cannot bleed into each other or the page', () => {
  it('every rule in the sheet is scoped under a .vt-* root class', () => {
    const selectors = [...ENTETES_STYLES.matchAll(/^[ \t]*([^@\s}][^{}\n]*?)\s*\{/gm)].map((m) => m[1]!);
    expect(selectors.length).toBeGreaterThan(50);
    for (const sel of selectors) {
      for (const part of sel.split(',')) {
        expect(part.trim(), `unscoped selector: ${sel}`).toMatch(/^\.vt-/);
      }
    }
  });

  it('the Cristal blur sits behind @supports with the contract’s finished fallback (§6)', () => {
    // A 1GB Android without backdrop-filter must get a finished opaque surface,
    // never a transparent unreadable card.
    expect(ENTETES_STYLES).toContain('.vt-cr .glz { background: rgba(255,255,255,.66); }');
    expect(ENTETES_STYLES).toMatch(/@supports \(\(backdrop-filter/);
    // the finished fallback is declared BEFORE the @supports, so a browser that
    // cannot blur never falls through to a transparent card
    expect(ENTETES_STYLES.indexOf('.vt-cr .glz { background: rgba(255,255,255,.66); }'))
      .toBeLessThan(ENTETES_STYLES.indexOf('@supports ('));
    // Exactly ONE @supports gates a BLUR — Cristal's. ENTETES-F added
    // `background-clip: text` gates for the Série 4 gold-brushed name segment;
    // those neither blur nor filter, and each declares a solid accent colour
    // BEFORE its gate, so a browser without background-clip still reads a
    // coloured word rather than a transparent one. Asserting the property
    // rather than a count is what keeps this gate meaningful as styles land.
    const gates = ENTETES_STYLES.match(/@supports \([^{]+/g) ?? [];
    expect(gates.filter((g) => g.includes('backdrop-filter'))).toHaveLength(1);
    for (const g of gates.filter((g) => !g.includes('backdrop-filter'))) {
      expect(g).toContain('background-clip');
    }
    for (const sel of ['pr', 'te', 'ti']) {
      // the solid fallback colour is declared in the ungated rule (wherever in
      // its block — Terracotta also switches face there), before the gate
      const decl = new RegExp(`\\.vt-${sel} \\.${sel}-name \\.vt-ent-acc \\{[^}]*color: [^};]+;[^}]*\\}`);
      expect(ENTETES_STYLES, sel).toMatch(decl);
      expect(ENTETES_STYLES.search(decl), sel).toBeLessThan(
        ENTETES_STYLES.indexOf(`@supports (background-clip: text) or (-webkit-background-clip: text) {\n    .vt-${sel}`),
      );
    }
    expect(ENTETES_STYLES.slice(0, ENTETES_STYLES.indexOf('.vt-cr {'))).not.toContain('backdrop-filter');
    expect(ENTETES_STYLES.slice(ENTETES_STYLES.indexOf('.vt-dy {'))).not.toContain('backdrop-filter');
    // §6 — « Aucun filter ailleurs »: no bare CSS filter anywhere in the sheet
    expect(ENTETES_STYLES).not.toMatch(/[^-\w]filter:/);
  });

  it('no continuous animation ships in the five headers (§6)', () => {
    expect(ENTETES_STYLES).not.toMatch(/@keyframes|animation:/);
  });
});

/* -------------------------------------------- 8 · the empty screen + shapes -- */

describe('ENTETES-A — the vide screen carries the chosen header too', () => {
  for (const key of FIVE) {
    it(`${key}: renders on the empty storefront, compact, above the untouched dashed card`, () => {
      const html = renderVitrineEmpty(WITH_COVER as never, ZERO, { fromProduct: false }, key);
      expect(html).toContain('data-role="vitrine-hero"');
      expect(html).toContain(ROOT[key]!); // this style's root class
      // compact suppresses the optional prose, exactly as classique's vide does
      expect(html).not.toContain('Bienvenue');
      expect(html).not.toContain('Du bon tissu');
      // …and everything below the header is the shared, unchanged empty state
      expect(html).toContain('data-role="vitrine-vide"');
      expect(html).toContain('data-role="vitrine-bande"');
      // a shop with no history and no products still shows no invented number
      expect(html).toContain('data-role="chip-nouvelle"');
      expect(html).not.toContain('data-role="reputation"');
    });
  }
});

describe('ENTETES-A — every style survives every combination of its own states', () => {
  it('120 renders: every tag closes, no undefined/NaN leaks into the page', () => {
    let renders = 0;
    for (const key of FIVE) {
      for (const trust of [REAL, ZERO, BELOW_FLOOR]) {
        for (const cover of [{ status: 'live' as const, url: PHOTO }, { status: 'none' as const }]) {
          for (const fromProduct of [true, false]) {
            for (const compact of [true, false]) {
              const html = renderEntete(
                key,
                { ...BASE, cover } as never,
                trust as never,
                { fromProduct, compact },
              );
              renders += 1;
              for (const tag of ['div', 'span', 'button', 'svg', 'v', 'b']) {
                const open = (html.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length;
                const close = (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
                expect(open, `${key}: <${tag}> opens more often than it closes`).toBe(close);
              }
              // a half-built template string is how « undefined » reaches a cliente
              expect(html).not.toContain('undefined');
              expect(html).not.toContain('NaN');
              expect(html).not.toContain('[object');
              expect(html.startsWith('<div class="vt-ent vt-')).toBe(true);
            }
          }
        }
      }
    }
    expect(renders).toBe(120);
  });
});

/**
 * M4 (verifier): the suite made ZERO assertions on any palette value — all five
 * palettes could be recoloured with CI green. These pin the relevé hex-for-hex
 * on the tokens that carry each style's identity.
 */
describe('palettes — the relevé values, pinned against silent recolour', () => {
  it('EACH STYLE CARRIES ITS CONTRACT TOKENS', () => {
    const pins: [string, string][] = [
      ['--ry-fond', '#26082C'], ['--ry-magenta', '#A81E62'], ['--ry-or', '#D4A857'], ['--ry-or-clair', '#E9CF8F'],
      ['--he-vert', '#0B4638'], ['--he-or', '#C79A45'], ['--he-creme', '#F7F1E5'],
      ['--ch-page', '#FDEEE7'], ['--ch-corail', '#D95238'],
    ];
    for (const [token, hex] of pins) {
      const re = new RegExp(`${token}\\s*:\\s*${hex}`, 'i');
      expect(ENTETES_STYLES, `${token} must be ${hex}`).toMatch(re);
    }
    // two identities that live as literals, not tokens, in the sheet
    expect(ENTETES_STYLES).toContain('#EDF2ED'); // Cristal's page
    expect(ENTETES_STYLES).toMatch(/118deg,\s*#2B1055/); // Dynamique's veil-anchored gradient
  });
});

/* ----------------------------------------------- 9 · ENTETES-B: the field -- */

/**
 * ENTETES-B — the storefront FIELD drives the render; `?entete=` stays the
 * founder's override. Everything below EXECUTES the decision functions, the
 * port and the renderer — never a source grep.
 */
describe('ENTETES-B — enteteForRender: the field drives, the ?entete= override wins', () => {
  it('field royale + NO param ⇒ royale (her choice reaches her page)', async () => {
    const { enteteForRender } = await import('../src/vitrine/flows');
    expect(enteteForRender(undefined, 'royale')).toBe('royale');
  });

  it('field royale + ?entete=cristal ⇒ cristal — the param wins, byte-for-byte the ENTETES-A lever', async () => {
    const { enteteForRender } = await import('../src/vitrine/flows');
    expect(enteteForRender('cristal', 'royale')).toBe('cristal');
    // …including previewing classique OVER a chosen header
    expect(enteteForRender('classique', 'royale')).toBe('classique');
  });

  it('field absent / storefront not yet resolved ⇒ classique, exactly as before the field existed', async () => {
    const { enteteForRender } = await import('../src/vitrine/flows');
    expect(enteteForRender(undefined, undefined)).toBe('classique');
    expect(enteteForRender(undefined, 'classique')).toBe('classique');
  });

  it('the classique perf guard holds for BOTH sources: only classique skips the sheet', async () => {
    const { enteteForRender, needsEnteteSheet } = await import('../src/vitrine/flows');
    // field-driven and override-driven keys feed the SAME guard
    expect(needsEnteteSheet(enteteForRender(undefined, 'classique'))).toBe(false);
    expect(needsEnteteSheet(enteteForRender(undefined, undefined))).toBe(false);
    for (const key of FIVE) {
      expect(needsEnteteSheet(enteteForRender(undefined, key)), `field ${key}`).toBe(true);
      expect(needsEnteteSheet(enteteForRender(key, undefined)), `param ${key}`).toBe(true);
    }
    // the override can also FORCE classique (no sheet) over a styled shop
    expect(needsEnteteSheet(enteteForRender('classique', 'royale'))).toBe(false);
  });

  it('EXECUTED ON THE RENDERER: the field-driven key renders that header on the ready screen', async () => {
    const { enteteForRender } = await import('../src/vitrine/flows');
    const opts = { fromProduct: false };
    const classique = renderVitrineReady(WITH_COVER as never, REAL, opts, {}, PRODUCTS, 'classique');
    // her chosen royale, no param: the Royale header is what a cliente receives
    const royale = renderVitrineReady(WITH_COVER as never, REAL, opts, {}, PRODUCTS, enteteForRender(undefined, 'royale'));
    expect(royale).toContain(ROOT['royale']!);
    expect(royale).not.toBe(classique);
    // …and the ?entete=cristal override on the same shop renders Cristal instead
    const cristal = renderVitrineReady(WITH_COVER as never, REAL, opts, {}, PRODUCTS, enteteForRender('cristal', 'royale'));
    expect(cristal).toContain(ROOT['cristal']!);
    expect(cristal).not.toContain(ROOT['royale']!);
  });
});

describe('ENTETES-B — the port boundary: old wire, new wire, garbage wire', () => {
  const stubFetch = async <T>(body: unknown, run: () => Promise<T>): Promise<T> => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({ ok: true, status: 200, json: async () => body }) as unknown as Response) as typeof fetch;
    try {
      return await run();
    } finally {
      globalThis.fetch = original;
    }
  };
  const WIRE_BASE = {
    id: 'sf-w', resellerId: 'rs-w', slug: 'chez-w-1', name: 'Chez Wendkuni',
    zone: 'Ouagadougou', category: 'Général', tagline: '', bio: '', theme: 'laterite',
    cover: { status: 'none' }, avatar: { mode: 'monogram' }, curatedItems: [],
    featuredItems: [], sections: [], discoverable: true, createdAt: 'T', updatedAt: 'T',
  };

  it('an OLD deployed service (no headerStyle on the wire) resolves classique — the page must not break', async () => {
    const { httpStorefrontPort } = await import('../src/vitrine/profile');
    const resolved = await stubFetch(WIRE_BASE, () => httpStorefrontPort('https://svc.example').resolve('chez-w-1'));
    expect(resolved).toBeTruthy();
    expect(resolved!.storefront.headerStyle).toBe('classique');
  });

  it('a NEW service wire carries her choice through', async () => {
    const { httpStorefrontPort } = await import('../src/vitrine/profile');
    const resolved = await stubFetch({ ...WIRE_BASE, headerStyle: 'royale' }, () =>
      httpStorefrontPort('https://svc.example').resolve('chez-w-1'),
    );
    expect(resolved!.storefront.headerStyle).toBe('royale');
  });

  it('garbage on the wire falls back to classique — never an unstyled header', async () => {
    const { httpStorefrontPort } = await import('../src/vitrine/profile');
    for (const bad of ['baroque', '', 42, null, { deep: true }]) {
      const resolved = await stubFetch({ ...WIRE_BASE, headerStyle: bad }, () =>
        httpStorefrontPort('https://svc.example').resolve('chez-w-1'),
      );
      expect(resolved!.storefront.headerStyle, JSON.stringify(bad)).toBe('classique');
    }
  });

  it('demo ports: default and empty stay classique; customised carries a NON-classique key (the honest exercise)', async () => {
    const { demoStorefrontPort } = await import('../src/vitrine/profile');
    expect((await demoStorefrontPort('default').resolve('aicha-4821'))!.storefront.headerStyle).toBe('classique');
    expect((await demoStorefrontPort('empty').resolve('aicha-4821'))!.storefront.headerStyle).toBe('classique');
    const customised = (await demoStorefrontPort('customised').resolve('aicha-4821'))!.storefront.headerStyle;
    expect(customised).toBe('royale');
    expect(customised).not.toBe('classique');
  });
});

/* ------------------------------------ 10 · ENTETES-B: verifier fix round -- */

/**
 * Verifier findings 1–2 closed here, both by EXECUTION:
 *   1. the app's key list is pinned to the EXECUTED canon import — a seventh
 *      canon style now fails a buyer test instead of coercing to classique;
 *   2. the absent/present `?entete=` distinction (main.ts's wiring) is the
 *      pure `enteteOverride`, pinned across its whole behaviour space — a
 *      regression to ENTETES-A's unconditional resolve fails loudly here.
 */
describe('ENTETES-B — canon conformance + the override wiring, pinned by execution', () => {
  it('ENTETE_KEYS is exactly the canon STOREFRONT_HEADER_STYLES, in canon order (executed import)', async () => {
    const { STOREFRONT_HEADER_STYLES } = await import('@platform/contracts');
    expect([...ENTETE_KEYS]).toEqual([...STOREFRONT_HEADER_STYLES]);
  });

  it('enteteOverride: ABSENT param is undefined — no override, her field drives', async () => {
    const { enteteOverride } = await import('../src/vitrine/entetes');
    expect(enteteOverride('')).toBeUndefined();
    expect(enteteOverride('?demo-cliente=C1&theme=indigo')).toBeUndefined();
  });

  it('enteteOverride: PRESENT param keeps the exact ENTETES-A coercion — and wins over the field', async () => {
    const { enteteOverride } = await import('../src/vitrine/entetes');
    const { enteteForRender } = await import('../src/vitrine/flows');
    expect(enteteOverride('?entete=royale')).toBe('royale');
    // garbage and the empty value are a PRESENT param: a classique OVERRIDE
    expect(enteteOverride('?entete=garbage')).toBe('classique');
    expect(enteteOverride('?entete=')).toBe('classique');
    expect(enteteOverride('?entete=ROYALE')).toBe('classique');
    // composed with the field: present-but-garbage FORCES classique over royale…
    expect(enteteForRender(enteteOverride('?entete=garbage'), 'royale')).toBe('classique');
    // …while the absent param lets her chosen field through
    expect(enteteForRender(enteteOverride(''), 'royale')).toBe('royale');
  });
});

/* -------------------------------------------- 11 · ENTETES-C: her framing -- */

/**
 * ENTETES-C — `cover.focus` / `avatar.focus` (canon v2.2.0) drive the emitted
 * `object-position`; ABSENT focus renders the style's contract framing
 * byte-for-byte, exactly as before the field existed. Everything below
 * EXECUTES the renderers and the port — never a source grep.
 */
describe('ENTETES-C — focus drives object-position; absent = the contract default, byte-for-byte', () => {
  const FOCUSED = { ...WITH_COVER, cover: { status: 'live' as const, url: PHOTO, focus: { x: 10, y: 90 } } };

  for (const key of FIVE) {
    it(`${key}: focus {10,90} ⇒ object-position:10% 90% — and the style default is GONE`, () => {
      const html = head(key, FOCUSED, REAL);
      expect(html).toContain('object-position:10% 90%');
      expect(html).not.toContain(`object-position:${OBJECT_POS[key]}`); // her hand replaced the default
      expect(html).toContain(`src="${PHOTO}"`); // still her photo, same markup family
    });

    it(`${key}: ABSENT focus ⇒ the contract default byte-for-byte (nothing about the emission changed)`, () => {
      const html = head(key, WITH_COVER, REAL);
      expect(html).toContain(`object-position:${OBJECT_POS[key]}`);
      expect(html).not.toContain('10% 90%');
      // and the unframed emission is IDENTICAL to a cover that never knew the field
      const stripped = head(key, { ...WITH_COVER, cover: { status: 'live' as const, url: PHOTO } }, REAL);
      expect(html).toBe(stripped);
    });

    it(`${key}: GARBAGE focus on the shape renders the default — never garbage in a style attribute`, () => {
      for (const bad of [{ x: 10 }, { x: 1.5, y: 2 }, { x: 500, y: 50 }, { x: '10', y: '90' }, 'haut', null]) {
        const html = head(key, { ...WITH_COVER, cover: { status: 'live' as const, url: PHOTO, focus: bad } }, REAL);
        expect(html, JSON.stringify(bad)).toContain(`object-position:${OBJECT_POS[key]}`);
        expect(html).not.toContain('undefined');
        expect(html).not.toContain('[object');
      }
    });
  }

  it('heritage: her AVATAR framing reaches the medallion <img> inline; unframed, the tag carries NO style at all', () => {
    const AV_URL = 'https://svc.example/media/av.jpg';
    const framed = head(
      'heritage',
      { ...WITH_COVER, avatar: { mode: 'photo' as const, url: AV_URL, focus: { x: 77, y: 33 } } },
      REAL,
    );
    const framedTag = /<img class="vt-avatar-img"[^>]*>/.exec(framed)?.[0] ?? '';
    expect(framedTag).toContain('style="object-position:77% 33%"');
    // unframed: the avatar <img> is BYTE-IDENTICAL to what it always emitted — no style attribute
    const plain = head('heritage', { ...WITH_COVER, avatar: { mode: 'photo' as const, url: AV_URL } }, REAL);
    const plainTag = /<img class="vt-avatar-img"[^>]*>/.exec(plain)?.[0] ?? '';
    expect(plainTag).not.toBe('');
    expect(plainTag).not.toContain('style=');
    // (the 50% 32% medallion bias lives in the sheet's CSS, untouched)
    expect(ENTETES_STYLES).toContain('.vt-he .he-med-photo .vt-avatar-img { object-position: 50% 32%; }');
  });

  it('every OTHER style carries the avatar framing the same way (one emitter, no per-style drift)', () => {
    const AV_URL = 'https://svc.example/media/av.jpg';
    for (const key of FIVE) {
      const html = head(key, { ...WITH_COVER, avatar: { mode: 'photo' as const, url: AV_URL, focus: { x: 1, y: 99 } } }, REAL);
      expect(html, key).toContain('object-position:1% 99%');
    }
  });

  it('classique: NO focus ⇒ not one object-position byte on the page (the ENTETES-A byte-identity family)', () => {
    const opts = { fromProduct: false };
    const plain = renderVitrineReady(WITH_COVER as never, REAL, opts, {}, PRODUCTS, 'classique');
    expect(plain).toContain(`src="${PHOTO}"`); // the cover really rendered
    expect(plain).not.toContain('object-position'); // and today's bytes carry no position at all
    // …byte-identical to a storefront whose cover object never knew the field
    const stripped = renderVitrineReady(
      { ...WITH_COVER, cover: { status: 'live' as const, url: PHOTO } } as never,
      REAL, opts, {}, PRODUCTS, 'classique',
    );
    expect(plain).toBe(stripped);
    // WITH focus, the classique cover <img> gains exactly the inline position
    const focused = renderVitrineReady(
      { ...WITH_COVER, cover: { status: 'live' as const, url: PHOTO, focus: { x: 10, y: 90 } } } as never,
      REAL, opts, {}, PRODUCTS, 'classique',
    );
    expect(focused).toContain('style="object-position:10% 90%"');
  });

  it('classique: the avatar photo takes her framing too, and stays bare without it', () => {
    const AV_URL = 'https://svc.example/media/av.jpg';
    const opts = { fromProduct: false };
    const focused = renderVitrineReady(
      { ...WITH_COVER, avatar: { mode: 'photo' as const, url: AV_URL, focus: { x: 40, y: 20 } } } as never,
      REAL, opts, {}, PRODUCTS, 'classique',
    );
    expect(focused).toContain('style="object-position:40% 20%"');
    const plain = renderVitrineReady(
      { ...WITH_COVER, avatar: { mode: 'photo' as const, url: AV_URL } } as never,
      REAL, opts, {}, PRODUCTS, 'classique',
    );
    expect(plain).not.toContain('object-position');
  });
});

describe('ENTETES-C — the port boundary: a canon pair rides, garbage is STRIPPED, demo ports are honest', () => {
  const stubFetch = async <T>(body: unknown, run: () => Promise<T>): Promise<T> => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({ ok: true, status: 200, json: async () => body }) as unknown as Response) as typeof fetch;
    try {
      return await run();
    } finally {
      globalThis.fetch = original;
    }
  };
  const WIRE = {
    id: 'sf-f', resellerId: 'rs-f', slug: 'chez-f-1', name: 'Chez Fati',
    zone: 'Ouagadougou', category: 'Général', tagline: '', bio: '', theme: 'laterite',
    cover: { status: 'live', url: 'https://svc.example/c.jpg' },
    avatar: { mode: 'photo', url: 'https://svc.example/a.jpg' },
    curatedItems: [], featuredItems: [], sections: [], discoverable: true, createdAt: 'T', updatedAt: 'T',
  };

  it('a valid integer pair 0–100 passes through on BOTH kinds', async () => {
    const { httpStorefrontPort } = await import('../src/vitrine/profile');
    const resolved = await stubFetch(
      { ...WIRE, cover: { ...WIRE.cover, focus: { x: 0, y: 100 } }, avatar: { ...WIRE.avatar, focus: { x: 40, y: 20 } } },
      () => httpStorefrontPort('https://svc.example').resolve('chez-f-1'),
    );
    expect(resolved!.storefront.cover.focus).toEqual({ x: 0, y: 100 });
    expect(resolved!.storefront.avatar.focus).toEqual({ x: 40, y: 20 });
  });

  it('a hostile wire — strings, lone axes, out-of-range, extra keys — is STRIPPED, never seen downstream', async () => {
    const { httpStorefrontPort } = await import('../src/vitrine/profile');
    for (const bad of [{ x: '50', y: '50' }, { x: 50 }, { x: 500, y: 50 }, { x: 1.5, y: 2 }, { x: 5, y: 6, z: 7 }, 'haut', 42, null]) {
      const resolved = await stubFetch(
        { ...WIRE, cover: { ...WIRE.cover, focus: bad } },
        () => httpStorefrontPort('https://svc.example').resolve('chez-f-1'),
      );
      expect(resolved!.storefront.cover.focus, JSON.stringify(bad)).toBeUndefined();
      expect('focus' in resolved!.storefront.cover, JSON.stringify(bad)).toBe(false); // the KEY is gone, not nulled
      // the photo itself is untouched by the stripping
      expect(resolved!.storefront.cover.url).toBe('https://svc.example/c.jpg');
    }
  });

  it('an OLD wire (no focus anywhere) resolves exactly as before — no key invented', async () => {
    const { httpStorefrontPort } = await import('../src/vitrine/profile');
    const resolved = await stubFetch(WIRE, () => httpStorefrontPort('https://svc.example').resolve('chez-f-1'));
    expect('focus' in resolved!.storefront.cover).toBe(false);
    expect('focus' in resolved!.storefront.avatar).toBe(false);
  });

  it('demo ports: customised carries NON-default framings (the honest exercise); default and empty carry none', async () => {
    const { demoStorefrontPort } = await import('../src/vitrine/profile');
    const customised = (await demoStorefrontPort('customised').resolve('aicha-4821'))!.storefront;
    expect(customised.cover.focus).toEqual({ x: 30, y: 70 });
    expect(customised.avatar.focus).toEqual({ x: 40, y: 20 });
    for (const variant of ['default', 'empty'] as const) {
      const sf = (await demoStorefrontPort(variant).resolve('aicha-4821'))!.storefront;
      expect(sf.cover.focus, variant).toBeUndefined();
      expect(sf.avatar.focus, variant).toBeUndefined();
    }
  });
});

/* ------------------------------- 11 · the loading state is not a dead link -- */

/**
 * FIELD FIX (founder report): tapping « voir ma boutique en ligne » showed
 * « Ce lien ne mène à aucune boutique » and only THEN the boutique. The mount
 * asks for `loading` with no storefront yet; the old guard rewrote ANY state
 * without a storefront to `invalid`, so the designed skeleton never rendered on
 * a real visit and a terminal error stood in for a network wait.
 */
describe('etatForRender — a state that reads no storefront is never the not-found', () => {
  it('LOADING with nothing resolved STAYS loading — the regression that shipped', async () => {
    const { etatForRender } = await import('../src/vitrine/flows');
    expect(etatForRender('loading', false)).toBe('loading');
  });

  it('only ready/empty — the states that DEREFERENCE the storefront — fall back to invalid', async () => {
    const { etatForRender } = await import('../src/vitrine/flows');
    expect(etatForRender('ready', false)).toBe('invalid');
    expect(etatForRender('empty', false)).toBe('invalid');
    // …and the storefront-free states pass through untouched
    expect(etatForRender('offline', false)).toBe('offline');
    expect(etatForRender('invalid', false)).toBe('invalid');
  });

  it('with a storefront in hand every state is served as asked', async () => {
    const { etatForRender } = await import('../src/vitrine/flows');
    for (const etat of ['loading', 'ready', 'empty', 'offline', 'invalid'] as const) {
      expect(etatForRender(etat, true), etat).toBe(etat);
    }
  });
});

/* ------------------------- 12 · ENTETES-E0/E: the dispatch and the wire ---- */

/**
 * ENTETES-E — the Beurni Boss five have their render units now (their own
 * suite lives in entetes-beurni.test.ts). What survives from the E0 law here:
 * every canon key dispatches to its OWN unit, never to classique's bytes, and
 * a hypothetical future key with no unit still falls back explicitly instead
 * of handing `undefined` to the page.
 */
describe('ENTETES-E — the five Beurni Boss keys render their own units, not classique', () => {
  const BUILT = ['masque', 'harmattan', 'balafon', 'seance', 'cauris'] as const;
  // ENTETES-F — the keys are unchanged canon; the ROOTS are the Série 4 units
  // they now draw (Prestige · Terracotta · Étendard · Douceur · Tissage).
  const ROOTS: Record<(typeof BUILT)[number], string> = {
    masque: 'vt-pr', harmattan: 'vt-te', balafon: 'vt-et', seance: 'vt-do', cauris: 'vt-ti',
  };

  for (const key of BUILT) {
    it(`${key}: renders its own root class, never the classique hero`, () => {
      const out = head(key as EnteteKey, WITH_COVER, REAL, true);
      expect(out).toContain(`class="vt-ent ${ROOTS[key]}"`);
      expect(out).not.toContain('class="vt-hero"');
      expect(out.length).toBeGreaterThan(1000);
    });
  }

  it('a FUTURE canon key with no unit still falls back to classique, explicitly', () => {
    const out = renderEntete('style-de-demain' as unknown as EnteteKey, BASE as never, ZERO as never, { compact: true });
    expect(out).toBe(renderEntete('classique', BASE as never, ZERO as never, { compact: true }));
    expect(out).toContain('class="vt-hero"');
  });
});

/**
 * ENTETES-E0 — the pairing that IS this slice: the port boundary now ACCEPTS
 * the five Beurni Boss keys (headerStyleFromWire normalises 'masque' to
 * 'masque', not to classique), while the renderer — whose units for them land
 * in E1/E2 — serves the classique bytes through the explicit default. Old-key
 * behaviour at the boundary is pinned unchanged alongside.
 */
describe('ENTETES-E0 — the wire accepts the five; the renderer falls back until their units land', () => {
  const stubFetch = async <T>(body: unknown, run: () => Promise<T>): Promise<T> => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({ ok: true, status: 200, json: async () => body }) as unknown as Response) as typeof fetch;
    try {
      return await run();
    } finally {
      globalThis.fetch = original;
    }
  };
  const WIRE_BASE = {
    id: 'sf-w', resellerId: 'rs-w', slug: 'chez-w-1', name: 'Chez Wendkuni',
    zone: 'Ouagadougou', category: 'Général', tagline: '', bio: '', theme: 'laterite',
    cover: { status: 'none' }, avatar: { mode: 'monogram' }, curatedItems: [],
    featuredItems: [], sections: [], discoverable: true, createdAt: 'T', updatedAt: 'T',
  };

  it('each of the five NEW keys passes the port boundary AS ITSELF — accepted, never coerced', async () => {
    const { httpStorefrontPort } = await import('../src/vitrine/profile');
    for (const key of ['masque', 'harmattan', 'balafon', 'seance', 'cauris']) {
      const resolved = await stubFetch({ ...WIRE_BASE, headerStyle: key }, () =>
        httpStorefrontPort('https://svc.example').resolve('chez-w-1'),
      );
      expect(resolved!.storefront.headerStyle, key).toBe(key);
    }
  });

  it('the six OLD keys pass the boundary exactly as before — behaviour unchanged', async () => {
    const { httpStorefrontPort } = await import('../src/vitrine/profile');
    for (const key of ['classique', 'royale', 'heritage', 'chaleureux', 'cristal', 'dynamique']) {
      const resolved = await stubFetch({ ...WIRE_BASE, headerStyle: key }, () =>
        httpStorefrontPort('https://svc.example').resolve('chez-w-1'),
      );
      expect(resolved!.storefront.headerStyle, key).toBe(key);
    }
    // …and garbage still falls back to classique, the ENTETES-B law intact
    const bad = await stubFetch({ ...WIRE_BASE, headerStyle: 'baroque' }, () =>
      httpStorefrontPort('https://svc.example').resolve('chez-w-1'),
    );
    expect(bad!.storefront.headerStyle).toBe('classique');
  });

  it("the ACCEPTED 'masque' — wire-normalised, not cast — renders the PRESTIGE unit end to end", async () => {
    const { httpStorefrontPort } = await import('../src/vitrine/profile');
    const resolved = await stubFetch({ ...WIRE_BASE, headerStyle: 'masque' }, () =>
      httpStorefrontPort('https://svc.example').resolve('chez-w-1'),
    );
    expect(resolved!.storefront.headerStyle).toBe('masque');
    const out = renderEntete(resolved!.storefront.headerStyle, resolved!.storefront, REAL as never, { fromProduct: true });
    expect(out).toContain('class="vt-ent vt-pr"');
    expect(out).not.toContain('class="vt-hero"');
    expect(out.length).toBeGreaterThan(1000);
  });
});
