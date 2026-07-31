const __m = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => __m.get(k) ?? null,
  setItem: (k: string, v: string) => void __m.set(k, v),
  removeItem: (k: string) => void __m.delete(k),
  clear: () => __m.clear(),
  key: (i: number) => [...__m.keys()][i] ?? null,
  get length() { return __m.size; },
} as Storage;
import { afterEach, describe, expect, it } from 'vitest';
import { ENTETE_KEYS, renderEntete, type EnteteKey } from '../src/vitrine/entetes';
import { loadEntete, loadedEntete, loadedEnteteCss, registerEntete, resetEntetes } from '../src/vitrine/entetes/registry';

/**
 * ENTETES-G — the payload architecture, executed.
 *
 * The point of this file is that a style can arrive as its own chunk and draw
 * correctly, and that a style which FAILS to arrive degrades to classique
 * instead of taking the shop page with it. Both are asserted on real
 * `renderEntete` output, never on the registry's internal state.
 */

const SF = {
  id: 'sf-g', resellerId: 'rs-g', slug: 'g-1', name: 'Chez Awa',
  zone: 'Gounghin, Ouagadougou', category: 'Général', tagline: '', bio: '',
  theme: 'laterite' as const, cover: { status: 'none' as const },
  avatar: { mode: 'monogram' as const }, curatedItems: [], featuredItems: [],
  sections: [], discoverable: true, createdAt: 'T', updatedAt: 'T',
};
const TRUST = { deliveredCount: 12, rating: '4,8', reviewCount: 17, demo: false };
const head = (key: EnteteKey): string => renderEntete(key, SF as never, TRUST as never, {});

afterEach(() => resetEntetes());

