# WO-FP-SHOP — Faso Premium reskin of the reseller app · REVIEW PACKET

**Branch:** `e7/wo-fp-shop` · **head:** `376f145` · **base:** `ce75029` (STEP 1 re-pin) · **DO NOT MERGE** (founder review gate).

The reseller surface (Shop+, Aïcha) migrated from Grand Teint to **Faso Premium v2**: the fonts, the design tokens, a signature module, the seven motions, and the state families — the existing 8 screens only, no gated work.

---

## Founder rulings applied (on the record — see JOURNAL.md)

1. **Mid-weight = 700** (canon `type.families` token), NOT the `.dc.html` mockup's 600. The token + the HANDOFF prose agree on 700; the mockup's 600 is a render-layer artifact (specs override the prototype).
2. **Scope = the existing 8 screens + states.** The 7 SP9 Cercle-cluster views (Cercle · Nouvelle campagne · Campagne active · Membres · Financement · Avis vérifiés) are **journaled as gated, not built** (Law #8).
3. **The star-score dies.** The planche's reseller « Ma réputation · 4,8 ★ » contradicts the S8 count-not-score law (SP8); it is NOT built. Réputation (« N ventes livrées ») lives on the buyer PWA (S8, merged) and is a WO-FP-PWA concern.
4. **expo-font added** (ruling 2026-07-14) so the expo-preview evidence renders the real faces.

## STEP 0 — the fonts (both surfaces, shared design-system layer)

Four canon-declared faces only — Bricolage Grotesque 700/800 + Instrument Sans 400/700 (`type.families`; Instrument 500/600 NOT built, derive-never-invent). Subset to the French+franc charset. The **money-render guard caught two real gaps**: U+202F (the narrow no-break space `fr-FR` emits in « 11 500 F » — Instrument lacked it, consciously cmap-pinned) and U+2212 (the typographic minus in the reseller fee line « Part Shop+ (20 %) : − {amount} » — added and rebuilt). PWA payload **82.3 KB / 300 KB**. OFL 1.1 committed. Coverage sha-bound in `faso-premium.coverage.json` + `test/faso-fonts.test.ts` (both surfaces).

## DoD → evidence

| DoD item | Evidence |
|---|---|
| Migrate each file /legacy → v2 root | `kit.tsx`, `App.tsx`, `signature.tsx` import v2 colour/type/radius/motion; the deferred groups (spacing/touch/interaction/money/skeleton/dimension) stay /legacy per the v2 token `$note`. |
| Signature module (6 elements) | `src/ui/signature.tsx` — woven band · hero ledger · duotone tile · selection swap+check · corner ticks · quote rule; **all six composed** into screens (woven band=WaxBand, swap+ticks=selection, tile=vitrine grid, hero ledger=vente_detail, quote rule=gains). `test/signature.test.ts` 8/8. |
| Seven motions + prefers-reduced-motion | `src/ui/motion.ts` resolves fpIn/fpUp/fpPop/fpPulse/fpBar/fpShimmer/fpShake to RN easings (parsed from the token's own timingFunction); `useReducedMotion()` gates every animation; the ui-kit gate pins the token-derived curve + reduced-motion. |
| Zero hardcode | the `ui-kit` scan (App+kit) + `signature` scan: no hex, no rgb, no raw dimension; ranges resolve via the one documented `rmax`→max rule. |
| Net-first (SP-I04/I12) + share-hub + S8 laws | `ui-kit.test.ts` net-first assertion (opportunites + selection); share-hub + journey suites unchanged and green; S8 lives on the PWA (untouched). |
| States-law LIST | `test/states-law.test.ts` 7/7 — empty ×2, preview banner, problème encart, selection chosen/unchosen, timeline done/now/later, disabled. Skeleton = available-not-rendered (honest states law). |
| Fonts render (cold-start law) | `useFonts(FONTS_TO_LOAD)` loads Bricolage 800 + Instrument 400/700 under distinct keys (no faux-bold on Android); first paint never gated. Asset requires isolated to `fonts-load.ts` (App-only chain; tests source-scan, never execute). |
| Galleries + screenshots | **Constraint:** the reseller app is RN with no web/react-native-web and no emulator in the sandbox, and a web shim is ruled out — so expo-preview SCREENSHOTS are not producible headless. Evidence is source-discipline (all scans/guards green) + `typecheck` builds; the visual confirmation is `expo start` on the founder's device (Expo Go). This matches every prior reseller slice. |

## Proofs

- **Warm:** reseller-app **110/110** · typecheck clean · `run-gates.sh` **ALL GATES GREEN rc=0** (`warm-gates.log`).
- **Cold** (`cold-proof.log`, from committed bytes `376f145`, fresh HOME credential-only + isolated store): `git@`-form **0**, proxy-leak **0**, expo-font@14.0.12 pinned + **frozen install rc=0** + resolves cold, ui-tokens **1.0.0**, reseller typecheck clean + **110/110** cold (settled run), `run-gates.sh` **ALL GREEN rc=0**. *(The very first cold invocation of typecheck/test failed on a fresh-install warm-up race — turbo/vitest caches + workspace linking; the identical cold clone is fully green on the settled run, proving the bytes, not a byte defect.)*
- **Frozen anchors:** journey.ts byte-unchanged (the 8 screens); contracts pin byte-frozen at v1.0.0 `f23407c`; no money/custody logic touched.

## Fresh-context verifier

See `VERIFIER-VERDICT-verbatim.md` (copied verbatim).
