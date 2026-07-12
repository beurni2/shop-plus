import { t, tf } from './i18n';
import { FCFA } from './format';
import { lockIcon, scooterIcon } from './icons';
import { renderAudioNote } from './audio-note';

/**
 * TWO-OPTION CHECKOUT (WO-2.5; Build Spec §6.1) — restyled Grand Teint
 * (WO-5.3). Both options shown; A is labeled « recommandé »; before choosing,
 * the buyer sees the two bold amount lines per option — what's paid NOW and
 * what's due AT THE DOOR — with the total stated once and the RECONCILE LINE
 * restating the sum (« L'argent en majesté »: 12 500 = 11 500 + 1 000 —
 * chaque franc a sa place). The replay line states both figures again before
 * payment. No « séquestre » anywhere (copy-lint enforced). When the §6.1 gate
 * refuses Option B, the refusal is a designed, dignified state — one honest
 * line, never an error wall. The lock (A) and scooter (B) canon icons ride
 * the option titles; the per-option audio note is an honest placeholder
 * (founder recording pending).
 */

export interface CheckoutViewModel {
  buyerTotalFcfa: number;
  /** Option A (FULL_PREPAY): everything now. */
  optionA: { payNowFcfa: number; dueAtDoorFcfa: 0 };
  /** Option B split (from the pinned waterfall) — absent when ineligible. */
  optionB:
    | { available: true; payNowFcfa: number; dueAtDoorFcfa: number }
    | { available: false };
}

function amountLines(payNow: number, dueAtDoor: number): string {
  return [
    `<p class="fcfa-line"><span>${t('checkout.pay_now_label')}</span> <strong class="fcfa-figure-inline">${FCFA.format(payNow)} F</strong></p>`,
    `<p class="fcfa-line"><span>${t('checkout.pay_at_door_label')}</span> <strong class="fcfa-figure-inline">${FCFA.format(dueAtDoor)} F</strong></p>`,
  ].join('');
}

/** The reconcile line (GRAND-TEINT §2.2) — a component, not a nicety: the
 * order total restated as product + delivery, to the franc. Rendered when the
 * split is available (Option B carries product = due-at-door, delivery =
 * pay-now); the same sum underlies Option A. */
function reconcileLine(total: number, product: number, delivery: number): string {
  return `<p class="reconcile-line" data-role="reconcile">${tf('checkout.reconcile', {
    total: FCFA.format(total),
    produit: FCFA.format(product),
    livraison: FCFA.format(delivery),
  })}</p>`;
}

export function renderCheckoutOptions(model: CheckoutViewModel): string {
  const optionA = [
    `<article class="checkout-option" data-option="full-prepay">`,
    `<h3><span class="option-icon-slot" data-icon="cadenas">${lockIcon()}</span>${t('checkout.option_a.title')}</h3>`,
    amountLines(model.optionA.payNowFcfa, model.optionA.dueAtDoorFcfa),
    `<p>${t('checkout.option_a.body')}</p>`,
    renderAudioNote('checkout_option_a'),
    `<button class="action action-equal" data-key="checkout.option_a.choose">${t('checkout.option_a.choose')}</button>`,
    `</article>`,
  ].join('');

  const optionB = model.optionB.available
    ? [
        `<article class="checkout-option" data-option="pay-at-door">`,
        `<h3><span class="option-icon-slot" data-icon="moto">${scooterIcon()}</span>${t('checkout.option_b.title')}</h3>`,
        amountLines(model.optionB.payNowFcfa, model.optionB.dueAtDoorFcfa),
        `<p class="option-summary">${tf('checkout.option_b.summary', { amount: FCFA.format(model.optionB.dueAtDoorFcfa) })}</p>`,
        `<p>${tf('checkout.option_b.body', { amount: FCFA.format(model.optionB.payNowFcfa) })}</p>`,
        `<p class="fee-warning">${t('checkout.option_b.fee_warning')}</p>`,
        `<p class="replay-line">${tf('checkout.replay', {
          now: FCFA.format(model.optionB.payNowFcfa),
          door: FCFA.format(model.optionB.dueAtDoorFcfa),
        })}</p>`,
        renderAudioNote('checkout_option_b'),
        `<button class="action action-equal" data-key="checkout.option_b.choose">${t('checkout.option_b.choose')}</button>`,
        `</article>`,
      ].join('')
    : [
        `<article class="checkout-option checkout-option-unavailable" data-option="pay-at-door-unavailable">`,
        `<h3>${t('checkout.option_b.title')}</h3>`,
        `<p>${t('checkout.option_b.unavailable')}</p>`,
        `</article>`,
      ].join('');

  // The reconcile line restates the order sum on C5 (product + delivery = total).
  // Derivable from Option B's split; the same total underlies Option A.
  const reconcile = model.optionB.available
    ? reconcileLine(model.buyerTotalFcfa, model.optionB.dueAtDoorFcfa, model.optionB.payNowFcfa)
    : '';

  return [
    `<section class="checkout-view">`,
    `<h2>${t('checkout.heading')}</h2>`,
    `<p class="fcfa-figure">${FCFA.format(model.buyerTotalFcfa)} F CFA</p>`,
    reconcile,
    optionA,
    optionB,
    `</section>`,
  ].join('');
}
