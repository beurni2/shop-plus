import {
  shopPlusTheme as theme,
  type,
  money,
  spacing,
  radius,
  touch,
  motion,
  interaction,
  band,
  ribbon as ribbonTokens,
  skeleton,
  landmark,
} from '@platform/ui-tokens/legacy';
import { t } from './i18n';
import { vitrineSlugFromPath, signedProductSlugFromPath, recordVitrineArrival, vitrineHref } from './vitrine-link';
import { demoStorefrontPort } from './vitrine/profile';
import { mountVitrine, type VitrineEtat } from './vitrine/flows';
import { ENT_STYLES } from './vitrine/entries';
import { createCliente, type ClienteEcran } from './cliente/flow';
import { clienteProduit, clienteProduitReel, composeQuote } from './cliente/seed';
import { seedProduct } from './vitrine/catalog';
import { CLIENTE_STYLES } from './cliente/styles';
import type { VitrineThemeKey } from './vitrine/themes';
// The Faso Premium face substrate (six @font-face, WO-FP STEP 0) — injected as
// raw CSS so './fonts/…' stays document-relative (the Archivo pattern; correct
// under base './' at / and /shop-plus/).
import fontsCss from './fonts.css?raw';
import { renderBoutiques, type BoutiqueState } from './boutiques-view';

/**
 * The buyer PWA shell (WO-5.3 chrome). The legacy Grand Teint demo params
 * (journey/skeleton/order/checkout) are RETIRED and un-generatable — the
 * vitrine.test source scan locks the retired route out of src/ forever.
 * Every colour, dimension, radius
 * and duration is a Grand Teint token resolved to a CSS custom property; the
 * style sheet carries NO hardcoded colour and no dimension outside the token
 * vars (the ui-scan test proves it — the only literal dimension is a 1px
 * hairline, and exactly one cubic-bezier approximates motion.springSoft, whose
 * duration IS the token var).
 *
 * Font: Archivo variable, font-display:optional so first paint never waits —
 * system-ui renders immediately and the real face swaps in only inside the
 * optional window (CLS=0 by construction: optional never swaps mid-page). The
 * woff2 is WO-5.1's substrate at public/fonts/archivo-latin-var.woff2 (served
 * document-relative as ./fonts/…, correct under base:'./' at / and /shop-plus/);
 * the font-load e2e proves it responds 200 and the Archivo face actually loads
 * (document.fonts resolves) — a wrong path fails LOUD there, never silently.
 */

const root = document.documentElement;
const px = (n: number): string => `${n}px`;
const ms = (n: number): string => `${n}ms`;

// Colours — one loop over the merged shared+shop palette (`.colours`, British).
for (const [name, value] of Object.entries(theme.colours)) {
  root.style.setProperty(`--c-${name}`, value);
}
// The sandbox ribbon stripes + skeleton fill (their own token groups).
root.style.setProperty('--ribbon-a', ribbonTokens.sandbox.stripeA);
root.style.setProperty('--ribbon-b', ribbonTokens.sandbox.stripeB);
root.style.setProperty('--ribbon-text', ribbonTokens.sandbox.text);
root.style.setProperty('--ribbon-h', px(ribbonTokens.sandbox.heightPx));
root.style.setProperty('--ribbon-stripe', px(ribbonTokens.sandbox.stripePx));
root.style.setProperty('--skeleton-bg', skeleton.bg);

// Spacing scale 4/8/12/16/24/34.
root.style.setProperty('--sp-xs', px(spacing.xs));
root.style.setProperty('--sp-sm', px(spacing.sm));
root.style.setProperty('--sp-md', px(spacing.md));
root.style.setProperty('--sp-lg', px(spacing.lg));
root.style.setProperty('--sp-xl', px(spacing.xl));
root.style.setProperty('--sp-xxl', px(spacing.xxl));

// Radius — buttons/chips/pill; boxes and cards are radius 0 (used inline).
root.style.setProperty('--r-button', px(radius.button));
root.style.setProperty('--r-chip', px(radius.chip));
root.style.setProperty('--r-pill', px(radius.pill));

// Type scale sizes + the letterspacing of the caps labels.
root.style.setProperty('--t-labelXS', px(type.scale.labelXS.size));
root.style.setProperty('--t-label', px(type.scale.label.size));
root.style.setProperty('--t-labelLG', px(type.scale.labelLG.size));
root.style.setProperty('--t-caption', px(type.scale.caption.size));
root.style.setProperty('--t-body', px(type.scale.body.size));
root.style.setProperty('--t-row', px(type.scale.row.size));
root.style.setProperty('--t-title', px(type.scale.title.size));
root.style.setProperty('--t-titleLG', px(type.scale.titleLG.size));
root.style.setProperty('--t-display', px(type.scale.display.size));
root.style.setProperty('--ls-labelXS', px(type.scale.labelXS.ls));
root.style.setProperty('--ls-label', px(type.scale.label.ls));
root.style.setProperty('--ls-labelLG', px(type.scale.labelLG.ls));

// Money — l'argent en majesté.
root.style.setProperty('--m-hero', px(money.amountScale.hero.size));
root.style.setProperty('--m-page', px(money.amountScale.page.size));
root.style.setProperty('--m-section', px(money.amountScale.section.size));
root.style.setProperty('--m-row', px(money.amountScale.row.size));
root.style.setProperty('--m-reconcile', px(money.reconcileLine.size));
root.style.setProperty('--ls-reconcile', px(money.reconcileLine.ls));

// Landmark — le repère, pas l'adresse.
root.style.setProperty('--lm-repere', px(landmark.repere.size));
root.style.setProperty('--lm-zone', px(landmark.zone.size));
root.style.setProperty('--ls-zone', px(landmark.zone.ls));
root.style.setProperty('--lm-border', px(landmark.cardBorderPx));

