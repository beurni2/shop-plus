import { DeliveryFeeQuoteSchema, type DeliveryFeeQuote } from '@platform/contracts';

/**
 * SANDBOX TARIFF — THE CONTRACT-CERTIFIED DELIVERY SOURCE (SP3.2a).
 *
 * ═══ WHY THIS FILE EXISTS AT ALL ═══
 *
 * D — the delivery charge — is SÉRA'S to price (Build Spec §5: `DeliveryFeeQuote`
 * is « OWNER: Logistics (Séra) → Checkout »). Séra's service is not live, so the
 * checkout path has no authority to ask. This module is that authority's STAND-IN,
 * and it is deliberately the dumbest thing that can be honest: a fixed, versioned
 * ZONE TABLE. It is replaced, whole, by Séra's live quote; nothing else in this
 * repo may compute D, ever (Ten Laws #2 — « no app … computes another domain's
 * amounts »).
 *
 * ═══ MOCK CERTIFICATION (Execution Contract §3) ═══
 *
 * A mock that only ever succeeds makes the integration look healthier than it is.
 * This one reproduces the failure surface the real service has:
 *   · UNSERVIEABLE PAIRS EXIST and are the DEFAULT. Any pair the table does not
 *     name answers `serviceable: false`. Séra does not deliver everywhere, and a
 *     checkout that quietly invented a fee for an unreachable address would put a
 *     buyer's money against a delivery nobody promised.
 *   · THE ANSWER IS VERSIONED (`version`), exactly as the canon shape requires, so
 *     a quote issued today names the tariff it was priced under.
 *   · IT IS TOTAL and synchronous: no timeout branch is simulated, because the
 *     caller of a LIVE Séra would treat an unreachable service as a refusal, never
 *     as a fee. That is the one behaviour this stand-in cannot exercise and it is
 *     named here rather than left to be discovered (see the header note in
 *     `checkout-core.ts`: an unserviceable answer and an unreachable service must
 *     land on the SAME refusal).
 *
 * ═══ DETERMINISTIC ONLY (Ten Laws #5) ═══
 *
 * A TABLE, never a formula, never a distance model, never anything tuned by
 * something learned. Two identical requests get the identical answer forever.
 *
 * ═══ THE ONE FIGURE, AND WHERE IT COMES FROM ═══
 *
 * The single serviceable row carries D = 1 000 FCFA. That is NOT invented here:
 * it is the delivery figure of the §5.4 WORKED BASELINE the whole repo already
 * reconciles against (`gates/fixtures/quote.baseline.json`,
 * `WORKED_BASELINE_INPUT`). Using the baseline's own number keeps the sandbox
 * quote arithmetically comparable to the canon worked example instead of adding
 * a second, unexplained tariff to the repo.
 */

/** Every answer names the tariff it came from — a quote is replayable or it is nothing. */
export const DELIVERY_TARIFF_VERSION = 'sera-sandbox-tariff.v1';

interface TariffRow {
  readonly zoneFrom: string;
  readonly zoneTo: string;
  /** Integer FCFA. */
  readonly fee: number;
}

/**
 * THE TABLE. One row, on purpose: `Ouagadougou` is the ONLY zone identifier that
 * exists anywhere in this repo's storefront data, and inventing a vocabulary of
 * zones would be inventing Séra's product. Rows are added when Séra names them —
 * or, sooner, the whole module is deleted the day the live quote arrives.
 */
const TARIFF: readonly TariffRow[] = [{ zoneFrom: 'Ouagadougou', zoneTo: 'Ouagadougou', fee: 1_000 }];

/**
 * The zone pair → `DeliveryFeeQuote`. TOTAL: it never throws.
 *
 * THREE ANSWERS, AND ONLY ONE OF THEM IS A PRICE:
 *   · a table row      ⇒ `serviceable: true` with that row's integer fee;
 *   · no table row      ⇒ `serviceable: false`;
 *   · zones that cannot even form a canon `DeliveryFeeQuote` (empty, untrimmed —
 *     which is what an ABSENT storefront yields upstream) ⇒ `undefined`.
 *
 * THE THIRD CASE IS WHY THIS RETURNS AN OPTIONAL, and it is a defect this file
 * shipped with for one test run: `DeliveryFeeQuoteSchema` refuses an empty zone
 * string, so parsing eagerly turned « the shop does not exist » into a THROWN
 * ZodError on the money path — a 500 where a named refusal belongs. `safeParse`
 * and `undefined` put it back where it belongs: `decideIssueQuote` reads
 * `undefined` as `delivery_not_serviceable`, the identical refusal an unknown
 * zone gets. AN UNQUOTABLE DELIVERY AND AN UNREACHABLE SÉRA MUST LOOK THE SAME
 * FROM HERE; neither is ever a fee.
 *
 * THE `fee: 0` ON AN UNSERVICEABLE ANSWER IS NOT A PRICE. The canon shape requires
 * a number in that slot and there is no absent value to put there, so it carries
 * the only figure that cannot be mistaken for a tariff. It is unreachable as an
 * amount: `decideIssueQuote` refuses on `serviceable === false` BEFORE it reads
 * `fee`, and that ordering is asserted by test. A caller that read `fee` without
 * reading `serviceable` would be quoting free delivery — which is why no caller
 * may exist outside this module's one consumer.
 */
export function quoteDeliveryFee(zoneFrom: string, zoneTo: string): DeliveryFeeQuote | undefined {
  const row = TARIFF.find((r) => r.zoneFrom === zoneFrom && r.zoneTo === zoneTo);
  const parsed = DeliveryFeeQuoteSchema.safeParse({
    zoneFrom,
    zoneTo,
    fee: row === undefined ? 0 : row.fee,
    serviceable: row !== undefined,
    version: DELIVERY_TARIFF_VERSION,
  });
  return parsed.success ? parsed.data : undefined;
}
