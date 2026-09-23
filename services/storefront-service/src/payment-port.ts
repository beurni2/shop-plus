import { MockPaymentProvider, type PaymentMockConfig } from '@shop-plus/commerce-core';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PROVIDER SEAM (SP3.3a). One verb, one implementation, no aggregator.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══ WHAT THIS SEAM IS ALLOWED TO KNOW, AND WHAT IT IS NOT ═══
 *
 * Build Spec §12 carries an OPEN DECISION (⏳) covering « aggregator selection +
 * BCEAO perimeter + two-leg/refund fees + auth/capture (Real-Money Gate) », and
 * §5.5 records that « "Held/escrow" wording is a legal Decision ». None of those
 * are closed here and none are guessed at:
 *
 *   · NO AGGREGATOR IS NAMED — not in code, not in config, not in a comment.
 *   · NO CREDENTIAL EXISTS. There is nothing to authenticate to: the only
 *     implementation is the vault's certified sandbox mock, in-process.
 *   · NO AUTH/CAPTURE SEMANTICS ARE INVENTED. The seam has ONE verb —
 *     `initiateCharge` — because that is the only thing this slice does. Whether
 *     a real provider authorises then captures, or collects once, is the open
 *     Decision's to settle, and a seam that already modelled it would be that
 *     Decision made quietly.
 *
 * ═══ WHY THE PORT IS ASYNC WHEN THE MOCK IS SYNCHRONOUS ═══
 *
 * Execution Contract §3: « A mock is not trustworthy until it misbehaves like the
 * real service. » A synchronous port would make every future caller's control
 * flow assume an answer that cannot be late — and « late » is the single most
 * common real behaviour of a mobile-money call in Ouagadougou. The port is a
 * Promise so that the timeout branch below is a REAL branch its callers must
 * handle, not a shape that only appears the day a real adapter lands.
 *
 * ═══ PROVIDER WEBHOOKS ARE THE ONLY PAYMENT TRUTH (Ten Laws #2) ═══
 *
 * An `accepted` answer from this port is NOT payment. It means a charge was
 * initiated; nothing about the order's money state moves until a signed webhook
 * arrives on the webhook route and the vault's spine validates it to the franc.
 * Nothing in this module ever reports an amount as paid.
 */

/** What a charge is, in the only vocabulary this slice needs. */
export interface ChargeCommand {
  readonly orderId: string;
  /**
   * ═══ THE PROVIDER IDEMPOTENCY KEY — AND IT IS NOT THE AUDIT ATTEMPT ID ═══
   *
   * It belongs to the LEG, not to the attempt. It is minted ONCE per
   * (order, legType), stored durably, and REUSED for every retry of that leg —
   * which is the certified mock's own stated contract
   * (`payment-provider-mock.ts`: « the retry path must reuse the SAME
   * idempotency key and never double-charge »).
   *
   * Conflating it with the state machine's attempt id — which
   * `order-machine.ts` REQUIRES to be new on the `payment_failed →
   * payment_pending` edge — is a DUPLICATE CHARGE: after an ambiguous timeout,
   * where the money may already have moved, a second key is a second collection
   * a provider cannot dedupe. SP-I13 forbids it in those words.
   */
  readonly paymentAttemptId: string;
  /** Read verbatim off the immutable Quote — never computed, never a caller's. */
  readonly amount: number;
  readonly correlationId: string;
  readonly requestedAtIso: string;
  /**
   * Which §5.6 leg this charge funds.
   *
   * SP4.2a-bis WIDENED THIS FROM `'checkout'` ALONE, and the old comment said
   * « this slice only ever funds `checkout` » — which was true, and was also the
   * reason the Option-B loop had no way to close: the product leg is « paid by
   * MoMo AT THE DOOR before custody transfer » (§5.5), and nothing could ask a
   * provider to collect it.
   *
   * THE TYPE IS THE ROUTING, not a hint: a caller must NAME the leg it is
   * funding, the amount beside it is read off that leg's own entry in
   * `requiredLegsFor`, and the provider key handed in belongs to that leg. There
   * is no branch anywhere that infers a leg from an amount.
   */
  readonly legType: 'checkout' | 'door';
}

/**
 * Every outcome ECHOES THE AMOUNT THE PORT WAS ACTUALLY CALLED WITH, and the
 * caller records THAT rather than the value it believes it passed. The two used
 * to be read independently, so changing the charged amount left the durable
 * record truthful-looking and every test green (found by mutation check). One
 * value, one source: what was asked for is what is written down.
 */
export type ChargeOutcome =
  | { readonly accepted: true; readonly collectRef: string; readonly chargedAmount: number }
  | {
      readonly accepted: false;
      /** NAMED, never a boolean: the two answers need different local knowledge. */
      readonly reason: 'timeout' | 'idempotency_key_amount_mismatch';
      readonly chargedAmount: number;
    };

/**
 * REMBOURSEMENT-1 (founder ruling 2026-09-23) — THE SECOND VERB: money back.
 * One refund of one paid leg, under a refund key minted ONCE for it and stored
 * durably BEFORE this call (the charge key's own law): a retry after an
 * ambiguous timeout reuses the key, so a provider can never refund twice. The
 * amount is read off the order's own paid leg, never a caller's.
 */
export interface RefundCommand {
  readonly orderId: string;
  readonly refundKey: string;
  readonly collectRef: string;
  readonly amount: number;
  readonly correlationId: string;
  readonly requestedAtIso: string;
  readonly legType: 'checkout' | 'door';
}

/** Accepted is NOT refunded: the refund webhook is the only truth of it. */
export type RefundOutcome =
  | { readonly accepted: true; readonly refundRef: string }
  | {
      readonly accepted: false;
      readonly reason: 'timeout' | 'idempotency_key_amount_mismatch' | 'refund_exceeds_collection' | 'refund_declined';
    };

/**
 * COLIS-2 (founder, 2026-09-23: « if her door payment's answer is lost and
 * she gives an article back before retrying, the retry still covers it ») —
 * THE THIRD VERB: what became of a charge whose answer never came, asked
 * under its own key. What a real adapter may answer is bound here, because
 * the whole safety of acting on it rests on it:
 *   · `collected`     — the provider TOOK the money under that key.
 *   · `not_collected` — a FINAL answer: the charge failed or expired and the
 *                       key will never take money. « Not found » is NOT this
 *                       (a late request may still land): it is `unknown`.
 *   · `unknown`       — anything else, including « still waiting for her ».
 * The caller acts only on the first two; `unknown` changes nothing.
 *
 * ⚠ ON `not_collected` THE CALLER SPENDS A NEW KEY (a smaller payment, for
 * what she keeps). If an adapter ever answered it wrongly and the old key
 * took the money after all, that late confirmation is refused on an article
 * already paid and only alerted on its record — nothing refunds it by itself
 * yet (COLIS-2 verifier M1, put to the founder). So a real adapter may NOT
 * be wired until it is certified (Execution Contract §3) to answer
 * `not_collected` only for a failure its provider guarantees final.
 */
export interface ChargeStatusCommand {
  readonly orderId: string;
  readonly paymentAttemptId: string;
  readonly legType: 'checkout' | 'door';
}

export type ChargeStatus =
  | { readonly status: 'collected'; readonly collectRef: string }
  | { readonly status: 'not_collected' }
  | { readonly status: 'unknown' };

export interface PaymentProviderPort {
  initiateCharge(command: ChargeCommand): Promise<ChargeOutcome>;
  initiateRefund(command: RefundCommand): Promise<RefundOutcome>;
  chargeStatus(command: ChargeStatusCommand): Promise<ChargeStatus>;
}

/**
 * The sandbox behaviour knobs a deployment may set. EMPTY IS THE DEFAULT AND THE
 * DEPLOYED VALUE — the well-behaved provider. It exists so the certified mock's
 * MISBEHAVIOUR is reachable deterministically from a test against the real
 * Worker, instead of being reachable only from a unit test that never crosses
 * workerd (Execution Contract §3: a mock nobody can make fail is a mock that
 * makes the integration look healthier than it is).
 */
export type SandboxBehavior = PaymentMockConfig;

/**
 * Parse the behaviour config. A missing or unreadable value is the WELL-BEHAVED
 * provider — the fail-safe direction, and the only one available: a config this
 * module cannot read is a config it must not act on.
 */
export function readSandboxBehavior(raw: string | undefined): SandboxBehavior {
  if (raw === undefined || raw === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SandboxBehavior;
  } catch {
    return {};
  }
}

/**
 * THE ONE IMPLEMENTATION: the FROZEN VAULT's certified sandbox mock, wrapped —
 * not reimplemented, not adapted. Every behaviour below is the mock's own.
 *
 * ═══ `attemptsAlreadyInitiated` — THE DURABLE HALF OF A MEMORY-ONLY MOCK ═══
 *
 * `MockPaymentProvider` counts its own timeouts and remembers its own attempt
 * keys IN MEMORY, and a Durable Object rebuilds its world on every request — so a
 * fresh instance would forget both, and « the first N initiates time out » would
 * silently become « every initiate times out ». The caller therefore passes how
 * many charges this order has ALREADY initiated (a durable count), and the
 * mock's remaining timeout budget is computed from it. Deterministic across a
 * process death, which is the only kind of determinism worth having here.
 *
 * The mock's OWN idempotency (« the same key never charges twice ») cannot
 * survive that same forgetting, and it is deliberately NOT relied upon: the
 * Durable Object refuses to initiate a charge for an attempt id it has already
 * recorded, and that durable record — not the provider's memory — is what makes
 * « no duplicate charge on retry » (SP-I13) true across a restart.
 */
export function sandboxPaymentProvider(
  behavior: SandboxBehavior,
  attemptsAlreadyInitiated: number,
  /** REMBOURSEMENT-1 — the same durable count, for refunds this order already asked. */
  refundsAlreadyInitiated = 0,
  /**
   * COLIS-2 — the charges already asked, in the order they were asked, from
   * the caller's durable record: the mock forgets them, so its answer to
   * `chargeStatus` is rebuilt by asking them again of a fresh mock with the
   * same behaviour — the provider's memory, replayed, never guessed.
   */
  historique: readonly ChargeCommand[] = [],
): PaymentProviderPort {
  const budget = behavior.timeoutFirstNInitiates ?? 0;
  const refundBudget = behavior.timeoutFirstNRefunds ?? 0;
  const mock = new MockPaymentProvider({
    ...behavior,
    timeoutFirstNInitiates: Math.max(0, budget - attemptsAlreadyInitiated),
    timeoutFirstNRefunds: Math.max(0, refundBudget - refundsAlreadyInitiated),
  });
  return {
    chargeStatus(command: ChargeStatusCommand): Promise<ChargeStatus> {
      const rejeu = new MockPaymentProvider(behavior);
      for (const h of historique) {
        rejeu.initiateCharge({
          orderId: h.orderId,
          paymentAttemptId: h.paymentAttemptId,
          amount: h.amount,
          correlationId: h.correlationId,
          requestedAtIso: h.requestedAtIso,
          legType: h.legType,
        });
      }
      return Promise.resolve(rejeu.chargeStatus(command.paymentAttemptId));
    },
    initiateRefund(command: RefundCommand): Promise<RefundOutcome> {
      const response = mock.initiateRefund({
        orderId: command.orderId,
        refundKey: command.refundKey,
        collectRef: command.collectRef,
        amount: command.amount,
        correlationId: command.correlationId,
        requestedAtIso: command.requestedAtIso,
        legType: command.legType,
      });
      if (response.outcome === 'accepted') return Promise.resolve({ accepted: true, refundRef: response.refundRef });
      if (response.outcome === 'timeout') return Promise.resolve({ accepted: false, reason: 'timeout' });
      return Promise.resolve({ accepted: false, reason: response.reason });
    },
    initiateCharge(command: ChargeCommand): Promise<ChargeOutcome> {
      const response = mock.initiateCharge({
        orderId: command.orderId,
        paymentAttemptId: command.paymentAttemptId,
        amount: command.amount,
        correlationId: command.correlationId,
        requestedAtIso: command.requestedAtIso,
        legType: command.legType,
      });
      // `chargedAmount` is the figure THIS CALL carried, echoed from the command
      // itself — never re-derived, so it cannot disagree with what was asked.
      if (response.outcome === 'accepted') {
        return Promise.resolve({
          accepted: true,
          collectRef: response.collectRef,
          chargedAmount: command.amount,
        });
      }
      if (response.outcome === 'timeout') {
        return Promise.resolve({ accepted: false, reason: 'timeout', chargedAmount: command.amount });
      }
      return Promise.resolve({ accepted: false, reason: response.reason, chargedAmount: command.amount });
    },
  };
}
