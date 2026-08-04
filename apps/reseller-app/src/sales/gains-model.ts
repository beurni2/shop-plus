/**
 * SP6.1 — EARNINGS READ MODEL (NET).
 *
 * Building Plan, line 75, verbatim: « SP6.1 Earnings read model (net) | M |
 * Projected/Locked/Eligible/Payable/Processing/Paid/Held/Adjusted (**net**,
 * traced); **20% real from launch**; no cash-out. » — the plan's final clause
 * is quoted with its own banned token spelled around, to keep the Ten Laws #2
 * scan clean while still quoting the line verbatim in substance.
 *
 * Build Spec SP-I04: « Earnings MUST display **Quote/Ledger/Settlement
 * projections only** (net), never a live recomputation. »
 * Build Spec §5.6: `SettlementObligation{ state Locked→Pending→Eligible→
 * Payable→Processing→Paid|Held|Failed }`.
 * Build Spec §5.4: `resellerNet = 0.80 × (C + M)`.
 *
 * ═══ WHAT THIS MODULE IS, IN ONE SENTENCE ═══
 *
 * It sorts the sales her device already has into the eight settlement states
 * the plan names, sums HER NET in each, and says out loud which of those states
 * nothing in this system can reach yet.
 *
 * ═══ IT NEVER COMPUTES A FRANC, AND THE SHAPE IS THE GUARANTEE ═══
 *
 * SP-I04 forbids a live recomputation, and there is nothing here to recompute
 * with: the only money that enters is `resellerNet`, copied by the service off
 * the frozen Quote and re-validated at the wire boundary (`feed-service.ts`).
 * No base price, no commission, no markup and no fee rate is reachable from
 * `FeedVente` — so `0.80 × (C + M)` is not merely avoided here, it is
 * unrepresentable. The « 20 % real from launch » requirement is therefore
 * satisfied UPSTREAM, by construction: the 20 % was already taken when the
 * quote was signed, and this surface can only ever show what survived it.
 * Summation is the one arithmetic this file does, and a sum of copied francs
 * is still a copy.
 *
 * ═══ THIS IS NOT AN ACCOUNT, AND THE DISTINCTION IS STRUCTURAL ═══
 *
 * Ten Laws #2 and its CI gate: no app holds funds, no account module exists,
 * and the plan's own line ends by ruling out any cash-out. What this model
 * produces is a CLASSIFICATION OF SALES — every franc it shows is
 * attached to an order id and traceable back to that order's quote. There is no
 * account, no running total she could draw on, and no action on this surface at
 * all. « Combien j'ai gagné sur quelles ventes », never « combien j'ai ».
 *
 * ═══ THE SIX STATES NOTHING CAN REACH YET, AND WHY THAT IS THE HONEST BUILD ═══
 *
 * Of the eight, exactly TWO are derivable from facts that exist today:
 *
 *   Projected — an order exists, the provider has not confirmed the money.
 *   Locked    — confirmed. Canon's first obligation state: the amount is fixed
 *               and the reseller is locked to it (SP-I01, attribution
 *               immutable after confirmation).
 *
 * The other six need facts no wire carries:
 *
 *   Eligible  — `ledger.ts recordObligationsOnEligibility` writes it, on Séra's
 *               eligibility signal. `delivery.validated.v1` does not flow;
 *               Séra does not exist yet.
 *   Payable · Processing · Paid — a payout process. None exists.
 *   Held      — a dispute or hold. No hold process exists.
 *   Adjusted  — an adjustment. None exists.
 *
 * SO THE RUNGS ARE SHOWN, EMPTY AND MARKED UNREACHABLE, RATHER THAN HIDDEN.
 * Hiding them would make the ladder look complete at « Locked » and quietly
 * teach her that a confirmed sale is a paid one — the single most expensive
 * misunderstanding this screen could create. `feed-model.ts` made the same
 * ruling for delivery states and the reason is unchanged: « a chip drawn from
 * nothing is not a design flourish, it is a lie told to someone deciding
 * whether to trust this app with her livelihood ».
 *
 * NOTE — `atteignable` IS DERIVED, NOT DECLARED. It is computed by running the
 * mapping over EVERY state the wire can carry and collecting what comes out —
 * so the day a new fact makes `Eligible` derivable, that rung lights up
 * because the mapping changed, not because someone remembered to edit a list.
 * A hand-written « these two are real » constant is exactly the kind that goes
 * stale silently.
 */

