# LOCK-DURABILITY — Fresh-context verifier verdict (VERBATIM)

> Standing rule: the verifier's verdict is COPIED here, never rewritten. Anchored to code HEAD `a266a83`.

---

The mutation test is decisive: replacing `state.storage` with instance memory makes all 6 restart-crossing tests fail (only the non-restart router test survives). That proves the "restart" is a real process death and every durability assertion genuinely bites. Good bundle restored (empty diff). I have everything.

---

VERDICT: PASS

**A. SEMANTICS BYTE-UNCHANGED — PASS.** `test/lock.test.ts` is not in the diff's name-only list (unmodified) and still passes 4/4. The `lock.ts` diff shows the old private `lockedEvent` and inline collision alert became exported builders with byte-identical envelopes (`command_id: attr-lock-${checkoutRef}` / `attr-collision-${checkoutRef}-${seq}`, same `aggregateVersion`, same payload); decision branches map 1:1 through `decideLock`. `lock.test.ts:35-40` asserts refusal → `attribution_already_locked`, lock stays `rs-first`, `reconciliation.alert.v1`, `rejected_reseller_id: rs-second`, `buyerMessageRef: attribution.collision`; `:49` asserts idempotent `duplicate: true`. `decideLock` returns exactly `created|idempotent|collision` (`lock-core.ts:27-33`).

**B. DURABILITY IS REAL — PASS.** DO persists via `state.storage.put/get` (`attribution-lock-do.ts:47,63,67,75-76`), addressed by `idFromName(checkoutRef)` (`:115`). e2e uses `durableObjectsPersist: persist` on an on-disk `mkdtempSync` dir (`test:18,26`); `restart()` = `await mf.dispose(); mf = makeMf()` on the same dir (`:30-33`). Ran on real workerd: 7/7 pass. Mutation to instance-memory DO fails all 6 restart tests → the restart is a real process death, not a second request (vs. commerce-core `reservation-do.e2e.test.ts:93-99`, which only probes within-instance persistence).

**C. FIVE CLAIMS EACH ASSERT — PASS.** Mutation proves none is trivially true. (1) survive: reads back `rs-A`/`att-1` after restart (`:70-72`). (2) first-lock-wins-across-restart: restart sits between claim#1 (`:76`) and claim#2 (`:79`); second → 409 collision, `existing.resellerId rs-A`, re-read `rs-A` (`:82-85`). (3) replay-identical: `JSON.stringify` equality over 3 checkouts **plus** `rebuilt['chk-2'].resellerId==='rs-2'` (`:105-106`) defeats the all-null trivial pass. (4) collision-alert-durable: feeds the DO's durable `existing/rejected/seq` into the SAME `attributionCollisionAlert` builder, asserts `locked_reseller_id rs-A`, `rejected_reseller_id rs-B`, lock unchanged (`:117-128`). (5) never-platform: asserts `rs-A`, `not /platform|shop-plus/i`, not `''`, untouched checkout `toBeNull()` (`:140-145`).

**D. NEVER-PLATFORM ON DURABLE PATH — PASS.** `decideLock`: `created` carries `claim.resellerId` (`lock-core.ts:47`), `idempotent` carries `current` unchanged (`:54`), `collision` carries `existing` unchanged + `rejected=claim.resellerId` (`:57-60`); DO GET returns `{lock:null}` on empty storage (`do:47`). No platform sentinel in either file.

**E. FORBIDDEN HONORED — PASS.** name-only diff touches only `services/attribution-service/*` + `pnpm-lock.yaml`. `resolution.ts` empty diff; `commerce-core/src/order-spine.ts`, `quote-issuance.ts`, `reseller-app/src/journey.ts`, `earnings.ts` all empty diff.

**F. SUBSTRATE BY DERIVATION, ZERO NEW DEPS — PASS.** DO mirrors `reservation-do.ts` (constructor(state)→fetch→`storage.get/put`→`idFromName` router with refuse-closed mismatch guard). `miniflare`/`esbuild`/`@cloudflare/workers-types` carry the same specifiers *and* resolved versions as commerce-core (`4.20260702.1` / `0.25.12` / `4.20260708.1`); `bundle:worker`+`pretest` mirror commerce-core's scripts. Worker bundle: 0 `@platform/contracts`; committed bundle byte-identical to a fresh esbuild of committed source. `grep -c 'git@github.com:' pnpm-lock.yaml` == 0.

BLOCKING FINDINGS: none.

NON-BLOCKING NOTES:
- The canon `PlatformEvent`s are constructed by the shared builder invoked in the test from the DO's returned decision facts, not emitted on the wire by the DO itself (correct seam — keeps `@platform/contracts` out of the worker bundle). The DO→canon-event emission wiring lives outside this DO and outside this WO's scope; the durable decision facts it returns are what the builder consumes, so the invariant is genuinely asserted.
- `attributionLockedEvent` pins `aggregateVersion: 1` for every lock including idempotent replays — pre-existing behavior, preserved byte-for-byte, in-scope-correct.
