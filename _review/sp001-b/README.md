# SP#001-B — LISTINGS + THE LIVE PROJECTION · review packet

**Slice:** SP#001-B (spine slice B of *SP#001 — The Seller #001 Spine*).
**Branch:** `e7/wo-sp001-b` · **code head:** `65a558b` · **branched from A:** `9257c12`.
**B-only code delta:** `git diff 9257c12..65a558b` (see `code.diff` / `code.stat`).
**Priority:** 🟠 — a listing seam consuming canon `ResellerListingSchema` + canon events → **fresh-context verifier mandatory** (§6bis, contracts path).
**Status:** DO NOT MERGE — founder review gate.

---

## 1. CANON-CHECK — PASS (consumes canon, invents nothing)

- **`ResellerListingSchema`** (v0.9.9, read from the installed pin `dist/shapes/commerce.js`): `{ id, resellerId, productVersionId, offerVersion, markup, version, variants, status }.strict()`. The listing aggregate builds its record via `ResellerListingSchema.parse(...)` — never a hand-rolled shape.
- **Canon event names** (read from `dist/events.js`): `listing.published.v1` and `listing.auto_hidden.v1` both present. The aggregate emits ONLY these, through `PlatformEventSchema.parse(...)`. Canon defines NO per-event payload shape (payload is a free record) — so `hub_verified` and `customer_price_fcfa` are app-boundary payload data, permitted exactly as A's storefront events carry payload fields. **No event name invented.**
- **The producer** (`packages/store-projection`) is a Shop+-owned VIEW producer. `StoreProjection` / `StoreProjectionEvent` are app-defined view types — the same class as the pre-existing `StorePreview` (discovery.ts) and `CustomerProductView`. No canon shape is redefined.
→ canon-check **PASS**.

## 2. THE ARCHITECTURE (surfaced for founder review — my call, not a blocker)

**The crux:** "ONE producer feeds BOTH" across a **backendless vite PWA** and a **tsc Workers service**. My decision:

- **A new pure package `@shop-plus/store-projection`** is THE one producer — a dependency-free fold (type-only canon imports) so it is safe inside the PWA's payload budget. It is **source-exported** (`exports → src/index.ts`): the vite PWA (bundler resolution) transpiles it, `vitest` transpiles it, and each service's `tsc --noEmit` resolves its types. This avoids (a) bloating the 300 KB PWA budget with a heavy dep, and (b) coupling the frontend to a backend service. Both `discovery-service` and `buyer-pwa` depend on it — **ONE producer, two consumers.** Cold proof confirms it resolves under a frozen install for both the NodeNext services and the vite PWA.
- Alternative homes I rejected: `commerce-core` (its money identity + PWA-bundle risk), a service-owned module (frontend↔backend coupling). If you prefer a different home, moving the ~200-line pure module is mechanical.

## 3. WHAT WAS BUILT

| Piece | File | What |
|---|---|---|
| THE PRODUCER | `packages/store-projection/src/store-projection.ts` | `projectStores(events)` → one StoreProjection per DISCOVERABLE storefront (productCount = live listings, lastUpdated = max event time, verified = ≥1 live hub-verified listing), ordered lastUpdated desc + id tiebreak (deterministic). `resolvePublishedStore(events, slug)` for vitrine resolution. |
| listing seam | `services/storefront-service/src/listing-aggregate.ts` | `ListingRegistry.publish` (canon `ResellerListing`, `listing.published.v1`) · `autoHide` (`listing.auto_hidden.v1`, once). HER price carried, never recomputed. `hubVerified` = Boutik hub signal (real wire deferred). |
| discovery re-anchor | `services/discovery-service/src/discovery.ts` | `projectStoreDiscovery(events)` — the SP-I05 envelope fed by the producer, deterministic zone→name→id order kept. |
| buyer directory re-anchor | `apps/buyer-pwa/src/boutiques-data.ts` + `demo-stores.ts` | hard-coded `updatedRank` **DELETED**; the directory is `projectStores(demoStoreEvents())`; « quand » derived from `lastUpdated` vs a fixed demo clock. ONE demo event log. |
| vitrine resolution real | `apps/buyer-pwa/src/vitrine-link.ts` | `resolveVitrineSlug` gated by `resolvePublishedStore` — ANY published store resolves; unknown/unpublished → `undefined`. The 1-of-5 hack is gone. |

**OUT of scope (deferred):** SP5.1 `store_index` / search index · `matchingItemPreviews` (search) · full SP1.3 (markup-cap enforcement, net-preview UI, version-on-price-change) · the real Boutik supply wire (demo-supply seam feeds it).

## 4. THE FIVE RED-FIRST FIXTURES (+ red proof)

`packages/store-projection/test/store-projection.test.ts`:
- **only-discoverable-storefronts-project** — created-but-unpublished + unpublished-again both absent.
- **ordering-follows-real-events** — a later listing event lifts its store above one published later; `lastUpdated` moved to the real listing time.
- **unknown-slug-honest-not-found** — unknown AND known-but-unpublished → `undefined`; **a SECOND non-Aïcha published store resolves** (kills the 1-of-5 hack).
- **verified-renders-only-where-true (SP-I19)** — verified iff a LIVE listing is hub-verified; auto-hiding the only verified listing turns the badge OFF.
- **stores-never-products (SP-I05) on live data** — top level is a store collection; a listing never rises to a top-level row.

**RED PROOF** (`red-proof.log`): the same five fixtures run against a NAIVE producer carrying the old flaws (no discoverable filter, insertion order, verified-always-true, the 1-of-5 hack) → **5 failed | 2 passed**. The 2 that pass assert invariants the naive impl happens to satisfy; the 5 catch every real flaw.

## 5. FORBIDDEN — held

- checkout / Quote / journey / earnings: **byte-frozen** (`git diff --name-only 9257c12..65a558b` touches none — verified).
- **No money recompute** in the listing seam — `customerPriceFcfa` is a carried command field; no B+M arithmetic in `listing-aggregate.ts`.
- No ranking/ML/inference/generative. No celebration (`première_vente` belongs to the first REAL franc, slice D).
- `boutiques-view.ts` (directory/search UI) structurally unchanged — only the DATA source changed; the directory renders identically (same 5 stores, same order, same counts — pinned by `boutiques.test.ts` + the discovery fixture).
- No invented canon shape or event name. SP5.1 store_index not built.

## 6. EVIDENCE (this session's tool results)

- **Warm** (`warm-gates.log`): store-projection **7/7** · storefront-service **16/16** (incl. 4 listing) · discovery-service **8/8** · buyer-pwa **94/94** (incl. boutiques 13, vitrine 10) · `run-gates.sh` **ALL GATES GREEN, rc=0** (Playwright 43 passed) · workspace typecheck clean · **PWA payload budget: buyer-pwa 75,178 B / 300 KB, JS 44,059 B / 150 KB** — the source-exported producer adds negligible bytes.
- **Cold proof** — committed bytes at `65a558b` (`cold-proof.log`, script `cold-proof.sh`): `cold HEAD 65a558b` · frozen install rc=0 · **0 ssh-form / 0 proxy-leak** · `ui-tokens 0.9.9` · **the source-exported producer + all consumers resolve cold** (turbo typecheck+test 13/13: store-projection 7, storefront 16, discovery 8, buyer-pwa 94) · `run-gates.sh` **ALL GATES GREEN, rc=0**.
- **Diff:** `code.diff` (16 files, +880/−59) · `code.stat`.

## 7. FRESH-CONTEXT VERIFIER VERDICT

See `VERIFIER-VERDICT-verbatim.md` — copied verbatim, never rewritten.
