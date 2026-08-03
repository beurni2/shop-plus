import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JOURNEY, type Screen } from '../src/journey.js';
import { apercuBox, frameSpecFor, APERCU_BOX_H, APERCU_MAX_W } from '../src/vitrine/customize/framing-math.js';
import { PICKABLE_HEADER_STYLES } from '../src/vitrine/customize/storefront.js';

const read = (...rel: string[]): string => readFileSync(join(import.meta.dirname, '..', ...rel), 'utf8');
const app = read('App.tsx');
const screens = read('src', 'vitrine', 'customize', 'screens.tsx');
const journey = read('src', 'journey.ts');
const catalog = JSON.parse(read('i18n', 'catalog.json')) as { entries?: unknown } | unknown[];
const entries = (Array.isArray(catalog) ? catalog : (catalog.entries as unknown[])) as ReadonlyArray<{
  key: string; fr: string; register?: string; screenClass?: string;
}>;

/**
 * MA VITRINE, three founder orders in one message (2026-08-03):
 *   « remove the aperçu cliente screen and its button »
 *   « make the personnaliser button more understandable and professional
 *     instead of just Aa »
 *   « on theme I want to see the en-tête preview attached to its name so I can
 *     see it before tapping to choose like the habillages »
 */

describe('1 · the aperçu-cliente replica is GONE', () => {
  it('the screen, its route and its button leave together — no orphan of any kind', () => {
    // A half-removal is the failure mode here: a dead route in the map, or a
    // button whose target no longer renders. Each half is asserted separately.
    expect(journey).not.toMatch(/^\s*\|\s*'pubvitrine'/m); // the Screen union
    expect(Object.keys(JOURNEY)).not.toContain('pubvitrine');
    expect(app).not.toContain("screen === 'pubvitrine'"); // the render block
    expect(app).not.toContain("go('pubvitrine')"); // the button
    // …and nothing anywhere still points at it
    for (const [from, targets] of Object.entries(JOURNEY) as [Screen, readonly Screen[]][]) {
      expect(targets as readonly string[], `${from} still routes to pubvitrine`).not.toContain('pubvitrine');
    }
  });

  it('THE REAL CLIENTE VIEW SURVIVES — the replica went, the genuine article did not', () => {
    // This is what makes the removal safe rather than a loss: Personnaliser
    // still opens the LIVE page (and the K7 replica only before a shop exists),
    // which is the view that cannot drift from what a client sees.
    expect(screens).toContain("t('k.voir_cliente')");
    expect(screens).toMatch(/liveSlug !== undefined && onOpenBoutique !== undefined \? onOpenBoutique\(liveSlug\) : go\('k7'\)/);
  });
});

describe('2 · the Personnaliser button says what it does', () => {
  it('« Aa » is gone from the vitrine header', () => {
    // Two letters that mean "typography" to a designer and nothing to Aïcha.
    const head = app.slice(app.indexOf('vitrineHeadRow'), app.indexOf('noteLine'));
    expect(head).not.toMatch(/>Aa</);
  });

  it('it is an ICON PAIRED WITH ITS WORD, and the word comes from the catalog', () => {
    expect(app).toContain("<Text style={styles.vitrinePersoLabel}");
    expect(app).toContain("{t('vitrine.personnaliser')}");
    // Scoped to the button itself rather than a character window: the JSX
    // carries a comment block, so a fixed-distance regex measures prose length
    // instead of structure — and would 'fail' on a correct button.
    const btn = app.slice(app.indexOf('styles.vitrinePersoBtn'), app.indexOf('</Pressable>', app.indexOf('styles.vitrinePersoBtn')));
    expect(btn).toContain('<IconVitrine'); // icon and word inside ONE button
    expect(btn).toContain("t('vitrine.personnaliser')");
    // the screen-reader name is unchanged — one door, one name
    expect(app).toMatch(/accessibilityLabel=\{t\('k\.entree'\)\}/);
  });

  it('the new string is a REAL catalog entry with its register and class', () => {
    const e = entries.find((x) => x.key === 'vitrine.personnaliser');
    expect(e, 'vitrine.personnaliser missing from the catalog').toBeDefined();
    expect(e!.fr).toBe('Personnaliser');
    expect(e!.register).toBe('selling');
    expect(e!.screenClass).toBe('label');
  });

  it('the button can SHRINK — French is long and the toggle must not fall off', () => {
    // A fixed-width pill with a French word in it pushes the public/private
    // switch off a narrow phone. Both the pill and its label give way first.
    const style = app.slice(app.indexOf('vitrinePersoBtn: {'), app.indexOf('vitrineIconBtn: {'));
    expect(style).toContain('flexShrink: 1');
    expect(style).toContain('minHeight'); // …but never below the touch law
  });
});

