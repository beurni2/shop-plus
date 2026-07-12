import { shopPlusTheme as theme, money } from '@platform/ui-tokens';
import { t } from './i18n';
import { renderOrderView, type OrderViewModel } from './order-view';
import { renderCheckoutOptions } from './checkout-view';
import { createJourney, JOURNEY_SCREENS, type JourneyScreen } from './journey';

/**
 * The buyer PWA shell. SP0.1 (discovery shell) + the E2 demo harness
 * (?demo-order / ?demo-checkout — byte-behavior preserved) + WO-4.4: the
 * walkable §6.2 buyer journey (?demo-journey=<screen>), full-screen — the
 * 5-second test owns the viewport. Everything visual rides the ui-tokens
 * shop-plus theme through CSS custom properties; the style sheet below
 * carries NO hardcoded color and no dimension outside the token vars (the
 * scan test proves it; 1px hairlines are the documented interim, like the
 * kit's accepted literals under the v0.7.0 interaction-token docket).
 */

const root = document.documentElement;
root.style.setProperty('--surface', theme.colors.surface);
root.style.setProperty('--surface-raised', theme.colors.surfaceRaised);
root.style.setProperty('--surface-sunken', theme.colors.surfaceSunken);
root.style.setProperty('--ink', theme.colors.ink);
root.style.setProperty('--ink-muted', theme.colors.inkMuted);
root.style.setProperty('--ink-faint', theme.colors.inkFaint);
root.style.setProperty('--line', theme.colors.line);
root.style.setProperty('--primary', theme.colors.primary);
root.style.setProperty('--primary-strong', theme.colors.primaryStrong);
root.style.setProperty('--primary-soft', theme.colors.primarySoft);
root.style.setProperty('--on-primary', theme.colors.onPrimary);
root.style.setProperty('--verified', theme.colors.verifiedBadge);
root.style.setProperty('--success', theme.colors.success);
root.style.setProperty('--warning', theme.colors.warning);
root.style.setProperty('--info', theme.colors.info);
root.style.setProperty('--space-xs', `${theme.spacing.xs}px`);
root.style.setProperty('--space-sm', `${theme.spacing.sm}px`);
root.style.setProperty('--space-md', `${theme.spacing.md}px`);
root.style.setProperty('--space-lg', `${theme.spacing.lg}px`);
root.style.setProperty('--space-xl', `${theme.spacing.xl}px`);
root.style.setProperty('--radius-md', `${theme.radius.md}px`);
root.style.setProperty('--radius-lg', `${theme.radius.lg}px`);
root.style.setProperty('--radius-pill', `${theme.radius.pill}px`);
root.style.setProperty('--type-title', `${theme.typeScale.title.size}px`);
root.style.setProperty('--type-heading', `${theme.typeScale.heading.size}px`);
root.style.setProperty('--type-body', `${theme.typeScale.bodyLarge.size}px`);
root.style.setProperty('--type-body-line', `${theme.typeScale.bodyLarge.lineHeight}px`);
root.style.setProperty('--type-label', `${theme.typeScale.label.size}px`);
root.style.setProperty('--type-caption', `${theme.typeScale.caption.size}px`);
root.style.setProperty('--money-hero', `${money.amountScale.hero.size}px`);
root.style.setProperty('--money-hero-line', `${money.amountScale.hero.lineHeight}px`);
root.style.setProperty('--touch-min', `${theme.touch.minTargetPx}px`);
root.style.setProperty('--motion-standard', `${theme.motion.standard.durationMs}ms`);
root.style.setProperty('--icon-size', `${theme.spacing.xl}px`);