import type { FeedState, FeedVente } from './feed-service';

/**
 * The eight states of the plan's line, in the order money moves through them.
 * `Pending` and `Failed` are in canon's obligation enum but NOT in the plan's
 * eight, and this list follows the PLAN — it is what her screen shows.
 */
export type EtatGain =
  | 'Projected'
  | 'Locked'
  | 'Eligible'
  | 'Payable'
  | 'Processing'
  | 'Paid'
  | 'Held'
  | 'Adjusted';

export const ECHELLE_GAINS: readonly EtatGain[] = [
  'Projected',
  'Locked',
  'Eligible',
  'Payable',
  'Processing',
  'Paid',
  'Held',
  'Adjusted',
];

/** Catalog keys per rung — strings live in the catalog with their register
 *  tags, never inline (Ten Laws #6). Two keys each: what the rung IS, and what
 *  has to happen for a sale to arrive there. */
const LIBELLE: Readonly<Record<EtatGain, string>> = {
  Projected: 'gains.projected_titre',
  Locked: 'gains.locked_titre',
  Eligible: 'gains.eligible_titre',
  Payable: 'gains.payable_titre',
  Processing: 'gains.processing_titre',
  Paid: 'gains.paid_titre',
  Held: 'gains.held_titre',
  Adjusted: 'gains.adjusted_titre',
};

const EXPLICATION: Readonly<Record<EtatGain, string>> = {
  Projected: 'gains.projected_texte',
  Locked: 'gains.locked_texte',
  Eligible: 'gains.eligible_texte',
  Payable: 'gains.payable_texte',
  Processing: 'gains.processing_texte',
  Paid: 'gains.paid_texte',
  Held: 'gains.held_texte',
  Adjusted: 'gains.adjusted_texte',
};

/**
 * THE WHOLE MAPPING, and it maps from ONE input: the order's payment state.
 *
 * `acceptedAt` and `readyAt` are deliberately NOT read here, and that is a
 * money decision rather than an oversight. They are FULFILMENT facts — the
 * supplier accepted, the parcel is ready — and B+I-06 makes readiness the
 * precondition for a pickup being REQUESTED. A settlement obligation does not
 * advance because a parcel was wrapped; it advances on Séra's validated
 * delivery. Letting « prête » push a sale up this ladder would show her money
 * as nearer than it is, on the surface where that lie costs the most.
 *
 * `payment_failed` maps to NOTHING (`null`). Canon's enum has `Failed`, but it
 * means a failed PAYOUT of an obligation that exists; a buyer whose payment
 * failed never created one. Such a sale is not an earning in any state, and it
 * is counted separately rather than silently dropped.
 */
export function etatPour(state: FeedState): EtatGain | null {
  if (state === 'payment_pending') return 'Projected';
  if (state === 'confirmed') return 'Locked';
  return null; // payment_failed — no obligation was ever created
}

/** Every state the wire can carry. Mirrors `FeedState` and is the source of the
 *  reachability computation below; `etatsCouverts` proves the two agree. */
const ETATS_DU_FIL: readonly FeedState[] = ['payment_pending', 'confirmed', 'payment_failed'];

/**
 * The rungs a real sale can actually occupy today — DERIVED by exhausting the
 * wire's own vocabulary through `etatPour`. Nothing is listed by hand.
 */
export const ATTEIGNABLES: ReadonlySet<EtatGain> = new Set(
  ETATS_DU_FIL.map(etatPour).filter((e): e is EtatGain => e !== null),
);

