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
    // SP6.1 — THE GAINS SCREEN STILL LEADS WITH THE COMPOSED HERO, but on a
    // REAL figure now. This block used to pin `label={t('ce.gains_attente_label')}`
    // and `amount={enAttenteNet()}` — both from the DEMO model over DEMO_SALES,
    // beside a « Payé cette semaine » line on a platform that has never paid
    // anyone. The claim is rewritten, not dropped: the hero survives, the label
    // still comes from the catalog (never inline), and the amount is now the
    // « Locked » rung — the one net that is settled and unambiguously hers.
    const app = read('App.tsx');
    expect(app).toMatch(/<PendingHero/);
    expect(app).toMatch(/label=\{t\(p\.titreKey\)\} amount=\{p\.netFcfa\}/);
    // …and the retired fiction is GONE, asserted directly so it cannot return.
    expect(app).not.toMatch(/ce\.gains_paye_semaine/);
    expect(app).not.toMatch(/amount=\{enAttenteNet\(\)\}/);
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
    // PROFIL-REVENDEUR-1 (founder order 2026-08-25): a sixth — Profil, last.
    expect(app).toMatch(/HUBS: readonly Screen\[\] = \['accueil', 'opportunites', 'vitrine', 'cercle', 'gains', 'profil'\]/);
    expect(app).toMatch(/setStack\(hub === START \? \[START\] : \[START, hub\]\)/);
    for (const key of ['nav.tab_accueil', 'nav.tab_opportunites', 'nav.tab_vitrine', 'nav.tab_gains', 'nav.tab_profil']) {
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
    // ANCHORED ON THE RENDER FORM `{screen === 'x'`, NOT the bare comparison.
    // The bare one also occurs in dep arrays and tab chrome ABOVE the render
    // blocks, so `indexOf` found those instead and handed this pin an EMPTY
    // region — a money law checked against ''. Every slice is asserted
    // non-empty below, so an anchor that stops matching fails loudly rather
    // than passing over nothing.
    const at = (screen: string): number => {
      const i = app.indexOf(`{screen === '${screen}'`);
      expect(i, `no render block for '${screen}' — this pin's anchor has moved`).toBeGreaterThan(-1);
      return i;
    };
    const opp = app.slice(at('opportunites'), at('fiche'));
    const fiche = app.slice(at('fiche'), at('vitrine'));
    const vitrine = app.slice(at('vitrine'), at('lien'));
    for (const [name, region] of [['opp', opp], ['fiche', fiche], ['vitrine', vitrine]] as const) {
      expect(region.length, `${name} region is EMPTY — the pin is watching nothing`).toBeGreaterThan(200);
    }
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

  it('per-product markup: Ma Vitrine composes the MarkupControl that writes markups[pid] live', () => {
    const app = read('App.tsx');
    // WO-VITRINE-FLOW (founder redirect): the reseller sets her markup per product
    // on Ma Vitrine; the control writes markups[pid] and the net/client recompute live.
    // MARGE-EXACTE (2026-08-15) — it is the TYPABLE control now, the same one the
    // fiche uses; the slider it replaced is gone (« remove the slide … just let it
    // be typable »).
    expect(app).toMatch(/<MarkupControl/);
    expect(app).not.toMatch(/MarginSlider/);
    expect(app).toMatch(/value=\{markup\}/);
    expect(app).toMatch(/cap=\{v\.cap\}/);
    // PUBLISH-PRICE-1 — ONE KEYSPACE: the slider writes `markups[productVersionId]`,
    // NOT `markups[item.id]`. The demo-seed key was the defect — the Ma Vitrine
    // control and the fiche that signs the price never shared a key, so on a live
    // offer only `defaultMarkup(cap)` was ever reachable.
    expect(app).toMatch(/setMarkups\(\(prev\) => \(\{ \.\.\.prev, \[item\.productVersionId\]: m \}\)\)/);
    expect(app).not.toMatch(/setMarkups\(\(prev\) => \(\{ \.\.\.prev, \[item\.id\]: m \}\)\)/);
    // RESELLER-UX-2 (founder walk item 2): the DECIDED bit is retired with the
    // gate it fed — the default is now 0, so publish-on-arrival signs the
    // lowest cliente price and no untouched-slider guard is needed. The state
    // must be gone entirely, not lingering half-wired.
    expect(app).not.toMatch(/setMarkupTouched/);
    // the control's value comes from the SAME margin view the signed price is quoted from
    expect(app).toMatch(/const markup = v\.markup;/);
    // MARGE-EXACTE — the field routes through the SHARED `snapMarkup`, at step 1:
    // the clamp is still the one pricing bound, and nothing rounds her figure.
    expect(app).toMatch(/snapMarkup\(parsed, cap, 1\)/);
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

  it('CTA-ENTIÈRE — no accueil box makes its own text unwrappable (founder: « the end is cut »)', () => {
    const app = read('App.tsx');
    /**
     * THE MECHANISM, pinned where layout claims belong (a RENDU walk may never
     * assert layout). React Native defaults `flexShrink` to 0, so a Text in a
     * `flexDirection: 'row'` box takes its full single-line width and is
     * clipped by the box instead of wrapping. The accueil's primary CTA was
     * exactly that — a row, with NO horizontal padding — and his phone showed
     * « Trouver des produits à vendr ».
     */
    const cta = /sparkleCta: \{[^}]*\}/.exec(app)?.[0] ?? '';
    expect(cta, 'the sparkleCta style block must be found').not.toBe('');
    expect(cta, 'a row makes the label unwrappable').not.toMatch(/flexDirection: 'row'/);
    expect(cta, 'without horizontal padding the label touches the edge').toMatch(/paddingHorizontal: spacing\.lg/);
    expect(app).toMatch(/sparkleCtaText: \{[^}]*textAlign: 'center'/);

    // The zone rides a ROW (`homeSubRow`), where RN's default shrink of 0 would
    // paint a long quartier past the screen edge with no ellipsis — the very
    // row in the founder's screenshot (« MAMAN & MOI · Zone I, Ouagadougou »).
    expect(app).toMatch(/homeSubZone: \{[^}]*flexShrink: 1/);
    expect(app).toMatch(/style=\{styles\.homeSubZone\} numberOfLines=\{1\}/);

    /**
     * ONE sentence, said ONCE — and said where it can be READ WHOLE. The
     * header's slot is `numberOfLines={1}` (kit `AppHeader`), so the
     * 69-character promise could only ever be cut there; the hero is a plain
     * Text in a stretch column, which wraps. The first fix removed the wrong
     * one of the two — this pin keeps the truncating slot from coming back.
     */
    expect(app).toMatch(/<Text style=\{styles\.homeTagline\}>\{t\('accueil\.tagline'\)\}<\/Text>/);
    expect(app, 'the accueil must not feed the one-line header slot').not.toMatch(/subtitle=\{/);
    expect(read('src/ui/kit.tsx'), 'the uncalled subtitle slot is gone with it').not.toMatch(/headerSub/);
  });

  it('RECOMMENCER — the account guard refuses BEFORE any write (her feed is keyed by the account digits)', () => {
    /**
     * RESELLER-ACCOUNTS-1d makes the ACCOUNT's digits own the identity — her
     * sales feed and the founder's suivi ride them. A device-side re-mint with
     * a compte adopted would split her sales from her shop, so the handler
     * refuses with a sentence FIRST. Pinned at the source because no walk can
     * adopt a compte without the accounts flow; the guard's ORDER is the
     * assertion — it must precede the unpublish, the re-mint and the create.
     */
    const app = read('App.tsx');
    const handler = /const recommencer = useCallback\([\s\S]*?\n  \}, \[/.exec(app)?.[0] ?? '';
    expect(handler, 'the recommencer handler must be found').not.toBe('');
    const garde = handler.indexOf("t('k.recommencer.compte')");
    expect(garde, 'the compte guard is missing').toBeGreaterThan(-1);
    expect(garde).toBeLessThan(handler.indexOf('service.unpublish'));
    expect(garde).toBeLessThan(handler.indexOf('remintIdentity'));
    expect(garde).toBeLessThan(handler.indexOf('service.create'));
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