describe('3 · every en-tête shows its silhouette before the tap', () => {
  it('the card renders the preview, from the FRAMING source of truth', () => {
    // Not a drawing invented for the picker: `frameSpecFor` is what the framing
    // sheet crops her real photo with, so preview and crop cannot disagree.
    expect(screens).toContain("<EnteteApercu spec={frameSpecFor(key, 'cover')}");
    expect(screens).toContain("from './framing-math'");
    // and it is ABOVE the name, like the habillage cards' colours
    const card = screens.slice(screens.indexOf('PICKABLE_HEADER_STYLES.map'), screens.indexOf('k.entete.en_cours'));
    expect(card.indexOf('<EnteteApercu')).toBeLessThan(card.indexOf('S.themeNameRow'));
  });

  it('EVERY pickable style resolves to a real silhouette that FITS the card', () => {
    // The clamp is the point: Héritage's 360/238 strip would otherwise run past
    // a 47%-wide card. Asserted for every style, not a sampled one.
    for (const key of PICKABLE_HEADER_STYLES) {
      const box = apercuBox(frameSpecFor(key, 'cover'));
      expect(box.width, `${key} width`).toBeGreaterThan(0);
      expect(box.height, `${key} height`).toBeGreaterThan(0);
      expect(box.width, `${key} overflows the card`).toBeLessThanOrEqual(APERCU_MAX_W);
      expect(box.height, `${key} overflows the band`).toBeLessThanOrEqual(APERCU_BOX_H);
      // the shape is PRESERVED — a preview that squashed the aspect would show
      // her a frame she will never get
      const spec = frameSpecFor(key, 'cover');
      expect(box.width / box.height).toBeCloseTo(spec.aspect, 6);
    }
  });

  it('the fit math: height leads, width clamps, aspect always survives', () => {
    const sq = apercuBox({ aspect: 1, circle: true, radii: [0.5, 0.5, 0.5, 0.5] });
    expect(sq).toEqual({ width: APERCU_BOX_H, height: APERCU_BOX_H });
    // a very wide strip is clamped by WIDTH and gets shorter, never squashed
    const wide = apercuBox({ aspect: 6, circle: false, radii: [0, 0, 0, 0] });
    expect(wide.width).toBe(APERCU_MAX_W);
    expect(wide.height).toBeCloseTo(APERCU_MAX_W / 6, 6);
    // a tall portrait is bounded by the band height
    const tall = apercuBox({ aspect: 0.25, circle: false, radii: [0, 0, 0, 0] });
    expect(tall.height).toBe(APERCU_BOX_H);
    expect(tall.width).toBeCloseTo(APERCU_BOX_H * 0.25, 6);
  });

  it('the preview shows a SHAPE, never a borrowed photograph', () => {
    // Drawing someone else's picture under « voici votre en-tête » would be
    // exactly the pretend this app refuses. The band is theme tones only.
    const from = screens.indexOf('function EnteteApercu');
    const comp = screens.slice(from, screens.indexOf('\nfunction ', from + 1));
    // CONTROL — an empty slice would make both negatives below pass while
    // protecting nothing. This is the assertion that caught exactly that.
    expect(comp.length).toBeGreaterThan(200);
    expect(comp).not.toContain('<Image');
    expect(comp).not.toContain('uri:');
    expect(comp).toContain('backgroundColor: deep');
  });
});
