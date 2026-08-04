/**
 * SP6.1 — WHAT « MES GAINS » IS ALLOWED TO SAY.
 *
 * ═══ THE SCREEN THIS REPLACES, AND WHY IT HAD TO GO ═══
 *
 * Until now `screen === 'gains'` rendered `enAttenteNet()`, `payeSemaine()` and
 * `gainsCards()` — all three from `sales/ventes.ts`, the DEMO model, over
 * `DEMO_SALES`. So her earnings screen showed a « Payé cette semaine » figure
 * on a platform where **nothing has ever been paid out**: no payout process
 * exists, in any repo, in any state. That is the same defect RF-1c removed from
 * « Mes ventes » (a demo delivery story nobody had verified), on the surface
 * where it costs the most — money she believes she has received.
 *
 * This module is what the screen reads instead. It is PURE: every decision is
 * here, where it can be tested exhaustively, and `App.tsx` only paints.
 *
 * ═══ WHAT IT REFUSES TO SAY ═══
 *
 * No total. No « solde ». No payout claim, no payout date, and no action —
 * because Ten Laws #2 and the plan's own rule against any cash-out mean there
 * is nothing on this screen to act on. Six of the eight rungs cannot be reached by
 * any input (see `gains-model.ts`), and they render QUIET AND LABELLED rather
 * than as empty buckets — « pas encore » with a sentence saying what has to
 * happen, never a zero that reads as « you have earned nothing ».
 */

import type { GainsVue, PalierGains } from './gains-model';

/** One rung as the screen paints it. `netFcfa` is the only franc, and it is a
 *  sum of amounts copied from frozen quotes — never a recomputation (SP-I04). */
export interface PalierLigne {
  readonly etat: string;
  readonly titreKey: string;
  readonly texteKey: string;
  readonly netFcfa: number;
  /** Catalog key for « 1 vente » / « {n} ventes » / « Aucune vente ici ». */
  readonly compteKey: string;
  /** Substitution for `compteKey` when it carries `{n}`; absent otherwise. */
  readonly compteN?: string;
  /** TRUE for the six rungs no fact can reach yet — the screen dims these and
   *  shows `gains.etape_absente` instead of a franc figure. */
  readonly enSommeil: boolean;
}

export interface GainsEcran {
  readonly kind: 'porte' | 'chargement' | 'refus' | 'hors_ligne' | 'non_branche' | 'echelle';
  readonly titreKey: string;
  readonly sousTitreKey?: string;
  readonly paliers: readonly PalierLigne[];
  /** Honest disclosures ABOVE the ladder — a partial read, and orders whose
   *  payment failed and therefore sit on no rung at all. */
  readonly noticeKeys: readonly string[];
  /** Params for any notice key carrying `{n}`, by key. */
  readonly noticeParams: Readonly<Record<string, Record<string, string>>>;
  /** TRUE only while a real credential is required and absent. */
  readonly demandeCode: boolean;
}

const AUCUN: readonly PalierLigne[] = [];
const SANS_PARAMS: Readonly<Record<string, Record<string, string>>> = {};

/**
 * The count line for one rung. A dormant rung says nothing about counts — it
 * has no sales because the STEP does not exist, and « Aucune vente ici » there
 * would answer a question she did not ask.
 */
function compte(p: PalierGains): { compteKey: string; compteN?: string } {
  if (!p.atteignable) return { compteKey: 'gains.pas_encore' };
  if (p.ventes === 0) return { compteKey: 'gains.aucune_vente' };
  if (p.ventes === 1) return { compteKey: 'gains.vente_une' };
  return { compteKey: 'gains.ventes_n', compteN: String(p.ventes) };
}

function ligne(p: PalierGains): PalierLigne {
  const { compteKey, compteN } = compte(p);
  return {
    etat: p.etat,
    titreKey: p.libelleKey,
    texteKey: p.explicationKey,
    netFcfa: p.netFcfa,
    compteKey,
    ...(compteN !== undefined ? { compteN } : {}),
    enSommeil: !p.atteignable,
  };
}

/**
 * The whole mapping, one place. `vue` is the model's honest state; the screen
 * never inspects raw rows.
 */
export function ecranDesGains(vue: GainsVue): GainsEcran {
  const shell = (kind: GainsEcran['kind'], titreKey: string, demandeCode = false): GainsEcran => ({
    kind,
    titreKey,
    paliers: AUCUN,
    noticeKeys: [],
    noticeParams: SANS_PARAMS,
    demandeCode,
  });

  switch (vue.kind) {
    // Same five honest non-list states « Mes ventes » has, with the same
    // meanings, so the two screens behave identically when the feed is not
    // answering — a reseller must never learn two different vocabularies for
    // « I am offline ».
    case 'non_branche':
      return shell('non_branche', 'ventes.reel_non_branche_titre');
    case 'verrouille':
      return shell('porte', 'gains.title', true);
    case 'chargement':
      return shell('chargement', 'gains.title');
    case 'refus':
      return shell('refus', 'ventes.reel_refus_titre', true);
    case 'hors_ligne':
      return shell('hors_ligne', 'ventes.reel_hors_ligne_titre');
    case 'echelle': {
      const noticeKeys: string[] = [];
      const noticeParams: Record<string, Record<string, string>> = {};
      if (vue.incomplet) noticeKeys.push('gains.incomplet');
      if (vue.sansObligation > 0) {
        noticeKeys.push('gains.sans_obligation');
        noticeParams['gains.sans_obligation'] = { n: String(vue.sansObligation) };
      }
      // ALWAYS LAST, ALWAYS PRESENT: the sentence that keeps this screen from
      // reading as an account. It is not a notice about a problem — it is the
      // standing truth about what Shop+ is (Ten Laws #2).
      noticeKeys.push('gains.pas_de_retrait');
      return {
        kind: 'echelle',
        titreKey: 'gains.title',
        sousTitreKey: 'gains.sous_titre',
        paliers: vue.paliers.map(ligne),
        noticeKeys,
        noticeParams,
        demandeCode: false,
      };
    }
  }
}
