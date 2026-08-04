/**
 * ACCUEIL-HONESTY-1 — what the FIRST screen is allowed to say about her money.
 *
 * ═══ WHAT WAS THERE, AND WHY IT HAD TO GO ═══
 *
 * The home screen showed two large FCFA figures side by side:
 *
 *   « Gains nets — juin »  →  `MONTHLY_NET_DEMO`, a hardcoded 34 500
 *      sub-line: « Versés sur Mobile Money »
 *   « En attente (net) »   →  `enAttenteNet()` summed over `DEMO_SALES`
 *
 * Both invented, both in the type reserved for real money, and the first of
 * them told her the money had been PAID TO HER MOBILE MONEY ACCOUNT. Nothing
 * has ever been paid to anyone, by any process, in any repo. Under them sat two
 * « ventes en cours » rows naming customers — Mariam and her neighbours — who
 * are not her customers and do not exist.
 *
 * SP6.1 removed exactly this defect from « Mes gains » one tab away. Leaving it
 * on the screen that opens first meant a reseller met the invented number
 * BEFORE she ever met the honest ladder, and the honest ladder then read as the
 * app losing track of her earnings.
 *
 * ═══ WHAT THIS MODULE IS ═══
 *
 * A pure reading of the two screens she already has. It invents nothing, fetches
 * nothing, and computes no franc: it takes the SAME `GainsEcran` and
 * `VentesEcran` the gains and ventes screens render — one hook, one fetch — and
 * selects the part that belongs on a glance. Home can therefore never disagree
 * with the screen it links to, because there is only one answer and this is a
 * projection of it.
 *
 * ═══ WHICH FIGURES APPEAR IS DERIVED, NOT CHOSEN ═══
 *
 * The cards are exactly the rungs a real sale can occupy today —
 * `enSommeil === false`, computed by `gains-model.ts` by exhausting the wire's
 * own vocabulary. Today that is two: « En attente de paiement » and « Gain
 * bloqué pour vous ». The day Séra's validated delivery makes `Eligible`
 * reachable, a third card appears here on its own. A hand-picked pair would
 * have gone stale silently, which is the failure this whole slice is about.
 *
 * ═══ AND WHEN THERE IS NOTHING TRUE TO SHOW, IT SHOWS NO FIGURE ═══
 *
 * No code entered, no feed configured, offline, refused, still loading: there
 * is no honest number, so `silence` carries a sentence instead. A zero would be
 * a claim — « you have earned nothing » — and we do not know that. The rule
 * this file exists to enforce, in one line: **a figure on this screen means a
 * real sale, or there is no figure.**
 */

import type { GainsEcran } from './gains-screen';
import type { VenteLigne, VentesEcran } from './feed-screen';

/** How many sales the glance shows. The rest are one tap away, on a screen
 *  built to hold them. */
export const APERCU_MAX = 2;

/** One money card. Every field is copied from the ladder — none is derived
 *  here, and there is no total: a sum across rungs would be the running figure
 *  of an account, and no app in this ecosystem keeps one (Ten Laws #2). */
export interface CarteGain {
  readonly etat: string;
  readonly libelleKey: string;
  readonly netFcfa: number;
  /** « 1 vente » / « {n} ventes » / « Aucune vente ici », already chosen. */
  readonly compteKey: string;
  readonly compteN?: string;
}

export type AccueilGains =
  | { readonly kind: 'chiffres'; readonly cartes: readonly CarteGain[] }
  | {
      readonly kind: 'silence';
      readonly titreKey: string;
      readonly texteKey: string;
      /** TRUE only when a real credential is required and absent — the home
       *  screen points at the door rather than opening a second one. */
      readonly demandeCode: boolean;
    };

export interface AccueilEcran {
  readonly gains: AccueilGains;
  /** Her real sales, newest-first as the feed screen ordered them, capped. */
  readonly apercu: readonly VenteLigne[];
  /** Set when there is no list to show — the feed's own sentence, so home and
   *  « Mes ventes » never describe one situation two ways. */
  readonly apercuEtatKey?: string;
  readonly apercuHintKey?: string;
}

const AUCUNE: readonly VenteLigne[] = [];

/**
 * The honest line for each non-list state of the ladder.
 *
 * Three of the five REUSE the sentences « Mes ventes » already uses, on
 * purpose: a reseller must not have to learn two vocabularies for « I am
 * offline ». The two that are home-specific say what home can act on.
 */
function silence(gains: GainsEcran): AccueilGains {
  switch (gains.kind) {
    case 'porte':
      return {
        kind: 'silence',
        titreKey: 'accueil.gains_verrouille',
        texteKey: 'accueil.gains_verrouille_sub',
        demandeCode: true,
      };
    case 'chargement':
      return {
        kind: 'silence',
        titreKey: 'accueil.gains_chargement',
        texteKey: 'accueil.gains_patience',
        demandeCode: false,
      };
    case 'refus':
      return {
        kind: 'silence',
        titreKey: 'ventes.reel_refus_titre',
        // « Vérifiez le code, ou demandez-en un nouveau. » — the REFUSED door's
        // own second line, not the locked door's. Founder-found, 2026-08-04:
        // the first cut paired « Ce code n'ouvre pas. » with « Entrez votre
        // code dans « Mes gains » pour les voir », which tells her to do the
        // thing she has just done. A refused code and an absent code are
        // different situations and may not share a sentence.
        texteKey: 'ventes.reel_refus_hint',
        demandeCode: true,
      };
    case 'hors_ligne':
      return {
        kind: 'silence',
        titreKey: 'ventes.reel_hors_ligne_titre',
        texteKey: 'accueil.gains_patience',
        demandeCode: false,
      };
    default:
      // 'non_branche' — and the default arm is deliberate: an unknown future
      // kind must land on the QUIETEST honest state, never fall through to a
      // figure. Failing closed on a money surface means saying less.
      return {
        kind: 'silence',
        titreKey: 'ventes.reel_non_branche_titre',
        texteKey: 'accueil.gains_patience',
        demandeCode: false,
      };
  }
}

/**
 * The whole mapping, one place and one direction: two honest screens in, one
 * glance out. Pure and total — no clock, no I/O, no throw on any input the
 * types admit.
 */
export function ecranAccueil(gains: GainsEcran, ventes: VentesEcran): AccueilEcran {
  const apercu = ventes.kind === 'liste' ? ventes.lignes.slice(0, APERCU_MAX) : AUCUNE;

  return {
    gains:
      gains.kind === 'echelle'
        ? {
            kind: 'chiffres',
            // THE SELECTION IS THE DERIVATION: whatever the ladder says a real
            // sale can reach today, in ladder order. Nothing is named here.
            cartes: gains.paliers
              .filter((p) => !p.enSommeil)
              .map((p) => ({
                etat: p.etat,
                libelleKey: p.titreKey,
                netFcfa: p.netFcfa,
                compteKey: p.compteKey,
                ...(p.compteN !== undefined ? { compteN: p.compteN } : {}),
              })),
          }
        : silence(gains),
    apercu,
    ...(ventes.kind === 'liste'
      ? {}
      : {
          apercuEtatKey: ventes.titreKey,
          ...(ventes.hintKey !== undefined ? { apercuHintKey: ventes.hintKey } : {}),
        }),
  };
}
