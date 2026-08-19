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
import { beforeAll, describe, expect, it } from 'vitest';
import { t } from '../src/i18n';
import { NNBSP } from '../src/cliente/money';
import {
  ENTETES_STYLES,
  nameTail,
  renderEntete,
  type EnteteKey,
} from '../src/vitrine/entetes';
import { loadAllEntetes, loadedEnteteCss } from '../src/vitrine/entetes/registry';

/**
 * ENTETES-F — the SÉRIE 4 five (Prestige · Terracotta · Étendard · Douceur ·
 * Tissage), against the pixel contract « En-tetes Boutique - Serie 4 » and its
 * per-style relevés. They render under the UNCHANGED canon keys `masque ·
 * harmattan · balafon · seance · cauris` so no live storefront can hold a
 * value the service would refuse; only the drawing and the labels changed.
 *
 * These assertions replace the ENTETES-E ones because that reading is
 * SUPERSEDED, not because they were failing: the normative markdown they
 * pinned is no longer the authority for these five.
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

/** ENTETES-J — « masque » (Prestige) was cut by the founder on looks, with nine
 *  others. The key stays canon vocabulary and draws `classique`; there is no
 *  Prestige unit left to assert against, so this set is the surviving four. */
const FIVE: readonly EnteteKey[] = ['harmattan', 'balafon', 'seance', 'cauris'];

const ROOT: Record<string, string> = {
  harmattan: 'vt-te', balafon: 'vt-et', seance: 'vt-do', cauris: 'vt-ti',
};
/** The contract name each key now DRAWS — the rename the picker shows. */
const NOM: Record<string, string> = {
  harmattan: 'Terracotta', balafon: 'Étendard', seance: 'Douceur', cauris: 'Tissage',
};
/** The style's own MINIMAL pattern class — what fills the frame sans photo. */
const MOTIF: Record<string, string> = {
  harmattan: 'te-motif', balafon: 'et-motif', seance: 'do-motif', cauris: 'ti-motif',
};
/** Relevé §Photo — the COVER crop bias the contract fixes for each style. */
const COVER_POS: Record<string, string> = {
  harmattan: '55% 30%', balafon: '55% 22%', seance: '60% 30%', cauris: '52% 28%',
};
/** Série 1 §5 « biais haut 18–30 % » — the portrait fallback's shared bias. */
const AVATAR_POS = '50% 24%';

const head = (key: EnteteKey, sf: unknown, trust: unknown, fromProduct = false): string =>
  renderEntete(key, sf as never, trust as never, { fromProduct });

/** Visible copy only — tags stripped (proves what reaches her eyes). */
const visible = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    // &nbsp; is a SPACE on screen: the anti-widow joints (« par&nbsp;Séra »)
    // change where a line may break, never what she reads.
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/* ------------------------------------------------- 1 · identity + strings -- */


/**
 * ENTETES-I — the styles this file exercises are now LAZY CHUNKS. `renderEntete`
 * is still synchronous by contract; it draws a lazy unit only once that unit has
 * been registered, exactly as `flows.ts` guarantees by awaiting `loadEntete`
 * before any header-drawing screen. This hook is that guarantee, in test form.
 * Nothing in this file resets the registry, so one load serves the whole run.
 */

/**
 * ENTETES-I — THE SHEET A PAGE ACTUALLY MOUNTS is the compiled shell PLUS the
 * chunks that have arrived. These styles used to live wholly in
 * `ENTETES_STYLES`; their rules now travel with their modules, so a CSS
 * assertion that reads only the compiled half is asserting over a sheet no
 * cliente ever receives. `beforeAll` has loaded every chunk by the time any
 * `it` runs, so this is the same bytes the browser gets.
 */
const sheet = (): string => ENTETES_STYLES + loadedEnteteCss();

beforeAll(async () => {
  await loadAllEntetes();
});

