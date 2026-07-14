# S8 — LA RÉPUTATION RENDERED · review packet

**Slice:** S8 — « N ventes livrées » (the réputation count law, rendered).
**Branch:** `e7/wo-s8-reputation` · **code head:** `bc45abe` · **branched from main:** `dd2a304`.
**Delta:** `git diff dd2a304..bc45abe` (see `code.diff` / `code.stat`).
**Priority:** 🟠 AMBER (small). **Status:** DO NOT MERGE — founder review gate.

---

## 1. GATE + CANON (verified by my own fetch)

Gated on canon **WO-5.15**. Verified merged: `006e2f5 merge(canon): the réputation law (S8 …) — founder review passed`; canon main journals it done. **Docs-only, no version bump** → this repo STAYS pinned at contracts **0.9.9** (no re-pin). The shapes the law needs (`delivery.validated.v1`, `Order.resellerId`, …) all exist at 0.9.9; the drift-check stays green at 0.9.9.

**The law (canon Shop-Plus-Build-Spec §SP8, quoted):** « la réputation d'une revendeuse EST le nombre de ventes livrées — an exact count, never a rank, never a score, never a comparison. » Source `delivery.validated.v1` via the LOCKED `Order.resellerId` (SP-I01). Rendered « N ventes livrées », floor = 1, shown from the first delivered sale.

**The five-hop linkage (canon `REPUTATION-LAW.md`, all existing fields, no shape invented):** `delivery.validated.v1` → `ValidationDecision.taskId` → `DeliveryTask.orderId` → `Order.resellerId` (LOCKED) → `Storefront.resellerId`. So **réputation(R) = |{ validated order : Order.resellerId = R }|**.

## 2. WHAT WAS BUILT

| Piece | File | What |
|---|---|---|
| THE COUNT PROJECTION | `packages/store-projection/src/reputation.ts` | `countDeliveredSales(events, resellerId)` — the exact count of DISTINCT validated orders for ONE reseller. Deterministic (no clock/window/decay); idempotent (dedup by `orderId`); **un-rankable by construction** (per-reseller integer, no compare/sort/leaderboard API). |
| THE RENDER — vitrine | `apps/buyer-pwa/src/vitrine-view.ts` | « N ventes livrées » on the trust chrome; floor = 1 (hidden at 0); `renderVitrine(model, reputation?)` — réputation kept OUT of the pinned `VitrineViewModel` so the SP-I03 fixture is untouched. |
| THE RENDER — directory | `apps/buyer-pwa/src/boutiques-view.ts` | « N ventes livrées » chip on the store card; floor = 1. |
| demo source + wiring | `demo-stores.ts`, `boutiques-data.ts`, `vitrine-link.ts`, `main.ts` | one demo delivered-sale event log; every rendered count is FOLD-derived (`countDeliveredSales`), never hard-coded; the count carries a « démo » marker (test data under the « données d'essai » ribbon). |
| strings | `apps/buyer-pwa/i18n/catalog.json` | `reputation.ventes_livrees` (register `selling`), `reputation.demo` (register `neutral`) — in the catalog, not inline (Ten Laws §6). |

**OUT of scope:** no re-pin (docs-only law) · the real delivery-validated event wire (E2/E3 · Séra validation) — the demo-supply seam feeds it here.

### Pre-merge string (founder-ruled finding G — code head `bbeb4af`)

The founder ruled the verifier's finding G under French Voice Standard §10.5: **correct French is the law's baseline, and N=1 is the FIRST trust state a reseller ever shows.** Added the singular catalog variant `reputation.ventes_livrees_une` = « 1 vente livrée » (register `selling`); the render branches on the count via `reputationText(count)` — « 1 vente livrée » at 1, « {n} ventes livrées » at ≥2. **Voice-standard conformance of the canon template « N ventes livrées », not a new mechanic; founder-overridable.** `reputation-render.test.ts` gains a **singular-at-1** assertion (« 1 vente livrée » present, « 1 ventes livrées » absent). Finding H (the render's inline +1 line is not the load-bearing count-exact guard) is accepted — the gate is sound (the fold's `toBe(3)` + badge-only-where-true carry it).

## 3. THE FOUR RED-FIRST GATES (with red proofs)

| Gate | Where | Red proof |
|---|---|---|
| **count-exact-verbatim** | fold `reputation.test.ts` + render `reputation-render.test.ts` | a **+1-mutated fold** fails count-exact AND idempotent → `fold-red-proof.log` (**2 failed / 1 passed**) |
| **never-a-rank** | fold (no rank API exported; structural) + render (directory NOT re-sorted by count — Kadi has the most sales but is not first) | asserted structurally; the too-broad first draft even caught « Classées par mise à jour » (the SP-I11 *time*-ordering) and was tightened to reputation-rank words only |
| **hidden-below-floor** | render `reputation-render.test.ts` | removing the `count < 1` floor guard fails hidden-below-floor → `render-red-proof.log` (**1 failed / 4 passed**) |
| **badge-only-where-true** (SP-I19 adjacency) | render | every rendered count `=== countDeliveredSales(...)` — fold-derived, never fabricated |

## 4. FORBIDDEN — held

- **No score, no comparison, no celebration** — the fold returns a bare integer; no `première_vente`/confetti anywhere in the delta.
- **checkout / spine / quote-issuance / order-spine / ledger / journey / earnings: BYTE-FROZEN** — `git diff --name-only dd2a304..bc45abe` touches only `packages/store-projection/*` + `apps/buyer-pwa/*`; no services, no commerce-core, no contracts, **no re-pin** (canon stays 0.9.9).
- **The pinned SP-I03 vitrine fixture holds** — réputation is a render-time signal OUTSIDE `VitrineViewModel`; `resolveVitrineSlug('aicha-4821').view` still equals `vitrine-view.json`.
- Token-only CSS (ui-scan green); strings in the catalog, register-tagged.

## 5. EVIDENCE (this session's tool results)

- **Warm** (`warm-gates.log`): store-projection **10/10** (3 réputation) · buyer-pwa **99/99** (5 réputation-render) · `run-gates.sh` **ALL GATES GREEN, rc=0** (French-Voice copy-lint pass, Playwright 43) · full turbo typecheck+test **29/29** · **PWA payload RE-MEASURED: 75,579 B / 300 KB** (+401 B for the feature; JS 44,463 B / 150 KB).
- **Cold proof** — committed bytes `bc45abe` (`cold-proof.log`, `cold-proof.sh`): `cold HEAD bc45abe` · frozen install rc=0 · **0 ssh-form / 0 proxy-leak** · `ui-tokens 0.9.9` · store-projection 10/10 + all consumers cold (13 tasks) · `run-gates.sh` **ALL GATES GREEN, rc=0**.
- **Red proofs:** `fold-red-proof.log` · `render-red-proof.log`.
- **Diff:** `code.diff` · `code.stat`.

## 6. FRESH-CONTEXT VERIFIER VERDICT

See `VERIFIER-VERDICT-verbatim.md` — copied verbatim, never rewritten.
