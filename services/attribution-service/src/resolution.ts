import {
  ARRIVAL_TTL_POLICY,
  PlatformEventSchema,
  ResellerShortCodeSchema,
  normalizeShortCode,
  resolveAttribution,
  type AttributionArrival,
  type AttributionResolution,
  type PlatformEvent,
} from '@platform/contracts';

/**
 * WO-7.1 — the checkout attribution SEAM (SP-I09b précédence, wired). It does
 * NOT re-implement the resolver: it CONSUMES canon `resolveAttribution` (all
 * four branches, incl. the deliberate absence of any platform fallback) and
 * the two-scope machinery (`normalizeShortCode`, `ResellerShortCodeSchema`,
 * `ARRIVAL_TTL_POLICY`). Its only job is the wiring the app surfaces need:
 *
 *  · resolve an EXPLICIT typed code, tolerantly (A7) but fail-closed — a
 *    mis-shaped or unknown code fabricates NO reseller;
 *  · feed the lock, the explicit reseller, and the recorded arrivals to the
 *    canon resolver with the versioned TTL;
 *  · when a reference was PRESENTED (a typed code, a signed token that the
 *    verifier refused, or arrivals) yet nobody resolved, raise the canonical
 *    reconciliation.alert.v1 so operations sees the contested checkout — the
 *    outcome is still NOBODY, NEVER the platform (Ten Laws #1/#2, SP-I09b.4).
 *
 * The signed-token path itself is verified upstream by `verifyAttributionToken`
 * (tamper fails closed); this seam only takes the boolean fact that a presented
 * token was refused, so it can raise the alert — it never repairs a token.
 */

export interface CheckoutAttributionInput {
  /** Set when the order is already locked — attribution is immutable (SP-I09b.1). */
  readonly lockedResellerId?: string;
  /** The raw short code the buyer typed at payment (A7 tolerant input), if any. */
  readonly typedShortCode?: string;
  /** True when a signed token was presented and `verifyAttributionToken` REFUSED it. */
  readonly presentedTokenFailed?: boolean;
  /** Recorded arrivals (identity from the vitrine, product from signed links). */
  readonly arrivals: readonly AttributionArrival[];
  readonly nowIso: string;
  readonly correlationId?: string;
  /** Server-side registry: a valid short code → the reseller it names, or undefined. */
  readonly resolveShortCode: (code: string) => string | undefined;
}

export interface CheckoutAttributionOutcome {
  readonly resolution: AttributionResolution;
  /** Present only when a reference was presented but attributed nobody. */
  readonly alert?: PlatformEvent;
}

export function resolveCheckoutAttribution(input: CheckoutAttributionInput): CheckoutAttributionOutcome {
  // Explicit code (A7): normalize tolerantly, validate the SHAPE, then resolve
  // server-side. Any failure → NO explicit reseller (fails closed, never fabricated).
  let explicitResellerId: string | undefined;
  let typedCodeUnresolved = false;
  const typed = input.typedShortCode?.trim();
  if (typed !== undefined && typed !== '') {
    const normalized = normalizeShortCode(typed);
    const resolved = ResellerShortCodeSchema.safeParse(normalized).success
      ? input.resolveShortCode(normalized)
      : undefined;
    if (resolved !== undefined) explicitResellerId = resolved;
    else typedCodeUnresolved = true;
  }

  const resolution = resolveAttribution({
    ...(input.lockedResellerId !== undefined ? { lockedResellerId: input.lockedResellerId } : {}),
    ...(explicitResellerId !== undefined ? { explicitResellerId } : {}),
    arrivals: input.arrivals,
    nowIso: input.nowIso,
    ttlDays: ARRIVAL_TTL_POLICY.ttlDays,
  });

  // A reference was PRESENTED if the buyer typed a code, a signed token was
  // refused, or any arrival was on file. Nothing presented + nobody resolved is
  // an organic no-attribution, not an alert.
  const referencePresented =
    typedCodeUnresolved || input.presentedTokenFailed === true || input.arrivals.length > 0;

  if (resolution.attributed === false && referencePresented) {
    return {
      resolution,
      alert: PlatformEventSchema.parse({
        name: 'reconciliation.alert.v1',
        envelope: {
          command_id: `attr-unresolved-${input.correlationId ?? 'checkout'}`,
          correlation_id: input.correlationId ?? 'unknown',
          aggregateVersion: 1,
          actor: 'attribution-service:resolution',
          serverTime: input.nowIso,
          version: '1',
        },
        payload: {
          alert: 'attribution_presented_but_unresolved',
          typed_code_unresolved: typedCodeUnresolved,
          token_refused: input.presentedTokenFailed === true,
          arrivals_on_file: input.arrivals.length,
        },
      }),
    };
  }

  return { resolution };
}
