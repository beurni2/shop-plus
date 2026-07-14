# SW-2 — FRESH-CONTEXT VERIFIER VERDICT (verbatim, never rewritten)

Fresh-context subagent, no memory of the build. Given: the SW-2 scope, the 15-min ruling, the SW-1 `consumeProjection` law to mirror, the four fixtures, the FORBIDDEN set, and the diff (`git diff 421bd9f..79a8953`). It read the pin + SW-1's mock, ran the tests + the gate itself. Copied exactly as returned:

---

All checks complete. Writing the verdict.

---

VERDICT: PASS

**A. The consumer is correct and invents no canon shape** — blocker-free. `packages/supply-consumer/src/consumer.ts:43-68` pulls raw bytes via the `SupplyProjectionPort.readProjection` port (`consumer.ts:19-22`), parses through `SupplyReadModelSchema` (`read-model.ts:28-34`) — a `.strict()` envelope `{version, asOf, value}` whose `value` is the canon `SupplyProjectionSchema` imported verbatim from `@platform/contracts` (`read-model.ts:1`). I confirmed the canon schema is the strict five-field shape (`node_modules/@platform/contracts/dist/shapes/commerce.js:172-181`: `productVersionId, offerVersion, basePrice, resellerCommission, available`, `.strict()`) and that the consumer wraps it rather than redefining it. Freshness: `ageMs = Date.parse(now) − Date.parse(asOf)`, stale when `> SUPPLY_PROJECTION_MAX_AGE_MS` (`consumer.ts:63-66`). `canBackAgreement` returns true only for `status === 'fresh'` (`consumer.ts:76-78`). `SUPPLY_PROJECTION_MAX_AGE_MS = 15 * 60 * 1000` (`read-model.ts:18`), journaled to the founder 2026-07-15 ruling, aligned to quote TTL.

**B. IDENTITY_LEAK regex byte-identical to SW-1** — verified by direct byte comparison: SW-2 `read-model.ts:25` equals SW-1 `boutik-plus/services/offer-service/mocks/shop-projection-consumer-mock.ts:23` exactly (`/supplier[_-]?(id|name|phone|contact)|phone|whatsapp|pickup|adresse|address/i`). Sweep runs FIRST and refuses closed (`consumer.ts:51-52`), mirroring SW-1's `consumeProjection` law.

**C. The four red-first fixtures are real assertions** — not vacuous. `test/consumer.test.ts`: stale-blocks (16 min → `stale`, `canBackAgreement` false, L52-58); fresh-unblocks (5 min → `fresh`, asserts basePrice/commission passthrough + true, L31-39); exact boundary (15 min → `fresh`; 15 min + 1 ms → `stale`; MAX_AGE pinned, L41-50); leak-swept (planted `supplierPhone` → `rejected`/`identity_material_refused`, AND independent `SupplyReadModelSchema.safeParse(...).success === false` proving `.strict()` rejects the extra key, L60-69).

**D. Reconciliation is a genuine three-way byte-for-byte anchor** — blocker-free. `test/consumer.test.ts:91-125` loads `apps/reseller-app/src/demo/seed.json`, asserts `opportunities.length > 0`, and for each of the 7 opportunities feeds the seed's B (`sellerBasePrice`) and C (`sellerFundedCommission`) through a live projection → consumer → `opportunityMoneyFromSupply` (which calls the pinned `computeWaterfall`), then `expect(money).toEqual(opp.money)` AND `expect(money).toEqual(computeWaterfall(opp.input))`. This proves the seed's stored money is itself waterfall-derived and the live path reproduces it byte-for-byte. I hand-checked o1 and o3 to the franc (e.g. o3: B6500/C650/M1000/D1000 → subtotal 7500, buyerTotal 8500, sellerNet 5525, resellerNet 1320, platformProductFeeRevenue 655) — reconciles.

**E. Money core untouched / no pin change** — `git diff --name-only 421bd9f..79a8953` touches nothing in `packages/commerce-core/**` and no `quote`/`checkout`/`order-spine`/`journey`/`earnings` file. The waterfall is consumed (`opportunity.ts:1-7,44`), never reimplemented. Root `package.json` diff is empty; the new pnpm-lock importer uses the same commit `1c98ad15…` as every other importer; installed `@platform/contracts` resolves to **0.9.9**. No pin change.

**F. Pull-only, no bus infra (C forbidden here)** — the slice is a port + mock `readProjection` (`mock.ts:34-46`). Grep for `eventbus|subscribe|websocket|amqp|kafka|queue|publish|emitter|pubsub` across `src/` returns only the prose word "publish" in a comment (`consumer.ts:72`). No subscription/websocket/queue code.