const style = document.createElement('style');
style.textContent = `
  body {
    margin: 0;
    background: var(--surface);
    color: var(--ink);
    font-family: system-ui, sans-serif;
  }
  header {
    padding: var(--space-lg) var(--space-xl);
    border-bottom: 1px solid var(--line);
  }
  h1 {
    margin: 0;
    color: var(--primary);
    font-size: var(--type-title);
    font-weight: ${theme.typeScale.title.weight};
  }
  main {
    padding: var(--space-xl);
    display: grid;
    gap: var(--space-lg);
  }
  h2 {
    margin: 0;
    font-size: var(--type-heading);
    font-weight: ${theme.typeScale.heading.weight};
  }
  .empty-state {
    background: var(--surface-raised);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: var(--space-xl);
    color: var(--ink-muted);
    font-size: var(--type-body);
  }
  .order-view { display: grid; gap: var(--space-lg); }
  .fcfa-figure { margin: 0; font-size: var(--type-title); font-weight: ${money.amountScale.display.weight}; font-variant-numeric: tabular-nums; }
  /* EQUAL PROMINENCE (M4): one shared weight class, one shared row — the
     problem/abandon side is never smaller, dimmer, or demoted. */
  .action-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-lg); }
  .action.action-equal {
    min-height: var(--touch-min);
    border: 1px solid var(--primary);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    color: var(--ink);
    font-size: var(--type-body);
    font-weight: ${theme.typeScale.heading.weight};
  }
  /* WO-2.5 two-option checkout (§6.1): calm cards, bold FCFA lines, the
     unavailable state designed — dignified, never an error wall. */
  .checkout-view { display: grid; gap: var(--space-lg); }
  .checkout-option {
    background: var(--surface-raised);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    display: grid;
    gap: var(--space-lg);
  }
  .checkout-option h3 { margin: 0; font-size: var(--type-body); font-weight: ${theme.typeScale.title.weight}; display: flex; align-items: center; gap: var(--space-sm); }
  .fcfa-line { margin: 0; font-size: var(--type-body); display: flex; justify-content: space-between; gap: var(--space-sm); }
  .fcfa-figure-inline { font-weight: ${theme.typeScale.title.weight}; font-variant-numeric: tabular-nums; }
  .fee-warning, .option-summary, .replay-line { margin: 0; font-size: var(--type-body); }
  .checkout-option-unavailable { color: var(--ink-muted); }
  /* WO-4.4 — the journey layer. Icons are paired with text, sized by token. */
  .option-icon { width: var(--icon-size); height: var(--icon-size); color: var(--primary); flex: none; }
  .listen-icon { width: var(--space-lg); height: var(--space-lg); color: var(--primary); flex: none; }
  .audio-note {
    display: flex; align-items: center; gap: var(--space-sm);
    margin: 0; font-size: var(--type-label); color: var(--ink);
    background: var(--primary-soft); border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md); min-height: var(--touch-min);
  }
  .audio-note-pending { color: var(--ink-muted); }
  .journey-screen > section, .journey-screen > div { display: grid; gap: var(--space-lg); }
  @media (prefers-reduced-motion: no-preference) {
    .journey-screen { animation: screen-in var(--motion-standard) cubic-bezier(0.2, 0.9, 0.3, 1); }
    @keyframes screen-in { from { opacity: 0; transform: translateY(var(--space-sm)); } }
  }
  .product-photo {
    position: relative; border-radius: var(--radius-lg); overflow: hidden;
    border: 1px solid var(--line); background: var(--surface-sunken);
    aspect-ratio: 4 / 3;
  }
  .product-photo svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .product-photo-initial {
    position: absolute; inset: 0; display: grid; place-items: center;
    font-size: var(--money-hero); font-weight: ${money.amountScale.hero.weight};
    color: var(--primary-strong);
  }
  .reseller-line { margin: 0; font-size: var(--type-body); display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; }
  .reseller-name { font-weight: ${theme.typeScale.heading.weight}; }
  .verified-badge {
    color: var(--verified); font-size: var(--type-label);
    font-weight: ${theme.typeScale.label.weight};
    background: var(--surface-raised); border: 1px solid var(--line);
    border-radius: var(--radius-pill); padding: var(--space-xs) var(--space-md);
  }
  .product-name { font-size: var(--type-heading); }
  /* « L'argent en majesté » — the buyer's price is the hero of the page. */
  .fcfa-hero {
    margin: 0; font-size: var(--money-hero); line-height: var(--money-hero-line);
    font-weight: ${money.amountScale.hero.weight}; font-variant-numeric: tabular-nums;
  }
  .trust-row { display: flex; gap: var(--space-sm); flex-wrap: wrap; }
  .trust-chip {
    font-size: var(--type-label); font-weight: ${theme.typeScale.label.weight};
    color: var(--primary-strong); background: var(--primary-soft);
    border-radius: var(--radius-pill); padding: var(--space-sm) var(--space-md);
  }
  .primary-action {
    min-height: var(--touch-min); border: 0; border-radius: var(--radius-lg);
    background: var(--primary); color: var(--on-primary);
    font-size: var(--type-body); font-weight: ${theme.typeScale.heading.weight};
    padding: var(--space-md) var(--space-lg);
    transition: background var(--motion-standard);
  }
  .primary-action:active { background: var(--primary-strong); }
  .secondary-action {
    min-height: var(--touch-min); border: 1px solid var(--primary);
    border-radius: var(--radius-lg); background: var(--surface-raised);
    color: var(--primary-strong); font-size: var(--type-body);
    font-weight: ${theme.typeScale.heading.weight}; padding: var(--space-md) var(--space-lg);
  }
  .link-quiet {
    border: 0; background: none; color: var(--ink-muted);
    font-size: var(--type-label); text-decoration: underline;
    min-height: var(--touch-min); text-align: left; padding: 0;
  }
  .back-step { display: block; padding: var(--space-md) var(--space-xs); }
  .step-line { margin: 0; color: var(--ink-faint); font-size: var(--type-label); font-weight: ${theme.typeScale.label.weight}; }
  .field { display: grid; gap: var(--space-xs); }
  .field-label { margin: 0; font-size: var(--type-label); font-weight: ${theme.typeScale.label.weight}; color: var(--ink-muted); }
  .field input {
    min-height: var(--touch-min); border: 1px solid var(--line);
    border-radius: var(--radius-md); background: var(--surface-raised);
    color: var(--ink); font-size: var(--type-body); padding: var(--space-sm) var(--space-md);
  }
  .chips { display: flex; gap: var(--space-sm); flex-wrap: wrap; }
  .chip {
    min-height: var(--touch-min); border: 1px solid var(--line);
    border-radius: var(--radius-pill); background: var(--surface-raised);
    color: var(--ink); font-size: var(--type-body); padding: var(--space-sm) var(--space-lg);
  }
  .chip-on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-strong); font-weight: ${theme.typeScale.heading.weight}; }
  .quiet-line { margin: 0; color: var(--ink-muted); font-size: var(--type-label); line-height: var(--type-body-line); }
  .voice-note { display: grid; gap: var(--space-sm); background: var(--surface-raised); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: var(--space-lg); }
  .status-chip {
    margin: 0; display: inline-flex; align-items: center; gap: var(--space-sm);
    font-size: var(--type-label); font-weight: ${theme.typeScale.label.weight};
    border-radius: var(--radius-pill); padding: var(--space-sm) var(--space-md);
    justify-self: start;
  }
  .status-chip::before { content: ''; width: var(--space-sm); height: var(--space-sm); border-radius: var(--radius-pill); background: currentColor; }
  .status-ok { color: var(--success); background: var(--surface-raised); border: 1px solid var(--line); }
  .status-pending { color: var(--warning); background: var(--surface-raised); border: 1px solid var(--line); }
  .status-info { color: var(--info); background: var(--surface-raised); border: 1px solid var(--line); }
  .status-muted { color: var(--ink-muted); background: var(--surface-raised); border: 1px solid var(--line); }
  .quote-table { display: grid; gap: var(--space-sm); }
  .quote-row {
    min-height: var(--touch-min); display: flex; justify-content: space-between; align-items: center;
    gap: var(--space-sm); border: 1px solid var(--line); border-radius: var(--radius-lg);
    background: var(--surface-raised); color: var(--ink); font-size: var(--type-body);
    padding: var(--space-md) var(--space-lg); text-align: left;
  }
  .quote-row-on { border-color: var(--primary); background: var(--primary-soft); }
  .timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-md); }
  .timeline-step { display: flex; align-items: center; gap: var(--space-md); font-size: var(--type-body); }
  .timeline-dot { width: var(--space-md); height: var(--space-md); border-radius: var(--radius-pill); background: var(--line); flex: none; }
  .timeline-done { color: var(--ink-muted); }
  .timeline-done .timeline-dot { background: var(--success); }
  .timeline-now { font-weight: ${theme.typeScale.heading.weight}; }
  .timeline-now .timeline-dot { background: var(--primary); }
  .timeline-later { color: var(--ink-faint); }
  .door-block, .code-box {
    display: grid; gap: var(--space-md); background: var(--surface-raised);
    border: 1px solid var(--line); border-radius: var(--radius-lg); padding: var(--space-lg);
  }
  .door-block h3 { margin: 0; font-size: var(--type-body); font-weight: ${theme.typeScale.title.weight}; }
  .door-block p { margin: 0; font-size: var(--type-body); }
  .code-box { border-color: var(--primary); text-align: center; justify-items: center; }
  .code-figure {
    margin: 0; font-size: var(--money-hero); line-height: var(--money-hero-line);
    font-weight: ${money.amountScale.hero.weight}; font-variant-numeric: tabular-nums;
    letter-spacing: var(--space-sm); color: var(--primary-strong);
  }
  .protections-sheet {
    background: var(--surface-raised); border: 1px solid var(--line);
    border-radius: var(--radius-lg); padding: var(--space-xl); display: grid; gap: var(--space-lg);
  }
  .protections-list { margin: 0; padding: 0 0 0 var(--space-lg); display: grid; gap: var(--space-md); font-size: var(--type-body); line-height: var(--type-body-line); }
  .protection-row { margin: 0; }
  .offline-banner {
    margin: 0; background: var(--surface-sunken); color: var(--ink-muted);
    font-size: var(--type-label); font-weight: ${theme.typeScale.label.weight};
    border-radius: var(--radius-md); padding: var(--space-sm) var(--space-md);
  }
  .sandbox-ribbon {
    margin: 0; background: var(--primary-soft); color: var(--primary-strong);
    font-size: var(--type-label); font-weight: ${theme.typeScale.label.weight};
    text-align: center; padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--line);
  }
  .tracking p { margin: 0; }
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

  // WO-4.4 — the walkable journey owns the whole viewport (5-second test).
  if (journeyScreen && (JOURNEY_SCREENS as readonly string[]).includes(journeyScreen)) {
    const main = document.createElement('main');
    createJourney(main, {
      screen: journeyScreen as JourneyScreen,
      trackingEtat: params.get('etat') ?? undefined,
      voix: params.get('voix') ?? undefined,
    });
    app.append(main);
  } else {
    const header = document.createElement('header');
    const brand = document.createElement('h1');
    brand.textContent = t('app.title');
    header.appendChild(brand);

    const main = document.createElement('main');
    const heading = document.createElement('h2');
    heading.textContent = t('discover.heading');
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = t('discover.empty_state');
    main.append(heading, empty);

    // E2 order-view demo surface (no backend at E2): the Playwright harness
    // drives ?demo-order=<state> to exercise the honest failure states.
    const demoState = params.get('demo-order');
    const DEMO_STATES: ReadonlyArray<OrderViewModel['state']> = [
      'payment_failed', 'cancelled', 'confirmed', 'paid_cancel_refused',
      'door_pending', 'door_paid',
    ];
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
    const demoCheckout = params.get('demo-checkout');
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
  }
}
