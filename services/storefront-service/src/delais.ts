/**
 * VITRINE-LECTURE-1 (AUDIT-SHOP-2 F-29) — THE TWO CEILINGS ON AN OUTBOUND WAIT.
 *
 * No outbound call in this Worker carried a timeout: a slow producer stalled
 * every quote and every boutique read up to the platform's own limits, and an
 * alarm flusher held its Durable Object for as long as the far side cared to
 * take. So the checkout budget (« server ≤ 800 ms p95 », PERF-BUDGETS) was
 * unbounded by construction, and the offline-first law was broken from the
 * server side — a buyer on 2G waiting on Boutik+'s slow day saw nothing at all.
 *
 * Two values, deliberately apart:
 *  · the BUYER-PATH read (a supply describe on a quote, the collection read on
 *    a boutique) — a timeout here is the existing honest branch, « undescribable »
 *    / `unknown`: the product is omitted and the page SAYS it is incomplete;
 *  · the FLUSHERS (the outbox wires to Boutik+ and custody) — a timeout is one
 *    failed attempt; the alarm re-arms with its capped backoff exactly as it does
 *    for a refusal, so nothing is lost and nothing is held.
 *
 * One module, no imports, so every reader — `supply-source`, `supply-collection`,
 * the order object — takes the value from one place and none can drift.
 */
export const SUPPLY_READ_TIMEOUT_MS = 2_000;
export const FLUSHER_TIMEOUT_MS = 10_000;
