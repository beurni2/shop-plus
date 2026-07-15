# ACCUEIL — anatomy derivation (planche « Shop Plus - Redesign.dc.html » L54–110)

Frame elements grepped verbatim from the planche → implementation (App.tsx `screen === 'accueil'`) → lawful divergences only.

| Frame element (planche line) | Implementation | Lawful divergence |
|---|---|---|
| Monogram tile 40·r14 accent, Bricolage 800 "A" (L58) | `styles.monogram` + `monogramText` (DISPLAY_FAMILY 800) | RN: 40→`spacing.xl+lg`, r14→`rmax(radius.art)` (token fidelity) |
| Title "**Ma Boutique**" Bricolage 800/19 -.02em (L60) | `homeTitle` (DISPLAY, view) → **« Ma vitrine »** | **Law #10** — "Ma Boutique" is a retired name; canon « Ma vitrine » |
| Sub `{shopName}` + check svg + "· Gounghin" (L61) | `homeSubRow` + **`IconCoche`** (canon check) + `accueil.zone` | no `shopName` field → `resellerName` (the vitrine is under her name) |
| "Comment ça marche" pill h38 (L62) | `commentPill` + `commentPillText` | h38→`spacing.xxl+xs` |
| Greeting "Bonjour, {resellerName}" **Bricolage 800/28** (L64) | `greeting` (DISPLAY, `t2.scale.screen` 28) | — |
| Tagline "…jamais de recrutement." (L65) | `homeTagline` (`accueil.tagline`, canon copy) | — |
| 2 ledger cards r20 (caps · Bricolage 800/24 tnum deep · sub) (L67–77) | `ledgerCard`/`ledgerMoneyDeep`/`ledgerMoney`/`ledgerCardSub` | — (net-first: the money IS the figure) |
| Primary CTA h54 r16 accent + **✨ sparkle** Bricolage 700/16 (L79) | `sparkleCta` + **`IconProduits`** (canon) + DISPLAY 700 | **§8 + canon** — the 29-icon set is geometry-locked (adding a sparkle breaks `grand-teint.test.ts`); canon `IconProduits` (fits "trouver des produits"). 16→`row` 14.5 (v2 scale) |
| "VENTES EN COURS" caps + "Tout voir" pill (L81–83) | `homeSectionHead` + `toutVoirPill` | — |
| Active-sales rows: **48·r13 duotone art-tile** (bg + diagonal-stripe + glyph) · code/sub · status pill (L85–93) | `homeSaleRow` + `artTile` (soft field + gold keyline + product initial) + `StatusChip` | **RN**: no CSS `repeating-linear-gradient` → soft field + gold keyline (the duotone language); **§8**: glyph = product initial, not the frame's emoji |
| Astuce rose card #F8E4EC (L95) | `astuceCard` + `astuceText` | — |
| **Mon Cercle** card (L96–108) | **not rendered** | **Law #8** — SP9 Cercle is build-gated |

**States law (grammar the planche lacks, LISTED):** the active-sales list carries an **EmptyState** (kit) when `ventesRows` is empty — the planche shows only the populated state; the honest empty state is added.

**Font-render (finding #1, load-bearing):** every Bricolage element above uses `DISPLAY_FAMILY` whose internal name-table family now equals the useFonts key (guarded by `faso-fonts.test.ts` render-name assertion) — so headers/heroes render Bricolage on device, not system font.
