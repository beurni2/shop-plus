import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { money, motion, shopPlusTheme, type } from '@platform/ui-tokens/legacy';

/**
 * WO-4.2R — the visual layer obeys the tokens. The scan test IS the DoD's
 * "zero hardcoded colors/sizes — a scan proves it": every color is a theme
 * token, every size/spacing/radius/type value is a token expression; the
 * gains hero counts up on the motion law's token ceiling; reduced motion is
 * honored; tabular numerals wherever francs render. Navigation pins stay in
 * journey-spine.test.ts (byte-untouched); this file adds only the chrome
 * pins the kit introduced.
 */

const appDir = join(import.meta.dirname, '..');
const FILES = ['App.tsx', 'src/ui/kit.tsx'];
const read = (f: string) => readFileSync(join(appDir, f), 'utf8');

describe('WO-4.2R visual layer (reseller-app)', () => {
  it('SCAN: zero hardcoded colors anywhere in the visual layer', () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, `${f} carries a hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, `${f} carries an rgb() color`).not.toMatch(/\brgba?\(/);
      expect(src, `${f} carries a named CSS color literal`).not.toMatch(/color:\s*'(?!#)[a-z]+'/);
    }
  });

  it('SCAN: zero hardcoded size/spacing/type values — every number is a token expression', () => {
    const SIZE_PROPS =
      /(?:fontSize|lineHeight|borderRadius|padding(?:Horizontal|Vertical|Top|Bottom|Left|Right)?|margin[A-Za-z]*|minHeight|minWidth|maxWidth|height|width|gap|letterSpacing|top|bottom|left|right):\s*(\d+(?:\.\d+)?)\b/g;
    for (const f of FILES) {
      const src = read(f);
      const offenders: string[] = [];
      for (const m of src.matchAll(SIZE_PROPS)) {
        if (Number(m[1]) !== 0) offenders.push(m[0]);
      }
      expect(offenders, `${f} hardcodes size values: ${offenders.join(' · ')}`).toEqual([]);
    }
  });

  it('the gains hero consumes money.amountScale.hero with tabular numerals, fed from the catalog', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/money\.amountScale\.hero\.size/);
    expect(kit).toMatch(/money\.amountScale\.hero\.wght/);
    expect(kit).toMatch(/fontVariant: \['tabular-nums'\]/);
    // the App leads the gains screen with the count-up hero: label + template
    // both from the catalog — copy never inline.
    const app = read('App.tsx');
    expect(app).toMatch(/<CountUpAmount/);
    expect(app).toMatch(/label=\{t\('gains\.total_label'\)\}/);
    expect(app).toMatch(/template=\{t\('money\.amount_f'\)\}/);
    expect(app).toMatch(/amount=\{totals\.netFcfa\}/);
    // francs render tabular in the App too (money lines + stats)
    expect(app).toMatch(/fontVariant: \['tabular-nums'\]/);
    // the hero size is a real hero (doctrine: the amount is the screen's hero)
    expect(money.amountScale.hero.size).toBeGreaterThan(type.scale.display.size);
  });

  it('count-up law: token-timed (money.countUpMs, never a literal), instant under reduced motion', () => {
    const kit = read('src/ui/kit.tsx');
    const block = kit.slice(kit.indexOf('export function CountUpAmount'), kit.indexOf('/* Status chip'));
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/duration: money\.countUpMs/); // the TOKEN times the animation
    expect(block).not.toMatch(/duration:\s*\d/); // never a literal clock
    expect(block).toMatch(/if \(reduced\) \{\s*setShown\(amount\);/); // instant landing
    expect(kit).toMatch(/AccessibilityInfo\.isReduceMotionEnabled/);
    expect(kit).toMatch(/reduceMotionChanged/);
    // token-level law: « compte-montant ≤ 600 ms », one clock, a ref into motion
    expect(money.countUpMs).toBeLessThanOrEqual(600);
    expect(money.countUpMs).toBe(motion.countUpMs);
  });

  it('the screen change eases in on the ONE soft spring — TOKEN-DERIVED curve, static under reduced motion', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/export function ScreenTransition/);
    // the easing curve is derived from the token, never invented (RN parses the
    // v0.8.0 cubic-bezier string into Easing.bezier — derive-never-invent)
    expect(kit).toMatch(/motion\.springSoft/);
    expect(kit).toMatch(/Easing\.bezier/);
    const transition = kit.slice(kit.indexOf('export function ScreenTransition'), kit.indexOf('const styles'));
    expect(transition).toMatch(/springSoftEasing/); // the token-derived curve
    expect(transition).toMatch(/duration: motion\.standardMs/); // the token times it
    expect(transition).toMatch(/useNativeDriver: true/);
    expect(transition).toMatch(/if \(reduced\) \{/);
    const app = read('App.tsx');
    expect(app).toMatch(/<ScreenTransition screenKey=\{screen\}>/);
  });

  it('the skeleton pulses on the token clock and is static under reduced motion — no bare spinner anywhere', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/skeletonToken\.pulseMs/); // the Grand Teint skeleton clock
    expect(kit).toMatch(/interaction\.skeletonPulseFloor/); // pulse floor from the token
    expect(kit).toMatch(/if \(reduced\) return;/);
    for (const f of FILES) expect(read(f)).not.toMatch(/ActivityIndicator/);
  });

  it('navigation chrome: header everywhere, hubs = Accueil·Opportunités·Gains, tabs are waypoint RESETS (never edges, never go())', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/<AppHeader/);
    expect(app).toMatch(/HUBS: readonly Screen\[\] = \['accueil', 'opportunites', 'gains'\]/);
    expect(app).toMatch(/setStack\(hub === START \? \[START\] : \[START, hub\]\)/);
    for (const key of ['nav.tab_accueil', 'nav.tab_opportunites', 'nav.tab_gains']) {
      expect(app).toContain(`t('${key}')`);
    }
    // go() is byte-identical to WO-4.1 (the spine test pins it too)
    expect(app).toMatch(/JOURNEY\[stack\[stack\.length - 1\] \?\? START\]\.includes\(next\)/);
    // the tab bar never renders off-hub (single source: HUBS gate)
    expect(app).toMatch(/\{HUBS\.includes\(screen\) && \(\s*<TabBar/);
    // tabs reset waypoints, they NEVER walk edges: no go() inside the TabBar block.
    // The items now carry canon SVG glyph nodes (each a self-closing <Icon… />),
    // so bound the block at the items array's own close `]}` — not the first `/>`.
    const tabStart = app.indexOf('<TabBar');
    const tabBlock = app.slice(tabStart, app.indexOf(']}', tabStart));
    expect(tabBlock.length).toBeGreaterThan(0);
    expect(tabBlock).not.toContain('go(');
    expect(tabBlock).toContain('toHub(');
  });

  it('net-first on the reseller rows (SP-I04/SP-I12): the net line renders before the customer price', () => {
    const app = read('App.tsx');
    const opportunites = app.slice(app.indexOf("screen === 'opportunites'"), app.indexOf("screen === 'selection'"));
    const netAt = opportunites.indexOf("t('opportunity.net_label')");
    const priceAt = opportunites.indexOf("t('opportunity.customer_price_label')");
    expect(netAt).toBeGreaterThanOrEqual(0);
    expect(priceAt).toBeGreaterThan(netAt);
    const selection = app.slice(app.indexOf("screen === 'selection'"), app.indexOf("screen === 'vitrine'"));
    expect(selection).toContain("t('opportunity.net_label')");
    // the kit's row renders net before detail in source order
    const kit = read('src/ui/kit.tsx');
    const row = kit.slice(kit.indexOf('export function ListRow'), kit.indexOf('/* Button hierarchy'));
    expect(row.indexOf('styles.rowNet')).toBeGreaterThanOrEqual(0);
    expect(row.indexOf('styles.rowDetail')).toBeGreaterThan(row.indexOf('styles.rowNet'));
  });

  it('the sélection chosen state draws the theme-primary border via the kit selected prop', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).toMatch(/selected\?: boolean \| undefined/);
    expect(kit).toMatch(/selected === true && styles\.rowSelected/);
    expect(kit).toMatch(/rowSelected: \{\s*borderColor: theme\.colours\.primary/);
    const app = read('App.tsx');
    expect(app).toMatch(/selected=\{isSelected\(world, item\.id\)\}/);
  });

  it('honest states stay designed: the vitrine empty state is the kit EmptyState on the catalog string, with a CANON glyph (never an emoji)', () => {
    const app = read('App.tsx');
    // the empty-state glyph is a Grand Teint SVG icon sized on the token, not an emoji raster
    expect(app).toMatch(/<EmptyState\s+glyph=\{<IconVitrine size=\{dimension\.iconSizePx\.emptyState\}/);
    expect(app).toMatch(/title=\{t\('vitrine\.vide'\)\}/);
  });

  it('the bottom nav wires the CANON glyphs at the canon tab size — no emoji in chrome', () => {
    const app = read('App.tsx');
    // each hub tab renders its canon SVG glyph at dimension.iconSizePx.tab (20)
    expect(app).toMatch(/<IconAccueil size=\{dimension\.iconSizePx\.tab\}/);
    expect(app).toMatch(/<IconProduits size=\{dimension\.iconSizePx\.tab\}/);
    expect(app).toMatch(/<IconGains size=\{dimension\.iconSizePx\.tab\}/);
    // the retired emoji are gone from the tab bar
    expect(app).not.toMatch(/icon: '[^a-zA-Z]/);
  });

  it('the kit imports stay inside the RN + tokens world (banned-import law extended to the kit)', () => {
    const BANNED = /@platform\/contracts|@platform\/i18n|@shop-plus\/commerce-core|^node:/;
    const kit = read('src/ui/kit.tsx');
    const specs = [...kit.matchAll(/^import [^;]*from '([^']+)';/gm)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) expect(spec, `kit imports ${spec}`).not.toMatch(BANNED);
  });

  it('the kit stages NO celebration — shop has no honest trigger in the demo world', () => {
    const kit = read('src/ui/kit.tsx');
    expect(kit).not.toMatch(/produit_pret|premiere_vente|course_validee/);
    expect(kit).not.toMatch(/Celebration/);
    expect(read('App.tsx')).not.toMatch(/Celebration/);
  });
});
