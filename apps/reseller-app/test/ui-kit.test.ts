import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { money, motion as legacyMotion } from '@platform/ui-tokens/legacy';
import { type as t2, shopColour } from '@platform/ui-tokens';

/**
 * WO-4.2R / WO-FP-SHOP — the visual layer obeys the tokens. The scan test IS the
 * DoD's "zero hardcoded colors/sizes — a scan proves it": every color is a token,
 * every size/spacing/radius/type value is a token expression; the gains hero is
 * the screen's largest figure, tabular, catalog-fed; reduced motion is honored;
 * tabular numerals wherever francs render. WO-FP-SHOP repoints the reskinned
 * groups (colour → sharedColour+shopColour, type → the Faso Premium scale, motion
 * → the seven fp* curves) to v2 WITHOUT loosening one invariant; money.countUpMs
 * and the /legacy geometry groups stay as they were. Navigation pins stay in
 * journey-spine.test.ts (byte-untouched).
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

  it('the gains hero consumes the Faso Premium heroMoney with tabular numerals, fed from the catalog', () => {
    const kit = read('src/ui/kit.tsx');
    // v2: the money hero is the display face at the heroMoney size + weight
    expect(kit).toMatch(/fontSize: rmax\(t2\.scale\.heroMoney\.size\)/);
    expect(kit).toMatch(/fontWeight: w\(t2\.scale\.heroMoney\.wght\)/);
    expect(kit).toMatch(/fontFamily: DISPLAY_FAMILY/);
    expect(kit).toMatch(/fontVariant: \['tabular-nums'\]/);
    // D4 (Cercle) — the gains screen leads with the composed pending hero
    // (montant 38 + FCFA 17, §7 count-up), label from the catalog, amount from
    // the sales world (En attente = Σ net − camp). Copy never inline.
    const app = read('App.tsx');
    expect(app).toMatch(/<PendingHero/);
    expect(app).toMatch(/label=\{t\('ce\.gains_attente_label'\)\}/);
    expect(app).toMatch(/amount=\{enAttenteNet\(\)\}/);
    expect(app).toMatch(/ce\.gains_paye_semaine/);
    // francs render tabular in the App too (money lines + stats)
    expect(app).toMatch(/fontVariant: \['tabular-nums'\]/);
    // the hero size is a real hero (doctrine: the amount is the screen's hero) —
    // heroMoney (max 38) tops every other type-scale size on the surface.
    const heroMax = t2.scale.heroMoney.size.max;
    const scaleMaxes = [t2.scale.screen.size, t2.scale.view.size.max, t2.scale.cardMoney.size, t2.scale.row.size];
    expect(heroMax).toBeGreaterThan(Math.max(...scaleMaxes));
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
    // (the count-up stays on the /legacy money clock this wave — money group deferred)
    expect(money.countUpMs).toBeLessThanOrEqual(600);
    expect(money.countUpMs).toBe(legacyMotion.countUpMs);
  });

  it('the screen change eases in on the fp UP curve — TOKEN-DERIVED, static under reduced motion', () => {
    const kit = read('src/ui/kit.tsx');
    const motion = read('src/ui/motion.ts');
    expect(kit).toMatch(/export function ScreenTransition/);
    // the seven fp* motions come from the v2 token; the curve is PARSED from the
    // token's own timingFunction into Easing.bezier — never invented.
    expect(motion).toMatch(/from '@platform\/ui-tokens'/);
    expect(motion).toMatch(/Easing\.bezier/);
    expect(motion).toMatch(/fpIn:.*fpUp:.*fpPop:.*fpPulse:.*fpBar:.*fpShimmer:.*fpShake:/s);
    const transition = kit.slice(kit.indexOf('export function ScreenTransition'), kit.indexOf('const styles'));
    expect(transition).toMatch(/fp\.fpUp\.easing/); // the token-derived curve
    expect(transition).toMatch(/duration: fp\.fpUp\.durationMs/); // the token times it
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

  it('navigation chrome: header everywhere, hubs = Accueil·Opportunités·Ma Vitrine·Gains, tabs are waypoint RESETS (never edges, never go())', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/<AppHeader/);
    // CERCLE (SP9, founder-override scoped to UI + certified mock, journaled
    // 2026-07-19): the dock grows to 5 tabs — Cercle between Ma Vitrine and Gains.
    expect(app).toMatch(/HUBS: readonly Screen\[\] = \['accueil', 'opportunites', 'vitrine', 'cercle', 'gains'\]/);
    expect(app).toMatch(/setStack\(hub === START \? \[START\] : \[START, hub\]\)/);
    for (const key of ['nav.tab_accueil', 'nav.tab_opportunites', 'nav.tab_vitrine', 'nav.tab_gains']) {
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

  it('net-first (SP-I04/SP-I12): the reseller PRODUCT surfaces show NET, never gross', () => {
    const app = read('App.tsx');
    // The three product slices (opp row · fiche · vitrine tile). Each shows the
    // reseller's NET and never a gross figure — gross-first is prohibited. (The
    // gains breakdown legitimately shows gross BESIDE net, net strongest — its
    // net-first is pinned in demo-store.test, not here.)
    const opp = app.slice(app.indexOf("screen === 'opportunites'"), app.indexOf("screen === 'fiche'"));
    const fiche = app.slice(app.indexOf("screen === 'fiche'"), app.indexOf("screen === 'vitrine'"));
    const vitrine = app.slice(app.indexOf("screen === 'vitrine'"), app.indexOf("screen === 'lien'"));
    expect(opp, 'opp row net line').toContain("'opportunity.gagnez'");
    expect(fiche, 'fiche net line').toContain("'opportunity.gagnez'");
    // MA VITRINE leads with the net hero (« Votre gain net » + formatFcfa(v.net));
    // the cliente price is the secondary line beneath it.
    expect(vitrine, 'vitrine net hero label').toContain("'opportunity.net_label'");
    expect(vitrine, 'vitrine net hero figure').toContain('styles.vitrineNetHero');
    expect(vitrine).toContain('formatFcfa(v.net)');
    // gross is computed in the margin module but NEVER rendered on these surfaces.
    for (const [name, slice] of [['opp', opp], ['fiche', fiche], ['vitrine', vitrine]] as const) {
      expect(slice, `${name} must not render gross`).not.toMatch(/\.gross\b|grossFcfa|resellerGrossEarnings/);
    }
    // the kit's row still renders net before detail in source order (unchanged)
    const kit = read('src/ui/kit.tsx');
    const row = kit.slice(kit.indexOf('export function ListRow'), kit.indexOf('/* Button hierarchy'));
    expect(row.indexOf('styles.rowNet')).toBeGreaterThanOrEqual(0);
    expect(row.indexOf('styles.rowDetail')).toBeGreaterThan(row.indexOf('styles.rowNet'));
  });

  it('per-product markup: Ma Vitrine composes the MarginSlider that writes markups[pid] live', () => {
    const app = read('App.tsx');
    // WO-VITRINE-FLOW (founder redirect): the reseller sets her markup per product
    // on Ma Vitrine; the slider writes markups[pid] and the net/client recompute live.
    expect(app).toMatch(/<MarginSlider/);
    expect(app).toMatch(/value=\{markup\}/);
    expect(app).toMatch(/cap=\{v\.cap\}/);
    expect(app).toMatch(/onChange=\{\(m\) => setMarkups\(\(prev\) => \(\{ \.\.\.prev, \[item\.id\]: m \}\)\)\}/);
    // the slider value is her markup or the capped default (min(1500, cap))
    expect(app).toMatch(/markups\[item\.id\] \?\? defaultMarkup\(v\.cap\)/);
    // the slider routes the value through the PURE snapMarkup (step + clamp)
    const slider = read('src/ui/margin-slider.tsx');
    expect(slider).toMatch(/snapMarkup\(raw, capRef\.current\)/);
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
