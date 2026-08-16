/**
 * PERSONNALISATION — the K-half gates.
 *
 * PROPERTY PINS: the expected literals below were derived INDEPENDENTLY from
 * the locked Phase-0 table (bp-K1…K7 blueprints — computed styles of the pixel
 * source), then compared against the runtime StyleSheet the screens actually
 * consume. A drifted value fails here, not on a device.
 *
 * FLOW LAW (§8.5–§8.10): theme set closed at 4; K2 name < 3 refused; K3 cycle
 * none→uploading(1 400)→pending(2 600)→live; 3rd pin refused; pinned épuisé
 * refused; ▲▼ reorders curatedItems; the pin PERSISTS on an épuisé (K5 shows
 * it, the BUYER display auto-retires it). (Sections and their laws left with
 * the K6 editor — founder order 2026-08-13; the canon FIELD stays.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STOREFRONT,
  FEATURED_CAP,
  HEADER_STYLES,
  THEMES,
  coverTo,
  moveItem,
  saveIdentity,
  togglePin,
} from '../src/vitrine/customize/storefront';
import { K_SEED } from '../src/vitrine/customize/storefront';
import { K_RAW_STYLES as S } from '../src/vitrine/customize/k-styles';
import { StorefrontSchema, STOREFRONT_THEMES } from '@platform/contracts';

const flat = (style: unknown): Record<string, unknown> => style as Record<string, unknown>;

describe('K property pins — the Phase-0 table bytes in the runtime StyleSheet', () => {
  it('C-K2 row: 64 min-height, pad 10/16, glyph 38 r12 soft/deep, title 14.5/700, sub 12 #6F6355, divider #F3EDDE', () => {
    expect(flat(S.row).minHeight).toBe(64);
    expect(flat(S.row).paddingVertical).toBe(10);
    expect(flat(S.row).paddingHorizontal).toBe(16);
    expect(flat(S.row).gap).toBe(13);
    expect(flat(S.rowGlyph)).toMatchObject({ width: 38, height: 38, borderRadius: 12, backgroundColor: '#F8E4EC' });
    expect(flat(S.rowGlyphText).color).toBe('#701134');
    expect(flat(S.rowTitle)).toMatchObject({ fontSize: 14.5, color: '#1C1710' });
    expect(flat(S.rowSub)).toMatchObject({ fontSize: 12, color: '#6F6355' });
    expect(flat(S.rowDivider).borderTopColor).toBe('#F3EDDE');
  });

  it('C-K3 counted field: r14 border 1.5 #E5DCC9, focus #A31D4E, error #C4574B, label 11/700 ls1.1', () => {
    expect(flat(S.fieldInput)).toMatchObject({ borderRadius: 14, borderWidth: 1.5, borderColor: '#E5DCC9', fontSize: 16, paddingVertical: 14, paddingHorizontal: 15 });
    expect(flat(S.fieldInputFocus).borderColor).toBe('#A31D4E');
    expect(flat(S.fieldInputError).borderColor).toBe('#C4574B');
    expect(flat(S.fieldLabel)).toMatchObject({ fontSize: 11, letterSpacing: 1.1, color: '#6F6355' });
    expect(flat(S.fieldCountLimit).color).toBe('#7A5104');
  });

  it('C-K4 cover slot: h120 r20; dashed #DDD2BC/#FCF9F2; error #C4574B/#F8E1DE; track 190×4 #ECE3D1 + bar #A31D4E', () => {
    expect(flat(S.coverSlot)).toMatchObject({ height: 120, borderRadius: 20 });
    expect(flat(S.coverSlotDashed)).toMatchObject({ borderWidth: 1.5, borderColor: '#DDD2BC', backgroundColor: '#FCF9F2' });
    expect(flat(S.coverSlotError)).toMatchObject({ borderColor: '#C4574B', backgroundColor: '#F8E1DE' });
    expect(flat(S.coverTrack)).toMatchObject({ width: 190, height: 4, backgroundColor: '#ECE3D1' });
    expect(flat(S.coverBar).backgroundColor).toBe('#A31D4E');
  });

  it('C-K5 segments: piste #ECE3D1 r14 p4, seg h38 r11 13/700; C-K6 theme card r18, rest 1.5 #E0D6C2, selected 2 #A31D4E + check 26; swatches 20 r99', () => {
    expect(flat(S.segTrack)).toMatchObject({ backgroundColor: '#ECE3D1', borderRadius: 14, padding: 4 });
    expect(flat(S.segBtn)).toMatchObject({ height: 38, borderRadius: 11 });
    expect(flat(S.segText).fontSize).toBe(13);
    expect(flat(S.themeCard).borderRadius).toBe(18);
    expect(flat(S.themeCardRest)).toMatchObject({ borderWidth: 1.5, borderColor: '#E0D6C2' });
    expect(flat(S.themeCardSelected)).toMatchObject({ borderWidth: 2, borderColor: '#A31D4E' });
    expect(flat(S.themeCheck)).toMatchObject({ width: 26, height: 26, backgroundColor: '#A31D4E' });
    expect(flat(S.swatch)).toMatchObject({ width: 20, height: 20 });
    expect(flat(S.defautPill).backgroundColor).toBe('#EFE8DA');
  });

  it('C-K7 order row: min-h 62, art 44 r12, arrows 30 r9, star 38 r12 (pinned bg #F8E4EC), pills #F8E4EC/#701134 + #EFE8DA/#6F6355, épuisé opacity .62', () => {
    expect(flat(S.orderRow).minHeight).toBe(62);
    expect(flat(S.orderRow).gap).toBe(11);
    expect(flat(S.orderArt)).toMatchObject({ width: 44, height: 44, borderRadius: 12 });
    expect(flat(S.arrowBtn)).toMatchObject({ width: 30, height: 30, borderRadius: 9 });
    expect(flat(S.starBtn)).toMatchObject({ width: 38, height: 38, borderRadius: 12 });
    expect(flat(S.starBtnPinned).backgroundColor).toBe('#F8E4EC');
    expect(flat(S.unePill).backgroundColor).toBe('#F8E4EC');
    expect(flat(S.unePillText).color).toBe('#701134');
    expect(flat(S.epuisePill).backgroundColor).toBe('#EFE8DA');
    expect(flat(S.orderRowEpuise).opacity).toBe(0.62);
  });

  it('C-K8 CTA 54 r16 #A31D4E, disabled #DDD5C3/#8A7D6B (checkbox/danger pins left with the K6 editor, founder order 2026-08-13)', () => {
    expect(flat(S.cta)).toMatchObject({ height: 54, borderRadius: 16, backgroundColor: '#A31D4E' });
    expect(flat(S.ctaDisabled).backgroundColor).toBe('#DDD5C3');
    expect(flat(S.ctaTextDisabled).color).toBe('#8A7D6B');
  });

  /**
   * THEMES-8 (canon v3.9.0, founder order 2026-08-05) — the curated set is
   * eight. The claim was never « exactly four »: it is that the set is CLOSED
   * and MIRRORS CANON. Both halves are asserted below, and the mirror half is
   * the one that matters — a preset canon accepts but this app has no tokens
   * for would render a seller's shop with `undefined` colours.
   */
  it('the theme set is CLOSED and mirrors canon exactly — no free colours, no drift', () => {
    expect(Object.keys(THEMES).sort()).toEqual(
      ['aubergine', 'danfani', 'foret', 'frangipanier', 'indigo', 'brique', 'laterite', 'lagune'].sort(),
    );
    // THE MIRROR, both directions: canon's vocabulary and this record's keys are
    // the same set. A canon preset with no tokens here, or a theme here that
    // canon would refuse to store, both fail.
    expect(Object.keys(THEMES).sort()).toEqual([...STOREFRONT_THEMES].sort());
    expect(THEMES.laterite).toMatchObject({ accent: '#C2571B', deep: '#7A340E', soft: '#F7E7D8', on: '#FFF6EC' });
    expect(THEMES.indigo).toMatchObject({ accent: '#3E4B8C', deep: '#232B54', soft: '#E7EAF6', on: '#F2F4FC' });
    // the founder's light pink, by value — « make sure there is a light pink in it »
    expect(THEMES.frangipanier).toMatchObject({ name: 'Frangipanier', accent: '#AD4F83', deep: '#641E47', soft: '#FCD9EA', on: '#FFF4F7' });
  });

  /**
   * THEMES-8 — NO NEW NAME MAY COLLIDE WITH A HEADER STYLE.
   *
   * Caught in review before merge: `hibiscus` and `karite` were the first two
   * picks, and both are already header keys. The personnalisation screen renders
   * the theme grid and the header grid one under the other, so the seller would
   * have met two identically-labelled cards with no way to tell them apart.
   *
   * `indigo` is grandfathered: it shipped in both vocabularies long before this
   * slice, and renaming a live key would orphan every shop stored under it. The
   * exemption is exactly one, asserted, so the next preset cannot join it
   * quietly.
   */
  it('no theme key collides with a header style — except the grandfathered indigo', () => {
    const collisions = Object.keys(THEMES).filter((k) => (HEADER_STYLES as readonly string[]).includes(k));
    expect(collisions).toEqual(['indigo']);
  });

  /**
   * THE CONTRAST LAW IS COMPUTED, NOT TRUSTED (§1.2: « contrasts are
   * pre-validated by design »). Eyeballing a hex is how an unreadable price
   * band ships to a woman standing in the sun, so the ratios are measured here
   * from the shipped bytes, for every preset, on every new one.
   *
   * THE FOUR ORIGINALS ARE MEASURED TOO — and one of them, Latérite, comes in
   * at 4.20:1 on its price-band text, under the 4.5 floor its own docstring
   * names. That is a SHIPPED, founder-owned brand colour and the default
   * habillage; silently retuning it would be a redesign nobody asked for. It is
   * recorded here as a known exemption and flagged to the founder, and the law
   * is enforced strictly on everything else.
   */
  it('CONTRAST — every preset proves θ.on/θ.accent ≥ 4.5:1 and θ.deep/white ≥ 7:1, computed from the shipped bytes', () => {
    const lum = (hex: string): number => {
      const h = hex.replace('#', '');
      const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      const lin = ch.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
    };
    const ratio = (a: string, b: string): number => {
      const [la, lb] = [lum(a), lum(b)];
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    // the control: the function itself must be able to fail
    expect(ratio('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
    expect(ratio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);

    const EXEMPT_ON_ACCENT = new Set(['laterite']); // shipped brand colour, see the docstring
    for (const [key, th] of Object.entries(THEMES)) {
      expect(ratio(th.deep, '#FFFFFF'), `${key} deep-on-white`).toBeGreaterThanOrEqual(7);
      if (EXEMPT_ON_ACCENT.has(key)) continue;
      expect(ratio(th.on, th.accent), `${key} on-accent`).toBeGreaterThanOrEqual(4.5);
    }
    // …and the exemption is EXACTLY ONE preset, measured — so a future theme
    // cannot be quietly added to the escape hatch.
    expect(EXEMPT_ON_ACCENT.size).toBe(1);
    expect(ratio(THEMES.laterite.on, THEMES.laterite.accent)).toBeLessThan(4.5);
  });

  /**
   * THEMES-8b — NO TWO HABILLAGES MAY READ AS THE SAME COLOUR.
   *
   * The founder, on a real phone: « forêt et lagune are the same color ». My
   * swatch review had missed it because the review sheet drew cards four times
   * the size a seller actually sees, and « they look different to me » is not a
   * measurement. So the claim is computed here, in CIE Lab ΔE*ab, from the
   * shipped bytes — the same discipline the contrast law already gets.
   *
   * THE METRIC MATCHES WHAT HE LOOKED AT. The picker card (K4) draws three
   * swatches — accent, deep, soft — so two cards are confusable only when ALL
   * THREE are close; one clearly different swatch is enough to tell them apart.
   * Card distance is therefore the MAXIMUM of the three ΔEs, not the mean.
   *
   * THE FLOOR IS 20, and it is derived from the defect, not chosen for comfort:
   * the pair he rejected measures 16.2. A second pair, Dan Fani / Frangipanier,
   * measured 12.9 — WORSE than the one he sent back, found by running this
   * metric over the set rather than by looking again; the pink was retuned for
   * it (see themes.ts). Everything now clears 22.9.
   */
  it('SEPARATION — no two habillages are confusable on the picker card (ΔE*ab ≥ 20), computed from the shipped bytes', () => {
    const lab = (hex: string): [number, number, number] => {
      const h = hex.replace('#', '');
      const [r, g, b] = [0, 2, 4]
        .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
      const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
      const Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
      return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
    };
    const dE = (a: string, b: string): number => {
      const [x, y] = [lab(a), lab(b)];
      return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    };
    // the control: the metric must be able to FAIL, and it must fail on exactly
    // the pair the founder rejected — Lagune BEFORE the fix, against Forêt.
    const LAGUNE_REJECTED = { accent: '#0E6E70', deep: '#06484A', soft: '#E2F1F0' };
    const rejected = Math.max(
      dE(THEMES.foret.accent, LAGUNE_REJECTED.accent),
      dE(THEMES.foret.deep, LAGUNE_REJECTED.deep),
      dE(THEMES.foret.soft, LAGUNE_REJECTED.soft),
    );
    expect(rejected).toBeLessThan(20); // the defect scores BELOW the floor…
    expect(dE('#FFFFFF', '#FFFFFF')).toBe(0); // …and identical colours are 0

    const keys = Object.keys(THEMES) as (keyof typeof THEMES)[];
    let pairs = 0;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const [x, y] = [THEMES[keys[i]!]!, THEMES[keys[j]!]!];
        const card = Math.max(dE(x.accent, y.accent), dE(x.deep, y.deep), dE(x.soft, y.soft));
        expect(card, `${keys[i]} / ${keys[j]}`).toBeGreaterThanOrEqual(20);
        pairs++;
      }
    }
    // THE COUNT IS LITERAL ON BOTH SIDES, and it has to be: my first spelling
    // was `expect(pairs).toBe((keys.length * (keys.length - 1)) / 2)`, where
    // both sides derive from `keys.length` — an identity that cannot fail,
    // asserting nothing while claiming to prove coverage (§9.7). Eight presets
    // are 28 pairs; delete one and this goes red instead of quietly checking 21.
    expect(keys).toHaveLength(8);
    expect(pairs).toBe(28);
  });

});

