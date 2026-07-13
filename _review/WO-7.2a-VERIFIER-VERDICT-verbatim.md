# WO-7.2a — VERIFIER VERDICT (VERBATIM TESTIMONY)

The text below is the fresh-context verifier subagent's final message, copied
verbatim (only transport HTML-escapes `&lt;`/`&gt;`/`&amp;` restored). No session
edits. Session commentary on how the findings were addressed lives in the packet
README and the JOURNAL, never here. Per the standing rule: a verdict is copied,
never rewritten.

---

I have completed a thorough adversarial verification. All gates ran green (exit 0), all tests pass (67 reseller + 94 buyer), and I independently traced every string to the handoff and recomputed the money. Here is my verdict.

---

## VERIFIER VERDICT — WO-7.2a (S3 Découverte · S7 Ventes/Clientes · price-validity hint)

Overall: the money, custody, discovery, and provenance invariants all hold. I found **no invariant violation**. I found **two un-flagged UI-fidelity deviations from the handoff mockup**, one **inaccurate code comment**, one **loose deferral justification**, and one **test-coverage gap** — none block the invariants, but the founder should see them because "beauty is the product."

### CONFIRMED-OK
- **SP-I05 (stores, not a feed)** — `boutiques-data.ts` has no product pool; `DiscoveryResponse` is a store collection; the test pins `gates/fixtures/customer-surfaces/boutiques-discovery.json` to `toDiscoveryResponse()`; the gate passes on it (5 stores) and the S3 planted-negative `boutiques-as-product-feed.json` **FIRES** (gate FAILED as required, confirmed in the live run). The rendered list carries no franc figure and no `<img>` (test-asserted, passing).
- **SP-I11 (deterministic order + on-screen sentence)** — `orderedBoutiques` sorts `updatedRank` desc, pure (no clock/random); the sentence renders via `data-role="ordering-sentence"` (« Classées par dernière mise à jour — la plus récente d'abord. »); search is a deterministic substring filter over name+zone. Unit + e2e (`shell.spec.ts`, root = S3) pass.
- **SP-I04/SP-I12 (net-first)** — row descriptor `['resellerNet']`, detail `['resellerNet','customerPrice']` (net before son prix); both fixtures pinned to the presenter; `net-first-display` gate passes both and still fails the gross-first negative. `SaleRow`/`SaleDetail` carry no gross/commission field; App.tsx renders the net card before the son-prix card.
- **Money reconciles to the franc** — `ventes.test.ts` recomputes every sale through `computeWaterfall` + `assertQuoteReconciles`, asserting `netFcfa===resellerNet`, `sonPrixFcfa===productSubtotal`, and `net===gross−fee`. I re-derived all six by hand; all reconcile. Mariam = §5.4 baseline (net 2000 / son prix 11500) asserted explicitly. The tests genuinely assert, not merely run.
- **SP-I03 (no supplier / masked relay)** — `no-supplier-contact` gate passes on `boutiques-discovery.json`; client is first-name-only, no `phone`/`clientPhone` field on `Sale`/`SaleRow`; relais note present; no drop code or four-secrets on the reseller surface.
- **Metro-safety** — `ventes.ts` (`import type`), `hub.ts` (only `../demo/store`), and `App.tsx` (none) runtime-import zero `@platform/contracts` values. Verified by grep + passing reseller suite.
- **SP-I19 (validity hint)** — `assertCardAuthoritative` now throws without EITHER the signed link OR the validity date; both planted negatives fire. `frenchDate` is deterministic (UTC accessors + hardcoded `FR_MONTHS`, no Intl); `DEMO_RENDER_DATE` is a frozen clock, no live `now()`.
- **Provenance** — every rendered S3/S7 string traces to `copy.md` or the mockup. I confirmed each key NOT in copy.md is present in the mockup (`VOIR TOUTES LES BOUTIQUES`, `La plus récente d'abord`, `recherche reviendra avec le réseau`, all timeline steps, `MAINTENANT`, `VOIR LE DÉTAIL`, `Rien à faire de votre côté`, `HIER SOIR`, etc.). All new keys register-tagged; copy-lint / ui-scan green; no inline French.
- **Honest flags (a)+(b)** — mockup header says « 6 BOUTIQUES » but lists 5; the build renders the real count (5) — honest. Only `aicha-4821` resolves to a full vitrine; the other four are directory entries, journaled in the docblock — honest.

### PROBLEMS / findings

- **P1 — À LA PORTE chip loses its emphasis (UI fidelity, un-flagged).** `App.tsx` `chipTone` maps `a_la_porte → 'info'`, and `kit.tsx` CHIP_COLOR: `info === muted` (`#6E6154`). The S7 mockup renders À LA PORTE in the **warn/amber** family (bg `#F7EED7` warningTint, text `#6B4E0C` warning) — a deliberate emphasis for the nearest-to-door state. Net effect: à la porte, en route, en préparation, payée **all render as identical muted-grey chips**, so the "closest-to-door" state is indistinguishable from "payée" — on a screen whose whole ordering law is closest-to-door-first. The correct token (`warn`) exists and renders exactly the mockup's amber; it simply wasn't used. `apps/reseller-app/App.tsx` (the `chipTone` arrow, diff ~L830–834). No canon invariant broken.

- **P2 — "ink « ok »" comment is false; LIVRÉE renders green, mockup wants ink (borderline).** `ventes.ts` and `App.tsx` comment: *"LIVRÉE is a server FACT (ink « ok »)."* But tone `'ok'` → `CHIP_COLOR.ok = success = #1F4D36` (forest **green**), not ink; the mockup renders LIVRÉE as an **ink-filled** chip (`#1B140D`). The canon "never a green lie *before* the operator" is technically held (green only when `status==='livree'`, post-fact), but the mockup deliberately chose ink to avoid conflating with money-green, and the build reintroduces green. No ChipTone renders ink today — a component limitation worth surfacing; at minimum the "ink" comment should be corrected. `apps/reseller-app/App.tsx` chipTone / `src/sales/ventes.ts` docblock.

- **P3 — S7 tab-nav deferral is honestly disclosed but loosely attributed (minor).** The builder deferred the S7 filter tabs as "Q1-dependent." Q1 (`questions.md`) concerns where **S3** hangs and the reseller's **product-catalogue search** — it does not clearly govern the S7 list's tabs, which the mockup does intend (skeleton caption: « en-tête et onglets rendent en vrai »). The omission is disclosed (not hidden), but the Q1 linkage is a stretch; worth the founder confirming the tabs are genuinely blocked rather than just skipped.

- **P4 — Metro-safety scan doesn't cover the new file (test-coverage gap, no current violation).** `test/demo-store.test.ts` hardcodes the scanned list `['src/journey.ts','src/demo/store.ts','src/share/hub.ts','App.tsx']` and omits the new `src/sales/ventes.ts`. The actual `ventes.ts` is clean (type-only import), so nothing leaks today — but the guard would not catch a future runtime `import { computeWaterfall }` added to `ventes.ts`. Add it to the scan list.

### Minor notes (not problems)
- Net figures (list row + detail hero) render in `primaryStrong` (`#A34312` terracotta) = the reseller app's **established** money-hero token (`moneyNetLine`/`rowNet` pre-date this slice). The mockup shows list nets green / detail net ink. This is the design system correctly asserting over a mockup's illustrative colors — not a miss.
- `Sale` demo type carries the full `WaterfallInput` (incl. `sellerFundedCommission`, `sellerBasePrice`) for test-pinning, but the presenter models (`SaleRow`/`SaleDetail`) strip it and `App.tsx` never reads `sale.input` — commission is unrepresentable on the surfaces, representable only in internal pinning data (same derive-through-snapshot pattern as `WORKED_BASELINE_INPUT`).
- The `no-supplier-contact` gate is not run against the ventes fixtures (only `net-first-display` is); the ventes presenter's no-commission property is guarded by the vitest regex only, not a CI gate — weaker coverage than S3, but covered.
- Accueil→ventes entry uses the full title « MES VENTES — LES PROBLÈMES D'ABORD » as a SecondaryButton label (temporary demo-nav bridge, not in the mockup) — awkward as a button label.

Files of record: `apps/reseller-app/App.tsx`, `apps/reseller-app/src/sales/ventes.ts`, `apps/reseller-app/src/share/hub.ts`, `apps/reseller-app/src/ui/kit.tsx`, `apps/buyer-pwa/src/boutiques-data.ts`, `apps/buyer-pwa/src/boutiques-view.ts`, `apps/buyer-pwa/test/boutiques.test.ts`, `apps/reseller-app/test/ventes.test.ts`, `apps/reseller-app/test/demo-store.test.ts` (scan gap), and the gate fixtures under `gates/fixtures/`.
