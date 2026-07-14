# SP#001-D — LA PREMIÈRE COMMANDE RÉELLE · review packet

**Slice:** SP#001-D (spine slice D of *SP#001 — The Seller #001 Spine*) · **🔴 RED** (money + custody + attribution).
**Branch:** `e7/wo-sp001-d` · **code head:** `ff85268` · **branched from B:** `7823b5d`.
**D-only code delta:** `git diff 7823b5d..ff85268` (see `code.diff` / `code.stat`).
**Status:** DO NOT MERGE — founder review gate.

---

## 1. WHAT D IS — minimal new code, maximal proof

The first real order end-to-end through REAL data, proving the spine holds to the franc:

**Seller #001's real storefront + published listing** (the A/B aggregates) → a qualified attribution token → **attribution LOCKED THROUGH THE DURABLE DO** (workerd) → **immutable Quote** from the real listing → order spine → provider payment **HELD** («en attente», no franc moves) → confirm → Séra eligibility → **settlement obligations** copied from the Quote to the DURABLE-LOCKED reseller.

New code is deliberately minimal — a thin durable-lock client (the re-pointed seam) — with the bulk of the slice being the end-to-end PROOF + the narrated run.

## 2. NAMED CONDITION ② — the lock goes THROUGH the durable DO (founder-ratified)

> "'locked through the durable book (slice C)' means through the `AttributionLockDO` — in D the checkout seam RE-POINTS to the durable authority, and D's fixtures prove the WIRED path (the DO), not the in-memory `AttributionLockBook`."

- **`services/attribution-service/src/durable-lock-client.ts`** — `lockThroughDurableAuthority(doFetch, {checkoutRef, correlationId, token, at})`: POSTs the claim to the `AttributionLockDO` (the DO owns `decideLock` + persistence) and translates the DO's HTTP response into the SAME `LockOutcome` the in-memory book returns, built with the SAME shared canon-event builders (`attributionLockedEvent` / `attributionCollisionAlert`). **Byte-equivalent to the book** (its unit test asserts `JSON.stringify` equality of the lock AND the event), and **fails closed** (throws, never fabricates a lock, never falls back to platform) on an unexpected authority response.
- **The e2e locks through the DO**: `premiere-commande-reelle.e2e.test.ts` hosts the real `AttributionLockDO` on **Miniflare (workerd)**; its `doFetch` dispatches to it; `lockOutcome.lock.resellerId` (from the DO) is the reseller carried into `issueQuote({attributionResellerId})` and into the obligations. Not the in-memory book.

## 3. THE FIXTURES (each a real assertion) + the narrated run

`test/premiere-commande-reelle.e2e.test.ts` (8 tests) + `test/durable-lock-client.test.ts` (5):
- **full préséance suite on the REAL storefront**: locked (from the DO) > explicit `SELLER-0001` > identity arrival; a `GHOST-0000` presented-but-unresolved → NOBODY + `reconciliation.alert.v1`, never the platform.
- **quote-immutable-on-real-listing**: reconciles to the franc — `productSubtotal 11500 = sellerNet 8500 + resellerNet 2000 + platformFee 1000`; `buyerTotal = productSubtotal + deliveryFee`; `amountPaidAtCheckout + amountDueAtDelivery = buyerTotal` — and a second `ImmutableQuoteStore.put` on the same id refuses (`quote_id_exists`).
- **obligation-equals-locked-quote**: the reseller obligation is `reseller:${DO-locked reseller}` (== `quote.attributionResellerId`), amount `== quote.resellerNet`, copied never recomputed; supplier `== quote.sellerNet`; state `Eligible`.
- **money-boundary-honest**: the checkout leg is `held` (never `captured`), aggregator stage `hold`, `payoutRefs == []` — «en attente», no franc captured or paid out.

**Narrated run** (`narrated-run.log`, emitted by the e2e on every run): the première-commande story on real data — storefront → listing @ HER price → LOCKED through the DO → immutable quote → held money boundary → obligations → confirmed.

**RED PROOF** (`red-proof.log`, throwaway test run then removed): the fixtures catch broken wiring — a quote issued for a RIVAL reseller makes `obligation-equals-locked` diverge (`reseller:rs-rival-9999` ≠ `reseller:rs-seller-0001`), and a `captured` leg fails the `held` assertion. The positive e2e proves the wired path; this proves the fixtures are not vacuous.

## 4. FORBIDDEN — held (byte-frozen)

- **`git diff --name-only 7823b5d..ff85268` touches ONLY `services/attribution-service/` + `pnpm-lock.yaml`.** Every commerce-core money/order/ledger/mock file (`quote-issuance`, `order-spine`, `order-machine`, `ledger`, the payment/sera mocks) is **byte-UNCHANGED** — D WIRES the frozen primitives with real inputs, modifies none. No buyer-pwa checkout/journey, no reseller earnings touched.
- No franc captured or paid out (leg `held`, stage `hold`, no payout). No custody transfer faked (real Séra dispatch deferred; the certified eligibility mock is the seam).
- No celebration (`première_vente` belongs to the first REAL franc). No ranking/ML. No invented canon shape or event name — the lock client reuses the shared canon-event builders.

## 5. EVIDENCE (this session's tool results)

- **Warm** (`warm-gates.log`): attribution-service **43/43** (durable-lock-client 5, première-commande e2e 8, attribution-lock-do e2e 7, + existing) · full turbo test **19/19 tasks** (commerce-core 86, buyer-pwa 94, reseller-app 89, discovery 8) · `run-gates.sh` **ALL GATES GREEN, rc=0** · typecheck clean (incl. worker/tsconfig).
- **Cold proof** — committed bytes at `ff85268` (`cold-proof.log`, script `cold-proof.sh`): `cold HEAD ff85268` · frozen install rc=0 · **0 ssh-form / 0 proxy-leak** · `ui-tokens 0.9.9` · **the cross-package e2e resolves + runs COLD** (commerce-core + storefront-service dist turbo-built, the `AttributionLockDO` bundled + hosted on real workerd via Miniflare) → attribution-service typecheck+test **43/43**, narrating «held»/«en attente» cold · `run-gates.sh` **ALL GATES GREEN, rc=0**.
- **Diff:** `code.diff` (6 files, attribution-service only + lockfile) · `code.stat`.

## 6. ARCHITECTURE CALLS (surfaced for founder review — my calls, not blockers)

- **e2e home:** the première-commande e2e lives in `attribution-service` (it owns the lock DO + the Miniflare harness), with `commerce-core` + `storefront-service` added as **test-only devDependencies** to reach the real aggregates + the quote/order/ledger/mocks. This keeps the DO harness where it already is; the alternative (a dedicated integration-tests package) is heavier. Cold proof confirms the cross-package resolution works under a frozen install.
- **narrated run:** the narration is emitted BY the e2e (console output on every run) rather than a separate script, because the run requires Miniflare (workerd). If you want a standalone narration script, it's a mechanical extraction.

## 7. FRESH-CONTEXT VERIFIER VERDICT

See `VERIFIER-VERDICT-verbatim.md` — copied verbatim, never rewritten.
