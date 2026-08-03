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

  it('it is an ICON PAIRED WITH ITS FULL SENTENCE, from the catalog', () => {
    // PIN EVOLVED (founder order 2026-08-03: « put 'personnaliser ma boutique'
    // instead of just personnaliser »). The short key I had added is DELETED
    // rather than left dead in the catalog — `k.entree` already carried his
    // sentence and was already the screen-reader name for this door.
    // SCOPED TO THE VISIBLE TEXT, not the file. A bare `toContain("t('k.entree')")`
    // passes on the accessibilityLabel alone — mutation proved it: swapping the
    // VISIBLE label back to the one-word key left this test green. The visible
    // sentence and the spoken one must be asserted at their own sites.
    expect(app).toContain("<Text style={styles.vitrinePersoLabel}>{t('k.entree')}</Text>");
    // Scoped to the button itself rather than a character window: the JSX
    // carries a comment block, so a fixed-distance regex measures prose length
    // instead of structure — and would 'fail' on a correct button.
    const btn = app.slice(app.indexOf('styles.vitrinePersoBtn'), app.indexOf('</Pressable>', app.indexOf('styles.vitrinePersoBtn')));
    expect(btn).toContain('<IconVitrine'); // icon and sentence inside ONE button
    expect(btn).toContain("t('k.entree')");
    // the screen-reader name is unchanged — one door, one name
    expect(app).toMatch(/accessibilityLabel=\{t\('k\.entree'\)\}/);
  });

  it('the sentence is the CATALOG one, and the short key I added is gone', () => {
    const e = entries.find((x) => x.key === 'k.entree');
    expect(e, 'k.entree missing from the catalog').toBeDefined();
    expect(e!.fr).toBe('Personnaliser ma boutique');
    // the one-word key existed for about an hour; a dead catalog entry is a
    // string a translator would eventually be asked to translate for nothing
    expect(entries.some((x) => x.key === 'vitrine.personnaliser')).toBe(false);
  });

  it('it has its OWN ROW — the full sentence must not ellipsise beside the toggle', () => {
    // PIN EVOLVED with the label: « Personnaliser ma boutique » does not fit
    // beside the public/private switch on a narrow phone, and a truncated label
    // is the same 5-second failure « Aa » was, only longer. So the button left
    // the header row entirely.
    const head = app.slice(app.indexOf('vitrineHeadRow'), app.indexOf('</View>', app.indexOf('vitrineToggle')));
    expect(head).not.toContain('vitrinePersoBtn'); // no longer crammed in the row
    const style = app.slice(app.indexOf('vitrinePersoBtn: {'), app.indexOf('vitrinePersoLabel: {'));
    expect(style).toContain("justifyContent: 'center'");
    expect(style).toContain('minHeight'); // the touch law still holds
    expect(style).not.toContain('flexShrink'); // nothing to shrink against now
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

describe('4 · Couverture & portrait stops cropping his photograph', () => {
  it('the filled slot takes THE PHOTO’S proportions, not a fixed band', () => {
    // The defect, from his screenshot: `coverSlot` is a fixed 120px band and the
    // image was `resizeMode="cover"`, so a portrait photograph was beheaded on
    // the one screen whose whole job is showing him his photograph.
    expect(screens).toContain('coverRatio !== null ? { height: undefined, aspectRatio: coverRatio } : null');
    expect(screens).toMatch(/resizeMode="contain"/); // he is checking the picture, not previewing a crop
  });

  it('the bound is the SAME rule the product cards use — one answer in this app', () => {
    // `cadreRatio` already decides how far a frame may follow a photo. A second
    // clamp here would be a second answer to one question.
    expect(screens).toContain("import { cadreRatio } from '../../ui/cadre'");
    expect(screens).toContain('cadreRatio(src.width, src.height)');
  });

  it('UNMEASURED ⇒ the old band, so empty/uploading/error keep their box', () => {
    // Those three states have no photograph to measure. The 120px must survive
    // for them or the screen collapses exactly where it has least to show.
    const kstyles = read('src', 'vitrine', 'customize', 'k-styles.ts');
    expect(kstyles).toMatch(/coverSlot: \{ height: 120,/);
    expect(screens).toContain('useState<number | null>(null)');
  });

  it('the measurement is written ONCE — no re-render loop on a repeated onLoad', () => {
    expect(screens).toContain('setCoverRatio((prev) => (prev === r ? prev : r))');
  });
});
