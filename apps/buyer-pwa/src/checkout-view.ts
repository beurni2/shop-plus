import { t, tf } from './i18n';
import { FCFA } from './format';
import { lockIcon, scooterIcon } from './icons';
import { renderAudioNote } from './audio-note';

/**
 * TWO-OPTION CHECKOUT (WO-2.5; Build Spec §6.1). Both options shown; A is
 * labeled « recommandé »; before choosing, the buyer sees the two bold
 * amount lines per option — what's paid NOW and what's due AT THE DOOR —
 * with the total stated once. The replay line states both figures again
 * before payment. No « séquestre » anywhere (copy-lint enforced). When the
 * §6.1 gate refuses Option B, the refusal is a designed, dignified state —
 * one honest line, never an error wall.
 * WO-4.4 absorption — the carried §6.1 items land here: the lock (A) and
 * scooter (B) icons, paired with the option titles, and the per-option
 * audio note player (founder asset pending — honest placeholder).
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

  return [
    `<section class="checkout-view">`,
    `<h2>${t('checkout.heading')}</h2>`,
    `<p class="fcfa-figure">${FCFA.format(model.buyerTotalFcfa)} F CFA</p>`,
    optionA,
    optionB,
    `</section>`,
  ].join('');
}
