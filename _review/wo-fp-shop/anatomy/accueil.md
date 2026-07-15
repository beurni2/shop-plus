# ACCUEIL — anatomy derivation (planche « Shop Plus - Redesign.dc.html »)

**Method (founder's rule, adopted verbatim):** *"A derivation row exists only if its quoted string is in your OWN app's planche slice — sibling apps share a system, never a frame."* Every row below carries its **grep evidence** (pattern + hit line) against `Shop Plus - Redesign.dc.html`. The ACCUEIL slice is bounded by its own markers:

```
54:    <!-- ══ ACCUEIL ══ -->
110:    <!-- ══ OPPORTUNITÉS ══ -->
```

Every hit line below falls inside **54–110** — SHOP's own ACCUEIL frame.

## Cross-check against the import theory (BOUTIK planche)

The mechanical gate flagged « Ventes en cours » / « Tout voir » / the sales-rows section as *imported from BOUTIK's ACCUEIL table*. Grep of `Boutik Plus - Redesign.dc.html` for those exact strings:

```
grep -n "Ventes en cours\|activeSales\|Astuce : le prix client"  "Boutik Plus - Redesign.dc.html"
  → (no matches — none of these strings exist in the BOUTIK planche)
```

The section cannot have been imported from a table that does not contain it. It is native to SHOP's frame (L83–98) and absent from BOUTIK's. Bytes reconciled.

## Derivation table — grep-evidenced

| Frame element | Grep anchor (pattern → hit line, ∈ 54–110) | Implementation | Lawful divergence |
|---|---|---|---|
| Monogram tile 40·r14 accent, Bricolage 800 "A" | `border-radius:14px;background:#A31D4E` → **L58** | `styles.monogram` + `monogramText` (DISPLAY 800) | RN: 40→`spacing.xl+lg`, r14→`rmax(radius.art)` (token fidelity) |
| Title "Ma Boutique" Bricolage 800/19 | `>Ma Boutique<` → **L60** | `homeTitle` → **« Ma vitrine »** | **Law #10** — "Ma Boutique" is retired; canon « Ma vitrine » |
| Sub `{shopName}` + check svg + "· Gounghin" | `{{ shopName }}` → **L61** | `homeSubRow` + `IconCoche` + `accueil.zone` | no `shopName` field → `resellerName` (the vitrine is under her name) |
| "Comment ça marche" pill h38 | `howItWorks` → **L63** | `commentPill` + `commentPillText` | h38→`spacing.xxl+xs` |
| Greeting "Bonjour, {resellerName}" Bricolage 800/28 | `Bonjour, {{ resellerName }}` → **L65** | `greeting` (DISPLAY, `t2.scale.screen` 28) | — |
| Tagline "…jamais de recrutement." | `jamais de recrutement` → **L66** | `homeTagline` (`accueil.tagline`) | — |
| Ledger card 1 — "Gains nets — juin" | `Gains nets — juin` → **L69** | `ledgerCard`/`ledgerMoneyDeep`/`ledgerCardSub` | — (net-first: the money IS the figure) |
| Ledger card 2 — "En attente (net)" | `En attente (net)` → **L74** | `ledgerCard`/`ledgerMoney`/`ledgerCardSub` | — |
| Primary CTA "Trouver des produits à vendre" h54 r16 accent | `Trouver des produits à vendre` → **L80** | `sparkleCta` + `IconProduits` (canon) + DISPLAY 700 | **§8 + canon** — 29-icon set is geometry-locked (`grand-teint.test.ts`); canon `IconProduits`. 16→`row` 14.5 (v2 scale) |
| Section head "Ventes en cours" caps | `>Ventes en cours<` → **L83** | `homeSectionHead` | — |
| "Tout voir" pill → openSales | `>Tout voir<` → **L84** · `{{ openSales }}` → **L84** | `toutVoirPill` | — |
| Active-sales rows `sc-for activeSales`: 48·r13 duotone art-tile · code/sub · status pill | `{{ activeSales }}` → **L87** | `homeSaleRow` + `artTile` + `StatusChip` | **RN**: no CSS `repeating-linear-gradient` → soft field + gold keyline (duotone language); **§8**: glyph = product initial, not the frame's emoji |
| Astuce rose card #F8E4EC | `Astuce : le prix client` → **L98** | `astuceCard` + `astuceText` | — |
| **Mon Cercle** card → goCercle | `{{ goCercle }}` → **L99** · `>Mon Cercle<` → **L102** | **not rendered** | **Law #8** — SP9 Cercle is build-gated |

**States law (grammar the planche lacks, LISTED):** the active-sales list carries an **EmptyState** (kit) when `ventesRows` is empty — the planche shows only the populated state; the honest empty state is added.

**Font-render (finding #1, load-bearing):** every Bricolage element above uses `DISPLAY_FAMILY` whose internal name-table family now equals the useFonts key (guarded by `faso-fonts.test.ts` render-name assertion) — so headers/heroes render Bricolage on device, not system font.