describe('ENTETES-G — a lazily-loaded style draws, and a missing one never breaks the shop', () => {
  it('an ARRIVED unit wins over the compiled-in dispatch, and receives her real data', () => {
    // classique is the strongest case: if the registry can override even the
    // default, nothing is reaching the drawing except through this seam.
    registerEntete('classique', {
      render: (v) => `<div class="vt-ent vt-stub" data-role="vitrine-hero">${v.zone}|${v.delivN}</div>`,
      css: '.vt-stub { color: #000; }',
    });
    const out = head('classique');
    expect(out).toContain('class="vt-ent vt-stub"');
    // it got HER values through `vals`, not a fixture of its own
    expect(out).toContain('Gounghin, Ouagadougou');
    expect(out).toContain('12');
  });

  it('a style that never arrives falls back to classique — her products still reach the buyer', () => {
    // no registration: this is the offline / failed-chunk path, and the
    // ENTETES-E0 law says the page draws the shipped default rather than
    // crashing or emitting nothing.
    const out = head('royale');
    expect(out.length).toBeGreaterThan(1000);
    expect(out).toContain('class="vt-ent vt-ry"'); // compiled-in tier still serves
    const unknown = head('classique');
    expect(unknown).toContain('class="vt-hero"');
  });

  it('loadEntete is safe for every key, including ones with no chunk', async () => {
    // callers must not have to know which tier a key belongs to
    await expect(loadEntete('classique')).resolves.toBeUndefined();
    await expect(loadEntete('royale')).resolves.toBeUndefined();
    expect(loadedEntete('royale')).toBeUndefined();
  });

  it('INDIGO — the real chunk loads, registers, and draws her identity on the photo', async () => {
    // the first of the twenty, exercised END TO END through the real dynamic
    // import rather than a stub: if the chunk fails to resolve or the unit is
    // shaped wrong, this fails here rather than on a seller's phone.
    expect(loadedEntete('indigo')).toBeUndefined();
    await loadEntete('indigo');
    expect(loadedEntete('indigo'), 'the indigo chunk did not register').toBeDefined();

    const html = renderEntete('indigo', SF as never, TRUST as never, {});
    expect(html).toContain('class="vt-ent vt-in"');
    expect(html).toContain('data-role="vitrine-hero"');
    expect(html).toContain('data-role="vitrine-identity"');
    expect(html).toContain('data-role="vitrine-trust"');
    // HER data, through vals — not a fixture of the module's own
    expect(html).toContain('Gounghin, Ouagadougou');
    expect(html).toContain('Chez');
    // the honesty rules hold in a lazily-loaded unit exactly as in a compiled
    // one: 12 deliveries ⇒ proof, never the « nouvelle » badge
    expect(html).toContain('data-role="reputation"');
    expect(html).not.toContain('data-role="chip-nouvelle"');
    // …and its CSS travels WITH it, so the rules reach the page only now
    expect(loadedEnteteCss()).toContain('.vt-in');
    expect(loadedEnteteCss()).toContain('#0D133A');
  });

  it('INDIGO at zero history — the badge replaces the proof, and no number reaches her screen', async () => {
    await loadEntete('indigo');
    const zero = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
    const html = renderEntete('indigo', SF as never, zero as never, {});
    expect(html).toContain('data-role="chip-nouvelle"');
    expect(html).not.toContain('data-role="reputation"');
    expect(html).not.toContain('data-role="chip-avis"');
    // THE BAN IS ON CLAIMS ABOUT HER, NOT ON DIGITS. « 100% sécurisé » is a
    // fixed trust label and says nothing about this seller; scoping the scan to
    // the identity block is what makes the assertion mean « no count of hers
    // reached the screen » instead of accidentally banning the copy.
    const ident = /data-role="vitrine-identity"[\s\S]*?(?=<div class="in-trust")/.exec(html)?.[0] ?? '';
    expect(ident.length, 'identity block not found — the scan would assert over nothing').toBeGreaterThan(100);
    const visible = ident.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    expect(visible, 'a count leaked into the MINIMAL state').not.toMatch(/\d/);
    expect(visible).toContain('Nouvelle');
  });

  it('COUTURE — its chunk loads and draws, and it is a SEPARATE chunk from indigo', async () => {
    await loadEntete('couture');
    expect(loadedEntete('couture'), 'the couture chunk did not register').toBeDefined();
    const html = renderEntete('couture', SF as never, TRUST as never, {});
    expect(html).toContain('class="vt-ent vt-co"');
    expect(html).toContain('Gounghin, Ouagadougou');
    expect(html).toContain('data-role="reputation"');
    // both styles can be resident at once WITHOUT their CSS colliding: each
    // sheet is scoped to its own root, which is what lets the page mount
    // whichever arrived
    await loadEntete('indigo');
    const sheet = loadedEnteteCss();
    expect(sheet).toContain('.vt-co');
    expect(sheet).toContain('.vt-in');
    for (const line of sheet.split('\n')) {
      const m = /^\s{2}(\.[^\s{]+[^{]*)\{/.exec(line);
      if (m) expect(m[1], line).toMatch(/^\.vt-(co|in)[ .]/);
    }
  });

  it('SAFRAN — its chunk draws, applies the split-column long-name rule, and stays honest', async () => {
    await loadEntete('safran');
    expect(loadedEntete('safran'), 'the safran chunk did not register').toBeDefined();
    const html = renderEntete('safran', SF as never, TRUST as never, {});
    expect(html).toContain('class="vt-ent vt-sa"');
    expect(html).toContain('Gounghin, Ouagadougou');
    expect(html).toContain('data-role="reputation"');
    expect(html).not.toContain('data-role="chip-nouvelle"');

    // « Colonnes fendues (Safran, Kraft) : nom > 14 caractères → 20 px fixe ».
    // « Chez Awa » is 9 characters, so it must NOT carry the tier…
    expect(html, 'a 9-char name took the long tier').not.toContain('vt-ent-long');
    // …and a 24-character name must, or the name runs into the photograph.
    const long = renderEntete('safran', { ...SF, name: 'Atelier Élégance-Burkina' } as never, TRUST as never, {});
    expect(long, 'a 24-char name did not take the long tier').toContain('vt-ent-long');
    // the tier is only worth anything if the sheet actually sizes it
    expect(loadedEntete('safran')!.css).toContain('.sa-name.vt-ent-long');
  });

  it('GRENAT — its chunk draws, stays full-width (no long-name tier), and inverts the trust card', async () => {
    await loadEntete('grenat');
    expect(loadedEntete('grenat'), 'the grenat chunk did not register').toBeDefined();
    const html = renderEntete('grenat', SF as never, TRUST as never, {});
    expect(html).toContain('class="vt-ent vt-gr"');
    expect(html).toContain('Gounghin, Ouagadougou');
    expect(html).toContain('data-role="reputation"');
    expect(html).not.toContain('data-role="chip-nouvelle"');

    // « Pleine largeur (Indigo, Couture, Grenat) : pas de règle fixe » — even a
    // 24-char name must NOT take a fixed tier here; it wraps instead. Safran
    // does the opposite, and getting the two confused is the easy mistake.
    const long = renderEntete('grenat', { ...SF, name: 'Atelier Élégance-Burkina' } as never, TRUST as never, {});
    expect(long, 'grenat is full-width and must not size a long name down').not.toContain('.gr-name.vt-ent-long');
    expect(loadedEntete('grenat')!.css, 'a fixed tier crept into a full-width style').not.toContain('.gr-name.vt-ent-long');

    // « seule carte sombre sur page claire de la série » — the inversion is the
    // point of this style's foot, so it is pinned rather than left to drift.
    expect(loadedEntete('grenat')!.css).toContain('background: var(--gr-bordeaux)');
  });

  it('KRAFT — its chunk draws, stamps the zone, and keeps the split-column tier', async () => {
    await loadEntete('kraft');
    expect(loadedEntete('kraft'), 'the kraft chunk did not register').toBeDefined();
    const html = renderEntete('kraft', SF as never, TRUST as never, {});
    expect(html).toContain('class="vt-ent vt-kr"');
    // the verification line is STAMPED on this style rather than captioned
    expect(html).toContain('class="kr-tampon"');
    expect(html).toContain('Gounghin, Ouagadougou');
    expect(html).toContain('data-role="reputation"');
    expect(html).not.toContain('data-role="chip-nouvelle"');

    // split column (the polaroid owns the right 154px), so the tier applies
    expect(html, 'a 9-char name took the long tier').not.toContain('vt-ent-long');
    const long = renderEntete('kraft', { ...SF, name: 'Atelier Élégance-Burkina' } as never, TRUST as never, {});
    expect(long, 'a 24-char name did not take the long tier').toContain('vt-ent-long');
    expect(loadedEntete('kraft')!.css).toContain('.kr-name.vt-ent-long');
  });

  it('AUDACE — its chunk draws, and the name is BICOLORE through the accent span', async () => {
    await loadEntete('audace');
    expect(loadedEntete('audace'), 'the audace chunk did not register').toBeDefined();
    const html = renderEntete('audace', SF as never, TRUST as never, {});
    expect(html).toContain('class="vt-ent vt-au"');
    expect(html).toContain('Gounghin, Ouagadougou');
    expect(html).toContain('data-role="reputation"');

    // « Nom bicolore : le dernier segment porte la couleur d'accent » — carried
    // by the SAME span the anti-orphan rule produces, not a second mechanism
    expect(html).toContain('vt-ent-acc');
    expect(loadedEntete('audace')!.css).toContain('.au-name .vt-ent-acc { color: var(--au-orange); }');

    // série 3 draws the bio on Perle and Artisan ONLY — not here
    const withBio = renderEntete('audace', { ...SF, bio: 'Tissus choisis un par un.' } as never, TRUST as never, {});
    expect(withBio, 'audace drew a bio; only Perle and Artisan show one').not.toContain('Tissus choisis');

    // the fixed decorative line is a CATALOG string, never inline (loi 6)
    expect(html).toContain('Partenaire de confiance');
  });

  it('FLEURIE — its chunk draws, keeps the bio off, and wraps its badge string itself', async () => {
    await loadEntete('fleurie');
    expect(loadedEntete('fleurie'), 'the fleurie chunk did not register').toBeDefined();
    const html = renderEntete('fleurie', SF as never, TRUST as never, {});
    expect(html).toContain('class="vt-ent vt-fl"');
    expect(html).toContain('Gounghin, Ouagadougou');
    expect(html).toContain('data-role="reputation"');
    const withBio = renderEntete('fleurie', { ...SF, bio: 'Tissus choisis un par un.' } as never, TRUST as never, {});
    expect(withBio, 'fleurie drew a bio; only Perle and Artisan show one').not.toContain('Tissus choisis');

    // THE BADGE STRING IS NOT CUT BY HAND. The board sets « Nouvelle / vendeuse »
    // on two lines; the disc's width does that, not a <br> in the markup — a
    // string broken in markup no longer lives in the catalog (loi 6).
    const zero = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
    const min = renderEntete('fleurie', SF as never, zero as never, {});
    expect(min).toContain('data-role="chip-nouvelle"');
    expect(min).toContain('Nouvelle vendeuse');
    expect(min, 'the badge string was split in the markup').not.toContain('Nouvelle<br>');
  });

  it('PRISME — its chunk draws, is full-width, and ships an OPAQUE glass fallback', async () => {
    await loadEntete('prisme');
    expect(loadedEntete('prisme'), 'the prisme chunk did not register').toBeDefined();
    const html = renderEntete('prisme', SF as never, TRUST as never, {});
    expect(html).toContain('class="vt-ent vt-pi"');
    expect(html).toContain('Gounghin, Ouagadougou');
    expect(html).toContain('data-role="reputation"');

    // « pleine largeur (13, 14) : pas de règle fixe » — Prisme must NOT size a
    // long name down, unlike Audace and Fleurie in the same series
    const long = renderEntete('prisme', { ...SF, name: 'Atelier Élégance-Burkina' } as never, TRUST as never, {});
    expect(long, 'prisme is full-width and must not size a long name down').not.toContain('vt-ent-long');

    const sheet = loadedEntete('prisme')!.css;
    // THE GLASS FALLBACK IS LOAD-BEARING, not decoration: a phone without
    // backdrop-filter must get a FINISHED opaque panel, never transparent glass
    // with her name lost on it. So the opaque rule is declared FIRST and the
    // blur only inside @supports.
    const plain = sheet.indexOf('.vt-pi .glz { background: rgba(255,255,255,.66); }');
    const supports = sheet.indexOf('@supports ((backdrop-filter');
    expect(plain, 'the opaque .glz fallback is missing').toBeGreaterThan(-1);
    expect(supports, 'the @supports guard is missing').toBeGreaterThan(-1);
    expect(plain, 'the blur is not behind the opaque fallback').toBeLessThan(supports);
    // and it stays inside this chunk — it must never reach Cristal's .glz
    expect(sheet, 'an unscoped .glz would repaint Cristal').not.toMatch(/^\s*\.glz/m);
  });

  it('POP — full width WITH a tier, and a two-tone badge DERIVED from the catalog', async () => {
    await loadEntete('pop');
    expect(loadedEntete('pop'), 'the pop chunk did not register').toBeDefined();
    const html = renderEntete('pop', SF as never, TRUST as never, {});
    expect(html).toContain('class="vt-ent vt-po"');
    expect(html).toContain('Gounghin, Ouagadougou');
    expect(html).toContain('data-role="reputation"');

    // THE TRAP IN THIS SERIES: « pleine largeur (13, 14) : pas de règle fixe
    // (Pop : 24 px si > 14) ». Prisme and Pop are BOTH full width; Prisme has
    // no tier and Pop has one. Same clause, opposite answers.
    const long = renderEntete('pop', { ...SF, name: 'Atelier Élégance-Burkina' } as never, TRUST as never, {});
    expect(long, 'pop is full width but DOES take a tier at > 14 chars').toContain('vt-ent-long');
    expect(loadedEntete('pop')!.css).toContain('.po-name.vt-ent-long { font-size: 24px; }');

    // THE BADGE IS TWO COLOURS ON ONE CATALOG STRING. The split is derived at
    // the last space, never re-authored as two literals — so the two halves
    // must reassemble into exactly the catalog entry, byte for byte.
    const zero = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
    const min = renderEntete('pop', SF as never, zero as never, {});
    expect(min).toContain('data-role="chip-nouvelle"');
    const badge = /<span class="po-nouv">([\s\S]*?)<\/span><\/span>/.exec(min)?.[1] ?? '';
    expect(badge.length, 'the badge markup was not found — this scan would assert over nothing').toBeGreaterThan(10);
    const visible = badge.replace(/<[^>]*>/g, '');
    expect(visible, 'the two tones do not reassemble into the catalog string').toBe('Nouvelle vendeuse');
  });

  it('EVERY lazy style keeps its CSS to its OWN root — every resident sheet stays scoped', async () => {
    // the guard that has to grow with the set: as each of the twenty lands, its
    // rules join one shared <style> element, and a single unscoped selector
    // would repaint a shop that never chose that style.
    const { loadAllEntetes } = await import('../src/vitrine/entetes/registry');
    await loadAllEntetes();
    const sheet = loadedEnteteCss();
    for (const root of ['.vt-in', '.vt-co', '.vt-sa', '.vt-gr', '.vt-kr', '.vt-au', '.vt-fl', '.vt-pi', '.vt-po', '.vt-ch3', '.vt-ne', '.vt-pe', '.vt-ar', '.vt-br', '.vt-gf', '.vt-du']) {
      expect(sheet, `${root} absent — the scan would pass by having nothing to check`).toContain(root);
    }
    let checked = 0;
    for (const line of sheet.split('\n')) {
      const m = /^\s{2}(\.[^\s{]+[^{]*)\{/.exec(line);
      if (m) {
        expect(m[1], line).toMatch(/^\.vt-(co|in|sa|gr|kr|au|fl|pi|po|ch3|ne|pe|ar|br|gf|du)[ .]/);
        checked += 1;
      }
    }
    expect(checked, 'no selectors matched — the scan asserted over nothing').toBeGreaterThan(30);
  });

  it('PERLE — one of the TWO série 3 styles that draw her présentation', async () => {
    await loadEntete('perle');
    expect(loadedEntete('perle'), 'the perle chunk did not register').toBeDefined();
    const html = renderEntete('perle', SF as never, TRUST as never, {});
    expect(html).toContain('class="vt-ent vt-pe"');
    expect(html).toContain('data-role="reputation"');

    // « La présentation ne s'affiche que sur Perle et Artisan » — every other
    // série 3 style asserts the bio is ABSENT; this one asserts it is DRAWN.
    const bio = 'Tissus choisis un par un.';
    const withBio = renderEntete('perle', { ...SF, bio } as never, TRUST as never, {});
    expect(withBio, 'perle must draw her présentation — the board shows one').toContain(bio);
    // …and it still obeys the compact rule the shared vals() applies
    const compact = renderEntete('perle', { ...SF, bio } as never, TRUST as never, { compact: true });
    expect(compact, 'a compact render must drop the bio like every other style').not.toContain(bio);
  });

  it('THE BIO RULE holds across the whole série 3 set — two draw it, the rest do not', async () => {
    // « La présentation ne s'affiche que sur Perle et Artisan (seuls visuels
    // qui la montrent) ». Asserted as a SET rather than style by style: a new
    // série 3 unit that copies the wrong neighbour fails here, and so does one
    // that quietly stops drawing a bio it owes.
    const { loadAllEntetes } = await import('../src/vitrine/entetes/registry');
    await loadAllEntetes();
    const bio = 'Tissus choisis un par un.';
    const SERIE3_AVEC = ['perle', 'artisan'];
    const SERIE3_SANS = ['audace', 'fleurie', 'prisme', 'pop', 'chrome', 'neon', 'braise', 'graffiti'];
    for (const k of SERIE3_AVEC) {
      const html = renderEntete(k as EnteteKey, { ...SF, bio } as never, TRUST as never, {});
      expect(html, `${k} must draw her présentation — its board shows one`).toContain(bio);
    }
    for (const k of SERIE3_SANS) {
      const html = renderEntete(k as EnteteKey, { ...SF, bio } as never, TRUST as never, {});
      expect(html, `${k} drew a bio; only Perle and Artisan show one`).not.toContain(bio);
    }
    expect(SERIE3_AVEC.length + SERIE3_SANS.length, 'the série 3 set shrank — this scan is going stale').toBe(10);
  });

  it('THE HONESTY MARKERS are on EVERY built style — proof XOR badge, never both', async () => {
    // The single most important invariant these headers carry, asserted as a
    // SET rather than per style. Braise shipped its proof chip WITHOUT
    // `data-role="reputation"` and no per-style test caught it, because I had
    // not written that style's test yet — a marker that is only checked where
    // someone remembered to check it is not an invariant.
    const { loadAllEntetes, isLazyEntete } = await import('../src/vitrine/entetes/registry');
    await loadAllEntetes();
    const classique = renderEntete('classique', SF as never, TRUST as never, {});
    const built = (ENTETE_KEYS as readonly EnteteKey[]).filter(
      (k) => k !== 'classique' && (isLazyEntete(k) || renderEntete(k, SF as never, TRUST as never, {}) !== classique),
    );
    expect(built.length, 'no built styles found — this scan would pass vacuously').toBeGreaterThanOrEqual(25);

    const zero = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
    for (const k of built) {
      const avec = renderEntete(k, SF as never, TRUST as never, {});
      expect(avec, `${k}: a proof line with no data-role="reputation"`).toContain('data-role="reputation"');
      expect(avec, `${k}: showed the « nouvelle » badge alongside real history`).not.toContain('data-role="chip-nouvelle"');

      const sans = renderEntete(k, SF as never, zero as never, {});
      expect(sans, `${k}: no « nouvelle » badge at zero history`).toContain('data-role="chip-nouvelle"');
      expect(sans, `${k}: claimed sales it cannot have`).not.toContain('data-role="reputation"');
    }
  });

  it('no lazy chunk CLAIMS a compiled-in style root class', async () => {
    // CHROME nearly did. Its natural prefix is « ch », which série 1's
    // Chaleureux (.vt-ch) already owns — a lazy sheet using it would repaint
    // that header the moment a Chrome shop was loaded, and only for buyers who
    // had visited one. It ships as .vt-ch3 instead; the canon KEY is unchanged.
    // This checks the whole set, because the next collision will look just as
    // natural as that one did.
    const { loadAllEntetes } = await import('../src/vitrine/entetes/registry');
    await loadAllEntetes();
    // COMMENTS ARE STRIPPED FIRST, and that is not a loophole: this guard is
    // about what the CASCADE sees. Chrome's own docblock explains the collision
    // it avoids and necessarily names « .vt-ch » to do so — scanning prose made
    // the guard fail on the very comment documenting the fix.
    const sheet = loadedEnteteCss().replace(/\/\*[\s\S]*?\*\//g, '');
    const COMPILED = ['ry', 'he', 'ch', 'cr', 'dy', 'pr', 'te', 'et', 'do', 'ti'];
    for (const root of COMPILED) {
      // whole-token match, so .vt-ch3 must NOT trip the .vt-ch check
      const claimed = new RegExp('\\.vt-' + root + '(?![\\w-])').test(sheet);
      expect(claimed, 'a lazy chunk writes .vt-' + root + ', a compiled-in root').toBe(false);
    }
    expect(sheet, 'the sheet is empty — this scan would pass vacuously').toContain('.vt-ch3');
  });

  it('no style module hides a BACKTICK inside its css template literal', async () => {
    // Couture cost two rounds to this: a comment reading « `zoneLine` » inside
    // `const css = ` … ` ` terminated the template and the compiler answered
    // TS1005 « ',' expected » pointing at CSS, which reads like a CSS bug. The
    // typecheck does catch it — this makes it fail BY NAME, because eighteen
    // more style modules are coming and each will be written the same way.
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('../src/vitrine/entetes/', import.meta.url).pathname;
    const modules = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'registry.ts');
    expect(modules.length, 'no style modules found — this scan would assert over nothing').toBeGreaterThan(0);
    for (const file of modules) {
      const src = readFileSync(dir + file, 'utf8');
      const marker = 'const css = `';
      const i = src.indexOf(marker);
      if (i === -1) continue;
      const body = src.slice(i + marker.length).split('\n`;')[0]!;
      expect(body.includes('`'), `${file}: a backtick inside the css template ends the string early`).toBe(false);
    }
  });

  it('only ARRIVED styles put CSS on the page — a chunk that never came adds no bytes', () => {
    expect(loadedEnteteCss()).toBe('');
    registerEntete('cristal', { render: () => '<i></i>', css: '.vt-xx { color: #111; }' });
    expect(loadedEnteteCss()).toContain('.vt-xx');
    resetEntetes();
    expect(loadedEnteteCss()).toBe('');
  });
});