describe('K flows — §8.5–§8.10 as assertions', () => {
  const sf = DEFAULT_STOREFRONT;

  it('§8.6 K2: a name under 3 chars is refused; a valid save publishes immediately', () => {
    const bad = saveIdentity(sf, { name: 'Ai', tagline: '', bio: '', zone: sf.zone });
    expect(bad.ok).toBe(false);
    const good = saveIdentity(sf, { name: 'Chez Aïcha Mode', tagline: 'Le wax et le cuir', bio: '', zone: sf.zone });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.next.tagline).toBe('Le wax et le cuir');
  });

  it('VITRINE-QUARTIER-1: the quartier saves with the identity — blank refused by name, trimmed, capped', () => {
    // He can finally leave « Gounghin, Ouagadougou »: the founder's exact defect.
    const moved = saveIdentity(sf, { name: sf.name, tagline: '', bio: '', zone: '  Dassasgho, Ouagadougou  ' });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.next.zone).toBe('Dassasgho, Ouagadougou'); // trimmed — canon refuses edge whitespace
    // A shop must KEEP a quartier — a blank save is refused with its own toast,
    // never silently kept (that would tell him the clear saved).
    const blank = saveIdentity(sf, { name: sf.name, tagline: '', bio: '', zone: '   ' });
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.toastKey).toBe('k.identite.zone_requise');
    // The display bound: 40, like the tagline — sliced at the edit boundary.
    const long = saveIdentity(sf, { name: sf.name, tagline: '', bio: '', zone: 'Q'.repeat(60) });
    expect(long.ok).toBe(true);
    if (long.ok) expect(long.next.zone.length).toBe(40);
  });

  it('§8.8 K5: the 3rd pin is refused with the cap toast; an épuisé pin is refused', () => {
    let cur = sf;
    for (const pid of ['p1', 'p5']) {
      const r = togglePin(cur, pid, true);
      expect(r.ok).toBe(true);
      if (r.ok) cur = r.next;
    }
    expect(cur.featuredItems).toEqual(['p1', 'p5']);
    const third = togglePin(cur, 'p2', true);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.toastKey).toBe('k.une.refus_cap');
    const epuise = togglePin(sf, 'p3', false);
    expect(epuise.ok).toBe(false);
    if (!epuise.ok) expect(epuise.toastKey).toBe('k.une.refus_epuise');
    expect(FEATURED_CAP).toBe(2);
  });

  it('§8.8 K5: ▲▼ swaps neighbours in curatedItems (the buyer grid follows this order verbatim)', () => {
    const moved = moveItem(sf, 'p2', -1);
    expect(moved.curatedItems.slice(0, 2)).toEqual(['p2', 'p1']);
    expect(moveItem(sf, 'p1', -1)).toBe(sf); // top can't rise
  });

  it('the LOCAL mirror parses with the CANON v1.1.0 StorefrontSchema (RN bundle bans runtime imports; drift fails HERE)', () => {
    expect(() => StorefrontSchema.parse(DEFAULT_STOREFRONT)).not.toThrow();
    const saved = saveIdentity(DEFAULT_STOREFRONT, { name: 'Chez Aïcha Mode', tagline: 'Le wax', bio: '', zone: DEFAULT_STOREFRONT.zone });
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(() => StorefrontSchema.parse(saved.next)).not.toThrow();
    // canon bounds the name at ≤ 120; THIS app's 3–24 lives at the edit boundary
    expect(saveIdentity(DEFAULT_STOREFRONT, { name: 'Ai', tagline: '', bio: '', zone: DEFAULT_STOREFRONT.zone }).ok).toBe(false);
  });

  it('the K seed is the §3.2 catalog (8 articles, diaspora excluded, p3 the only épuisé)', () => {
    expect(K_SEED).toHaveLength(8);
    expect(K_SEED.some((p) => p.pid.startsWith('d'))).toBe(false);
    expect(K_SEED.filter((p) => !p.inStock).map((p) => p.pid)).toEqual(['p3']);
    expect(K_SEED.find((p) => p.pid === 'p1')!.priceFcfa).toBe(11_500);
  });
});

