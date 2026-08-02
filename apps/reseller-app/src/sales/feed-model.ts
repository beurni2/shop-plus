/**
 * RF-1b — WHAT HER SCREEN IS ALLOWED TO SAY.
 *
 * ═══ THE HONESTY PROBLEM THIS MODULE EXISTS TO SOLVE ═══
 *
 * `sales/ventes.ts` (the demo model that shipped first) names SIX states:
 * probleme · a_la_porte · en_route · en_preparation · payee · livree. Shop+ can
 * prove exactly ONE of them about a real order: `confirmed` — the operator saw
 * the provider confirm the money. « En préparation » lives in Boutik+'s book
 * (acceptedAt / readyAt) and no wire carries it back here. « En route », « à la
 * porte » and « livrée » belong to Séra, which does not exist yet.
 *
 * So this model maps ONLY what is proven and REFUSES to fill the rest. A real
 * sale renders « PAYÉE » and the screen states plainly that the next news does
 * not exist yet — because a « en route » chip drawn from nothing is not a
 * design flourish, it is a lie told to someone deciding whether to trust this
 * app with her livelihood. Queued is pending, never done (Ten Laws #7).
 *
 * SAFEST DEFAULT, FLAGGED FOR THE FOUNDER: the follow-up truthfully stops at
 * « payée ». Carrying it further needs a `package.ready.v1` return event from
 * Boutik+ — a canon contracts change, and his call, not mine.
 *
 * ═══ THE MONEY ═══
 * `netFcfa` is COPIED from the wire, which copied it from the frozen Quote.
 * Nothing here recomputes a franc (Ten Laws #1/#2), and no gross figure and no
 * commission is representable in these types at all — the shape itself is the
 * guarantee, not the discipline of whoever edits the screen next.
 */

import type { FeedVente } from './feed-service';

/** What she can be shown about one real sale. Note what is ABSENT and cannot
 *  be added by accident: no gross, no commission, no base, no buyer contact. */
export interface VenteReelle {
  readonly orderId: string;
  /** The chip key in the i18n catalog — never an inline string (Ten Laws #6). */
  readonly etatKey: string;
  /** HER NET, copied. The only franc on this surface. */
  readonly netFcfa: number;
  readonly createdAt: string;
  readonly zoneTo: string;
}

export type FeedVue =
  /** The base URL is unset — the app cannot reach any feed. Never a fake list. */
  | { readonly kind: 'not_configured' }
  /** She has not opened the door yet (no code entered on this device). */
  | { readonly kind: 'locked' }
  | { readonly kind: 'loading' }
  /** The code was refused. ONE message — the door is not an oracle. */
  | { readonly kind: 'refused' }
  | { readonly kind: 'unreachable' }
  /** The door opened and she has no confirmed sale yet. An HONEST empty,
   *  designed as a real state, never an error wall and never a fake count.
   *
   *  It CARRIES `nonConfirmees` too (verifier round 2): the first cut dropped
   *  the count here — the one place it matters most, since rows that are all
   *  unconfirmed produce an empty view — and the comment below claimed it was
   *  surfaced. That was the same failure as B2: an assertion in prose that the
   *  code did not keep. Her screen must be able to tell « the server sent
   *  nothing » from « the server sent rows and none of them is a sale », the
   *  second being a wire bug that would otherwise be invisible. */
  | { readonly kind: 'empty'; readonly incomplet: boolean; readonly nonConfirmees: number }
  | {
      readonly kind: 'ready';
      readonly ventes: readonly VenteReelle[];
      /** The server could not read everything it holds for her. The screen
       *  states it plainly instead of presenting a short list as the whole
       *  truth (Ten Laws #7: honest states are designed states). */
      readonly incomplet: boolean;
      /** Rows the server sent that are NOT confirmed sales. Registration only
       *  happens at the confirm transition, so this should always be 0; it is
       *  surfaced rather than silently dropped, because a silent drop is how a
       *  wire bug becomes invisible. */
      readonly nonConfirmees: number;
    };

/** The ONE state Shop+ can prove about a sale today. */
const ETAT_PAYEE_KEY = 'ventes.etat_payee';

/**
 * Newest first. The comparator is on the server's `createdAt` — her order of
 * events, not the order the fan-out happened to return.
 */
/**
 * `incomplet` is REQUIRED, with no default (verifier round 2 minor). A default
 * of `false` would let a screen written as `vueDesVentes(res.ventes)` report a
 * partial feed as the whole truth, with no type error to catch it — the exact
 * lie B3 was fixed to prevent. Making it required moves that from a discipline
 * to a compile error.
 */
export function vueDesVentes(rows: readonly FeedVente[], incomplet: boolean): FeedVue {
  const confirmees = rows.filter((r) => r.state === 'confirmed');
  const nonConfirmees = rows.length - confirmees.length;
  if (confirmees.length === 0) return { kind: 'empty', incomplet, nonConfirmees };
  const ventes = [...confirmees]
    .sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1))
    .map(
      (r): VenteReelle => ({
        orderId: r.orderId,
        etatKey: ETAT_PAYEE_KEY,
        netFcfa: r.resellerNet,
        createdAt: r.createdAt,
        zoneTo: r.zoneTo,
      }),
    );
  return { kind: 'ready', ventes, nonConfirmees, incomplet };
}

/** Her total, from rows already on screen — a sum of copied nets, never a
 *  recomputation from a base and a rate. */
export function totalNet(ventes: readonly VenteReelle[]): number {
  return ventes.reduce((sum, v) => sum + v.netFcfa, 0);
}
