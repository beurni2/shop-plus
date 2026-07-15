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

## Increments 2–5 (this drop) — THE UI FLOW, one green change on the approved seam

The flow lands as ONE change because it is entangled: removing the `selection` multi-select screen (for the new single-product FICHE) un-homes `SelectionSwap`/`CornerTicks`, which re-home in Inc4's ≤3 multi-select. Journey now: **Opportunités → Fiche → Ma vitrine → Partager**, with **Vitrine publique** the aperçu-cliente branch off Ma vitrine.

| Inc | Screen | Frame | What it does |
|---|---|---|---|
| **2** | **FICHE** | planche L140–191 / HANDOFF §4 | Tap an opportunity → single-product fiche: vérifié tier chip · art héro 170 · titre 24 · identity note (vendor hidden) · the **STATIC marge card** (slider DEFERRED) · protections chips · sticky CTA **« Ajouter à ma vitrine »** → `vitrineCol.addToVitrine(id)` + `go('vitrine')`. **ADD ONLY** — the planche's combined « & partager » splits (partager is the vitrine's own action). Diaspora/PackLab blocks **gated (Law #8), omitted**. |
| **3** | **MA VITRINE** | planche L239–267 | Title « Ma vitrine » + name + vérifié · the **œil** → aperçu-cliente · the **Privée/Publique toggle** (`vitrineCol.setDiscoverable` + the **verbatim toasts**, planche :1029) · the grid reads `vitrineCol.listings()` — each tile: client price (deep) ↔ **net (small)**, never a vendor. Empty is a designed state (a way back to Opportunités). |
| **4** | **PARTAGER** | planche L193–236 | The **≤3 select-to-feature** (`SelectionSwap` + `CornerTicks` **re-home here**; `capShareSelection` caps at 3, the toggle refuses the 4th with a stated cap) · the client **preview card** (featured product or the demo card) · the **reseller-only net line** (« jamais visible par la cliente ») · the **share channels** (Copier / WhatsApp / Facebook / TikTok over RN `Share`/`Linking`, the real signed slug) · the signed product link · the **QR** to her `/v/aicha-4821`. |
| **—** | **VITRINE PUBLIQUE** (pubvitrine) | planche L714–740 | Read-only aperçu-cliente: monogram + name + vérifié + zone · the grid shows **client price ONLY** (never net/marge/vendor) · « Lecture seule » pill · the ink banner (« vous êtes le visage de confiance »). |
| **5** | **build-stamp** | — | The real `expo-updates` `updateId` (« dev » locally) in the demo footer — honest provenance for the device pass. |

**Money:** every franc rides the frozen seed through `formatFcfa` (byte-stable, no hardcoded « F »). The FICHE marge card is **net-first** (commission + marge → brut → −20 % are calm lines; « Votre gain net » is the strong figure, precedes the client price). **All 7 seeds reconcile to the franc** (net = gross − fee = 80 %·(C+M); client = B+M) — verified.

**Evidence:** `tsc --noEmit` clean · reseller suite **117/117** green · copy-lint **143 entries, 0 violations** · reconciliation script green for all 7 seeds. Entangled tests updated (net-first slice `selection`→`fiche`; states-law empty gate `selection.length`→`vitrineOpps.length`; both still assert the invariant).

## ⚑ FLAGS for the founder (neither resolved unilaterally)

1. **SEED-vs-CAP (money/pricing — §7):** the FICHE states « Plafond : 20 % du prix de base ({cap}) » per your instruction. Two frozen seed markups **exceed** that cap — **o2 Savon** (M 350 > cap 300, base 1 500) and **o6 Bissap** (M 250 > cap 200, base 1 000). On those two fiches the static markup visibly sits above the stated plafond. I did **not** change the pinned seed (it is derive-through-`computeWaterfall` and pinned in `demo-store.test`) or invent a cap. **Recommend:** correct the two seed markups to ≤ 20 % of base (re-derive + re-pin), OR confirm the cap basis differs. Awaiting your call.
2. **⚑ VITRINE-SHARE-CLIPBOARD:** « Copier le lien signé » routes through the RN OS share sheet (which offers Copy) — no `Clipboard` dep is installed, and adding `expo-clipboard` is a **native** module (needs a full rebuild, not an OTA), so it is deferred. Swap for a one-tap silent copy + toast at integration.
3. **⚑ VITRINE-REAL-BACKING** (carried from Inc 1): the demo fold/log swaps for the live `projectStores`/`resolvePublishedStore`; the `VitrineCollectionPort` interface does not change. Note: `resolvePublishedStore` is **discoverable-only**, while the privée toast promises « accessible par lien » — a private-slug resolver + a fold-conformance test land at integration.

`DO NOT MERGE` — founder review gate (Gate 1 my Ecrans cross-check → Gate 2 your grep-verify → Gate 3 device pass).
