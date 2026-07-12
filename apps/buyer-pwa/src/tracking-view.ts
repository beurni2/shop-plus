import { t } from './i18n';
import { FCFA, esc } from './format';
import { icon } from './icons';
import { ORDER_ACTION_SURFACE } from './order-view';

/**
 * WO-4.4 §6.2 / WO-5.3 (Grand Teint) — CONFIRMATION + TRACKING. The timeline
 * is COARSE and honest (GRAND-TEINT Timeline): done (ink dot + check),
 * current (primary ring + MAINTENANT chip), future (hairline) — « jamais un
 * point GPS vif » (plan SP4.1). The problem path carries EQUAL prominence at
 * every decision moment (SP-I10; the existing ORDER_ACTION_SURFACE weight
 * class is reused). The drop code (C9 DropCodeDisplay) appears ONLY at the
 * handoff moment — §6.3 (quoted): "the buyer enters the drop code last, after
 * any door payment is provider-confirmed" — behind a 2 px ink frame with
 * terracotta corner ticks, framed as the buyer's proof. While a door payment
 * is provider-PENDING the code area shows the HIDDEN lock (« ••• ••• » +
 * « jamais avant »), never the code — custody law.
 *
 * r① (WO-5.3): step 1's display string `suivi.etat.confirmee` is « Commande
 * enregistrée » (aligned to copy.md C7 and to the C6 confirmation title) so
 * the timeline tells the SAME honest « enregistrée » story as the
 * confirmation screen — step 1 never claims « confirmée » (more than C6 says).
 * The step ID `confirmee` (TRACKING_STEPS[0]) is unchanged — semantics stay.
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
    const dot =
      state === 'done'
        ? `<span class="timeline-dot" aria-hidden="true">${icon('coche', 'dot-check')}</span>`
        : '<span class="timeline-dot" aria-hidden="true"></span>';
    const nowChip = state === 'now' ? `<span class="now-chip">${t('suivi.maintenant')}</span>` : '';
    return [
      `<li class="timeline-step timeline-${state}" data-step="${step}">`,
      dot,
      `<span class="timeline-label">${t(`suivi.etat.${step}`)}</span>`,
      nowChip,
      '</li>',
    ].join('');
  }).join('');
  return `<ol class="timeline">${rows}</ol>`;
}

function doorBlock(model: TrackingViewModel): string {
  const due = model.amountDueAtDoorFcfa;
  if (model.doorPaymentPending) {
    // Provider truth only: paid-at-door is PENDING until the operator says so.
    // The C9 code area shows the HIDDEN lock — never the code, never a role
    // that a reader (or a test) could mistake for the revealed frame.
    return [
      '<div class="door-block" data-door="pending">',
      `<p class="status-chip status-pending"><span class="rec-dot" aria-hidden="true"></span>${t('suivi.porte.paiement_attente')}</p>`,
      `<p class="quiet-line">${t('suivi.porte.colis_scelle')}</p>`,
      '<div class="code-box code-box-locked" data-drop="locked">',
      icon('cadenas', 'code-lock-icon'),
      '<p class="code-figure code-figure-hidden" aria-hidden="true">••• •••</p>',
      `<p class="quiet-line">${t('suivi.code.attente')}</p>`,
      '</div>',
      '</div>',
    ].join('');
  }
  return [
    '<div class="door-block" data-door="inspection">',
    `<h3>${icon('oeil', 'block-icon')}<span>${t('suivi.porte.inspectez')}</span></h3>`,
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
    '<div class="code-frame">',
    '<span class="tick tick-tl code-tick" aria-hidden="true"></span>',
    '<span class="tick tick-tr code-tick" aria-hidden="true"></span>',
    '<span class="tick tick-bl code-tick" aria-hidden="true"></span>',
    '<span class="tick tick-br code-tick" aria-hidden="true"></span>',
    `<p class="code-figure">${esc(code)}</p>`,
    '</div>',
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
  // The problem path never disappears — reachable on every tracking screen,
  // at equal prominence (a bordered danger secondary, not a whisper).
  parts.push(
    '<div class="tracking-actions">',
    `<button class="secondary-action problem-path" data-key="order.action.report_problem" data-action="souci">${icon('alerte', 'btn-icon')}<span>${t('suivi.un_souci')}</span></button>`,
    `<button class="link-quiet" data-action="protections">${t('protections.ouvrir')}</button>`,
    '</div>',
    '</section>',
  );
  return parts.join('');
}
