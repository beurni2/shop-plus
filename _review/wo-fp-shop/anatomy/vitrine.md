# VITRINE → `vitrine` — anatomy derivation (planche « Shop Plus - Redesign.dc.html »)

**View 5/8 · Option A.** Slice bounded by:

```
239:    <!-- ══ VITRINE ══ -->
270:    <!-- ══ VENTES (liste) ══ -->
```

Hits ∈ **239–270** (`{{ p.glyph }}`/`{{ p.name }}` are shared row tokens; their storeGrid instances are L256/L258). BOUTIK cross-check (`{{ storeGrid }}` · `openPubVitrine` · `jamais les vendeurs`) → **0 hits**. Native to SHOP.

**Semantic note (money surface — rigor up):** the app's `vitrine` is a **client-preview** — `vitrine.note` « Vos clientes verront ces prix » and the `DuotoneTile` render « prix client only, never net ». It is closer to the frame's *Vitrine publique* (Ecrans 06, client view) than to *Ma vitrine* (Ecrans 05, private management with net + toggle). Per Option A the existing screen's **no-net client-preview semantics are preserved**; the frame's net + toggle are the *Ma vitrine* private-view additions → backlog/divergence.

## Applied — header + product grid (built)

| Frame element | Grep anchor → hit | Implementation | Lawful divergence |
|---|---|---|---|
| Title « Ma vitrine » Bricolage 800/28 | `>Ma vitrine<` → **L244** | in-content `screenTitle` = `t('vitrine.title')` « Aperçu de ma vitrine »; chrome title suppressed (`IN_CONTENT_TITLE`, header keeps the back chip) | copy = catalog « Aperçu de ma vitrine » (canon); the in-content title lands the display type |
| Shop name + vérifié | *(shopName token, L245)* | `homeSubRow` = `resellerName` + `IconCoche` (canon check) | — |
| No-supplier reassurance | `jamais les vendeurs` → **L252** | existing `vitrine.note` « Vos clientes verront ces prix » | keep the canon note (no new string); the frame's « …jamais les vendeurs » is a copy option, not built |
| Product grid `sc-for storeGrid` (2-col) | `{{ storeGrid }}` → **L254** | existing `FlatList numColumns={2}` over `selection` | — |
| Duotone art-tile (110px) + glyph | `{{ storeGrid }}` tile L256 | `DuotoneTile` (signature element — the two-tone crown carrying the glyph) + product initial | **§8** glyph=initial; **RN** no gradient → the duotone crown; signature `DuotoneTile` kept (composed, signature.test) |
| Product name | tile L258 | `tileName` | — |
| Client price deep tnum | `{{ p.clientF }}` → **L260** | `tilePrice` = `customerPriceFcfa` (deep, tnum) | — |

## Backlog (Option A — NOT built) + no-net divergence

| Frame element | Grep anchor → hit | Disposition |
|---|---|---|
| « net {netF} » on each tile | `net {{ p.netF }}` → **L261** | **Deliberate no-net divergence** — `vitrine` is a client-preview; net is excluded by the app's SP-I03-aligned design (net lives on gains/opportunités). Surfacing net here is the *Ma vitrine* private-view behaviour → backlog. |
| **Toggle privée/publique** (`togglePublic` + `pubLabel`) | `{{ togglePublic }}` → **L248** · `{{ pubLabel }}` → **L249** | **Option-A backlog** — a new public/private state + control. Logged. |
| **Aperçu public** eye (`openPubVitrine` → Vitrine publique) | `openPubVitrine` → **L247** | **Option-A backlog** — targets Ecrans 06 « Vitrine publique », an unbuilt frame. Logged. |

## Ecrans cross-check (frame 05 « Ma vitrine · toggle privée/publique »)

The header (big title + name + vérifié) and the duotone product grid are built to the frame DNA. The **toggle** and the **net-on-tiles** are the *Ma vitrine* private-management additions — backlog / deliberate no-net (the app's vitrine is a client-preview). Composition matches on header + grid; toggle + net are logged. Visual gate: founder device pass.

**Font-render (load-bearing):** every Bricolage element uses `DISPLAY_FAMILY` (internal name === useFonts key, green on the built bytes). **Tests:** typecheck clean · 112/112 · net-first + states-law (vitrine empty state) + signature (DuotoneTile composed) pins green · no-emoji + copy-lint OK.
