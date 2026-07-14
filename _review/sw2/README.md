# SW-2 — THE SUPPLY CONSUMER (the seed seam dies) · review packet

**Slice:** SW-2 (🟠 AMBER, M) — the Shop+ consumer of Boutik+ supply read-models.
**Branch:** `e7/wo-sw-2` · **code head:** `79a8953` · **branched from main:** `421bd9f`.
**Transport:** B (HTTP read-model PULL; staleness blocks agreement). **C (push/bus) is the frozen target — NOT built here.**
**Status:** DO NOT MERGE — founder review gate.

---

## 1. THE FRESHNESS THRESHOLD — STOPPED, then RULED

Canon/specs were **silent** on the staleness number: SP2 (`Shop-Plus-Build-Spec:174`) and SP1.1 (`Building-Plan:43`) state "stock freshness … **stale → block agreement**" with no figure. The only TTLs in the system are reservation (2 min), quote (15 min), arrival (30 days) — none for supply projections. The CTO **STOPPED AND FLAGGED** (§7; failure-mode #3 — never invent a number for an open Decision). **Founder ruling (2026-07-15): 15 minutes** (= the quote TTL). `SUPPLY_PROJECTION_MAX_AGE_MS = 15 * 60 * 1000`, journaled.

## 2. THE SHARED CONTRACT (mirrored from SW-1, byte-compatible)

SW-1 lives in `boutik-plus/services/offer-service`; its `shop-projection-consumer-mock.ts` is the certified counterparty. SW-2 mirrors it VERBATIM:
- **Read-model envelope** `{ version, asOf, value }` — the SW-1↔SW-2 agreed contract (canon has no wrapper); **`value` = the canon strict five-field `SupplyProjectionSchema`**, consumed verbatim (`read-model.ts`).
- **`IDENTITY_LEAK`** regex copied verbatim from SW-1 (`/supplier[_-]?(id|name|phone|contact)|phone|whatsapp|pickup|adresse|address/i`).
- **`consumeProjection` law** mirrored for the pull path: reject non-contract payloads, sweep leak keys (refuse closed), keep the newest version.

## 3. WHAT WAS BUILT

| Piece | File | What |
|---|---|---|
| THE CONSUMER | `packages/supply-consumer/src/consumer.ts` | `consumeSupplyProjection(port, pv, now)` → pull → **identity sweep** → strict envelope+value parse → **freshness (15 min)** → verdict (`fresh`/`stale`/`absent`/`rejected`). `canBackAgreement` true ONLY for `fresh` (the block). `SupplyProjectionCache` — versioned, keeps newest. |
| the port + mock | `port.ts` (in consumer.ts) · `mock.ts` | `SupplyProjectionPort.readProjection`; the **certified mock** misbehaves on demand (stale `asOf`, planted leak key). SW-1's real endpoint plugs into the same port at integration. |
| the contract | `read-model.ts` | `SupplyReadModelSchema` = `{version, asOf, value: SupplyProjectionSchema}.strict()`; `SUPPLY_PROJECTION_MAX_AGE_MS`; `IDENTITY_LEAK`. |
| seed-death reconciliation | `opportunity.ts` | `opportunityMoneyFromSupply` — a live projection's B, C through the **PINNED `computeWaterfall`** → the seed's opportunity money, byte-for-byte. Waterfall CONSUMED, never touched. |
| no-supplier on the live path | `opportunity.ts` `customerSurfaceFromSupply` + `gates/fixtures/supply/live-customer-surface.json` + `scripts/run-gates.sh` | the customer surface derived from a live projection is `{productName, customerPriceFcfa}` only; the **actual `no-supplier-contact.mjs` gate scans a fixture produced by the consumer path**. |
| the block copy | `apps/reseller-app/i18n/catalog.json` | « Offre à confirmer — données périmées » + hint, register-tagged (`money`/`status`) — the honest state, never inline. |

## 4. THE FOUR RED-FIRST FIXTURES (+ red proof)

`packages/supply-consumer/test/consumer.test.ts`:
- **stale-blocks-agreement** — a 16-min projection → `stale`, `canBackAgreement` false.
- **fresh-pull-unblocks** — a 5-min projection → `fresh`, `canBackAgreement` true; the **boundary** is exact (15 min == fresh, +1 ms == stale).
- **leak-key-swept** — a planted `supplierPhone` → `rejected` (`identity_material_refused`); the strict schema independently rejects the extra key.
- **live-equals-seed-reconciliation** — every `seed.json` opportunity reproduced **byte-for-byte** from a live projection carrying the same B, C through `computeWaterfall` (reconciles to the franc).

**RED PROOF** (`red-proof.log`): a naive consumer (no freshness check, no sweep) → **stale-blocks-agreement FAILS** (a 16-min projection wrongly passes) and **leak-key-swept FAILS** (wrong/absent refusal). The gates catch the flaws.

## 5. FORBIDDEN — held

- **waterfall untouched · Quote/checkout byte-frozen** — `git diff --name-only 421bd9f..79a8953` touches nothing in `packages/commerce-core/**`, no quote/checkout/order-spine/journey/earnings file (verified). `computeWaterfall` is CONSUMED, never reimplemented.
- **no push/bus infra (that is C)** — pull-only: a `SupplyProjectionPort.readProjection` + a mock. No bus/subscription/websocket/queue.
- **contracts pin byte-frozen at 0.9.9** — no `@platform/contracts` pin change.
- Strings in the catalog, register-tagged. 0 ssh-form in the lockfile.

## 6. SCOPE BOUNDARY — surfaced honestly (RN + no-bus)

The reseller-app is React Native (Metro); its **runtime bundle cannot import `@platform/contracts`** (repo law — snapshot-only runtime, `demo/store.ts:12-14`). So `demo/store.ts` does **not** runtime-call the consumer. Item 3's DoD, per the founder's own spec, is the **reconciliation fixture** ("fixture: the live projection produces the same reconciling opportunity-card net the seed did") — **delivered and byte-proven**. The physical runtime re-point (RN → a live read-model service) needs either a service (bus/HTTP) — **FORBIDDEN this slice** — or bundling contracts into RN (repo law forbids). **It is the named SW-1 integration step** (the founder's own port framing: "SW-1's real endpoint plugs into the same port at integration — a named final check, not this slice's gate"). Flagged so it's not a surprise.

## 7. EVIDENCE

- **Warm** (`warm-gates.log`): supply-consumer **9/9** (4 fixtures + reconciliation + no-supplier live path); `run-gates.sh` **ALL GATES GREEN, rc=0** (incl. the new `no-supplier-contact-supply-live` gate + reseller-app copy-lint with the block copy); full turbo typecheck+test **32/32**.
- **Cold proof** (`cold-proof.log`, `cold-proof.sh`): `cold HEAD 79a8953` · frozen install rc=0 · **0 ssh-form / 0 proxy-leak** · ui-tokens 0.9.9 · supply-consumer 9/9 + consumers cold (18 tasks) · `run-gates.sh` **ALL GATES GREEN**. (The lockfile required a normalization re-resolve to keep 0 ssh-form — the recurring new-git-dep leak, fixed.)
- **Red proof:** `red-proof.log`. **Diff:** `code.diff` (571 lines) · `code.stat`.

## 8. FRESH-CONTEXT VERIFIER VERDICT

See `VERIFIER-VERDICT-verbatim.md` — copied verbatim, never rewritten.
