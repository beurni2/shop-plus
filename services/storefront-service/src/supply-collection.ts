/**
 * BROWSE-SUPPLY-1 — the RESELLER-FACING supply collection, and the diagnostic that
 * says WHY a product is missing.
 *
 * ═══ WHY THE APP GOES THROUGH THIS WORKER RATHER THAN CALLING BOUTIK ═══
 *
 * The supply hop lives server-side: the offer-service SERVICE BINDING and the
 * `SUPPLY_READ_SECRET` Worker secret are never readable from a phone. Letting the
 * reseller app call boutik
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

/** BROWSE-SUPPLY-BINDING-1 — with a binding there is no URL to name, so the target
 *  reports the BINDING NAME: readable in wrangler.toml, impossible to mistype into
 *  a secret nobody can read back. */
export const SUPPLY_TARGET_BINDING = 'service-binding:OFFER';

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
 *
 * ═══ A DIAGNOSTIC MUST NAME ITS TARGET, NOT ONLY ITS FAILURE (founder rule, from
 * the first real fault this instrument met) ═══
 *
 * The first live failure was `unreachable · 404 · refusals []`. That named the LAYER
 * in one request — it ruled out the app bundle, both app secrets, the gate, the wire
 * password and the freshness bound. Then it stopped helping: the fault was
 * `SUPPLY_BASE` pointing at the WRONG SERVICE (media-service 404s anything it does
 * not route), and the diagnostic never said which URL it had called — a value nobody
 * can read back out of a Worker secret. A fault report that names the failure
 * without naming what it was talking to is HALF an instrument. Hence `target`:
 *   · `base` — the RESOLVED ORIGIN actually called. A service origin is a hostname
 *     the founder can read off his own dashboard, NOT a credential; the ROUTE is
 *     deliberately not included, so nothing about path shape rides into a log that
 *     a base alone would not carry.
 *   · `answeredBy` — who answered a non-2xx. Every service here names itself in its
 *     JSON body (`service: media-service`, …), so this one field turns
 *     « unreachable 404 » into « I called this host and MEDIA-SERVICE answered
 *     not-found » — a diagnosis rather than a clue. BOUNDED: parsed from the body
 *     when it is service-shaped JSON, else the raw body truncated hard, so an
 *     arbitrary upstream response can never become an unbounded operator field.
 */
export interface SupplyTarget {
  /** The resolved base origin this reader actually called (never the full URL). */
  readonly base: string;
  /** Who answered a non-2xx: the upstream's self-reported service name, or its
   *  truncated body when it names no service. Absent when nothing answered at all. */
  readonly answeredBy?: string;
}

export interface SupplyCollectionResult {
  readonly status: 'ok' | 'unconfigured' | 'unreachable' | 'malformed';
  /** Fresh, contract-shaped, non-leaking offers. Empty is a legitimate answer. */
  readonly offers: readonly SupplyOffer[];
  /** Items the consumer refused, with the reason each was refused for. */
  readonly refusals: readonly SupplyRefusal[];
  /** The producer's HTTP status when it answered at all — an operator's first clue. */
  readonly httpStatus?: number;
  /** What this reader was talking TO. Absent only when unconfigured (no base exists). */
  readonly target?: SupplyTarget;
}

const UNCONFIGURED: SupplyCollectionResult = { status: 'unconfigured', offers: [], refusals: [] };

/** Hard bound on a captured upstream body — a diagnosis, never a payload mirror. */
const ANSWERED_BY_MAX = 120;

/** Extract who answered: the upstream's own `service` field when its body is
 *  service-shaped JSON, else the truncated raw body, else undefined for an empty one. */
export function whoAnswered(bodyText: string): string | undefined {
  try {
    const parsed = JSON.parse(bodyText) as { service?: unknown };
    if (typeof parsed.service === 'string' && parsed.service !== '') return parsed.service;
  } catch {
    /* not JSON — fall through to the bounded raw capture */
  }
  const trimmed = bodyText.trim();
  return trimmed === '' ? undefined : trimmed.slice(0, ANSWERED_BY_MAX);
}

/**
 * Read the producer's collection and consume EVERY item through the certified
 * consumer. Nothing is re-implemented here: `consumeSupplyItem` is the same
 * pipeline the lookup path runs — same schema, same 15-minute bound, same identity
 * sweep — minus the id expectation a list genuinely cannot have.
 */
export async function readSupplyCollection(
  env: SupplySourceEnv | undefined,
  nowIso: string,
): Promise<SupplyCollectionResult> {
  // BROWSE-SUPPLY-BINDING-1 — the fetcher IS the service binding. Unconfigured is
  // now VISIBLE IN CONFIG (no [[services]] block) rather than hidden in a secret,
  // and the day-long wrong-base fault class stops being expressible: there is no
  // URL to mistype. Tests stub the binding's fetch exactly as they stubbed fetchImpl.
  const fetcher = env?.OFFER;
  if (fetcher === undefined || typeof fetcher.fetch !== 'function') return UNCONFIGURED;
  const secret = env?.SUPPLY_READ_SECRET;
  // The target the diagnostic names. With a binding it is the binding NAME —
  // readable in wrangler.toml — where the burned instrument was a write-only secret.
  const resolvedBase = SUPPLY_TARGET_BINDING;

  let res: Response;
  try {
    res = await fetcher.fetch(
      new Request(`https://offer${SUPPLY_COLLECTION_ROUTE}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          // KEPT over the binding, env-gated exactly as before: boutik's Bearer gate
          // is load-bearing and the header flows fine through a binding. An absent
          // secret means NO HEADER, never a broken request — a 401 is then the
          // honest, reportable answer.
          ...(secret !== undefined && secret !== '' ? { Authorization: `Bearer ${secret}` } : {}),
        },
      }),
    );
  } catch {
    // Nothing answered — the base is still the diagnosis-bearing fact.
    return { status: 'unreachable', offers: [], refusals: [], target: { base: resolvedBase } };
  }
  if (!res.ok) {
    // WHO answered matters as much as THAT it answered: media-service 404s anything
    // it does not route, so a wrong base presents exactly like a missing route until
    // the responder names itself.
    const answeredBy = whoAnswered(await res.text().catch(() => ''));
    return {
      status: 'unreachable',
      offers: [],
      refusals: [],
      httpStatus: res.status,
      target: { base: resolvedBase, ...(answeredBy !== undefined ? { answeredBy } : {}) },
    };
  }

  const body = (await res.json().catch(() => null)) as { items?: unknown } | null;
  if (body === null || !Array.isArray(body.items)) {
    return { status: 'malformed', offers: [], refusals: [], httpStatus: res.status, target: { base: resolvedBase } };
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
  // The target rides the healthy answer too: « which producer served these offers »
  // is the same question as « which host 404'd », asked on a better day.
  return { status: 'ok', offers, refusals, httpStatus: res.status, target: { base: resolvedBase } };
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