/**
 * MEDIA-2 round 3 — coverTo MUST NOT FORGET WHERE THE PHOTOGRAPH IS.
 *
 * A verifier gutted this function to `return sf` — a complete no-op — and the whole
 * file stayed green (13/13). Nothing exercised it. Meanwhile the real version
 * dropped `cover.url` on every transition, because MEDIA-1 added `url?` to the
 * cover shape and never updated this constructor.
 */
describe('MEDIA-2 — coverTo carries the url through every local status change', () => {
  const live = {
    ...DEFAULT_STOREFRONT,
    cover: { status: 'live' as const, url: 'https://svc.example/media/storefronts/sf-1/cover/a.jpg' },
  };

  it('THE URL SURVIVES live → uploading → error → none', () => {
    // This is the exact walk of a FAILED REPLACEMENT: she has a live cover, taps
    // « Changer la photo », the upload fails, she taps « Réessayer ». Dropping the
    // url made her app say « Ajouter une couverture » over a shop whose cliente
    // was still looking at the photograph — with no way back inside the screen,
    // because the adoption effect is keyed on updatedAt, which never moved.
    let sf = coverTo(live, 'uploading');
    expect(sf.cover.url).toBe(live.cover.url);
    sf = coverTo(sf, 'error');
    expect(sf.cover.url).toBe(live.cover.url);
    sf = coverTo(sf, 'none');
    expect(sf.cover.url).toBe(live.cover.url);
    // …and the status really did change at each step (not a no-op function)
    expect(coverTo(live, 'uploading').cover.status).toBe('uploading');
    expect(coverTo(live, 'error').cover.status).toBe('error');
    expect(coverTo(live, 'none').cover.status).toBe('none');
  });

  it('A COVER THAT NEVER HAD A URL STILL HAS NONE — nothing is invented', () => {
    const bare = { ...DEFAULT_STOREFRONT, cover: { status: 'none' as const } };
    expect(coverTo(bare, 'uploading').cover.url).toBeUndefined();
  });

  it('NOTHING ELSE ON THE STOREFRONT IS DISTURBED', () => {
    const sf = coverTo(live, 'error');
    expect(sf.name).toBe(live.name);
    expect(sf.theme).toBe(live.theme);
    expect(sf.curatedItems).toEqual(live.curatedItems);
    expect(sf.updatedAt).toBe(live.updatedAt);
  });
});

