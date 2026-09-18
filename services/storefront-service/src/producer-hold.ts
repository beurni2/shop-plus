/**
 * ═══ B5.1 (RESERVATION-FOURNISSEUR-1) — THE PRODUCER'S HOLD, the calling side ═══
 *
 * Founder ruling 2026-09-17: « private door ». When a buyer reserves, Shop+
 * asks Boutik+ to set ONE unit aside for her order over the SAME binding and
 * credential the confirmed-order wire already uses (`OFFER` +
 * `FULFILLMENT_WRITE_SECRET`), carrying Shop+'s OWN reservation id — the
 * chain's `reservation_id`, one id on both sides — and the order id the quote
 * will become, so Boutik+'s confirmed-order intake converts exactly this hold.
 *
 * THE LAW OF THE ANSWER, the same as the price ask's (PRODUIT-REFUSÉ-1):
 * the producer's ANSWER binds, its SILENCE does not.
 *   · `held` / `idempotent` — the unit is hers while she pays.
 *   · `refused` — the producer answered 409 `insufficient_stock`: someone
 *     else holds the last unit. The reserve refuses `out_of_stock` and frees
 *     the order slot it just took.
 *   · `unknown` — unreachable, 5xx, 401 (the secret not yet set on one side),
 *     404 (a product the producer does not know — the price ask already
 *     judged that), non-JSON. The reserve proceeds as it always has: an
 *     outage never blocks a sale; the oversell risk it leaves is the one the
 *     system carried before this slice, recorded honestly on his board.
 *
 * NO MOCK IS REACHABLE FROM HERE (the supply-source law): configured ⇒ the
 * real client; unconfigured ⇒ `AbsentProducerHold`, which holds nothing and
 * answers `unknown` — the honest state of a Worker with no producer bound.
 *
 * The CONTRACT this client speaks is boutik-plus's own seam test
 * (`services/offer-service/test/stock-hold.e2e.test.ts`): 200 `{status:
 * 'held'|'idempotent', reservationId, expiresAt, available}` · 409 `{error:
 * 'insufficient_stock', available}` · release 200 `{status: 'released'|
 * 'idempotent', available}`. The test doubles in this repo mirror those shapes
 * byte for byte and say so.
 */

import { SUPPLY_READ_TIMEOUT_MS } from './delais.js';

export const HOLD_ROUTE = '/fulfillment/stock-hold';
export const HOLD_RELEASE_ROUTE = '/fulfillment/stock-hold/release';

export type HoldOutcome =
  | { readonly kind: 'held'; readonly expiresAt: string }
  | { readonly kind: 'refused'; readonly available: number }
  | { readonly kind: 'unknown' };

export interface ProducerHoldPort {
  hold(productVersionId: string, reservationId: string, orderId: string): Promise<HoldOutcome>;
}

export interface ProducerHoldEnv {
  readonly OFFER?: { fetch(request: Request): Promise<Response> };
  readonly FULFILLMENT_WRITE_SECRET?: string;
}

export class AbsentProducerHold implements ProducerHoldPort {
  async hold(): Promise<HoldOutcome> {
    return { kind: 'unknown' };
  }
}

export class BoundProducerHold implements ProducerHoldPort {
  private readonly secret: string | undefined;
  constructor(
    private readonly fetcher: { fetch(request: Request): Promise<Response> },
    secret?: string,
  ) {
    this.secret = secret !== undefined && secret !== '' ? secret : undefined;
  }

  async hold(productVersionId: string, reservationId: string, orderId: string): Promise<HoldOutcome> {
    let res: Response;
    try {
      res = await this.fetcher.fetch(
        new Request(`https://offer${HOLD_ROUTE}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.secret !== undefined ? { Authorization: `Bearer ${this.secret}` } : {}),
          },
          body: JSON.stringify({ productVersionId, reservationId, orderId }),
          // One bounded attempt on the buyer's own request; silence is `unknown`.
          signal: AbortSignal.timeout(SUPPLY_READ_TIMEOUT_MS),
        }),
      );
    } catch {
      return { kind: 'unknown' };
    }
    const body = (await res.json().catch(() => null)) as
      | { status?: unknown; error?: unknown; expiresAt?: unknown; available?: unknown }
      | null;
    // THE BODY IS VERIFIED, not the status code alone (the 404/409 law of the
    // supply read): a 409 that is not the producer's named refusal is silence.
    if (res.status === 409) {
      return body?.error === 'insufficient_stock'
        ? { kind: 'refused', available: typeof body.available === 'number' ? body.available : 0 }
        : { kind: 'unknown' };
    }
    if (!res.ok || body === null) return { kind: 'unknown' };
    if ((body.status === 'held' || body.status === 'idempotent') && typeof body.expiresAt === 'string') {
      return { kind: 'held', expiresAt: body.expiresAt };
    }
    return { kind: 'unknown' };
  }
}

/** Configured ⇒ the real client; otherwise ABSENT. No third branch. */
export function resolveProducerHold(env?: ProducerHoldEnv): ProducerHoldPort {
  const fetcher = env?.OFFER;
  return fetcher !== undefined && typeof fetcher.fetch === 'function'
    ? new BoundProducerHold(fetcher, env?.FULFILLMENT_WRITE_SECRET)
    : new AbsentProducerHold();
}
