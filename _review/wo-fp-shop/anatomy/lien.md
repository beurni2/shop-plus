# PARTAGER → `lien` — anatomy derivation (planche « Shop Plus - Redesign.dc.html »)

**View 4/8 · Option A.** The PARTAGER slice is bounded by its markers:

```
193:    <!-- ══ PARTAGER ══ -->
239:    <!-- ══ VITRINE ══ -->
```

Hits ∈ **193–239** (the `{{ shopName }}` token is shared with accueil L61; its PARTAGER instance is **L208**). BOUTIK cross-check (`{{ shareClientF }}` · `Copier le lien signé` · `jamais visible par la cliente`) → **0 hits**. Native to SHOP.

## Applied — the hero share-card + QR (built)

| Frame element | Grep anchor → hit | Implementation | Lawful divergence |
|---|---|---|---|
| Duotone art-tile hero banner | `{{ shareGlyph }}` → **L206** | `shareHero` (soft field + `artTileStripe` gold keyline) + `shareHeroGlyph` = product initial | **§8** glyph=initial not emoji; **RN** no `repeating-linear-gradient` → soft field + gold keyline; Card padding insets the banner vs the frame's full-bleed |
| Shop name + vérifié | `{{ shopName }}` → **L208** | `shareShopRow` = `shareCard.resellerName` (caps) + `IconCoche` (canon check, `shopColour.primary`) | — |
| Product name | `{{ shareName }}` → **L209** | `cardTitle` (DISPLAY view scale) | — |
| Client price — big deep tnum | `{{ shareClientF }}` → **L210** | `shareHeroPrice` (DISPLAY `heroMoney` 36–38, `shopColour.deep`, tnum) = `share.prix` « Votre prix : {priceFcfa} » | **HER price only** — never net, never commission (SP-I03; `ShareCard` carries client economics only). Frame 30 → v2 `heroMoney` (lands the display type). |
| Price validity | `Prix valable` → **L211** | `ogValidite` = `share.validite` « Prix du {date}… » | — |
| Trust badge | *(canon badge language)* | `StatusChip` « Livré par Séra » | frame's « Commander en 2 minutes » (a client-CTA preview) → the canon « Livré par Séra » trust chip |
| Signed link + QR « /v/aicha-4821 » | `/v/aicha-4821` → **L231** | existing QR card: `QrCode url={DEMO_QR_URL}` + `shortCode` + `DEMO_SHARE_LINK` (« lien d'essai ») | the app's QR uses the vendored encoder (WO-7.2b); print-spec caption is the existing copy |
| Attribution reassurance | `vous est attribuée` → **L222** | existing `lien.explication` « Chaque vente passée par ce lien vous est comptée » | catalog copy (French Voice) |

## Backlog (Option A — NOT built) + SP-I03 divergence

| Frame element | Grep anchor → hit | Disposition |
|---|---|---|
| **Format selector** (story/carré/affiche) | `{{ shareFmts }}` → **L201** | **Option-A backlog** — a new interactive format-switch; the app renders one canonical card. Logged. |
| **Net-is-private line** « Votre gain net… jamais visible par la cliente » | `{{ shareNetF }}` → **L216** · `jamais visible par la cliente` → **L216** | **SP-I03 divergence** — `ShareCard` carries **no net field** by leak-proof construction (composeShareCard forbids commission/net so a client-facing leak is impossible). Showing the reseller's net here needs a share-model change → backlog. |
| « Partager sur WhatsApp » | `Partager sur WhatsApp` → **L219** | **Option-A backlog** — a new WhatsApp deep-link action. Logged. |
| « Voir comme cliente » | `Voir comme cliente` → **L220** | **Option-A backlog** — a new view-as-client navigation. Logged. |
| « Aperçu du lien » (OG preview) | `Aperçu du lien` → **L235** | **Option-A backlog** — a separate OG-preview screen the app doesn't have. Logged. |

## Ecrans cross-check (frame 04 « Partager · formats · QR /v/aicha-4821 · aperçu OG »)

The QR « /v/aicha-4821 » is built; the share-card hero + signed link are built. « formats » (selector) and « aperçu OG » are backlog per Option A. Composition matches on the card + QR; the format-switch, OG-preview, WhatsApp and view-as-client are logged, not built. Visual gate: founder device pass on the republished preview.

**Font-render (load-bearing):** every Bricolage element uses `DISPLAY_FAMILY` (internal name === useFonts key, green on the built bytes). **Tests:** typecheck clean · 112/112 · no-emoji + copy-lint OK.
