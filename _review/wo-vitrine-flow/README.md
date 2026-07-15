# WO-VITRINE-FLOW — the vitrine-collection flow · REVIEW PACKET (increment 1 of N)

**Branch:** `e7/wo-fp-shop` · **DO NOT MERGE** · 🟠 AMBER · demo-fed, production-shaped.

---

## GROUND FIRST (the SP#001 pattern the flow is built against — file:line)

| Seam | Where | What it establishes |
|---|---|---|
| **Store-projection (SP#001-B)** | `packages/store-projection/src/store-projection.ts` | `StoreProjectionEvent` (**:31**) = the vitrine's write vocabulary: `listing.published` (add), `listing.auto_hidden` (remove), `storefront.published {discoverable}` (privée⇄publique). `StoreProjection` (**:63**) exposes `productCount` (live listings), `discoverable`, `/v/{slug}`. **`resolvePublishedStore(events, slug)`** (**:190**) = the slug→store resolution, **discoverable-only** (the directory rule). Pure & dependency-free (**:27**). |
| **Supply-consumer PORT pattern (SW-2)** | `packages/supply-consumer/src/consumer.ts:19` (`SupplyProjectionPort`) + `mock.ts:27` (`MockSupplyProjectionSource implements …`) | The established **port + demo-impl** shape: an interface; a mock backs demo/tests; "SW-1's real HTTP endpoint plugs into the same port at integration." This is the demo-fed/production-shaped template the vitrine seam follows. |
| **Canon `/v/` slug (SP#001-B)** | `apps/reseller-app/src/qr/identity.ts:11`, `src/share/hub.ts:16` | The share link is `origin + base + shortCodeToSlug(shortCode)` → `/v/aicha-4821`, derived through canon — the REAL slug, not a fake link. |

**Architecture finding that shaped the seam:** the reseller RN app is **snapshot-only** — `package.json` carries **no `@shop-plus/*` domain dependency** (money rides `seed.json`, generated *through* `computeWaterfall`, never an import of it, because the contracts barrel is not Metro-safe). So, per the WO's "**do not wire it to the real aggregate now, but shape it so it can be**", the seam is shaped **against** `StoreProjectionEvent` in an RN-local module and does **not** import the node `store-projection` package. Same discipline as money.

---

## Increment 1 (this drop) — THE SEAM

`apps/reseller-app/src/vitrine/collection.ts`:

- **`VitrineCollectionPort`** — the interface both the demo adapter and the real one implement. Ops speak the SP#001-B vocabulary: `addToVitrine` (→ `listing.published`), `removeFromVitrine` (→ `listing.auto_hidden`), `setDiscoverable` (→ `storefront.published`). Reads: `listings()`, `has()`, `isDiscoverable()`, `shareSlug()` (real `/v/`), `resolvesInDirectory()` (mirrors `resolvePublishedStore`'s discoverable-only rule).
- **`DemoVitrineCollection`** — backs the port with an in-memory `VitrineEvent` log + a minimal fold (the RN stand-in for `projectStores`). Adds/removes are events, not splices.
- **`VITRINE_SHARE_CAP = 3`** + `capShareSelection()` — the UI-enforced ≤3 share cap.

**Fixtures — `test/vitrine-collection.test.ts` (5/5 green):**
`add-writes-collection` (add goes through the seam as `listing.published`) · `vitrine-renders-collection` (the screen reads its rows from the seam) · `share-cap-≤3` · `share-uses-real-slug` (`/v/…`, never a fake link) · discoverable rule (privée = accessible par lien, not in directory; publique = both).

**Evidence:** typecheck clean · reseller suite **117/117** (112 + 5).

---

## ⚑ VITRINE-REAL-BACKING — named follow-on (NOT wired now)

Swap `DemoVitrineCollection`'s in-memory event log + demo fold for the **live storefront event source** + the real `projectStores`/`resolvePublishedStore` (`@shop-plus/store-projection`). **The `VitrineCollectionPort` interface does not change** — only the adapter. This is the "later adapter swap, not a rebuild" the WO names. Server-side (or a storefront service call) owns the real aggregate; the RN bundle stays snapshot-shaped.

---

## Remaining increments (the UI flow — proposed split, this slice is too large for one honest review)

2. **FICHE (frame 03, single-product; margin slider DEFERRED)** — Opportunités → tap → single-product fiche with « Ajouter à ma vitrine » calling `port.addToVitrine`.
3. **MA VITRINE** — the privée/publique toggle (`setDiscoverable`) + render `port.listings()`.
4. **PARTAGER** — select ≤3 (`capShareSelection`), share via RN `Share`/`Linking`/`Clipboard` (WhatsApp/Facebook/TikTok/copy) using `port.shareSlug()`. New catalog strings (none exist yet) — French Voice + copy-lint.
5. **Build-stamp** (via `expo-updates`) + republish.

Money stays frozen (consume `formatFcfa` / `money.amount_f`, never hardcode « F »). `DO NOT MERGE`.
