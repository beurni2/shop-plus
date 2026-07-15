# WO-FP-SHOP — Faso Premium reskin of the reseller app · REVIEW PACKET

**Branch:** `e7/wo-fp-shop` · **head:** `5384a37` · **base:** `ce75029` (STEP 1 re-pin) · **DO NOT MERGE** (founder review gate).

The reseller surface (Shop+, Aïcha) migrated from Grand Teint to **Faso Premium v2**: the fonts, the design tokens, a signature module, the seven motions, and the state families — the existing 8 screens only, no gated work.

---

## THE 8-VIEW FRAME REBUILD (Option A) — all 8 rebuilt to their planche frames

After the on-device recolor rejection, every view was **rebuilt to its frame** in « Shop Plus - Redesign.dc.html » (Option A: the 8 existing screens to frame anatomy; unbuilt frames + search/filters + margin slider = logged backlog). Each carries a **grep-evidence-per-row anatomy derivation** (`anatomy/*.md`, every quoted element cited to a SHOP planche line + BOUTIK cross-check) and an **Ecrans cross-check** (« Shop Plus - Ecrans.dc.html » frames 01–08/16).

| # | View (frame) | Derivation |
|---|---|---|
| 1 | ACCUEIL (L54–110) | `anatomy/accueil.md` |
| 2 | OPPORTUNITÉS (L110–138) | `anatomy/opportunites.md` |
| 3 | FICHE → `selection` (L140–191) | `anatomy/selection.md` |
| 4 | PARTAGER → `lien` (L193–236) | `anatomy/lien.md` |
| 5 | VITRINE (L239–267) | `anatomy/vitrine.md` |
| 6 | VENTES (L270–305) | `anatomy/ventes.md` |
| 7 | DÉTAIL VENTE → `vente_detail` (L308–355) | `anatomy/vente_detail.md` |
| 8 | GAINS (L641–677) | `anatomy/gains.md` |

The program's shared **duotone art-tile** DNA (soft field + gold keyline + product initial, §8 — never emoji) replaces the rejected letter-chips across every product surface. Money stays **net-first** throughout; the frames' gross « Gain brut » / « Frais Ma Boutique » lines are barred (Law #1/#10), and everything beyond the 8 screens is catalogued in **`SHOP-FULL-EXPERIENCE-backlog.md`**. Fonts render **Bricolage** on the built bytes (render-name guard green, faces bundled in the EAS export).

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
| Preview delivery + screenshots | **Two separate things, don't conflate them.** (1) **Preview delivery WORKS:** `expo-preview.yml` (`workflow_dispatch`, EXPO_TOKEN armed) publishes a real **EAS Update to the `preview` channel** — the founder opens it in Expo Go on his device. Republish of head `71ba0c1` = run #44, success, update group `10e30cc2-8087-4f66-8af9-c5fd17b43886`, fonts bundled (`Bricolage-ExtraBold.ttf` + `Instrument-Bold/Regular.ttf`). (2) **Headless SCREENSHOTS are not producible here:** the RN app has no web/react-native-web renderer and no emulator in the sandbox, so a static gallery can't be generated in-sandbox. Source-discipline (scans/guards green) + `typecheck` are the in-sandbox evidence; the **visual gate is the founder's device pass** on the published preview. |

## Proofs

- **Warm:** reseller-app **110/110** · typecheck clean · `run-gates.sh` **ALL GATES GREEN rc=0** (`warm-gates.log`).
- **Cold** (`cold-proof.log`, from committed bytes `376f145`, fresh HOME credential-only + isolated store): `git@`-form **0**, proxy-leak **0**, expo-font@14.0.12 pinned + **frozen install rc=0** + resolves cold, ui-tokens **1.0.0**, reseller typecheck clean + **110/110** cold (settled run), `run-gates.sh` **ALL GREEN rc=0**. *(The very first cold invocation of typecheck/test failed on a fresh-install warm-up race — turbo/vitest caches + workspace linking; the identical cold clone is fully green on the settled run, proving the bytes, not a byte defect.)*
- **Frozen anchors:** journey.ts byte-unchanged (the 8 screens); contracts pin byte-frozen at v1.0.0 `f23407c`; no money/custody logic touched.

## Fresh-context verifier — VERDICT: PASS

Copied verbatim in `VERIFIER-VERDICT-verbatim.md`. All ten laws hold; the verifier ran typecheck (clean), 110/110, `no-emoji-in-chrome` (exit 0), confirmed journey.ts byte-unchanged and the contracts pin unchanged (only expo-font added, 0 ssh-form). **Two non-blocking findings, neither a law violation:**
1. the reconcile-whisper (`heroLedgerRule` / `quoteRuleLine`) hints `fontWeight: 600` (the `/legacy` `money.reconcileLine` token) on Instrument, but only 400/700 load, so on-device it renders ~400 — cosmetic, and the money group is a `/legacy`-deferred slice this wave (not a law-7 breach; no 600 face is shipped).
2. the woven-band `Array.from({ length: 24 })` repeat count is the one raw non-zero constant — array construction, not a style dimension, justified + clipped. Benign.

Neither blocks merge. Both are carried to the founder (see JOURNAL.md).