/**
 * ENTETES-B — the six header keys, mirrored locally for the RN bundle exactly as
 * the Storefront shape is (Metro law), and pinned to CANON here so a drift fails
 * in vitest, never on a device. Plus the classique fallback the picker reads.
 */
describe('ENTETES-B — the local header-key mirror stays canon, and the fallback is classique', () => {
  it('the LOCAL list is exactly the canon STOREFRONT_HEADER_STYLES, in canon order', async () => {
    const { HEADER_STYLES } = await import('../src/vitrine/customize/storefront');
    const { STOREFRONT_HEADER_STYLES } = await import('@platform/contracts');
    expect([...HEADER_STYLES]).toEqual([...STOREFRONT_HEADER_STYLES]);
  });

  it('headerStyleOf: a held key reads back; ABSENT (old service wire) and UNKNOWN both read classique', async () => {
    const { DEFAULT_STOREFRONT, headerStyleOf } = await import('../src/vitrine/customize/storefront');
    expect(headerStyleOf({ ...DEFAULT_STOREFRONT, headerStyle: 'royale' })).toBe('royale');
    // an OLD deployed service omits the field entirely — the picker must not break
    const { headerStyle: _omitted, ...preField } = DEFAULT_STOREFRONT;
    expect(headerStyleOf(preField)).toBe('classique');
    expect(headerStyleOf({ ...DEFAULT_STOREFRONT, headerStyle: 'baroque' })).toBe('classique');
  });

  it('the DEFAULT storefront carries classique and STILL parses with the canon schema', () => {
    expect(DEFAULT_STOREFRONT.headerStyle).toBe('classique');
    expect(StorefrontSchema.parse(DEFAULT_STOREFRONT).headerStyle).toBe('classique');
  });
});

