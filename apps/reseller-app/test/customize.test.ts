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
import { describe, expect, it } from 'vitest';
import {
  COVER_UPLOAD_MS,
  COVER_VERIFY_MS,
  DEFAULT_STOREFRONT,
  FEATURED_CAP,
  SECTIONS_CAP,
  THEMES,
  createSection,
  deleteSection,
  moveItem,
  saveIdentity,
  toggleSectionPid,
  togglePin,
} from '../src/vitrine/customize/storefront';
import { K_SEED } from '../src/vitrine/customize/storefront';
import { K_RAW_STYLES as S } from '../src/vitrine/customize/k-styles';

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

  it('§4.4 timers are the decreed values: upload 1 400 ms, verification 2 600 ms', () => {
    expect(COVER_UPLOAD_MS).toBe(1_400);
    expect(COVER_VERIFY_MS).toBe(2_600);
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

  it('the K seed is the §3.2 catalog (8 articles, diaspora excluded, p3 the only épuisé)', () => {
    expect(K_SEED).toHaveLength(8);
    expect(K_SEED.some((p) => p.pid.startsWith('d'))).toBe(false);
    expect(K_SEED.filter((p) => !p.inStock).map((p) => p.pid)).toEqual(['p3']);
    expect(K_SEED.find((p) => p.pid === 'p1')!.priceFcfa).toBe(11_500);
  });
});