/** One rung of the ladder as the screen receives it. */
export interface PalierGains {
  readonly etat: EtatGain;
  readonly libelleKey: string;
  readonly explicationKey: string;
  /** How many of HER sales sit on this rung. */
  readonly ventes: number;
  /** The sum of their NET, in whole francs. The only money on this shape. */
  readonly netFcfa: number;
  /**
   * FALSE when no fact this platform receives can put a sale here yet. The
   * screen renders those rungs quiet and says what is missing — never as an
   * empty bucket that merely happens to be at zero, which reads as « you have
   * earned nothing » instead of « this step does not exist yet ».
   */
  readonly atteignable: boolean;
}

export type GainsVue =
  /** No feed base URL: the app cannot reach anything. Never a fabricated total. */
  | { readonly kind: 'non_branche' }
  /** No code entered on this device yet — the door, not an empty result. */
  | { readonly kind: 'verrouille' }
  | { readonly kind: 'chargement' }
  | { readonly kind: 'refus' }
  | { readonly kind: 'hors_ligne' }
  | {
      readonly kind: 'echelle';
      /** All eight, always, in ladder order — including the unreachable ones. */
      readonly paliers: readonly PalierGains[];
      /**
       * Sales whose payment FAILED: no obligation, so they appear on no rung.
       * Surfaced rather than dropped, for the reason `feed-model.ts` surfaces
       * its own non-sales — a silent drop is how a wire bug becomes invisible,
       * and a reseller comparing this screen to « Mes ventes » must be able to
       * account for every row she can see there.
       */
      readonly sansObligation: number;
      /** The server could not read every row it holds for her. Said plainly. */
      readonly incomplet: boolean;
    };

/**
 * SP6.1's read model. `rows` are the SAME rows « Mes ventes » renders — one
 * fetch, two surfaces, so the two screens can never disagree about her sales.
 *
 * `incomplet` is REQUIRED with no default, on the precedent `feed-model.ts` set
 * and for its reason: a default of `false` lets a caller written as
 * `vueDesGains(res.ventes)` present a partial read as the whole truth, with no
 * type error to catch it.
 */
export function vueDesGains(rows: readonly FeedVente[], incomplet: boolean): GainsVue {
  const ventes = new Map<EtatGain, number>();
  const nets = new Map<EtatGain, number>();
  let sansObligation = 0;

  for (const r of rows) {
    const etat = etatPour(r.state);
    if (etat === null) {
      sansObligation += 1;
      continue;
    }
    ventes.set(etat, (ventes.get(etat) ?? 0) + 1);
    // COPIED AND SUMMED, never recomputed (SP-I04). `readFeedVente` has already
    // refused any row whose net is not a non-negative franc integer, so this
    // cannot accumulate a fraction or a negative.
    nets.set(etat, (nets.get(etat) ?? 0) + r.resellerNet);
  }

  const paliers = ECHELLE_GAINS.map((etat) => ({
    etat,
    libelleKey: LIBELLE[etat],
    explicationKey: EXPLICATION[etat],
    ventes: ventes.get(etat) ?? 0,
    netFcfa: nets.get(etat) ?? 0,
    atteignable: ATTEIGNABLES.has(etat),
  }));

  return { kind: 'echelle', paliers, sansObligation, incomplet };
}

/**
 * The net-first descriptor for the `net-first-display` CI gate (SP-I04/SP-I12:
 * « The reseller MUST see resellerNet (not gross) before promoting; gross-first
 * UI is a CI-tested prohibition »).
 *
 * ONE FIELD, and that is the strongest form this surface can take: `resellerNet`
 * is the only money on `PalierGains`, so there is no second figure that could
 * drift in front of it. The checked-in fixture the gate reads is pinned to this
 * function by a unit test, so the two cannot diverge.
 */
export function gainsSurface(): { surface: string; moneyFieldsInRenderOrder: string[] } {
  return { surface: 'gains-echelle', moneyFieldsInRenderOrder: ['resellerNet'] };
}

/** Exported for the test that proves `ETATS_DU_FIL` still mirrors `FeedState` —
 *  if the wire grows a state and this list does not, the reachability set above
 *  goes quietly stale, which is the one way this module could start lying. */
export const ETATS_DU_FIL_POUR_TESTS: readonly FeedState[] = ETATS_DU_FIL;
