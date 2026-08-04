export * from '../../../packages/commerce-core/dist/quote-issuance.js';
export * from '../../../packages/commerce-core/dist/reservation.js';
export * from '../../../packages/commerce-core/dist/pay-at-door-policy.js';
// SP6.3 — §6.4's refusal ladder: the pure rung decisions, the buyer key, and
// the initial record. `BuyerLadderDO` stores what these return and decides
// nothing itself, so the ladder rules stay readable in one file in the vault.
export * from '../../../packages/commerce-core/dist/refusal-ladder.js';
// SP3.3a — the payment half of the vault. `order-spine.js` is the DECISION
// AUTHORITY for the provider webhook and for « no confirmed order without funded
// legs »; it pulls `order-machine.js` and `ledger.js` in through its own imports,
// and both are named here anyway so a future slice reaching for `advanceOrder` or
// `LedgerRecords` gets the vault's symbol rather than a second definition.
export * from '../../../packages/commerce-core/dist/order-machine.js';
export * from '../../../packages/commerce-core/dist/order-spine.js';
export * from '../../../packages/commerce-core/dist/ledger.js';
// The CERTIFIED sandbox provider (Execution Contract §3) — the ONE payment
// implementation this Worker has. It is deterministic and config-driven: no
// randomness, no clock, no network, and no aggregator named anywhere in it.
export * from '../../../packages/commerce-core/dist/mocks/payment-provider-mock.js';

/**
 * ═══ THE VAULT, NARROWED FOR THE WORKER BUNDLE — READ-ONLY, NOT REWRITTEN ═══
 *
 * `@shop-plus/commerce-core`'s package entry is a BARREL, and the barrel is not
 * bundlable for workerd: `dlq.js` opens with `import { createHash } from
 * 'node:crypto'`, which esbuild cannot resolve under `--platform=neutral` and
 * which workerd refuses to load without the `nodejs_compat` flag (both measured,
 * not assumed). The DLQ is E2 machinery this Worker never routes; it is simply
 * in the same barrel as the quote issuer.
 *
 * ═══ WHY THIS SHAPE AND NOT THE THREE ALTERNATIVES ═══
 *
 *  · EDITING THE VAULT is out, full stop. `packages/commerce-core` is FROZEN —
 *    byte-identical, zero diff — and a one-line `"sideEffects": false` or a
 *    subpath export in its package.json is still an edit to a frozen file.
 *  · TURNING ON `nodejs_compat` would change the runtime of the whole deployed
 *    Worker AND break `combined-worker.e2e.test.ts`, whose Miniflare does not
 *    set the flag — an existing suite this slice may not touch.
 *  · STUBBING `node:crypto` would put a throwing shim in a money Worker to
 *    satisfy dead code. A build-time absence beats a runtime landmine.
 *
 * ═══ WHAT IT ACTUALLY IS ═══
 *
 * A RE-EXPORT of three vault modules, by relative path into the vault's own
 * built `dist` — the identical artifact Node and vitest load through the package
 * entry. Nothing is copied, adapted or reimplemented here: every symbol below is
 * the vault's, and this file cannot drift from it because it contains no logic.
 * It follows the vault's OWN precedent — `packages/commerce-core/worker/
 * reservation-do.ts` imports `../src/reservation.js` rather than the barrel, for
 * exactly this reason.
 *
 * ═══ HOW IT IS WIRED, AND WHY THAT IS SAFE ═══
 *
 * `bundle:worker:combined` passes `--alias:@shop-plus/commerce-core=./worker/
 * commerce-core-worker.ts`, so source files keep importing the REAL package name
 * (TypeScript and vitest resolve it normally, through the pinned workspace
 * dependency) and only the Worker bundle receives the narrowed set. If a future
 * slice needs a vault symbol that is not re-exported here, the bundle FAILS TO
 * BUILD — loudly, at build time, never silently at runtime.
 */
