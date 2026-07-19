import { t } from './i18n';

/**
 * BUYER ORDER VIEW (WO-2.3; plan M4 "problem path equal"). Honest states for
 * the E2 failure paths, with RUTHLESSLY EQUAL prominence where the spec
 * demands it: retry/abandon after a payment failure, and confirm-receipt /
 * report-a-problem on a delivered order, are rendered with the SAME weight
 * class inside the SAME action row — no primary/secondary split, no size
 * split, no color demotion. The descriptor below is the testable contract
 * (the component test and the prominence gate assert against it and the
 * rendered DOM).
 */

export const ORDER_ACTION_SURFACE = {
  surface: 'order-view',
  weightClass: 'action-equal',
  equalPairs: [
    ['order.action.retry', 'order.action.abandon'],
    ['order.action.confirm_receipt', 'order.action.report_problem'],
  ],
} as const;

export interface OrderViewModel {
  state:
    | 'payment_failed'
    | 'cancelled'
    | 'confirmed'
    | 'paid_cancel_refused'
    | 'door_pending'
    | 'door_paid';
  buyerTotalFcfa: number;
  /** Option-B tracking (WO-2.5): the product amount still due at the door. */
  amountDueAtDeliveryFcfa?: number;
}

const FCFA = new Intl.NumberFormat('fr-FR');

function actionButton(key: string): string {
  return `<button class="action ${ORDER_ACTION_SURFACE.weightClass}" data-key="${key}">${t(key)}</button>`;
}

function actionRow(pair: readonly [string, string]): string {
  return `<div class="action-row">${actionButton(pair[0])}${actionButton(pair[1])}</div>`;
}

export function renderOrderView(model: OrderViewModel): string {
  const amount = `<p class="fcfa-figure">${FCFA.format(model.buyerTotalFcfa)} FCFA</p>`;
  switch (model.state) {
    case 'payment_failed':
      return [
        `<section class="order-view" data-state="payment_failed">`,
        `<h2>${t('order.payment_failed.title')}</h2>`,
        amount,
        `<p>${t('order.payment_failed.body')}</p>`,
        actionRow(ORDER_ACTION_SURFACE.equalPairs[0]),
        `</section>`,
      ].join('');
    case 'cancelled':
      return [
        `<section class="order-view" data-state="cancelled">`,
        `<h2>${t('order.cancelled.title')}</h2>`,
        `<p>${t('order.cancelled.body')}</p>`,
        `</section>`,
      ].join('');
    case 'paid_cancel_refused':
      return [
        `<section class="order-view" data-state="paid_cancel_refused">`,
        `<h2>${t('order.view.heading')}</h2>`,
        amount,
        `<p>${t('order.paid_cancel_refused.body')}</p>`,
        actionRow(ORDER_ACTION_SURFACE.equalPairs[1]),
        `</section>`,
      ].join('');
    case 'confirmed':
      return [
        `<section class="order-view" data-state="confirmed">`,
        `<h2>${t('order.view.heading')}</h2>`,
        amount,
        actionRow(ORDER_ACTION_SURFACE.equalPairs[1]),
        `</section>`,
      ].join('');
    // WO-2.5 Option-B tracking: both amounts explicit and honest — what was
    // already paid, and the product figure due at the door (register:money).
    case 'door_pending': {
      const due = `<p class="fcfa-figure">${FCFA.format(model.amountDueAtDeliveryFcfa ?? 0)} FCFA</p>`;
      return [
        `<section class="order-view" data-state="door_pending">`,
        `<h2>${t('order.view.heading')}</h2>`,
        `<p>${t('order.door_pending.fee_paid')}</p>`,
        due,
        `<p>${t('order.door_pending.next')}</p>`,
        `</section>`,
      ].join('');
    }
    case 'door_paid':
      return [
        `<section class="order-view" data-state="door_paid">`,
        `<h2>${t('order.view.heading')}</h2>`,
        `<p>${t('order.door_paid.body')}</p>`,
        `</section>`,
      ].join('');
  }
}
