import { t } from './i18n';

/**
 * WO-4.4 §6.3 — « Vos protections », the buyer's bill of rights: one compact,
 * calm sheet (register:money), reachable from the product page and from
 * tracking. Sources are the spec's own rules — §6.1 (payment protected with
 * the partner; delivery fee non-refundable on cancel/absence), §6.2
 * (verify-before-accepting; justified refusal protected), §6.3 (the drop
 * code enters last — it is the buyer's proof), and the masked relay. The
 * refusal path is stated as a RIGHT, with the same dignity as the purchase.
 */

const PROTECTION_KEYS = [
  'protections.verifier',
  'protections.refus',
  'protections.paiement',
  'protections.frais',
  'protections.code',
  'protections.especes',
  'protections.numero',
] as const;

export function renderProtections(): string {
  const rows = PROTECTION_KEYS.map(
    (key) => `<li class="protection-row">${t(key)}</li>`,
  ).join('');
  return [
    '<section class="protections-sheet" data-screen="protections" role="dialog" aria-label="' +
      t('protections.titre') +
      '">',
    `<h2>${t('protections.titre')}</h2>`,
    `<ul class="protections-list">${rows}</ul>`,
    `<button class="primary-action" data-action="protections-fermer">${t('protections.fermer')}</button>`,
    '</section>',
  ].join('');
}
