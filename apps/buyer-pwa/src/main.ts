import { shopPlusTheme as theme } from '@platform/ui-tokens';
import { t } from './i18n';
import { renderOrderView, type OrderViewModel } from './order-view';

/**
 * SP0.1 buyer PWA shell: one sparse page, entirely on ui-tokens (shop-plus
 * theme) and catalog strings. Buyer surface = lightweight web, no install.
 * The discovery placeholder is store-first by construction (SP-I05) and the
 * empty state is an honest, designed state. Sparse ≠ ugly.
 */

const root = document.documentElement;
root.style.setProperty('--surface', theme.colors.surface);
root.style.setProperty('--surface-raised', theme.colors.surfaceRaised);
root.style.setProperty('--ink', theme.colors.ink);
root.style.setProperty('--ink-muted', theme.colors.inkMuted);
root.style.setProperty('--line', theme.colors.line);
root.style.setProperty('--primary', theme.colors.primary);
root.style.setProperty('--space-lg', `${theme.spacing.lg}px`);
root.style.setProperty('--space-xl', `${theme.spacing.xl}px`);
root.style.setProperty('--radius-lg', `${theme.radius.lg}px`);
root.style.setProperty('--type-title', `${theme.typeScale.title.size}px`);
root.style.setProperty('--type-heading', `${theme.typeScale.heading.size}px`);
root.style.setProperty('--type-body', `${theme.typeScale.bodyLarge.size}px`);

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
  .fcfa-figure { margin: 0; font-size: var(--type-title); font-weight: 700; }
  /* EQUAL PROMINENCE (M4): one shared weight class, one shared row — the
     problem/abandon side is never smaller, dimmer, or demoted. */
  .action-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-lg); }
  .action.action-equal {
    min-height: 48px;
    border: 1px solid var(--primary);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    color: var(--ink);
    font-size: var(--type-body);
    font-weight: 600;
  }
`;
document.head.appendChild(style);

const app = document.querySelector('#app');
if (app) {
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
  const demoState = new URLSearchParams(window.location.search).get('demo-order');
  const DEMO_STATES: ReadonlyArray<OrderViewModel['state']> = [
    'payment_failed', 'cancelled', 'confirmed', 'paid_cancel_refused',
  ];
  if (demoState && (DEMO_STATES as readonly string[]).includes(demoState)) {
    const section = document.createElement('div');
    section.innerHTML = renderOrderView({ state: demoState as OrderViewModel['state'], buyerTotalFcfa: 12_500 });
    main.append(section);
  }

  app.append(header, main);
}