// Interaction — structural selection + press/skeleton feedback.
root.style.setProperty('--hair-mid', px(interaction.hairline.medium));
root.style.setProperty('--hair-strong', px(interaction.hairline.strong));
root.style.setProperty('--accent-edge', px(interaction.accentEdgePx));
root.style.setProperty('--sel-border', px(interaction.selectedBorderPx));
root.style.setProperty('--tick-size', px(interaction.cornerTick.sizePx));
root.style.setProperty('--tick-stroke', px(interaction.cornerTick.strokePx));
root.style.setProperty('--tick-inset', px(interaction.cornerTick.insetPx));
root.style.setProperty('--sel-mark', px(interaction.selectedMark.sizePx));
root.style.setProperty('--press-scale', `${interaction.pressScale}`);
root.style.setProperty('--pressed-opacity', `${interaction.pressedOpacity}`);
root.style.setProperty('--disabled-opacity', `${interaction.disabledOpacity}`);
root.style.setProperty('--skeleton-floor', `${interaction.skeletonPulseFloor}`);

// Band · touch · motion.
root.style.setProperty('--theme-strip', px(band.themeStripPx));
root.style.setProperty('--touch', px(touch.minTargetPx));
root.style.setProperty('--touch-gap', px(touch.minGapPx));
root.style.setProperty('--motion-standard', ms(motion.standardMs));
root.style.setProperty('--motion-quick', ms(motion.quickMs));
root.style.setProperty('--motion-instant', ms(motion.instantMs));
root.style.setProperty('--skeleton-pulse', ms(skeleton.pulseMs));

// Icon display sizes drawn from the spacing scale (no fresh literals).
root.style.setProperty('--icon', px(spacing.xl));
root.style.setProperty('--icon-sm', px(spacing.lg));

const fontsStyle = document.createElement('style');
fontsStyle.setAttribute('data-faso-fonts', '');
fontsStyle.textContent = fontsCss;
document.head.appendChild(fontsStyle);

const entStyle = document.createElement('style');
entStyle.setAttribute('data-vitrine-entries', '');
entStyle.textContent = ENT_STYLES;
document.head.appendChild(entStyle);

