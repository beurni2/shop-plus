# DÉTAIL VENTE → `vente_detail` — anatomy derivation (planche « Shop Plus - Redesign.dc.html »)

**View 7/8 · Option A.** Slice bounded by:

```
308:    <!-- ══ DÉTAIL VENTE ══ -->
358:    <!-- ══ CERCLE ══ -->
```

Hits ∈ **308–358** (`Gain brut`/`Frais Ma Boutique` also appear here at L325/L326; L174/175 are Fiche's). BOUTIK cross-check (`{{ saleSteps }}` · `Suivi — vue revendeuse` · `{{ saleNetF }}`) → **0 hits**. Native to SHOP.

## Applied — product card + net hero + timeline (built)

| Frame element | Grep anchor → hit | Implementation | Lawful divergence |
|---|---|---|---|
| Product card 52px art-tile + product + buyer | `{{ saleGlyph }}` → **L317** · `{{ saleProdLine }}` → **L319** · `{{ saleBuyer }}` → **L320** | `oppRow` info card + `artTile` + `saleDetail.productName` + `clientFirstName` | **model completion** — `productName` added to `SaleDetail` (real sale data, never a seller); **§8** glyph=initial; **RN** keyline; 48 tile (frame 52); no zone in the model |
| Money card « Votre gain net — verrouillé » / « Net pour vous » | `Votre gain net — verrouillé` → **L324** · `Net pour vous` → **L328** · `{{ saleNetF }}` → **L328** | `HeroLedger` (signature) — the locked net as the hero (`vente.net_label` « VOTRE GAIN NET » + `netFcfa`) + `vente.net_regle` « Réglé après livraison validée » whisper | the frame's gross breakdown is **barred** (see below); the net hero **is** the compliant card |
| Custody timeline « Suivi — vue revendeuse » (done/now/later) | `Suivi — vue revendeuse` → **L331** · `{{ saleSteps }}` → **L333** | timeline card (`vente.timeline_titre` + `TimelineRow` per step, phases done/now/later) — states-law pinned | copy = catalog « OÙ EN EST LA COMMANDE » |
| Son prix (client) | *(net-first pair)* | `vente.son_prix` « SON PRIX : {sonPrixFcfa} » card | net renders **before** son prix (net-first) |

## Barred (never built) + backlog (Option A)

| Frame element | Grep anchor → hit | Disposition |
|---|---|---|
| « Gain brut (commission + marge) » gross line | `Gain brut` → **L325** | **Law #1 barred** — reseller sees net; gross-first UI prohibited. |
| « Frais Ma Boutique (20 %) » | `Frais Ma Boutique` → **L326** | **Law #10 barred** — retired name. |
| « Contribution campagne Cercle » (`saleHasCamp`) | L327 | **Law #8 barred** — SP9 Cercle-gated. |
| « Simuler l'étape suivante (démo) » | `Simuler` → **L348** | **Option-A backlog** — a demo step-simulator (interactive). Logged. |
| « Contacter la cliente » + « Assistance » | `Contacter la cliente` → **L351** · `Assistance` → **L352** | **Option-A backlog** — new call/assistance actions. Logged. |
| Header status pill | `{{ saleCode }}` → **L313** (pill L314) | the AppHeader shows « VENTE — {name} »; the status is carried by the **timeline** (done/now/later), not a header pill. Light divergence. |

## Ecrans cross-check (frame 08 « Détail vente · gain verrouillé · timeline »)

« Gain verrouillé » (the HeroLedger net hero) and the custody timeline are the frame's two headline elements — both built, plus the product card. The gross breakdown is barred (Law #1/#10); the simulate/contact/assistance actions are backlog. Composition matches on gain-verrouillé + timeline. Visual gate: founder device pass.

**Font-render (load-bearing):** every Bricolage element uses `DISPLAY_FAMILY` (internal name === useFonts key, green on the built bytes). **Tests:** typecheck clean · 112/112 · states-law (timeline done/now/later) + net-first pins green · no-emoji + copy-lint OK.
