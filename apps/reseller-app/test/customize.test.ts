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
 * refused; ▲▼ reorders curatedItems; 5th section refused; section ≤ 1 per
 * product; delete keeps articles; the pin PERSISTS on an épuisé (K5 shows it,
 * the BUYER display auto-retires it).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STOREFRONT,
  FEATURED_CAP,
  SECTIONS_CAP,
  THEMES,
  coverTo,
  createSection,
  deleteSection,
  moveItem,
  saveIdentity,
  toggleSectionPid,
  togglePin,
} from '../src/vitrine/customize/storefront';
import { K_SEED } from '../src/vitrine/customize/storefront';
import { K_RAW_STYLES as S } from '../src/vitrine/customize/k-styles';
import { StorefrontSchema } from '@platform/contracts';

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

  it('C-K8 checkbox: 26 r9, checked #A31D4E; danger ghost #D9A49C/#8C1D18; CTA 54 r16 #A31D4E, disabled #DDD5C3/#8A7D6B', () => {
    expect(flat(S.checkbox)).toMatchObject({ width: 26, height: 26, borderRadius: 9, borderColor: '#E5DCC9' });
    expect(flat(S.checkboxOn).backgroundColor).toBe('#A31D4E');
    expect(flat(S.dangerGhost).borderColor).toBe('#D9A49C');
    expect(flat(S.dangerGhostText).color).toBe('#8C1D18');
    expect(flat(S.cta)).toMatchObject({ height: 54, borderRadius: 16, backgroundColor: '#A31D4E' });
    expect(flat(S.ctaDisabled).backgroundColor).toBe('#DDD5C3');
    expect(flat(S.ctaTextDisabled).color).toBe('#8A7D6B');
  });

  it('the theme set is CLOSED at exactly the four §1.2 presets (no free colors)', () => {
    expect(Object.keys(THEMES).sort()).toEqual(['danfani', 'foret', 'indigo', 'laterite']);
    expect(THEMES.laterite).toMatchObject({ accent: '#C2571B', deep: '#7A340E', soft: '#F7E7D8', on: '#FFF6EC' });
    expect(THEMES.indigo).toMatchObject({ accent: '#3E4B8C', deep: '#232B54', soft: '#E7EAF6', on: '#F2F4FC' });
  });

});

