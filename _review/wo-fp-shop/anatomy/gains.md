# GAINS → `gains` — anatomy derivation (planche « Shop Plus - Redesign.dc.html »)

**View 8/8 · Option A.** (View 8 = **Gains**, the 8th existing screen; the order's « Comment ça marche » was a slip — that frame is an unbuilt screen, backlog A.17.) Slice bounded by:

```
641:    <!-- ══ GAINS ══ -->
680:    <!-- ══ MA RÉPUTATION ══ -->
```

Hits ∈ **641–680** (`En attente (net)`/`{{ pendingF }}` are shared with accueil's ledger L74/75 — their GAINS instances are L648/L649; `Gain brut` also on Fiche L174, here L671). BOUTIK cross-check: `Bonus 5 premières ventes` · `{{ gainRows }}` → **0 hits** (native to SHOP); `versé sur votre Mobile Money` → 1 hit — shared **ecosystem** copy (both apps pay net to Mobile Money), not a frame import.

## Applied — title + accent net hero + breakdown (built)

| Frame element | Grep anchor → hit | Implementation | Lawful divergence |
|---|---|---|---|
| Title « Gains » Bricolage 800/28 | `>Gains<` → **L644** | in-content `screenTitle` = `t('gains.title')` « Mes gains (essai) »; hub brand header (`gains: 'app.title'`) | copy = catalog (canon); lands the display type |
| Subtitle « Toujours en net — versé sur… » | `versé sur votre Mobile Money` → **L645** | new `gains.sous_titre` (register money · general; copy-lint OK) | « versé sur votre Mobile Money » is shared ecosystem copy |
| **Accent pending hero** (magenta card, big net 38) | `En attente (net)` → **L648** · `{{ pendingF }}` → **L649** | `gainsHeroCard` (accent `shopColour.primary`) + `CountUpAmount ... onAccent` (net « en majesté », count-up money-law clock) | label = `gains.total_label` « Votre gain net (essai) » (canon; pinned by ui-kit.test); the app's total-net **is** the pending/expected net |
| Détail — gross → fee → net breakdown | `Gain brut` → **L671** · `Net<` → **L673** | `GainsBreakdown` (`gains.brut` → `gains.part` « Part Shop+ (20 %) » → `gains.net`) + `QuoteRule` | net-led screen (the net hero is first) → the gross breakdown is a **compliant transparency** detail here; canon « Part Shop+ », never « Ma Boutique » |

## Backlog / divergence (Option A)

| Frame element | Grep anchor → hit | Disposition |
|---|---|---|
| « Payé cette semaine » (`paidWeekF`) | `Payé cette semaine` → **L651** | **Backlog** — no paid-this-week split in the demo (the app's total is the pending/expected net). Logged. |
| **Bonus card** « Bonus 5 premières ventes » + progress | `Bonus 5 premières ventes` → **L657** | **Backlog** — a launch-bonus feature (data + progress) the app doesn't have. Logged. |
| Per-sale `gainRows` (per-order breakdown) | `{{ gainRows }}` → **L665** | **Divergence** — the app shows the **aggregate** breakdown (`totals` + the baseline example), not per-order rows; the aggregate is the existing capability. |

## Ecrans cross-check (frame 16 « Gains · bonus 5 premières ventes »)

The title, the accent net-in-majesty hero, and the gross→fee→net breakdown are built to the frame DNA. The launch-bonus card and the per-sale granularity are backlog. Composition matches on the accent hero + breakdown. Visual gate: founder device pass.

**Font-render (load-bearing):** every Bricolage element uses `DISPLAY_FAMILY` (internal name === useFonts key, green on the built bytes). **Tests:** typecheck clean · 112/112 · count-up (token-timed, reduced-motion) + net-first pins green · no-emoji + copy-lint (106) OK.
