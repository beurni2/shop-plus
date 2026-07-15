# VENTES → `ventes` — anatomy derivation (planche « Shop Plus - Redesign.dc.html »)

**View 6/8 · Option A.** Slice bounded by:

```
270:    <!-- ══ VENTES (liste) ══ -->
308:    <!-- ══ DÉTAIL VENTE ══ -->
```

Hits ∈ **270–308** (`{{ v.code }}`/`{{ v.glyph }}`/`{{ v.pill }}` are shared row tokens; their VENTES instances are within `salesProblems`/`salesRest`). BOUTIK cross-check (`{{ salesProblems }}` · `Les problèmes` · `{{ salesRest }}`) → **0 hits**. Native to SHOP.

## Applied — problems-first list on the art-tile (built)

| Frame element | Grep anchor → hit | Implementation | Lawful divergence |
|---|---|---|---|
| Title « Ventes » | `>Ventes<` → **L275** | AppHeader `ventes.titre` « MES VENTES — LES PROBLÈMES D'ABORD » | the app title carries the problems-first label itself |
| Problems-first grouping | `{{ hasProblems }}` → **L277** · `{{ salesProblems }}` → **L280** | `ventesRows` is problems-first ordered (S7 presenter); problem rows lead | — |
| Problem-row **danger border** | `border:1.5px solid #EFC7C2` → **L281** | `rowProbleme` = `sharedColour.dangerBorder` + `interaction.hairline.strong` on the row | token danger border (no hardcoded hex) |
| Sale rows 46px art-tile + code + sub + pill | `{{ salesRest }}` → **L294** | art-tile row: `artTile` (48·soft+gold keyline) + `clientFirstName` + `productName` + `StatusChip` | **§8** glyph=initial; **RN** gradient→keyline; row shows the client name + product (the existing `SaleRow` model), not an order code |
| Net on the row | *(app net-first; ventes-row gate)* | `oppNet` = `ventes.net_ligne` « + {netFcfa} net » | **money law** — net stays on the row (net-first, ventes-row surface gate); the frame shows net only on the detail |
| Problem encart (designed problem state) | *(states-law, not a frame row)* | `item.status === 'probleme'` → `problemeEncart` Card + `ventes.probleme_encart` + `SecondaryButton` | the app's designed problem state (honest states, states-law pinned) — kept |

## Backlog / light divergence (Option A)

| Frame element | Grep anchor → hit | Disposition |
|---|---|---|
| In-list section headers « Les problèmes d'abord » + « En cours & terminées » | `Les problèmes` → **L278** · `En cours` → **L291** | **Light divergence** — the app conveys problems-first via the **title** (« …LES PROBLÈMES D'ABORD »), the **danger-bordered** problem rows, the **red problem encart**, and problems-first **ordering**. Redundant in-list caps headers are not added (the title already labels it). |
| Order code `{{ v.code }}` as the row lead | `{{ v.code }}` → **L91**(shared)/L298 | app row leads with the **client name** (`SaleRow.clientFirstName`) + product — the existing S7 model; no order-code field. |

## Ecrans cross-check (frame 07 « Ventes · les problèmes d'abord (S7) »)

Problems-first is strongly present: the title labels it, problem rows carry the danger border, the red problem encart explains each problem, and the list is problems-first ordered. Rows are on the program's art-tile DNA. The only omission is the redundant in-list section headers (the title carries them). Composition matches on the S7 problems-first anatomy. Visual gate: founder device pass.

**Font-render (load-bearing):** every Bricolage element uses `DISPLAY_FAMILY` (internal name === useFonts key, green on the built bytes). **Tests:** typecheck clean · 112/112 · states-law (problem encart) + net-first (ventes-row) pins green · no-emoji + copy-lint OK.