describe('K flows — §8.5–§8.10 as assertions', () => {
  const sf = DEFAULT_STOREFRONT;

  it('§8.6 K2: a name under 3 chars is refused; a valid save publishes immediately', () => {
    const bad = saveIdentity(sf, { name: 'Ai', tagline: '', bio: '' });
    expect(bad.ok).toBe(false);
    const good = saveIdentity(sf, { name: 'Chez Aïcha Mode', tagline: 'Le wax et le cuir', bio: '' });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.next.tagline).toBe('Le wax et le cuir');
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

  it('§8.9 K6: the 5th section is refused; a product lives in ≤ 1 section; delete keeps the articles', () => {
    let cur = sf;
    for (let i = 0; i < SECTIONS_CAP; i++) {
      const r = createSection(cur, `s${i}`, 'Nouvelle section');
      expect(r.ok).toBe(true);
      if (r.ok) cur = r.next;
    }
    const fifth = createSection(cur, 'sX', 'Nouvelle section');
    expect(fifth.ok).toBe(false);
    cur = toggleSectionPid(cur, 's0', 'p1');
    cur = toggleSectionPid(cur, 's1', 'p1'); // joining s1 removes from s0
    expect(cur.sections.find((s) => s.id === 's0')!.pids).toEqual([]);
    expect(cur.sections.find((s) => s.id === 's1')!.pids).toEqual(['p1']);
    const del = deleteSection(cur, 's1');
    expect(del.ok).toBe(true);
    if (del.ok) {
      expect(del.next.sections.find((s) => s.id === 's1')).toBeUndefined();
      expect(del.next.curatedItems).toContain('p1'); // articles stay in boutique
    }
  });

  it('the LOCAL mirror parses with the CANON v1.1.0 StorefrontSchema (RN bundle bans runtime imports; drift fails HERE)', () => {
    expect(() => StorefrontSchema.parse(DEFAULT_STOREFRONT)).not.toThrow();
    const saved = saveIdentity(DEFAULT_STOREFRONT, { name: 'Chez Aïcha Mode', tagline: 'Le wax', bio: '' });
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(() => StorefrontSchema.parse(saved.next)).not.toThrow();
    // canon bounds the name at ≤ 120; THIS app's 3–24 lives at the edit boundary
    expect(saveIdentity(DEFAULT_STOREFRONT, { name: 'Ai', tagline: '', bio: '' }).ok).toBe(false);
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
describe('ENTETES-F — vocabulary and picker are both the eleven now', () => {
  it('each of the five NEW keys reads back through headerStyleOf — vocabulary, not garbage', async () => {
    const { DEFAULT_STOREFRONT, headerStyleOf } = await import('../src/vitrine/customize/storefront');
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
      'cristal',
      'dynamique',
      'masque',
      'harmattan',
      'balafon',
      'seance',
      'cauris',
      // ENTETES-H — Indigo (série 2) is the first of the twenty to be BUILT and
      // therefore the first to be offered. It was added here LAST, after its
      // chunk, its catalog strings and its framing silhouette existed.
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
    // and the twenty that have no unit yet are ABSENT from the picker, by name
    for (const unbuilt of ['dunda', 'graffiti', 'karite', 'braise']) {
      expect(PICKABLE_HEADER_STYLES, unbuilt).not.toContain(unbuilt);
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

  it('the five frame HER COVER in their Série 4 silhouettes — one shape, two crop biases', async () => {
    const { defaultFocusFor, frameSpecFor } = await import('../src/vitrine/customize/framing-math');
    // FOUNDER RULING 2026-07-30 « make it all be like the 6 original headers »:
    // these styles DRAW the cover now, so the sheet must show her drag inside the
    // real silhouette the buyer will see — never the classique placeholder they
    // carried while the cover went unused.
    for (const key of ['masque', 'harmattan', 'balafon', 'seance', 'cauris'] as const) {
      expect(frameSpecFor(key, 'cover'), key).not.toEqual(frameSpecFor('classique', 'cover'));
      // ONE SHAPE, both kinds — a second copy would be a second answer. The
      // FOCUS is deliberately not shared: the cover rides the style's own
      // relevé bias, the portrait fallback the shared high bias.
      expect(frameSpecFor(key, 'cover'), key).toEqual(frameSpecFor(key, 'avatar'));
      expect(defaultFocusFor(key, 'avatar'), key).toEqual({ x: 50, y: 24 });
    }
    // ENTETES-F — the Série 4 silhouettes and « cover · X% Y% » crop biases
    expect(frameSpecFor('masque', 'cover')).toEqual({ aspect: 186 / 358, circle: false, radii: [0, 0, 0, 0] });
    expect(frameSpecFor('balafon', 'cover')).toEqual({
      aspect: 158 / 212, circle: false, radii: [4 / 158, 4 / 158, 4 / 158, 4 / 158],
    });
    expect(defaultFocusFor('masque', 'cover')).toEqual({ x: 62, y: 24 });
    expect(defaultFocusFor('harmattan', 'cover')).toEqual({ x: 55, y: 30 });
    expect(defaultFocusFor('balafon', 'cover')).toEqual({ x: 55, y: 22 });
    expect(defaultFocusFor('seance', 'cover')).toEqual({ x: 60, y: 30 });
    expect(defaultFocusFor('cauris', 'cover')).toEqual({ x: 52, y: 28 });
    // …and the SIX keep the cover frames they have always had
    expect(frameSpecFor('royale', 'cover')).toEqual({ aspect: 1, circle: true, radii: [0.5, 0.5, 0.5, 0.5] });
    expect(defaultFocusFor('dynamique', 'cover')).toEqual({ x: 58, y: 30 });
    // Avatar: the SAME contract silhouette (the frame does not change with
    // which photograph fills it), and the shared high portrait bias.
    for (const key of ['masque', 'harmattan', 'balafon', 'seance', 'cauris'] as const) {
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