**G. no-supplier-contact on the LIVE path** — `test/no-supplier-live-path.test.ts:41-46` pins the checked-in fixture to the consumer output (`liveCustomerSurface()`), so the gate scans real live-derived data. `gates/fixtures/supply/live-customer-surface.json` carries only `{productName, customerPriceFcfa}` (9200 = B8000+M1200, verified). `scripts/run-gates.sh:127-128` scans it with `scripts/gates/no-supplier-contact.mjs`; I ran the gate directly → exit 0.

**H. Block copy in catalog, register-tagged** — `apps/reseller-app/i18n/catalog.json` gains `opportunite.perimee` = « Offre à confirmer — données périmées », `register: "money"`, plus a hint string. Not inline.

**I. 0 ssh-form in pnpm-lock** — grep for `git+ssh|ssh://|git@github` returns none.

**J. Tests + gate RUN GREEN** — `pnpm --filter @shop-plus/supply-consumer test` → **9 passed (2 files: 7 consumer + 2 no-supplier-live-path)**, 0 fail. `node scripts/gates/no-supplier-contact.mjs gates/fixtures/supply/live-customer-surface.json` → exit 0.

**Observations (non-blocking):**
- (obs) The runtime seam is proven-killable, not physically killed: `apps/reseller-app/src/demo/store.ts:3` still `import rawSeed from './seed.json'` at runtime, and the RN app imports only `type`-level `@platform/contracts` (Metro-safe), never the supply-consumer package. This is exactly the stated scope boundary — I judge the reconciliation fixture ADEQUATELY satisfies the founder's item-3 DoD ("the live projection produces the same reconciling opportunity-card net the seed did"), and the physical RN→live-service re-point was correctly NOT required here (it is SW-1 integration; wiring a live read-model service would be C-transport/bus-adjacent, forbidden this slice; and the RN snapshot-only runtime law bars importing contracts values into the bundle).
- (obs) `IsoTimestampSchema` in canon is `z.string().min(1)` (not a strict ISO format), so a malformed `asOf` would yield `Date.parse → NaN` and `NaN > threshold === false` → treated as fresh rather than rejected. The consumer relies on the canon schema verbatim (correct per spec) and SW-1 emits real ISO timestamps, so this is edge-case hardening to note at SW-1 integration, not a defect in SW-2.
- (obs) `catalog.json` now ends without a trailing newline (cosmetic).
- (obs) SW-2 is a deliberately narrow slice: the full SP1.1 net-first quality-card UI and its "net shown, not gross" CI (`Shop-Plus-Build-Spec:174`, `Building-Plan:43`) are not in this file set — consistent with the slice scope (consumer + seam), not a gap in what SW-2 claims.

**Rationale:** Every load-bearing claim verifies against read code and executed tools. The consumer consumes the canon strict five-field `SupplyProjectionSchema` verbatim, wraps it in the agreed SW-1↔SW-2 envelope, sweeps a byte-identical identity regex, and blocks at exactly `15*60*1000` ms with an exact boundary test. The four fixtures assert real behavior (including an independent strict-schema rejection and a three-way byte-for-byte reconciliation across all 7 seed opportunities that also re-derives the seed money from the pinned waterfall). The money core, waterfall, and the 0.9.9 contracts pin are untouched; the slice is pull-only with no bus infra; the customer surface is minimal and gated on live-derived data; the block copy is catalog-resident and register-tagged; no ssh-form leaked into the lock. Tests are 9/9 green and the no-supplier gate exits 0. The RN runtime seam is delivered as a reconciliation proof rather than a physical re-point, which matches the declared scope boundary and the founder's item-3 DoD.

---

**CTO note on the observations (carried to the founder, not resolved by me):**
- **The IsoTimestamp fail-open (obs 2)** is the one I'd act on. A malformed-but-non-empty `asOf` passes canon's loose `IsoTimestampSchema` (`z.string().min(1)`), then `Date.parse → NaN`, and `NaN > threshold` is `false` → the consumer treats it as **fresh**. That contradicts the founder's own item-2 invariant ("never a silent pass, never a fabricated freshness"). **My recommendation: harden fail-closed in SW-2** — a one-line guard rejecting a `NaN` `asOf` (verdict `rejected`/`stale`, never `fresh`) closes the hole without touching canon. It aligns with the named invariant, so I flag it for your ruling (like S8's finding G); on your word I add the guard + re-verify pre-merge.
- **The scope boundary (obs 1)** — the verifier independently VALIDATED that the reconciliation fixture satisfies item-3's DoD and the physical RN re-point was correctly not required this slice. No action; confirming my flag was right.
- obs 3 (trailing newline) is cosmetic; obs 4 confirms the narrow slice scope.
