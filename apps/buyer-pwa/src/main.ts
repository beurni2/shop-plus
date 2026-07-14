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
} from '@platform/ui-tokens';
import { t } from './i18n';
import { renderOrderView, type OrderViewModel } from './order-view';
import { renderCheckoutOptions } from './checkout-view';
import { renderProductSkeleton } from './product-view';
import { renderVitrine } from './vitrine-view';
import { vitrineSlugFromPath, resolveVitrineSlug, recordVitrineArrival } from './vitrine-link';
import { renderBoutiques, type BoutiqueState } from './boutiques-view';
import { createJourney, JOURNEY_SCREENS, type JourneyScreen } from './journey';

/**
 * The buyer PWA shell, rebuilt on GRAND TEINT (WO-5.3). SP0.1 discovery shell
 * + the E2 demo harness (?demo-order / ?demo-checkout — byte-behaviour
 * preserved) + WO-4.4 walkable §6.2 journey (?demo-journey=<screen>) + the C1
 * skeleton surface (?demo-skeleton=produit). Every colour, dimension, radius
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
  const journeyScreen = params.get('demo-journey');
  const skeletonScreen = params.get('demo-skeleton');

  // WO-7.1 — THE VITRINE (S5). Reached by the canon /v/{slug} path (restored by
  // the 404.html SPA-fallback before boot); ?demo-vitrine is a LOCAL/GATE harness
  // only, never the shared link. On land, record an IDENTITY-scope arrival (A8,
  // last-touch) — best-effort, it never blocks the render.
  const vitrineSlug = vitrineSlugFromPath(window.location.pathname) ?? params.get('demo-vitrine') ?? undefined;
  const vitrineIdentity = vitrineSlug ? resolveVitrineSlug(vitrineSlug) : undefined;

  if (vitrineIdentity) {
    try {
      recordVitrineArrival(
        vitrineIdentity,
        new Date().toISOString(),
        `vitrine-${vitrineIdentity.slug}-${Date.now()}`,
        window.sessionStorage,
      );
    } catch {
      /* storage unavailable — the arrival is best-effort and never blocks the vitrine */
    }
    const main = document.createElement('main');
    const section = document.createElement('div');
    section.className = 'journey-screen';
    section.innerHTML = renderVitrine(vitrineIdentity.view, vitrineIdentity.reputation);
    main.append(section);
    app.append(main);
  } else if (journeyScreen && (JOURNEY_SCREENS as readonly string[]).includes(journeyScreen)) {
    // WO-4.4 — the walkable journey owns the whole viewport (5-second test).
    const main = document.createElement('main');
    createJourney(main, {
      screen: journeyScreen as JourneyScreen,
      trackingEtat: params.get('etat') ?? undefined,
      voix: params.get('voix') ?? undefined,
    });
    app.append(main);
  } else if (skeletonScreen === 'produit') {
    // WO-5.3 — the C1 skeleton surface (« La vitesse comme luxe »), exact-box.
    const main = document.createElement('main');
    const section = document.createElement('div');
    section.className = 'journey-screen';
    section.innerHTML = renderProductSkeleton();
    main.append(section);
    app.append(main);
  } else {
    // E2 order-view demo surface (no backend at E2): the Playwright harness
    // drives ?demo-order=<state> to exercise the honest failure states.
    const demoState = params.get('demo-order');
    const DEMO_STATES: ReadonlyArray<OrderViewModel['state']> = [
      'payment_failed', 'cancelled', 'confirmed', 'paid_cancel_refused',
      'door_pending', 'door_paid',
    ];
    const demoCheckout = params.get('demo-checkout');
    const isE2Harness =
      (demoState && (DEMO_STATES as readonly string[]).includes(demoState)) ||
      demoCheckout === 'available' ||
      demoCheckout === 'unavailable';

    if (isE2Harness) {
      const header = document.createElement('header');
      const brand = document.createElement('h1');
      brand.textContent = t('app.title');
      header.appendChild(brand);
      const main = document.createElement('main');
      if (demoState && (DEMO_STATES as readonly string[]).includes(demoState)) {
        const section = document.createElement('div');
        section.innerHTML = renderOrderView({
          state: demoState as OrderViewModel['state'],
          buyerTotalFcfa: 12_500,
          amountDueAtDeliveryFcfa: 11_500, // §5.4 baseline under Option B
        });
        main.append(section);
      }
      // WO-2.5: two-option checkout demo (§6.1) — amounts are the §5.4 baseline
      // split written by the pinned waterfall (A: 12,500/0 · B: 1,000/11,500).
      if (demoCheckout === 'available' || demoCheckout === 'unavailable') {
        const section = document.createElement('div');
        section.innerHTML = renderCheckoutOptions({
          buyerTotalFcfa: 12_500,
          optionA: { payNowFcfa: 12_500, dueAtDoorFcfa: 0 },
          optionB:
            demoCheckout === 'available'
              ? { available: true, payNowFcfa: 1_000, dueAtDoorFcfa: 11_500 }
              : { available: false },
        });
        main.append(section);
      }
      app.append(header, main);
    } else {
      // WO-7.2a — S3 DÉCOUVERTE is the root (« root » entry, founder-ruled) and
      // the /boutiques path. The store directory owns the screen (its own
      // « LES BOUTIQUES » title — no separate brand bar, per the mockup). The
      // ?demo-boutiques=<state> harness drives the six states for the gallery.
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
}