const style = document.createElement('style');
style.textContent = `
  @font-face {
    font-family: 'Archivo';
    font-display: optional;
    src: url('./fonts/archivo-latin-var.woff2') format('woff2');
    font-weight: 400 900;
    font-stretch: 75% 125%;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--c-paper);
    color: var(--c-ink);
    font-family: 'Archivo', system-ui, sans-serif;
    font-size: var(--t-body);
    line-height: ${type.scale.body.lh};
    -webkit-font-smoothing: antialiased;
  }
  /* AppHeader — quiet ink wordmark + the 4 px theme strip (the brand mark). */
  header {
    padding: var(--sp-md) var(--sp-lg);
    border-bottom: var(--theme-strip) solid var(--c-themeStrip);
  }
  h1 {
    margin: 0;
    color: var(--c-ink);
    font-size: var(--t-labelLG);
    font-weight: ${type.scale.labelLG.wght};
    letter-spacing: var(--ls-labelLG);
    text-transform: uppercase;
  }
  main { padding: var(--sp-lg); display: grid; gap: var(--sp-lg); }
  h2 {
    margin: 0;
    font-size: var(--t-title);
    font-weight: ${type.scale.title.wght};
    line-height: ${type.scale.title.lh};
  }
  h3 { display: flex; align-items: center; gap: var(--sp-sm); }
  .empty-state {
    background: var(--c-surfaceMuted);
    border: var(--hair-mid) solid var(--c-hairlineStrong);
    padding: var(--sp-xl);
    color: var(--c-body);
    font-size: var(--t-body);
  }
  /* Sandbox ribbon — the striped sandbox band, on EVERY screen (WO-4.2E). */
  .sandbox-ribbon {
    margin: 0;
    min-height: var(--ribbon-h);
    display: flex; align-items: center; justify-content: center;
    background: repeating-linear-gradient(45deg,
      var(--ribbon-a), var(--ribbon-a) var(--ribbon-stripe),
      var(--ribbon-b) var(--ribbon-stripe), var(--ribbon-b) calc(var(--ribbon-stripe) * 2));
    color: var(--ribbon-text);
    font-size: var(--t-labelXS);
    font-weight: ${type.scale.labelXS.wght};
    letter-spacing: var(--ls-labelXS);
    text-transform: uppercase;
    text-align: center;
    padding: var(--sp-xs) var(--sp-md);
    border-bottom: var(--theme-strip) solid var(--c-themeStrip);
  }
  /* Offline is a designed state: a full-width ink band, never an alert. */
  .offline-banner {
    margin: 0;
    background: var(--c-ink);
    color: var(--c-onInk);
    font-size: var(--t-label);
    font-weight: ${type.scale.label.wght};
    letter-spacing: var(--ls-label);
    padding: var(--sp-sm) var(--sp-lg);
  }
  .journey-screen > section, .journey-screen > div { display: grid; gap: var(--sp-lg); }
  main > div { display: grid; gap: var(--sp-lg); }
  .order-view { display: grid; gap: var(--sp-lg); }
  @media (prefers-reduced-motion: no-preference) {
    .journey-screen { animation: screen-in var(--motion-standard) cubic-bezier(0.2, 0.8, 0.25, 1); }
    @keyframes screen-in { from { opacity: 0; transform: translateY(var(--sp-sm)); } }
    .rec-dot { animation: dot-pulse var(--skeleton-pulse) ease-in-out infinite; }
    .skeleton-fill, .skeleton-line { animation: skeleton-pulse var(--skeleton-pulse) ease-in-out infinite; }
    @keyframes dot-pulse { 50% { opacity: var(--skeleton-floor); } }
    @keyframes skeleton-pulse { 50% { opacity: var(--skeleton-floor); } }
  }
  /* Quiet back step + tertiary links. */
  .link-quiet {
    border: 0; background: none; color: var(--c-primaryStrong);
    font-size: var(--t-labelXS); font-weight: ${type.scale.labelXS.wght};
    letter-spacing: var(--ls-labelXS); text-transform: uppercase;
    text-decoration: underline; text-underline-offset: var(--sp-xs);
    min-height: var(--touch); text-align: left; padding: 0;
    display: inline-flex; align-items: center; gap: var(--sp-xs);
  }
  .back-step { display: inline-flex; padding: var(--sp-sm) 0; }
  .back-icon { width: var(--icon-sm); height: var(--icon-sm); transform: scaleX(-1); }
  /* Buttons: one primary per screen; problem paths equal-weight. */
  .primary-action {
    min-height: var(--touch); border: 0; border-radius: var(--r-button);
    background: var(--c-ink); color: var(--c-onInk);
    font-size: var(--t-label); font-weight: ${type.scale.label.wght};
    letter-spacing: var(--ls-label); text-transform: uppercase;
    padding: var(--sp-md) var(--sp-lg);
    display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-sm);
  }
  .primary-action:active { opacity: var(--pressed-opacity); }
  .secondary-action {
    min-height: var(--touch); border: var(--hair-mid) solid var(--c-hairlineStrong);
    background: var(--c-paper); color: var(--c-ink);
    font-size: var(--t-label); font-weight: ${type.scale.label.wght};
    letter-spacing: var(--ls-label); text-transform: uppercase;
    padding: var(--sp-sm) var(--sp-lg);
    display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-sm);
  }
  .problem-path { border-color: var(--c-danger); color: var(--c-danger); }
  .action-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-md); }
  .action.action-equal {
    min-height: var(--touch);
    border: var(--hair-mid) solid var(--c-ink);
    background: var(--c-paper);
    color: var(--c-ink);
    font-size: var(--t-label); font-weight: ${type.scale.label.wght};
    letter-spacing: var(--ls-label); text-transform: uppercase;
    padding: var(--sp-sm) var(--sp-md);
    display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-sm);
  }
  .tracking-actions { display: grid; gap: var(--sp-md); justify-items: start; }
  .btn-icon { width: var(--icon-sm); height: var(--icon-sm); flex: none; }
  /* C1 — the premium photo frame + corner ticks + PriceBand. */
  .product-photo-frame { margin: 0; display: grid; gap: var(--sp-sm); }
  .product-photo {
    position: relative; overflow: hidden;
    border: var(--hair-mid) solid var(--c-hairlineStrong); background: var(--c-sand);
    aspect-ratio: 4 / 5;
  }
  .product-photo svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .product-photo-initial {
    position: absolute; inset: 0; display: grid; place-items: center;
    font-size: var(--m-hero); font-weight: ${money.amountScale.hero.wght};
    color: var(--c-primaryStrong);
  }
  .tick { position: absolute; width: var(--tick-size); height: var(--tick-size); border: 0 solid var(--c-ink); }
  .tick-tl { top: var(--tick-inset); left: var(--tick-inset); border-top-width: var(--tick-stroke); border-left-width: var(--tick-stroke); }
  .tick-tr { top: var(--tick-inset); right: var(--tick-inset); border-top-width: var(--tick-stroke); border-right-width: var(--tick-stroke); }
  .tick-bl { bottom: var(--tick-inset); left: var(--tick-inset); border-bottom-width: var(--tick-stroke); border-left-width: var(--tick-stroke); }
  .tick-br { bottom: var(--tick-inset); right: var(--tick-inset); border-bottom-width: var(--tick-stroke); border-right-width: var(--tick-stroke); }
  .photo-caption {
    margin: 0; font-size: var(--t-caption); color: var(--c-muted);
    line-height: ${type.scale.caption.lh};
  }
  .reseller-line { margin: 0; font-size: var(--t-body); display: flex; align-items: center; gap: var(--sp-sm); flex-wrap: wrap; }
  .reseller-name { font-weight: ${type.scale.bodyStrong.wght}; }
  .verified-badge {
    color: var(--c-success); font-size: var(--t-labelXS);
    font-weight: ${type.scale.labelXS.wght}; letter-spacing: var(--ls-labelXS);
    text-transform: uppercase;
    background: var(--c-successTint); border: 1px solid var(--c-success);
    padding: var(--sp-xs) var(--sp-sm);
  }
  .product-name { font-size: var(--t-titleLG); font-weight: ${type.scale.titleLG.wght}; line-height: ${type.scale.titleLG.lh}; }
  /* PriceBand — the signature money moment. */
  .price-band {
    display: grid; grid-template-columns: 1fr auto; align-items: center;
    column-gap: var(--sp-md);
    background: var(--c-primary); color: var(--c-onPrimary);
    padding: var(--sp-md) var(--sp-lg);
  }
  .price-band-label {
    grid-column: 1; font-size: var(--t-labelXS); font-weight: ${type.scale.labelXS.wght};
    letter-spacing: var(--ls-labelXS); text-transform: uppercase; color: var(--c-primarySoft);
  }
  .price-band-note {
    grid-column: 2; grid-row: 1 / span 2; align-self: center; text-align: right;
    max-inline-size: 38%; font-size: var(--t-caption); color: var(--c-primarySoft);
    line-height: ${type.scale.caption.lh};
  }
  .fcfa-hero {
    grid-column: 1; margin: 0; white-space: nowrap;
    font-size: var(--m-page); line-height: ${money.amountScale.page.lh};
    font-weight: ${money.amountScale.page.wght}; font-variant-numeric: tabular-nums;
    color: var(--c-onPrimary);
  }
  .trust-row { display: flex; gap: var(--sp-sm); flex-wrap: wrap; }
  .trust-chip {
    font-size: var(--t-labelXS); font-weight: ${type.scale.labelXS.wght};
    letter-spacing: var(--ls-labelXS); text-transform: uppercase;
    color: var(--c-ink); background: var(--c-paper);
    border: 1px solid var(--c-hairlineStrong); border-radius: var(--r-chip);
    padding: var(--sp-xs) var(--sp-sm);
  }
  /* C1 skeleton — clones the exact boxes (CLS = 0). */
  .skeleton-fill { background: var(--skeleton-bg); border-radius: var(--r-chip); }
  .product-photo.skeleton-fill { border-color: var(--c-hairline); }
  .skeleton-line { display: block; height: var(--t-body); background: var(--skeleton-bg); border-radius: var(--r-chip); }
  .skeleton-line-mid { width: 55%; }
  .skeleton-line-wide { width: 78%; }
  .skeleton-line-band { height: var(--m-page); width: 60%; }
  .price-band-skeleton { background: var(--c-sand); }
  .product-page-skeleton .primary-action { min-height: var(--touch); }
  /* C3 — the landmark capture form. */
  .step-line { margin: 0; color: var(--c-muted); font-size: var(--t-labelXS); font-weight: ${type.scale.labelXS.wght}; letter-spacing: var(--ls-labelXS); text-transform: uppercase; }
  .field { display: grid; gap: var(--sp-xs); }
  .field-label { margin: 0; font-size: var(--t-labelXS); font-weight: ${type.scale.labelXS.wght}; letter-spacing: var(--ls-labelXS); text-transform: uppercase; color: var(--c-muted); }
  .field-input {
    min-height: var(--touch); border: var(--hair-mid) solid var(--c-hairlineStrong);
    background: var(--c-paper); color: var(--c-ink);
    font-size: var(--t-body); padding: var(--sp-sm) var(--sp-md);
  }
  .field-repere { font-weight: ${type.scale.bodyStrong.wght}; }
  .chips { display: flex; gap: var(--sp-sm); flex-wrap: wrap; }
  .chip {
    min-height: var(--touch); border: 1px solid var(--c-hairlineStrong);
    background: var(--c-paper); color: var(--c-ink);
    font-size: var(--t-body); padding: var(--sp-sm) var(--sp-lg);
  }
  .chip-on { border: var(--sel-border) solid var(--c-ink); background: var(--c-sand); font-weight: ${type.scale.bodyStrong.wght}; }
  .quiet-line { margin: 0; color: var(--c-body); font-size: var(--t-caption); line-height: ${type.scale.caption.lh}; }
  .voice-note { display: grid; gap: var(--sp-sm); background: var(--c-surfaceMuted); border: var(--hair-mid) solid var(--c-hairlineStrong); padding: var(--sp-lg); }
  .voice-action { justify-self: start; }
  .listen-icon { width: var(--icon-sm); height: var(--icon-sm); color: var(--c-primaryStrong); flex: none; }
  .rec-dot { width: var(--sp-sm); height: var(--sp-sm); border-radius: var(--r-pill); background: var(--c-danger); display: inline-block; }
  /* Status chips — never a green lie before server truth. */
  .status-chip {
    margin: 0; display: inline-flex; align-items: center; gap: var(--sp-sm);
    font-size: var(--t-labelXS); font-weight: ${type.scale.labelXS.wght};
    letter-spacing: var(--ls-labelXS); text-transform: uppercase;
    border: 1px solid currentColor; border-radius: var(--r-chip);
    padding: var(--sp-xs) var(--sp-sm); justify-self: start;
  }
  .status-ok { color: var(--c-success); }
  .status-pending { color: var(--c-warning); }
  .status-info { color: var(--c-primaryStrong); }
  .status-muted { color: var(--c-muted); }
  /* C4 — Séra's quote as OptionCards; selection is structural (accent edge). */
  .delivery-quote .quote-table { display: grid; gap: var(--sp-sm); }
  .quote-row {
    position: relative; min-height: var(--touch);
    display: flex; justify-content: space-between; align-items: center; gap: var(--sp-sm);
    border: var(--hair-mid) solid var(--c-hairlineStrong); background: var(--c-paper);
    color: var(--c-ink); font-size: var(--t-body);
    padding: var(--sp-md) var(--sp-lg); text-align: left;
  }
  .quote-label { font-weight: ${type.scale.bodyStrong.wght}; }
  .quote-row-on { border: var(--sel-border) solid var(--c-ink); padding-left: var(--sp-xl); }
  .quote-row-on::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: var(--accent-edge); background: var(--c-primary); }
  .quote-row-on::after { content: ''; position: absolute; top: 0; right: 0; width: var(--sel-mark); height: var(--sel-mark); background: var(--c-ink); }
  /* Money figures — tabular, confident. */
  .fcfa-figure { margin: 0; font-size: var(--m-page); line-height: ${money.amountScale.page.lh}; font-weight: ${money.amountScale.page.wght}; font-variant-numeric: tabular-nums; }
  .fcfa-figure-inline { font-weight: ${money.amountScale.row.wght}; font-variant-numeric: tabular-nums; }
  .fcfa-line { margin: 0; font-size: var(--t-body); display: flex; justify-content: space-between; gap: var(--sp-sm); }
  .reconcile-line { margin: 0; text-align: right; font-size: var(--m-reconcile); font-weight: ${money.reconcileLine.wght}; letter-spacing: var(--ls-reconcile); font-variant-numeric: tabular-nums; color: var(--c-body); }
  /* C5 — the two-option checkout (HairlineBoxes). */
  .checkout-view { display: grid; gap: var(--sp-lg); }
  .checkout-option {
    background: var(--c-paper); border: var(--hair-mid) solid var(--c-hairlineStrong);
    padding: var(--sp-lg); display: grid; gap: var(--sp-md);
  }
  .checkout-option h3 { margin: 0; font-size: var(--t-body); font-weight: ${type.scale.title.wght}; }
  .option-icon-slot { display: inline-flex; }
  .option-icon { width: var(--icon); height: var(--icon); color: var(--c-primary); flex: none; }
  .block-icon { width: var(--icon-sm); height: var(--icon-sm); color: var(--c-ink); flex: none; }
  .fee-warning, .option-summary, .replay-line { margin: 0; font-size: var(--t-caption); color: var(--c-body); line-height: ${type.scale.caption.lh}; }
  .checkout-option p { margin: 0; }
  .checkout-option-unavailable { background: var(--c-surfaceMuted); border-style: dashed; color: var(--c-muted); }
  .audio-note {
    display: flex; align-items: center; gap: var(--sp-sm);
    margin: 0; min-height: var(--touch);
    color: var(--c-primaryStrong); border: 1px solid var(--c-hairline);
    padding: var(--sp-sm) var(--sp-md);
  }
  .audio-note-label { font-size: var(--t-labelXS); font-weight: ${type.scale.labelXS.wght}; letter-spacing: var(--ls-labelXS); text-transform: uppercase; text-decoration: underline; text-underline-offset: var(--sp-xs); }
  .audio-note-pending { color: var(--c-muted); }
  /* « La voix » — the per-product voice-note player (house standard §5): the
     filled play triangle + caps label + visible duration. Tap plays (no autoplay). */
  .voix-note { margin: 0; }
  .voix-btn {
    display: inline-flex; align-items: center; gap: var(--sp-sm);
    min-height: var(--touch); border: 1px solid var(--c-hairline);
    background: var(--c-paper); color: var(--c-primaryStrong);
    padding: var(--sp-sm) var(--sp-md); cursor: pointer;
  }
  .voix-btn:active { opacity: var(--pressed-opacity); }
  .voix-icon { width: var(--icon-sm); height: var(--icon-sm); color: var(--c-primaryStrong); flex: none; }
  .voix-label { font-size: var(--t-labelXS); font-weight: ${type.scale.labelXS.wght}; letter-spacing: var(--ls-labelXS); text-transform: uppercase; }
  .voix-duration { font-size: var(--t-labelXS); color: var(--c-muted); font-variant-numeric: tabular-nums; }
  /* C7 — the coarse honest timeline (never a GPS dot). */
  .timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-md); }
  .timeline-step { position: relative; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--sp-md); font-size: var(--t-body); }
  .timeline-dot { position: relative; z-index: 1; width: var(--sp-md); height: var(--sp-md); border-radius: var(--r-pill); background: var(--c-paper); border: 1px solid var(--c-hairlineStrong); display: grid; place-items: center; flex: none; }
  .timeline-step:not(:first-child) .timeline-dot::before { content: ''; position: absolute; left: 50%; transform: translateX(-50%); bottom: 100%; width: var(--tick-stroke); height: var(--sp-md); background: var(--c-hairlineStrong); }
  .timeline-done { color: var(--c-muted); }
  .timeline-done .timeline-dot { background: var(--c-ink); border-color: var(--c-ink); color: var(--c-onInk); }
  .timeline-done .timeline-dot::before { background: var(--c-ink); }
  .dot-check { width: var(--sp-sm); height: var(--sp-sm); }
  .timeline-now { font-weight: ${type.scale.bodyStrong.wght}; }
  .timeline-now .timeline-dot { border: var(--sel-border) solid var(--c-primary); }
  .timeline-now .timeline-dot::before { background: var(--c-ink); }
  .timeline-later { color: var(--c-soft); }
  .timeline-label { min-width: 0; }
  .now-chip {
    font-size: var(--t-labelXS); font-weight: ${type.scale.labelXS.wght};
    letter-spacing: var(--ls-labelXS); text-transform: uppercase;
    background: var(--c-primary); color: var(--c-onPrimary);
    border-radius: var(--r-chip); padding: var(--sp-xs) var(--sp-sm);
  }
  /* C8 / C9 — the door block + the drop-code frame. */
  .door-block { display: grid; gap: var(--sp-md); background: var(--c-paper); border: var(--hair-mid) solid var(--c-hairlineStrong); padding: var(--sp-lg); }
  .door-block h3 { margin: 0; font-size: var(--t-body); font-weight: ${type.scale.title.wght}; }
  .door-block p { margin: 0; font-size: var(--t-body); }
  .code-box { display: grid; gap: var(--sp-md); border: var(--sel-border) solid var(--c-ink); padding: var(--sp-lg); text-align: center; justify-items: center; }
  .code-box-locked { border-style: dashed; }
  .code-lock-icon { width: var(--icon); height: var(--icon); color: var(--c-muted); }
  .code-frame { position: relative; padding: var(--sp-lg) var(--sp-xl); }
  .code-tick { border-color: var(--c-primary); }
  .code-figure {
    margin: 0; font-size: var(--m-hero); line-height: ${money.amountScale.hero.lh};
    font-weight: ${money.amountScale.hero.wght}; font-variant-numeric: tabular-nums;
    letter-spacing: var(--sp-sm); color: var(--c-ink);
  }
  .code-figure-hidden { color: var(--c-muted); letter-spacing: var(--sp-md); }
  /* C2 — « Vos protections » sheet. */
  .protections-sheet {
    background: var(--c-paper); border-top: var(--sel-border) solid var(--c-ink);
    padding: var(--sp-xl); display: grid; gap: var(--sp-lg);
  }
  .sheet-handle { justify-self: center; width: var(--touch); height: var(--tick-stroke); background: var(--c-hairlineStrong); border-radius: var(--r-pill); }
  .protections-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-md); font-size: var(--t-body); line-height: ${type.scale.body.lh}; }
  .protection-row { margin: 0; padding-left: var(--sp-lg); border-left: var(--sel-border) solid var(--c-ink); }

  /* WO-7.1 — THE VITRINE (S5). Ink-on-paper: the store name a poster header,
     the trust chrome before products, hairline product rows, HER price big. */
  .vitrine { display: grid; gap: var(--sp-lg); }
  .vitrine-head { display: grid; gap: var(--sp-xs); }
  .vitrine-store-name { margin: 0; font-size: var(--t-display); line-height: ${type.scale.display.lh}; font-weight: 900; text-transform: uppercase; color: var(--c-ink); }
  .vitrine-verified { margin: 0; }
  .vitrine-trust { display: grid; gap: var(--sp-sm); padding-bottom: var(--sp-sm); border-bottom: var(--hair-strong) solid var(--c-hairline); }
  .vitrine-privacy { margin: 0; font-size: var(--t-caption); line-height: ${type.scale.caption.lh}; color: var(--c-body); }
  .vitrine-reputation-line { margin: 0; font-size: var(--t-caption); line-height: ${type.scale.caption.lh}; color: var(--c-primaryStrong); }
  .vitrine-reputation { font-weight: ${type.scale.bodyStrong.wght}; }
  .reputation-demo { font-size: var(--t-labelXS); color: var(--c-muted); letter-spacing: var(--ls-label); text-transform: uppercase; }
  .vitrine-products { display: grid; gap: 0; border: var(--hair-mid) solid var(--c-hairlineStrong); }
  .vitrine-product { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-md); padding: var(--sp-md) var(--sp-lg); min-height: var(--touch); border-top: var(--hair-mid) solid var(--c-hairline); text-decoration: none; color: var(--c-ink); }
  .vitrine-product:first-child { border-top: 0; }
  .vitrine-product-name { font-size: var(--t-body); }
  .vitrine-price { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--c-ink); white-space: nowrap; }
  .vitrine-product-epuise { color: var(--c-muted); }
  .vitrine-epuise-chip { font-size: var(--t-labelXS); letter-spacing: var(--ls-labelXS); text-transform: uppercase; color: var(--c-muted); }
  .vitrine-boutiques { margin-top: var(--sp-sm); }

  /* WO-7.2a — S3 DÉCOUVERTE (the store directory). Stores, never products:
     no photo, no price in the list — the price lives in the vitrine. Fixed
     76 px rows (no layout jump), hairline grammar, ink-on-paper. */
  .boutiques { display: grid; gap: var(--sp-md); }
  .bq-header { display: grid; gap: var(--sp-xs); }
  .bq-title { margin: 0; color: var(--c-ink); font-size: var(--t-labelLG); font-weight: ${type.scale.labelLG.wght}; letter-spacing: var(--ls-labelLG); text-transform: uppercase; }
  .bq-subtitle { margin: 0; font-size: var(--t-caption); color: var(--c-body); line-height: ${type.scale.caption.lh}; }
  .bq-search { display: grid; gap: var(--sp-xs); }
  .bq-search[data-disabled="true"] { opacity: var(--disabled-opacity); }
  .bq-search-input { min-height: var(--touch); border: var(--hair-mid) solid var(--c-hairlineStrong); background: var(--c-paper); color: var(--c-ink); font-size: var(--t-body); padding: var(--sp-sm) var(--sp-md); }
  .bq-search-note { margin: 0; font-size: var(--t-labelXS); font-weight: ${type.scale.labelXS.wght}; letter-spacing: var(--ls-labelXS); text-transform: uppercase; color: var(--c-muted); }
  .bq-zones { }
  .bq-zone { min-height: auto; padding: var(--sp-xs) var(--sp-md); font-size: var(--t-labelXS); font-weight: ${type.scale.labelXS.wght}; letter-spacing: var(--ls-labelXS); text-transform: uppercase; }
  .bq-count { margin: 0; font-size: var(--t-labelXS); font-weight: ${type.scale.labelXS.wght}; letter-spacing: var(--ls-labelXS); text-transform: uppercase; color: var(--c-ink); }
  .bq-order { margin: 0; font-size: var(--t-caption); color: var(--c-muted); line-height: ${type.scale.caption.lh}; }
  .bq-list { display: grid; gap: 0; border: var(--hair-mid) solid var(--c-hairlineStrong); }
  .bq-card { display: flex; align-items: center; gap: var(--sp-md); min-height: calc(var(--touch) + var(--sp-lg) + var(--sp-lg)); padding: 0 var(--sp-md); border-top: var(--hair-mid) solid var(--c-hairline); text-decoration: none; color: var(--c-ink); }
  .bq-card:first-child { border-top: 0; }
  .bq-card:active { background: var(--c-sand); }
  .bq-avatar { position: relative; width: var(--touch); height: var(--touch); flex: none; display: grid; place-items: center; background: var(--c-sand); border: var(--hair-mid) solid var(--c-hairlineStrong); }
  .bq-avatar-initial { font-size: var(--t-row); font-weight: ${money.amountScale.hero.wght}; color: var(--c-primaryStrong); }
  .bq-card-body { flex: 1; min-width: 0; display: grid; gap: var(--sp-xs); }
  .bq-card-head { display: flex; align-items: center; gap: var(--sp-xs); }
  .bq-store-name { font-size: var(--t-caption); font-weight: ${type.scale.bodyStrong.wght}; letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--c-ink); }
  .bq-verified-mark { color: var(--c-ink); flex: none; }
  .bq-verified-label { font-size: var(--t-labelXS); color: var(--c-muted); }
  .bq-card-meta { font-size: var(--t-caption); color: var(--c-muted); line-height: ${type.scale.caption.lh}; }
  .bq-reputation { font-size: var(--t-caption); color: var(--c-primaryStrong); font-weight: ${type.scale.bodyStrong.wght}; }
  .bq-chevron { color: var(--c-primaryStrong); flex: none; }
  .bq-card-skeleton { pointer-events: none; }
  .bq-card-skeleton .bq-avatar { border: 0; }
  .bq-empty { display: grid; gap: var(--sp-md); justify-items: start; padding: var(--sp-lg) 0; }
  .bq-empty-title { margin: 0; font-size: var(--t-body); color: var(--c-ink); line-height: ${type.scale.body.lh}; }
  .bq-error { display: grid; gap: var(--sp-md); justify-items: start; }
  .bq-error-title { margin: 0; font-size: var(--t-body); font-weight: ${type.scale.bodyStrong.wght}; color: var(--c-ink); }
  .bq-error-hint { margin: 0; font-size: var(--t-caption); color: var(--c-body); }
  .bq-foot { margin: 0; font-size: var(--t-caption); color: var(--c-muted); line-height: ${type.scale.caption.lh}; }
`;
document.head.appendChild(style);

