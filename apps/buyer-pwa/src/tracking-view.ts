import { t } from './i18n';
import { FCFA, esc } from './format';
import { ORDER_ACTION_SURFACE } from './order-view';

/**
 * WO-4.4 §6.2 — CONFIRMATION + TRACKING. The timeline is COARSE and honest:
 * named steps, « jamais un point GPS vif » (plan SP4.1: "Responsible next
 * party; masked relay; no exact rider tracking"). The problem path carries
 * EQUAL prominence at every decision moment (SP-I10; the existing
 * ORDER_ACTION_SURFACE weight class is reused, not re-invented). The drop
 * code appears ONLY at the handoff moment — §6.3 (quoted): "the buyer enters
 * the drop code last, after any door payment is provider-confirmed" — and is
 * framed as the buyer's proof (« c'est votre preuve »).
 */

export const TRACKING_STEPS = [
  'confirmee',
  'preparee',
  'scellee',
  'en_route',
  'porte',
  'livree',
] as const;
export type TrackingStep = (typeof TRACKING_STEPS)[number];

export interface TrackingViewModel {
  step: TrackingStep;
  /** Option B only: the product leg due at the door (display, not computed). */
  amountDueAtDoorFcfa?: number | undefined;
  /** Option B at the door: the buyer paid; the operator has not confirmed
   * yet — the rider keeps the sealed parcel; the code stays hidden. */
  doorPaymentPending?: boolean | undefined;
  /** Set ONLY at handoff: acceptance done + every due leg provider-confirmed. */
  dropCode?: string | undefined;
}

function timeline(current: TrackingStep): string {
  const currentIndex = TRACKING_STEPS.indexOf(current);
  const rows = TRACKING_STEPS.map((step, index) => {
    const state = index < currentIndex ? 'done' : index === currentIndex ? 'now' : 'later';
    return [
      `<li class="timeline-step timeline-${state}" data-step="${step}">`,
      '<span class="timeline-dot" aria-hidden="true"></span>',
      `<span>${t(`suivi.etat.${step}`)}</span>`,
      '</li>',
    ].join('');
  }).join('');
  return `<ol class="timeline">${rows}</ol>`;
}

function doorBlock(model: TrackingViewModel): string {
  const due = model.amountDueAtDoorFcfa;
  if (model.doorPaymentPending) {
    // Provider truth only: paid-at-door is PENDING until the operator says so.
    return [
      '<div class="door-block" data-door="pending">',
      `<p class="status-chip status-pending">${t('suivi.porte.paiement_attente')}</p>`,
      `<p class="quiet-line">${t('suivi.porte.colis_scelle')}</p>`,
      '</div>',
    ].join('');
  }
  return [
    '<div class="door-block" data-door="inspection">',
    `<h3>${t('suivi.porte.inspectez')}</h3>`,
    `<p>${t('suivi.porte.verifiez')}</p>`,
    due !== undefined
      ? `<p class="fcfa-line"><span>${t('suivi.porte.du_label')}</span> <strong class="fcfa-figure-inline">${FCFA.format(due)} F</strong></p>`
      : '',
    // SP-I10: accepting and reporting share ONE weight class, ONE row.
    `<div class="action-row">`,
    `<button class="action ${ORDER_ACTION_SURFACE.weightClass}" data-key="order.action.confirm_receipt">${t('order.action.confirm_receipt')}</button>`,
    `<button class="action ${ORDER_ACTION_SURFACE.weightClass}" data-key="order.action.report_problem">${t('order.action.report_problem')}</button>`,
    '</div>',
    '</div>',
  ].join('');
}

function dropCodeBlock(code: string): string {
  return [
    '<div class="code-box" data-role="drop-code">',
    `<p class="field-label">${t('suivi.code.donnez')}</p>`,
    `<p class="code-figure">${esc(code)}</p>`,
    `<p class="quiet-line">${t('suivi.code.preuve')}</p>`,
    '</div>',
  ].join('');
}

export function renderTracking(model: TrackingViewModel): string {
  const parts: string[] = [
    '<section class="tracking" data-screen="suivi">',
    `<h2>${t('suivi.titre')}</h2>`,
    `<p class="quiet-line">${t('suivi.honnete')}</p>`,
    timeline(model.step),
  ];
  if (model.step === 'porte') {
    if (model.dropCode !== undefined && !model.doorPaymentPending) {
      parts.push(dropCodeBlock(model.dropCode));
    } else {
      parts.push(doorBlock(model));
    }
  }
  if (model.step === 'livree') {
    parts.push(`<p class="status-chip status-ok">${t('suivi.livree_merci')}</p>`);
  }
  // The problem path never disappears — reachable on every tracking screen.
  parts.push(
    `<button class="link-quiet" data-key="order.action.report_problem" data-action="souci">${t('suivi.un_souci')}</button>`,
    `<button class="link-quiet" data-action="protections">${t('protections.ouvrir')}</button>`,
    '</section>',
  );
  return parts.join('');
}