/**
 * ENTETES-E0/E (canon v2.3.0 → the built five) — the Beurni Boss five joined
 * the vocabulary first (E0), and now carry buyer render units + catalog
 * strings, so the K4 grid offers all eleven. The law that mattered survives:
 * the picker maps `PICKABLE_HEADER_STYLES`, and every pickable key MUST have
 * its strings (`t()` throws on a missing key — an un-authored card is a crash).
 */
describe('ENTETES-F/J — the picker is a strict subset of canon vocabulary', () => {
  it('each of the five NEW keys reads back through headerStyleOf — vocabulary, not garbage', async () => {
    const { DEFAULT_STOREFRONT, headerStyleOf } = await import('../src/vitrine/customize/storefront');
    // masque stays VOCABULARY after ENTETES-J even though it lost its drawing
    for (const key of ['masque', 'harmattan', 'balafon', 'seance', 'cauris']) {
      expect(headerStyleOf({ ...DEFAULT_STOREFRONT, headerStyle: key }), key).toBe(key);
    }
    // …and true garbage still reads classique — the ENTETES-B law intact
    expect(headerStyleOf({ ...DEFAULT_STOREFRONT, headerStyle: 'bogolan' })).toBe('classique');
  });

  it('PICKABLE_HEADER_STYLES is what is BUILT — a subset of canon, in canon order', async () => {
    const { HEADER_STYLES, PICKABLE_HEADER_STYLES } = await import('../src/vitrine/customize/storefront');
    expect([...PICKABLE_HEADER_STYLES]).toEqual([
      'classique',
      'royale',
      'heritage',
      'chaleureux',
      'dynamique',
      'harmattan',
      'balafon',
      'seance',
      'cauris',
      // ENTETES-H — Indigo (série 2) is the first of the twenty to be BUILT and
      // therefore the first to be offered. It was added here LAST, after its
      // chunk, its catalog strings and its framing silhouette existed.
      'indigo',
      'grenat',
      'kraft',
      'audace',
      'fleurie',
      'braise',
      'karite',
      'calebasse',
      'pagne',
      // ENTETES-L — séries 8/9. Same order of operations as Indigo above: the
      // six modules, their chunks, their catalog strings and their framing
      // silhouettes all landed before these lines were added — six then,
      // five since ENTETES-N retired Fil d'or.
      'bazin',
      'couverture',
      'billet',
      'enseigne',
      'hologramme',
      // ENTETES-M — séries 10/11, added last as always: modules, chunks,
      // catalog strings and framing silhouettes all landed before these lines.
      'dentelle',
      'bougain',
      'flamboyant',
      'hibiscus',
      'papillons',
      'guirlande',
    ]);
    // ENTETES-H — the picker is NO LONGER equal to the vocabulary, and asserting
    // equality would now enforce the opposite of this repo's own law:
    // « vocabulary may grow ahead of the picker; the picker never runs ahead of
    // the render ». Canon carries 31 keys at v2.4.0; only these 11 have a buyer
    // render unit and catalog strings. What must hold is CONTAINMENT and ORDER.
    expect(PICKABLE_HEADER_STYLES.length).toBeLessThanOrEqual(HEADER_STYLES.length);
    for (const k of PICKABLE_HEADER_STYLES) expect(HEADER_STYLES, k).toContain(k);
    // canon order is preserved inside the pickable subset — the picker must
    // never reshuffle the vocabulary it draws from
    const canonIndex = PICKABLE_HEADER_STYLES.map((k) => HEADER_STYLES.indexOf(k));
    expect(canonIndex).toEqual([...canonIndex].sort((a, b) => a - b));
    expect(canonIndex).not.toContain(-1);
    // ENTETES-J — the picker and the vocabulary DIVERGE, and that is the law,
    // not a gap to close. ENTETES-H briefly made them equal because every canon
    // key had a drawing; the founder then cut ten styles on looks. Their keys
    // stay canon VOCABULARY — a live storefront may hold one and
    // `storefront-core` must not refuse it — while the picker no longer offers
    // them. Containment and order, never equality: a key with no drawing must
    // never be offerable, and a new key is vocabulary before it is pickable.
    expect(PICKABLE_HEADER_STYLES.length).toBeLessThan(HEADER_STYLES.length);
    // and the ten that were cut are ABSENT from the picker, by name
    // ENTETES-N appended four to the ENTETES-J roster (founder, 2026-08-15:
    // « cleanly remove the en-têtes Safran, chrome, artisan and fil d'or »).
    // BOTH halves matter and they pull opposite ways: a key with no drawing
    // must never be offerable, and a retired key must never stop being
    // ACCEPTED — a live storefront still carries it.
    for (const cut of ['bronze', 'dunda', 'graffiti', 'perle', 'neon',
                       'pop', 'prisme', 'couture', 'masque', 'cristal',
                       'safran', 'chrome', 'artisan', 'fildor']) {
      expect(PICKABLE_HEADER_STYLES, cut).not.toContain(cut);
      expect(HEADER_STYLES, `${cut} must stay canon vocabulary`).toContain(cut);
    }
  });

  it('every PICKABLE key has BOTH its picker strings in the catalog (t throws on a missing key)', async () => {
    const { PICKABLE_HEADER_STYLES } = await import('../src/vitrine/customize/storefront');
    const { t } = await import('../src/i18n');
    for (const key of PICKABLE_HEADER_STYLES) {
      expect(t(`k.entete.nom_${key}`).length, key).toBeGreaterThan(0);
      expect(t(`k.entete.sub_${key}`).length, key).toBeGreaterThan(0);
    }
  });

  it('the four frame HER COVER in their Série 4 silhouettes — one shape, two crop biases', async () => {
    const { defaultFocusFor, frameSpecFor } = await import('../src/vitrine/customize/framing-math');
    // FOUNDER RULING 2026-07-30 « make it all be like the 6 original headers »:
    // these styles DRAW the cover now, so the sheet must show her drag inside the
    // real silhouette the buyer will see — never the classique placeholder they
    // carried while the cover went unused.
    // ENTETES-J — « masque » was cut; the other four still draw the cover.
    for (const key of ['harmattan', 'balafon', 'seance', 'cauris'] as const) {
      expect(frameSpecFor(key, 'cover'), key).not.toEqual(frameSpecFor('classique', 'cover'));
      // ONE SHAPE, both kinds — a second copy would be a second answer. The
      // FOCUS is deliberately not shared: the cover rides the style's own
      // relevé bias, the portrait fallback the shared high bias.
      expect(frameSpecFor(key, 'cover'), key).toEqual(frameSpecFor(key, 'avatar'));
      expect(defaultFocusFor(key, 'avatar'), key).toEqual({ x: 50, y: 24 });
    }
    // ENTETES-F — the Série 4 silhouettes and « cover · X% Y% » crop biases
    expect(frameSpecFor('balafon', 'cover')).toEqual({
      aspect: 158 / 212, circle: false, radii: [4 / 158, 4 / 158, 4 / 158, 4 / 158],
    });
    expect(defaultFocusFor('harmattan', 'cover')).toEqual({ x: 55, y: 30 });
    expect(defaultFocusFor('balafon', 'cover')).toEqual({ x: 55, y: 22 });
    expect(defaultFocusFor('seance', 'cover')).toEqual({ x: 60, y: 30 });
    expect(defaultFocusFor('cauris', 'cover')).toEqual({ x: 52, y: 28 });
    // …and the SIX keep the cover frames they have always had
    expect(frameSpecFor('royale', 'cover')).toEqual({ aspect: 1, circle: true, radii: [0.5, 0.5, 0.5, 0.5] });
    expect(defaultFocusFor('dynamique', 'cover')).toEqual({ x: 58, y: 30 });
    // Avatar: the SAME contract silhouette (the frame does not change with
    // which photograph fills it), and the shared high portrait bias.
    for (const key of ['harmattan', 'balafon', 'seance', 'cauris'] as const) {
      expect(frameSpecFor(key, 'avatar'), key).toEqual(frameSpecFor(key, 'cover'));
      expect(frameSpecFor(key, 'avatar').circle, key).toBe(false);
      expect(defaultFocusFor(key, 'avatar'), key).toEqual({ x: 50, y: 24 });
    }
    // …and the six keep the circle medallion + their defaults, unchanged.
    expect(frameSpecFor('royale', 'avatar')).toEqual({ aspect: 1, circle: true, radii: [0.5, 0.5, 0.5, 0.5] });
    expect(defaultFocusFor('heritage', 'avatar')).toEqual({ x: 50, y: 32 });
    expect(defaultFocusFor('classique', 'avatar')).toEqual({ x: 50, y: 50 });
  });
});