// PWA CLIENTE — the pixel-for-pixel C1→C9 buyer-flow stylesheet (Édition
// Indigo), its own `.cl-*` namespace reading the `--vt-*` theme props
// applyTheme sets on the container. Injected after the Grand Teint sheet; the
// two never collide (disjoint class names), so the legacy demo surfaces keep
// their chrome. (The S1–S7 achat module is retired — superseded 2026-07-22.)
const clienteStyle = document.createElement('style');
clienteStyle.setAttribute('data-cliente', '');
clienteStyle.textContent = CLIENTE_STYLES;
document.head.appendChild(clienteStyle);

/** Validate a harness `theme` param against the closed §1.2 set (default indigo). */
const CLIENTE_THEMES: readonly VitrineThemeKey[] = ['laterite', 'danfani', 'indigo', 'foret'];
function clienteTheme(raw: string | null): VitrineThemeKey {
  return raw && (CLIENTE_THEMES as readonly string[]).includes(raw) ? (raw as VitrineThemeKey) : 'indigo';
}

const app = document.querySelector('#app');
if (app) {
  // WO-4.2E — the SANDBOX RIBBON: a deployed preview must NEVER be
  // mistakable for a real store. Unconditional — no profile, no URL param,
  // no code path renders this surface without it.
  const ribbon = document.createElement('p');
  ribbon.className = 'sandbox-ribbon';
  ribbon.setAttribute('data-role', 'sandbox-ribbon');
  ribbon.textContent = t('apercu.ruban');
  app.append(ribbon);

  const params = new URLSearchParams(window.location.search);
  // PWA CLIENTE harness: drives any C1–C9 screen/state under any of the four
  // habillages (C2 mounts C1 with the sheet open). `?demo-cliente=<C1..C9>&theme=&stock=out&voix=0&offline=1&b=indisponible&micro=refuse&demo=0&etat=loading&conf=&revealed=1`.
  // (The retired `?demo-achat=` S1–S7 param is read by NOTHING — un-generatable.)
  const clienteDemo = params.get('demo-cliente');
  const CLIENTE_ECRANS: readonly ClienteEcran[] = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'];

  // VITRINE (redesign — HANDOFF §5). Reached by the canon /v/{slug} path
  // (restored by the 404.html SPA-fallback before boot); the ?demo-vitrine*
  // params are a LOCAL/GATE/audit harness only, never the shared link. The
  // controller records the IDENTITY-scope arrival (A8, last-touch) itself and
  // owns the §4.2 state machine (squelette → ready · offline · invalide · vide).
  const vitrineSlug = vitrineSlugFromPath(window.location.pathname) ?? params.get('demo-vitrine') ?? undefined;

  // THE SIGNED PRODUCT DEEP-LINK — `/s/{slug}`, « the one she sends » (§6.2.1
  // Arrival; SP-I09). It opens the OFFER (the signed product page), never the
  // directory. Resolved through the SAME storefront port as `/v/` — no second
  // scheme — so a privée vitrine (discoverable:false) still resolves (loi 4).
  // The `?demo-signed=` param is a LOCAL/GATE harness (like `?demo-vitrine`),
  // never the shared link; the shared link is the path the 404.html SPA-fallback
  // restores before boot. `?pid=` names the offered product; `demo-signed-profil`
  // is an audit-only lever for the privée state.
  const signedSlug = signedProductSlugFromPath(window.location.pathname) ?? params.get('demo-signed') ?? undefined;

  if (signedSlug) {
    const profil = params.get('demo-signed-profil') === 'prive' ? 'private' : 'default';
    const resolved = demoStorefrontPort(profil).resolve(signedSlug);
    if (!resolved) {
      // Unknown or expired slug → the HONEST not-found, reusing the `/v/` path's
      // invalid surface exactly (no bespoke error wall; §5 honest states).
      mountVitrine(app as HTMLElement, signedSlug);
    } else {
      // Arrival attribution, recorded on land EXACTLY as the `/v/` path records
      // it — the same function, the same IDENTITY scope, the same store. A direct
      // signed land never touched the vitrine, so this is where the token is
      // locked to her (SP-I09). Best-effort: storage failure never blocks the
      // offer (§5 — the money moment must not be gated on telemetry).
      try {
        recordVitrineArrival(
          {
            resellerId: resolved.storefront.resellerId,
            shortCode: '',
            slug: signedSlug,
            view: { resellerName: resolved.storefront.name, zone: resolved.storefront.zone, products: [] },
            reputation: { count: resolved.trust.deliveredCount, demo: resolved.trust.demo },
          },
          new Date().toISOString(),
          `signed-${signedSlug}-${Date.now()}`,
          window.sessionStorage,
        );
      } catch {
        /* storage unavailable — arrival is best-effort */
      }
      // THE SIGNED OFFER — the pixel-for-pixel PWA CLIENTE C1 (Édition Indigo),
      // rendered in HER habillage (the shop's theme; Aïcha = laterite; the
      // themeless fallback is indigo — founder decree 2026-07-21). BUG 3 law:
      // `?pid=` resolves against HER REAL vitrine catalog (seedProduct, the
      // same resolution the vitrine uses), so a shared product opens as ITSELF
      // — never the demo robe. No pid → her first curated item; an EXPLICIT
      // pid that resolves to nothing falls to the honest not-found (the same
      // surface as an unresolvable slug) — never a silent product swap
      // (PWA-CLEANUP-1 §1: a wrong link must say so, not sell something else).
      // épuisé / sans-voix derive from the real product + its real voice note. The
      // quote is composed ONCE by the mock quote service (composeQuote) —
      // render-only from there. « Voir la boutique › » navigates to her full
      // vitrine at the canon `/v/{slug}` (base-aware), the FROZEN attribution
      // seam — arrival locked to her above.
      const defaultPid = resolved.storefront.curatedItems[0] ?? 'p1';
      const pid = params.get('pid') || defaultPid;
      const product = seedProduct(pid);
      const main = document.createElement('main');
      if (!product) {
        // Unresolvable pid — honest not-found, the SAME `/v/` invalid surface
        // an unresolvable slug lands on. No demo fallback, no neighbouring
        // product: a wrong link says so instead of selling something else.
        mountVitrine(app as HTMLElement, signedSlug, { etat: 'invalid' });
      } else {
        const { produit, theme } = clienteProduitReel(resolved.storefront, product, resolved.notes[product.pid]);
        createCliente(main, {
          produit,
          quote: composeQuote(produit.priceFcfa),
          theme,
          ecran: 'C1',
          epuise: !produit.inStock,
          sansVoix: produit.voiceDuree === undefined,
          onVitrine: (slug) => {
            window.location.href = vitrineHref(window.location.pathname, slug);
          },
        });
        app.append(main);
      }
    }
  } else if (clienteDemo && (CLIENTE_ECRANS as readonly string[]).includes(clienteDemo)) {
    // The PWA CLIENTE harness — every C1–C9 screen/state × the four habillages,
    // reachable and gate-lockable (the shared link boots at root under preview).
    const theme = clienteTheme(params.get('theme'));
    // Resolve the demo storefront from the port (no inline shop name in the
    // shell); the harness theme param drives all four habillages.
    const sf = demoStorefrontPort('default').resolve('aicha-4821')?.storefront;
    const produit = {
      ...clienteProduit({ name: sf?.name ?? '', slug: sf?.slug ?? 'aicha-4821' }),
      inStock: params.get('stock') !== 'out',
    };
    const confRaw = params.get('conf');
    const main = document.createElement('main');
    createCliente(main, {
      produit,
      quote: composeQuote(produit.priceFcfa),
      theme,
      ecran: clienteDemo as ClienteEcran,
      epuise: !produit.inStock,
      sansVoix: params.get('voix') === '0',
      offline: params.get('offline') === '1',
      bIndisponible: params.get('b') === 'indisponible',
      microRefuse: params.get('micro') === 'refuse',
      demo: params.get('demo') !== '0',
      etat: params.get('etat') === 'loading' ? 'loading' : 'ready',
      conf: confRaw === 'attente' ? 'pending' : confRaw === 'hors-ligne' ? 'offline' : 'confirmed',
      revealed: params.get('revealed') === '1',
      onVitrine: (slug) => {
        window.location.href = vitrineHref(window.location.pathname, slug);
      },
    });
    app.append(main);
  } else if (vitrineSlug) {
    const VIT_ETATS: readonly VitrineEtat[] = ['loading', 'ready', 'empty', 'offline', 'invalid'];
    const etatParam = params.get('demo-vitrine-etat');
    const profilParam = params.get('demo-vitrine-profil');
    mountVitrine(app as HTMLElement, vitrineSlug, {
      etat: etatParam && (VIT_ETATS as readonly string[]).includes(etatParam) ? (etatParam as VitrineEtat) : undefined,
      profil: profilParam === 'perso' ? 'customised' : profilParam === 'vide' ? 'empty' : 'default',
      fromProduct: params.get('demo-vitrine-depuis') === 'produit',
      fige: params.has('demo-vitrine-fige'),
    });
  } else {
    // WO-7.2a — S3 DÉCOUVERTE is the root (« root » entry, founder-ruled) and
    // the /boutiques path. The store directory owns the screen (its own
    // « LES BOUTIQUES » title — no separate brand bar, per the mockup). The
    // ?demo-boutiques=<state> harness drives the six states for the gallery.
    // (The legacy Grand Teint buyer demo params are retired, and so is the
    // S1–S7 achat module with its ?demo-achat= param; the pixel PWA CLIENTE
    // C1→C9 is the buyer purchase surface now, via /s/{slug} and ?demo-cliente=.)
    const BQ_STATES: readonly BoutiqueState[] = [
      'default', 'skeleton', 'results', 'empty', 'offline', 'error',
    ];
    const demoBoutiques = params.get('demo-boutiques');
    const state: BoutiqueState =
      demoBoutiques && (BQ_STATES as readonly string[]).includes(demoBoutiques)
        ? (demoBoutiques as BoutiqueState)
        : 'default';
    const query = params.get('q') ?? (state === 'results' || state === 'empty' ? (state === 'empty' ? 'bazin' : 'rood') : '');
    const main = document.createElement('main');
    main.innerHTML = renderBoutiques({ state, query });
    app.append(main);
  }
}
