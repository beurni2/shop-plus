import { t, tf } from './i18n';
import { FCFA, esc } from './format';

/**
 * WO-4.4 §6.2 — DELIVERY: Séra's quote is the ONLY price authority for D
 * (plan guardrail: "delivery outside fee bases"; Ten Laws: no app computes
 * another domain's amounts). This view DISPLAYS a quote table — demo rows
 * standing in for Séra's `DeliveryFeeQuote` — it computes nothing. The D
 * line is separate and honest on every later money surface.
 */

export interface DeliveryOption {
  id: string;
  labelKey: string;
  feeFcfa: number;
}

/** Demo quote — the shape Séra's DeliveryFeeQuote will fill; amounts are the
 * §5.4 baseline D and a demo express row, NOT computed here. */
export const DEMO_SERA_QUOTE: readonly DeliveryOption[] = [
  { id: 'standard', labelKey: 'livraison.standard', feeFcfa: 1_000 },
  { id: 'express', labelKey: 'livraison.express', feeFcfa: 1_500 },
];

export interface DeliveryViewModel {
  options: readonly DeliveryOption[];
  selectedId: string;
}

export function renderDeliveryQuote(model: DeliveryViewModel): string {
  const selected = model.options.find((o) => o.id === model.selectedId) ?? model.options[0]!;
  const rows = model.options
    .map((option) =>
      [
        // r② (WO-5.3): esc() the interpolated attribute — option.id is a
        // constant today, but nothing model-derived reaches an attribute raw.
        `<button class="quote-row${option.id === model.selectedId ? ' quote-row-on' : ''}" data-delivery="${esc(option.id)}">`,
        `<span class="quote-label">${t(option.labelKey)}</span>`,
        `<strong class="fcfa-figure-inline">${FCFA.format(option.feeFcfa)} F</strong>`,
        '</button>',
      ].join(''),
    )
    .join('');
  return [
    '<section class="delivery-quote" data-screen="livraison">',
    `<p class="step-line">${t('etape.livraison')}</p>`,
    `<h2>${t('livraison.titre')}</h2>`,
    `<p class="quiet-line">${t('livraison.autorite')}</p>`,
    `<div class="quote-table">${rows}</div>`,
    `<p class="quiet-line">${t('livraison.a_part')}</p>`,
    `<button class="primary-action" data-action="livraison-continuer">${tf('livraison.choisir', { amount: FCFA.format(selected.feeFcfa) })}</button>`,
    '</section>',
  ].join('');
}