/**
 * PERSONNALISER-HONESTY-1 (founder-caught 2026-07-30) — THE CHECK MARK MEANS
 * STORED, NEVER « TAPPED ».
 *
 * He tapped « Masque »; the card drew its check mark on the tap, the service
 * refused the save (`unknown_header_style` — the live Worker still spoke the
 * six-style canon), and the screen showed a CHOSEN card and « Pas enregistré »
 * at the same time. Nothing had been stored. Law 7: queued is pending, never
 * done — and a picker is no exception.
 *
 * These are source-pinned because the assertion is about WHICH STATE MAY DRAW
 * THE CHECK, and the K screens are RN components this Node suite cannot mount.
 * They are written to fail on the exact regression: an optimistic local write
 * on the tap, or a success toast that does not wait for the answer.
 */
describe('PERSONNALISER-HONESTY-1 — the header picker never claims an unsaved choice', () => {
  const screens = readFileSync(join(__dirname, '..', 'src/vitrine/customize/screens.tsx'), 'utf8');
  const handler = /onPickEntete=\{\(key\) => \{[\s\S]*?\n          \}\}/.exec(screens)?.[0] ?? '';
  // The assertions below are about CODE, not commentary: the comment explains
  // the defect and names the call it removed, and a guard a comment can break
  // is a guard that will be silenced by rewording rather than fixed.
  const code = handler.replace(/\/\/[^\n]*/g, '');

  it('the handler really was found — an empty match would pass every assertion below', () => {
    expect(handler.length).toBeGreaterThan(200);
    expect(code).toContain('onSaveIdentity');
    // …and the comment-stripper left the code intact
    expect(code).toContain('setEnteteEnCours(key)');
  });

  it('the tap does NOT write local state — no optimistic setSfRaw, no onStorefrontChange', () => {
    expect(code).not.toMatch(/setSfRaw/);
    expect(code).not.toMatch(/onStorefrontChange/);
    // the stripper is not hiding the evidence: the PROSE does still name it
    expect(handler).toMatch(/setSfRaw/);
  });

  it('the success toast fires ONLY on a true answer from the save', () => {
    expect(code).toMatch(/const ok = await onSaveIdentity\?\.\(\{ headerStyle: key \}\)/);
    expect(code).toMatch(/if \(ok === true\) onToast/);
  });

  it('the card says PENDING while the save is in flight, and the check is bound to the STORED value', () => {
    expect(code).toMatch(/setEnteteEnCours\(key\)/);
    expect(code).toMatch(/setEnteteEnCours\(undefined\)/);
    // the grid draws « Enregistrement… » for the in-flight key, else the check
    // for the SELECTED (adopted) one — never both, never the check on a tap
    expect(screens).toMatch(/enCours === key \?[\s\S]{0,200}k\.entete\.en_cours/);
    expect(screens).toMatch(/\) : selected \? \(/);
  });

  it('the save seam ANSWERS — the callback type resolves a boolean, not void', () => {
    expect(screens).toMatch(/onSaveIdentity\?: \(patch: StorefrontIdentityPatch\) => Promise<boolean>/);
  });

  it('the pending string exists in the catalog and is a status, not a promise', async () => {
    const { t } = await import('../src/i18n');
    expect(t('k.entete.en_cours').length).toBeGreaterThan(0);
    expect(t('k.entete.en_cours')).not.toMatch(/enregistré[^e]|choisi/i);
  });
});

