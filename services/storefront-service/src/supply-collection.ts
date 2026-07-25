/**
 * BROWSE-SUPPLY-1 — the RESELLER-FACING supply collection, and the diagnostic that
 * says WHY a product is missing.
 *
 * ═══ WHY THE APP GOES THROUGH THIS WORKER RATHER THAN CALLING BOUTIK ═══
 *
 * `SUPPLY_BASE` and `SUPPLY_READ_SECRET` are WORKER secrets (`wrangler secret put`),
 * so they are never readable from a phone. Letting the reseller app call boutik
 * directly would need boutik credentials INSIDE THE EAS BUNDLE — extending a
 * weakness accepted once for the write key rather than containing it. So the app
 * asks this Worker, the Worker holds the service-to-service credential, and the
 * bearer never leaves the server side.
 *
 * The honest price of that choice, stated because it is real: this route had to be
 * ADDED. Supply was previously used only server-side inside `GET /s/{slug}`.
 *
 * ═══ WHY IT IS KEY-GATED, AND WHAT THAT WIDENS (founder ruling) ═══
 *
 * It returns `basePrice` and `resellerCommission` for every offer — precisely the
 * economics LISTING-READ-GATE-1 exists to protect. Open would be the same fail-open
 * leak APPS caught on boutik's side. It is gated on `X-Write-Key`, the key the app
 * ALREADY holds: a second bundled secret would buy separation of concerns and ZERO
 * protection, because both are readable by anyone who extracts the bundle, and it
 * would add a value the founder must set and could mismatch.
 *
 * SO THE BLAST RADIUS OF THAT KEY IS NOW WIDER, and this is the place it is written
 * down: it means « can write storefronts » AND « can read all supply economics ».
 * It rides the SAME hard gate already standing — no reseller but the founder
 * onboards until real per-reseller identity lands, at which point this becomes
 * per-reseller auth and the shared key GOES AWAY rather than being narrowed.
 *
 * ═══ THE REASON IS PRESERVED, NOT COLLAPSED (the diagnostic half) ═══
 *
 * `supply-source.ts` maps every non-2xx and every non-fresh verdict to `undefined`,
 * which is right for the BUYER — an undescribable product is omitted rather than
 * half-invented. But it DISCARDS THE ANSWER before anything downstream could report
 * it, and three distinct faults then present identically as an empty screen:
 * unconfigured, unreachable, refused-stale, refused-mismatch, or genuinely nothing
 * published. This module keeps the reason so an operator can be told which.
 */

import { consumeSupplyItem } from '@shop-plus/supply-consumer/consumer';
import type { SupplySourceEnv } from './supply-source.js';

/**
 * THE PRODUCER'S COLLECTION ROUTE — PLURAL, and matched EXACTLY, never by prefix.
 *
 * `/supply-projections` does NOT start with `/supply-projection/`, which is exactly
 * how APPS's prefix-based auth check failed to cover it on boutik's side — and that
 * failure mode is FAIL-OPEN: one unauthenticated request handing over every offer's
 * economics. A route name that looks like a longer version of another route is not
 * one. Shop's own `worker/index.ts` carries the same `startsWith` idiom for
 * `/listings/`, so this route is registered with `===`, deliberately.
 */
export const SUPPLY_COLLECTION_ROUTE = '/supply-projections';

/** One offer as the reseller browse surface needs it — the canon projection's
 *  seven fields, unaltered. No zone: boutik strips location as supplier-identifying. */
export interface SupplyOffer {
  readonly productVersionId: string;
  readonly offerVersion: string;
  readonly basePrice: number;
  readonly resellerCommission: number;
  readonly available: number;
  readonly productName: string;
  readonly assetRefs: readonly string[];
}

/** Why one item did not become an offer. Operator-facing — never shown to a reseller. */
export interface SupplyRefusal {
  /** Present when the item parsed far enough to name itself; absent when it did not. */
  readonly productVersionId?: string;
  /** `stale` · `absent` · `not_a_read_model` · `payload_not_contract_shaped` ·
   *  `identity_material_refused` · `product_mismatch` — the consumer's own verdict. */
  readonly reason: string;
}