describe('ENTETES-F — each unit renders her identity and the exact handoff strings', () => {
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

    it(`${key}: the back button obeys §2.5 — present from a product, absent on a direct landing`, () => {
      /* PARTAGE-HORS-ENTÊTE (founder, 2026-08-18: « on boutique/storefront
         remove the share sign that always shows on the en-tête/header »). This
         block asserted the share button on every header, both ways, and pinned
         the offset it slid to. The share is gone from every en-tête; what it
         guarded that still exists is the back button's own §2.5 rule. */
      const fromProduct = head(key, BASE, F1, true);
      expect(fromProduct).toContain('data-action="retour"');
      expect(fromProduct).toContain(`aria-label="${t('vit.retour_aria')}"`);
      expect(fromProduct, 'the share sign is back on the en-tête').not.toContain('data-action="partager"');
      const direct = head(key, BASE, F1, false);
      expect(direct).not.toContain('data-action="retour"');
      expect(direct, 'the share sign is back on a direct landing').not.toContain('data-action="partager"');
    });
  }
});

/* ------------------------------------------------------------ 2 · honesty -- */

describe('ENTETES-F — the frozen honesty rules, per style, on executed output', () => {
  for (const key of FIVE) {
    it(`${key}: F1 (COMPLET + AVIS) — « 128 ventes livrées par Séra » and « 4,9 · 28 avis », no badge`, () => {
      const html = head(key, BASE, F1);
      expect(html).toContain('data-role="reputation"');
      expect(html).toContain('<v>128</v>');
      expect(visible(html)).toContain(t('vit.ventes_livrees'));
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
      expect(visible(html)).not.toContain(t('vit.ventes_livrees'));
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

describe('ENTETES-F — her portrait in the style frame, or the monogram pattern; never a void', () => {
  for (const key of FIVE) {
    it(`${key}: a real portrait draws the avatar <img>; the sheet biases it at ${AVATAR_POS}`, () => {
      const html = head(key, BASE, F1);
      expect(html).toContain('data-etat="live"');
      expect(html).toContain(`src="${AVATAR}"`);
      expect(html).toContain(`alt="${t('vit.avatar_alt')}"`);
      // the crop bias lives in the SHEET (her inline focus must stay the only
      // inline emitter) — pinned here against the style's own rule
      expect(sheet()).toContain(`object-position: ${AVATAR_POS}`);
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

describe('ENTETES-F — nameTail: the deterministic anti-orphan rule, executed', () => {
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
  it('the ACCENT SEGMENT is what stays unbreakable — not the whole hyphenated word', () => {
    // Série 4: « dernier segment (/[^ -]+$/, nowrap) ». Making the entire tail
    // nowrap is what pushed « Élégance-Burkina » onto the photo; the hyphen
    // must be free to break while the accent word travels whole.
    const acc = sheet().slice(sheet().indexOf('.vt-ent .vt-ent-acc {'));
    expect(acc.slice(0, acc.indexOf('}'))).toMatch(/display:\s*inline-block;\s*white-space:\s*nowrap/);
    const tail = sheet().slice(sheet().indexOf('.vt-ent .vt-ent-tail {'));
    expect(tail.slice(0, tail.indexOf('}'))).not.toMatch(/nowrap/);
  });
  it('ONE size tier past 14 characters — the contract fixes a single reduced size', () => {
    for (const key of FIVE) {
      expect(head(key, BASE, F1)).not.toMatch(/vt-ent-long/); // « Beurni Boss » = 11
      expect(head(key, { ...BASE, name: 'Chez Wendkuni Or' }, F1)).toContain('vt-ent-long'); // 16
      expect(head(key, LONGUE, F1)).toContain('vt-ent-long'); // 24 — same tier, no second step
      // the superseded ENTETES-E second tier is GONE, not merely unused
      expect(head(key, LONGUE, F1)).not.toContain('vt-ent-xlong');
    }
    expect(sheet()).not.toContain('vt-ent-xlong');
  });

  it('the contract\'s fixed sizes: Douceur 20 px, the other three 24 px — AND NOTHING OVERRIDES THEM AT 320', () => {
    const SIZE: Record<string, string> = { do: '20px', te: '24px', et: '24px', ti: '24px' };
    for (const [sel, px] of Object.entries(SIZE)) {
      expect(sheet(), sel).toMatch(
        new RegExp(`\\.vt-${sel} \\.${sel}-name\\.vt-ent-long \\{ font-size: ${px}; \\}`),
      );
    }
    // THE HOLE THIS CLOSES: the first version matched only the BASE rule, so a
    // later @container override could silently ship a different size and this
    // test would still pass. Série 4 §QA-2 names the number FOR 320 —
    // « Nom 24 car. + zone longue à 320 : aucun débordement (tailles fixes
    // 20/24 px) » — so 320 is exactly where it must be checked. Every
    // `vt-ent-long` size declared anywhere in the sheet, for these five, must
    // equal the contract's.
    for (const [sel, px] of Object.entries(SIZE)) {
      const all = [...sheet().matchAll(
        new RegExp(`\\.vt-${sel} \\.${sel}-name\\.vt-ent-long \\{ font-size: ([^;]+); \\}`, 'g'),
      )].map((m) => m[1]);
      expect(all.length, `${sel}: no fixed-size rule found — the scan is asserting over nothing`).toBeGreaterThanOrEqual(1);
      for (const declared of all) expect(declared, `${sel} overridden away from the contract`).toBe(px);
    }
  });

  it('the trust strip keeps the relevé type (9.5px) at BOTH widths', () => {
    // « titres 700/9.5 + sous-lignes 600 » in all five relevés. Shrinking this
    // is failure mode #9 (a screen that dies on a 1GB Android in sunlight),
    // and it is the kind of change a height budget quietly invites.
    const sizes = [...sheet().matchAll(/\.(?:pr|te|et|do|ti)-cell-[ls] \{ font-size: ([^;]+);/g)].map((m) => m[1]);
    expect(sizes.length, 'no trust-cell type rules found — asserting over nothing').toBeGreaterThanOrEqual(2);
    for (const px of sizes) expect(px, 'trust label type below the relevé').toBe('9.5px');
  });
});

/* --------------------------------------------------- 5 · sheet discipline -- */

describe('ENTETES-F — the five sheets keep the house laws', () => {
  const START = sheet().indexOf('ENTETES-F · the Série 4 five');
  const SHEET_E = sheet().slice(START);

  it('the section exists and every rule is scoped under a .vt-* root', () => {
    expect(START).toBeGreaterThan(0);
    for (const line of SHEET_E.split('\n')) {
      const m = /^\s{2}(\.[^\s{]+[^{]*)\{/.exec(line);
      if (m) expect(m[1], line).toMatch(/^\.vt-(ent|pr|te|et|do|ti)[ .]/);
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
    expect(sheet()).toContain('.vt-ent [aria-hidden="true"] { pointer-events: none; }');
  });

  it('each column carries its relevé min-height (250 · 206 · 250 · 248)', () => {
    const H: Record<string, number> = { te: 250, et: 206, do: 250, ti: 248 };
    for (const [sel, px] of Object.entries(H)) {
      expect(sheet(), sel).toMatch(new RegExp(`\\.vt-${sel} \\.${sel}-scene \\{[^}]*min-height: ${px}px`));
    }
  });

  it('NO app bar and NO invented product amorce reach the output (founder law)', () => {
    for (const key of FIVE) {
      const html = head(key, BASE, F1, true);
      // the contract's 46px Shop+ bar: wordmark, hamburger, search, cart badge
      expect(html).not.toContain('Shop<span');
      expect(html).not.toMatch(/Sélection |Voir tout|à partir de/);
      // THE INVENTED CATALOGUE OF EVERY SÉRIE 4 RELEVÉ, VERBATIM. The first
      // version of this guard built its strings as `${prix}\u202f000`, which
      // turned « 15 500 » into the impossible « 15,5 000 » — seven of twelve
      // assertions were checking text that can never exist. The prices are
      // written out whole now, and the invented ARTICLE NAMES are checked too:
      // a fake product is fake with or without its price beside it.
      for (const prix of [
        '28\u202f000', '15\u202f000', '12\u202f000',   // Prestige
        '17\u202f000', '15\u202f500', '3\u202f500',    // Terracotta
        '12\u202f900', '15\u202f900', '4\u202f900',    // Étendard
        '8\u202f500', '6\u202f000', '7\u202f500',      // Tissage
      ]) {
        expect(html, `invented price ${prix}`).not.toContain(prix);
      }
      for (const article of [
        'Faso Dan Fani', 'Sacs & Pochettes', 'Sandales Chic',
        'Tunique XOX', 'Sac Wobi Chic', 'Collier Afrique Unie',
        'Hauts tissés', 'Soins & beauté',
      ]) {
        expect(html, `invented article « ${article} »`).not.toContain(article);
      }
      expect(html).not.toMatch(/FCFA/);
    }
  });
});

/* -------------------------------------- 6 · the six are behaviourally inert -- */

describe('ENTETES-F — the six existing styles absorbed NOTHING from this slice', () => {
  /** ENTETES-J — « cristal » was cut with the other nine; four of the original
   *  five remain. */
  const SIX: readonly EnteteKey[] = ['royale', 'heritage', 'chaleureux', 'dynamique'];
  const richSf = { ...BASE, cover: { status: 'live' as const, url: 'https://svc.example/c.jpg' } };

  for (const key of SIX) {
    it(`${key}: no tail markup, no xlong tier, no « Bienvenue » — and the count is now GROUPED`, () => {
      const html = head(key, { ...richSf, name: 'Atelier Élégance-Burkina' }, F4, true);
      expect(html).not.toContain('vt-ent-tail');
      expect(html).not.toContain('vt-ent-xlong');
      expect(html).not.toContain(t('vit.bienvenue'));
      // THE COUNT ASSERTION FLIPPED, DELIBERATELY (founder-authorised).
      // It used to pin « 1287 » — not because ungrouped was right, but as
      // incidental evidence that série 1 had absorbed nothing from ENTETES-F.
      // Série 1 was then the ONLY set in the app writing an unformatted count:
      // every style since, and `ventesLine` itself, groups through `groupFr`.
      // One number rendered two ways across one screen is a defect, so the
      // grouping is now shared and this asserts the shared form. The three
      // assertions above are the guard's real content and are untouched.
      expect(html).toContain(`1${NNBSP}287`);
      expect(html).not.toContain('<v>1287</v>');
    });
  }

  it('classique: byte-identical through the dispatch, still the hero + chips', () => {
    const out = head('classique', richSf, F1, true);
    expect(out).toContain('class="vt-hero"');
    expect(out).not.toContain('vt-ent-tail');
  });
});

/* ------------------------------- 7 · her cover, like the six (founder rule) -- */

/**
 * FOUNDER RULING 2026-07-30 — « make it all be like the 6 original headers ».
 *
 * He uploaded a photo de couverture and it appeared on none of the five. The
 * handoff calls the cover « non requis pour ces variantes » and every mockup
 * frames a portrait, so this file had wired the five to the avatar alone —
 * faithful to the spec, and wrong for the person whose shop it is: the six put
 * her cover in their photo area, so these must too.
 *
 * THE ORDER, pinned here because it is the whole ruling: COVER first, portrait
 * as the fallback, the style's own motif only when she has neither. Nothing
 * below is a source grep — every assertion executes the renderer.
 */
const COVER = 'https://svc.example/media/storefronts/sf-bb/cover/c.jpg';
const AVEC_COVER = { ...BASE, cover: { status: 'live' as const, url: COVER } };

describe('ENTETES-F — the five draw HER COVER, exactly as the six do', () => {
  it('ALL ELEVEN draw the cover when she has one — the ruling, across the whole set', async () => {
    const { ENTETE_KEYS } = await import('../src/vitrine/entetes');
    // ENTETES-H — canon carried 31 keys; only the first ELEVEN had a render
    // unit. The other twenty were vocabulary and fell back to classique, so
    // this ruling is asserted across the BUILT set, which is what « the whole
    // set » meant when it was written.
    //
    // ENTETES-L took canon to 37, ENTETES-M to 43. The six it added are BUILT (lazy modules),
    // but they sit at the END of the array and this slice reaches the first
    // eleven, so the set this test walks is unchanged; the six are covered by
    // the cover/proof scans in entetes-lazy.test.ts, which run over every lazy
    // style rather than over a fixed prefix.
    expect(ENTETE_KEYS.length).toBe(43);
    const BUILT = ENTETE_KEYS.slice(0, 11);
    for (const key of BUILT) {
      const html = renderEntete(key as EnteteKey, AVEC_COVER as never, F1 as never, {});
      expect(html, `${key} does not draw her cover`).toContain(COVER);
    }
  });

  for (const key of FIVE) {
    it(`${key}: the cover fills the frame and the frame reads live`, () => {
      const html = head(key, AVEC_COVER, F1);
      expect(html).toContain(`src="${COVER}"`);
      expect(html).toContain('data-etat="live"');
      expect(html).toContain(`alt="${t('vit.cover_alt')}"`);
      // the style's own motif is NOT drawn when a photograph exists
      expect(html).not.toContain(MOTIF[key]!);
    });

    it(`${key}: the cover wins over the portrait — one frame, one photograph`, () => {
      // BASE already carries an avatar; adding a cover must show the COVER
      const html = head(key, AVEC_COVER, F1);
      expect(html).toContain(COVER);
      expect(html).not.toContain(AVATAR);
    });

    it(`${key}: HER cover framing rides inline; unframed, the §5 contract position stands`, () => {
      const framed = { ...AVEC_COVER, cover: { status: 'live' as const, url: COVER, focus: { x: 20, y: 80 } } };
      expect(head(key, framed, F1)).toContain('object-position:20% 80%');
      // …and with no saved framing the style's own bias is what is emitted
      expect(head(key, AVEC_COVER, F1)).toContain(`object-position:${COVER_POS[key]}`);
    });

    it(`${key}: no cover ⇒ the PORTRAIT still fills the frame (the fallback, not a hole)`, () => {
      const html = head(key, BASE, F1); // avatar only
      expect(html).toContain(`src="${AVATAR}"`);
      expect(html).toContain('data-etat="live"');
      expect(html).not.toContain(MOTIF[key]!);
    });

    it(`${key}: neither photo ⇒ the style's motif + HER initial, never an empty frame`, () => {
      const html = head(key, SANS_PHOTO, F1);
      expect(html).toContain('data-etat="none"');
      expect(html).not.toContain('<img');
      expect(html).toContain(MOTIF[key]!);
    });

    it(`${key}: a live cover with NO url falls back to the portrait, never a broken <img>`, () => {
      const html = head(key, { ...BASE, cover: { status: 'live' as const } }, F1);
      expect(html).toContain(`src="${AVATAR}"`);
      expect(html).not.toContain('src=""');
    });

    it(`${key}: the cover URL is ESCAPED — a storefront record is not a licence to inject`, () => {
      const hostile = { ...BASE, cover: { status: 'live' as const, url: 'https://x/c.jpg" onerror="alert(1)' } };
      const html = head(key, hostile, F1);
      expect(html).not.toContain('onerror="alert');
      expect(html).toContain('&quot;');
    });
  }
});
