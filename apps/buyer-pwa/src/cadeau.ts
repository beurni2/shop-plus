/**
 * ═══ LISTE-MERCI — THE GIFT-TRACKING PAGE (founder order, 2026-08-26) ═══
 *
 * « …and give him the option to track the delivery as well. » The liste's
 * creator holds no order, no buyer token and no stored record — only the
 * link the purchaser's WhatsApp message carried: `?cadeau={orderId}`. So
 * this page is a READ-ONLY view over the PUBLIC order projection: the
 * journey's status and the four delivery marks, spoken plainly.
 *
 * WHAT IT DELIBERATELY NEVER SHOWS, and cannot:
 *  · the remise code — buyer-token-gated on the service; this page holds no
 *    token, and the code belongs to the PURCHASER, who directed the delivery;
 *  · any amount — a gift's price on the recipient's screen would be poor
 *    taste and worse craft; the wire carries figures, this page renders none;
 *  · any contact, any economics — nothing beyond « where is it ».
 *
 * ONE read on land, « Actualiser » for the next — never a polling ladder: a
 * page a recipient may keep open all day must not spend her data by itself
 * (Ten Laws #7). Honest states for every non-answer.
 */

import { t } from './i18n';
import type { OrderOutcome, QuotePort, ServerOrder } from './cliente/quote-port';

/* The `.cd-*` rules live in main.ts's token-driven stylesheet, beside the
 * `.bq-*` family — this module renders MARKUP ONLY (the boutiques-view law,
 * held by the ui-scan: a top-level view module carries no colour, no px). */

/** The page's whole state — one small machine, every branch a designed screen. */
export type CadeauEtat =
  | { readonly etape: 'chargement' }
  | { readonly etape: 'hors-ligne' }
  | { readonly etape: 'introuvable' }
  | { readonly etape: 'suivi'; readonly commande: ServerOrder };

/** LISTE-CADEAUX — the exact facts the état line reads, named so the
 *  creator's « Mes cadeaux » sheet can reuse THIS law over its own wire
 *  (whose suivi carries exactly these keys) instead of growing a twin that
 *  could drift. A full ServerOrder satisfies it; nothing else changes. */
export type CadeauFacts = Pick<ServerOrder, 'state' | 'acceptedAt' | 'readyAt' | 'departedAt' | 'arrivedAt' | 'livree'>;

/**
 * WHICH SENTENCE IS TRUE — a pure decision over the server's own facts, so a
 * test can drive every rung. The marks outrank the state string (a mark is a
 * recorded fact; the state is a summary), and an order that is not yet
 * provider-confirmed says so rather than promising a préparation that has
 * not begun.
 */
export function ligneCadeau(commande: CadeauFacts): string {
  if (commande.livree === true) return t('cadeau.etat_livre');
  if (commande.arrivedAt !== undefined) return t('cadeau.etat_arrive');
  if (commande.departedAt !== undefined) return t('cadeau.etat_route');
  if (commande.readyAt !== undefined) return t('cadeau.etat_pret');
  if (commande.acceptedAt !== undefined || commande.state === 'confirmed') return t('cadeau.etat_preparation');
  return t('cadeau.pas_confirmee');
}

export function renderCadeau(etat: CadeauEtat): string {
  if (etat.etape === 'chargement') {
    return `<div class="cd-root"><div class="cd-carte"><div class="cd-titre">${t('cadeau.titre')}</div><div class="cd-texte">${t('cadeau.chargement')}</div></div></div>`;
  }
  if (etat.etape === 'hors-ligne' || etat.etape === 'introuvable') {
    return [
      '<div class="cd-root"><div class="cd-carte">',
      `<div class="cd-titre">${t('cadeau.titre')}</div>`,
      `<div class="cd-texte">${t(etat.etape === 'hors-ligne' ? 'cadeau.hors_ligne' : 'cadeau.introuvable')}</div>`,
      etat.etape === 'hors-ligne'
        ? `<button class="cd-actualiser" data-action="cadeau-actualiser">${t('cadeau.actualiser')}</button>`
        : '',
      '</div></div>',
    ].join('');
  }
  const c = etat.commande;
  const marque = (fait: boolean, label: string): string =>
    `<div class="cd-marque${fait ? ' cd-marque-faite' : ''}"><span class="cd-marque-point"></span><span>${label}</span></div>`;
  return [
    '<div class="cd-root"><div class="cd-carte" data-role="cadeau-suivi">',
    `<div class="cd-titre">${t('cadeau.titre')}</div>`,
    `<div class="cd-etat" data-role="cadeau-etat">${ligneCadeau(c)}</div>`,
    `<div class="cd-texte">${t('cadeau.explique')}</div>`,
    '<div class="cd-marques">',
    marque(c.acceptedAt !== undefined, t('cadeau.etat_preparation')),
    marque(c.readyAt !== undefined, t('cadeau.etat_pret')),
    marque(c.departedAt !== undefined, t('cadeau.etat_route')),
    marque(c.arrivedAt !== undefined || c.livree === true, t('cadeau.etat_arrive')),
    '</div>',
    `<button class="cd-actualiser" data-action="cadeau-actualiser">${t('cadeau.actualiser')}</button>`,
    '</div></div>',
  ].join('');
}

/** The one honest mapping from a port answer to a screen. */
export function etatDeLecture(r: OrderOutcome): CadeauEtat {
  if (r.status === 'order') return { etape: 'suivi', commande: r.order };
  if (r.status === 'unreachable') return { etape: 'hors-ligne' };
  // refused (unknown order) and unreadable both land on the honest
  // introuvable: a mangled link must say so, never spin forever.
  return { etape: 'introuvable' };
}

export function mountCadeau(host: HTMLElement, orderId: string, port: QuotePort): void {
  const root = document.createElement('div');
  root.setAttribute('data-screen', 'cadeau');
  host.appendChild(root);

  const render = (etat: CadeauEtat): void => {
    root.innerHTML = renderCadeau(etat);
  };
  const charger = (): void => {
    render({ etape: 'chargement' });
    void port.orderState(orderId).then((r) => render(etatDeLecture(r)));
  };
  root.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest('[data-action="cadeau-actualiser"]');
    if (target !== null) charger();
  });
  charger();
}