/**
 * APERCU-PHOTOS-1 (founder-caught 2026-07-30) — THE APERÇU SHOWS HER REAL
 * PHOTOGRAPHS, OR SAYS IT HAS NONE.
 *
 * « Aperçu — vue cliente » drew a flat brown rectangle whenever a cover was
 * live and the theme monogram whenever it was not. The founder judged « the
 * photo de couverture is not showing on none of the en-têtes » from this
 * screen — and the buyer page had been rendering it correctly the whole time.
 * A preview that cannot show the photograph is worse than no preview: it
 * reports a defect that does not exist and hides the one that does.
 *
 * K3's cover slot carried this exact defect and was fixed once already (« a
 * coloured field with no image, so « en ligne » was a claim about nothing »);
 * this screen was left behind. Source-pinned because these are RN components
 * this Node suite cannot mount, and written to fail on the precise regression:
 * a coloured View standing in for a photograph.
 */
describe('APERCU-PHOTOS-1 — the aperçu draws her real cover and portrait', () => {
  const screens = readFileSync(join(__dirname, '..', 'src/vitrine/customize/screens.tsx'), 'utf8');
  const apercu = /export function ApercuCliente\([\s\S]*?\n\}/.exec(screens)?.[0] ?? '';
  const code = apercu.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/[^\n]*/g, '');

  it('the component really was found — an empty match would pass everything below', () => {
    expect(apercu.length).toBeGreaterThan(1000);
    expect(code).toContain('S.apercuCover');
    expect(code).toContain('S.apercuAvatar');
  });

  it('a LIVE cover renders her actual image, gated on a real url', () => {
    expect(code).toMatch(/sf\.cover\.status === 'live' && sf\.cover\.url \?/);
    expect(code).toMatch(/<Image source=\{\{ uri: sf\.cover\.url \}\}[^>]*resizeMode="cover"/);
  });

  it('a portrait renders her actual image, gated on a real url', () => {
    expect(code).toMatch(/sf\.avatar\.url \?/);
    expect(code).toMatch(/<Image source=\{\{ uri: sf\.avatar\.url \}\}[^>]*resizeMode="cover"/);
  });

  it('the OLD hard-coded photo-substitute colour is gone from the RENDERING code', () => {
    // #8A5A3A was the brown field that stood in for every seller's cover. The
    // string still appears in the comment that explains the defect, and a guard
    // a comment can break is a guard that gets silenced by rewording — so this
    // reads the file with its commentary stripped.
    const src = screens.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).not.toContain('#8A5A3A');
    // …and the stripper did not simply empty the file
    expect(src).toContain('S.apercuCover');
  });

  it('no photo ⇒ the honest monogram, never a bare coloured field', () => {
    expect(code).toContain('S.previewFiligrane');
    expect(code).toContain('S.apercuAvatarText');
  });

  it('the round portrait CLIPS its image — a square photo over a round border is a new defect', () => {
    expect(flat(S.apercuAvatar).overflow).toBe('hidden');
    expect(flat(S.apercuAvatar).borderRadius).toBe(99);
    // …and the cover frame already clipped, which is why it never spilled
    expect(flat(S.apercuCover).overflow).toBe('hidden');
  });
});