/**
 * The whole answer, INCLUDING the failure shapes. `status` distinguishes the faults
 * that would otherwise all look like an empty list.
 */
export interface SupplyCollectionResult {
  readonly status: 'ok' | 'unconfigured' | 'unreachable' | 'malformed';
  /** Fresh, contract-shaped, non-leaking offers. Empty is a legitimate answer. */
  readonly offers: readonly SupplyOffer[];
  /** Items the consumer refused, with the reason each was refused for. */
  readonly refusals: readonly SupplyRefusal[];
  /** The producer's HTTP status when it answered at all — an operator's first clue. */
  readonly httpStatus?: number;
}

const UNCONFIGURED: SupplyCollectionResult = { status: 'unconfigured', offers: [], refusals: [] };

/**
 * Read the producer's collection and consume EVERY item through the certified
 * consumer. Nothing is re-implemented here: `consumeSupplyItem` is the same
 * pipeline the lookup path runs — same schema, same 15-minute bound, same identity
 * sweep — minus the id expectation a list genuinely cannot have.
 */
export async function readSupplyCollection(
  env: SupplySourceEnv | undefined,
  nowIso: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SupplyCollectionResult> {
  const base = env?.SUPPLY_BASE;
  if (base === undefined || base === '') return UNCONFIGURED;
  const secret = env?.SUPPLY_READ_SECRET;

  let res: Response;
  try {
    res = await fetchImpl(`${base.replace(/\/+$/, '')}${SUPPLY_COLLECTION_ROUTE}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        // Env-gated exactly as the lookup path: an absent secret means NO HEADER,
        // never a broken request. A 401 here is then the honest, reportable answer.
        ...(secret !== undefined && secret !== '' ? { Authorization: `Bearer ${secret}` } : {}),
      },
    });
  } catch {
    return { status: 'unreachable', offers: [], refusals: [] };
  }
  if (!res.ok) return { status: 'unreachable', offers: [], refusals: [], httpStatus: res.status };

  const body = (await res.json().catch(() => null)) as { items?: unknown } | null;
  if (body === null || !Array.isArray(body.items)) {
    return { status: 'malformed', offers: [], refusals: [], httpStatus: res.status };
  }

  const offers: SupplyOffer[] = [];
  const refusals: SupplyRefusal[] = [];
  for (const item of body.items) {
    const verdict = consumeSupplyItem(item, nowIso);
    if (verdict.status === 'fresh') {
      const p = verdict.projection;
      offers.push({
        productVersionId: p.productVersionId,
        offerVersion: p.offerVersion,
        basePrice: p.basePrice,
        resellerCommission: p.resellerCommission,
        available: p.available,
        productName: p.productName,
        assetRefs: [...p.assetRefs],
      });
      continue;
    }
    // The reason is KEPT. This is the line that makes an operator answer possible;
    // collapsing it to `undefined` here would recreate the very gap this closes.
    const named = readProductVersionId(item);
    refusals.push({
      ...(named !== undefined ? { productVersionId: named } : {}),
      reason: verdict.status === 'stale' ? 'stale' : verdict.status === 'absent' ? 'absent' : verdict.reason,
    });
  }
  return { status: 'ok', offers, refusals, httpStatus: res.status };
}

/** Best-effort id for a REFUSED item, so an operator can name what was rejected.
 *  Defensive by design: the item failed validation, so nothing about it is trusted. */
function readProductVersionId(item: unknown): string | undefined {
  if (item === null || typeof item !== 'object') return undefined;
  const value = (item as { value?: unknown }).value;
  if (value === null || typeof value !== 'object') return undefined;
  const id = (value as { productVersionId?: unknown }).productVersionId;
  return typeof id === 'string' && id !== '' ? id : undefined;
}
