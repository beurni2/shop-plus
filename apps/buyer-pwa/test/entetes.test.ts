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
      expect(html).toContain(t('vit.ventes_livrees'));
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

  it('the closed list is exactly the six, classique first', () => {
    expect([...ENTETE_KEYS]).toEqual(['classique', 'royale', 'heritage', 'chaleureux', 'cristal', 'dynamique']);
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
    // there is exactly ONE @supports in the sheet, and no blur outside Cristal
    expect(ENTETES_STYLES.match(/@supports \(/g) ?? []).toHaveLength(1);
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
