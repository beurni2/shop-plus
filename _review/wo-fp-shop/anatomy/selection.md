# FICHE OPPORTUNITÉ → `selection` — anatomy derivation (planche « Shop Plus - Redesign.dc.html »)

**View 3/8 · Option A** — the existing `selection` screen (a **multi-select** « Ma sélection » list) reskinned to the Fiche frame's **shared product DNA**. The Fiche frame is a **single-product detail**; its distinctive composition (hero, **margin slider**, gross waterfall) is **Option-A backlog / law-barred**, LISTED below. The Fiche slice is bounded by its markers:

```
140:    <!-- ══ FICHE OPPORTUNITÉ ══ -->
193:    <!-- ══ PARTAGER ══ -->
```

Every hit below ∈ **140–193**. BOUTIK cross-check (`{{ oppName }}` · `type="range"` · `Votre marge`) → **0 hits**. Native to SHOP.

## Applied — shared DNA (built)

| Frame element | Grep anchor → hit | Implementation | Lawful divergence |
|---|---|---|---|
| Duotone art-tile (hero, `repeating-linear-gradient` + glyph) | `{{ oppGlyph }}` → **L149** | `oppArtTile` (60·r`radius.art`, soft field + `artTileStripe` gold keyline) + `artTileGlyph` = product initial | **RN**: no CSS `repeating-linear-gradient` → soft field + gold keyline (ratified duotone language); **§8**: glyph = initial, not emoji; **scale**: Fiche's 170px single-product hero → the 60px list-row tile (selection is a list, not a detail) |
| Product name Bricolage 800 | `{{ oppName }}` → **L150** | `homeSaleTitle` (row scale) | list-row scale, not the Fiche 24/800 detail scale |
| Net-first « Votre gain net » deep tnum | `Votre gain net` → **L176** · `{{ oppNetF }}` → **L176** | `oppNet` (deep, bold, tnum) = `t('opportunity.net_label') : {net}` | net only (SP-I04/I12; **no gross** — see backlog); catalog copy « Votre gain net » |
| Selection affordance (chosen ⇄ unchosen) | *(app capability, not a Fiche element)* | `SelectionSwap selected={chosen}` + `CornerTicks show={chosen}` + `rowChosen` accent border; `isSelected`/`toggleSelection` | the multi-select toggle is the existing screen's mechanic — preserved through the reskin |

## Backlog (Option A — NOT built) + law-barred

| Frame element | Grep anchor → hit | Disposition |
|---|---|---|
| Single-product **hero** (170px) + `oppSellerNote` | `{{ oppGlyph }}` → **L149** / L151 | **Option-A backlog** — Fiche is a single-product detail; `selection` stays a multi-select list. Logged in SHOP-FULL-EXPERIENCE. |
| « Votre marge » + **MARGIN SLIDER** (`<input type="range">`) | `Votre marge` → **L166** · `type="range"` → **L169** · `{{ oppMargin }}` → **L169** | **Option-A backlog (explicitly named by the founder)** — a live markup→waterfall recompute; the RN bundle can't run `computeWaterfall` (Metro bars the contracts barrel; seed is pre-computed). Money-architecture decision, logged. |
| Gross waterfall « Gain brut » | `Gain brut` → **L174** | **Law #1 barred** — reseller sees **net**, gross-first UI prohibited; `earnings.ts` renders `[resellerNet, customerPrice]` only. Never built. |
| « Frais Ma Boutique (20 %) » | `Frais Ma Boutique` → **L175** | **Law #10 barred** — retired name; canon is « Part Shop+ ». (Inside a backlog element regardless.) |
| Diaspora block | `{{ oppIsDiaspora }}` → **L152** | **Law #8 / §7 barred** — Diaspora out of scope until the founder reopens it. |
| PackLab block | `{{ oppIsPack }}` → **L158** | **Law #8 barred** — PackLab is B+9 gated. |
| Single bottom CTA « Ajouter à ma vitrine & partager » | `Ajouter à ma vitrine` → **L188** | selection's flow is multi-select → `PrimaryButton` « Voir ma vitrine » → vitrine (journey edge `selection→vitrine`, unchanged); the single-product share CTA belongs to the backlog Fiche detail. |

## Ecrans cross-check (« Shop Plus - Ecrans.dc.html » frame 03 « Fiche opportunité · slider de marge · net live »)

The Ecrans frame's signature — the **margin slider + live net** — is the unbuilt capability (Option-A backlog); it cannot be held pixel-for-pixel against a multi-select list, and the sandbox has no RN headless renderer. What ships is the existing `selection` screen carrying the frame's **shared product DNA** (duotone art-tile · Bricolage name · net-first deep money) — consistent with views 1–2. Composition matches on the shared system; the single-product detail + slider is intentionally backlog. Visual gate: founder device pass on the republished preview.

**Font-render (load-bearing):** every Bricolage element uses `DISPLAY_FAMILY` (internal name === useFonts key, guarded green on the built bytes). **Tests:** typecheck clean · 112/112 · net-first + selection-affordance + states-law pins green · no-emoji + copy-lint OK.
