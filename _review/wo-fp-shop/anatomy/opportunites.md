# OPPORTUNITÉS — anatomy derivation (planche « Shop Plus - Redesign.dc.html »)

**Method:** every row's quoted element grep-hits SHOP's OWN slice. The OPPORTUNITÉS frame is bounded by its markers:

```
110:    <!-- ══ OPPORTUNITÉS ══ -->
140:    <!-- ══ FICHE OPPORTUNITÉ ══ -->
```

Every hit line below is inside **110–140**. Cross-check: grep of `Boutik Plus - Redesign.dc.html` for these SHOP anchors (`Produits de vendeurs vérifiés` · `{{ oppList }}` · `Gagnez ≈`) → **0 hits**. Native to SHOP.

## Derivation table — grep-evidenced

| Frame element | Grep anchor → hit (∈ 110–140) | Implementation | Lawful divergence |
|---|---|---|---|
| Screen title "Opportunités" Bricolage 800/28 | `>Opportunités<` → **L113** | in-content `styles.screenTitle` (DISPLAY, `t2.scale.screen` 28/800) rendering `t('opportunites.title')` | copy = catalog « Les opportunités » (catalog is canon, §2); header shows brand « Shop+ » (app persistent-chrome; hub pattern, matches cleared ACCUEIL) |
| Net-first subtitle "Produits de vendeurs vérifiés — votre gain net est affiché." | `Produits de vendeurs vérifiés` → **L114** | `styles.oppSub` + new catalog `opportunites.sous_titre` (register selling · selling_surface; copy-lint OK) | — |
| Product list `sc-for oppList` | `{{ oppList }}` → **L125** | `FlatList data={world.opportunities}` (virtualized — perf budget, low-end Android) | — |
| Product row 60·r15, tappable → fiche | `border-radius:15px;flex:none;position:relative` → **L127** | `styles.oppRow` (r`radius.tile`) + `oppArtTile` (`touch.minTargetPx+spacing.md` = **60**) · `onPress={() => go('selection')}` | frame row → FICHE; app edge is `opportunites→selection` (journey.ts, unchanged) — the pick step |
| Art-tile glyph (frame emoji) | `{{ p.glyph }}` → **L127** | `artTileGlyph` = product initial `item.name.slice(0,1)` | **§8** no-emoji-in-chrome — canon text/SVG only, never emoji; **RN**: no `repeating-linear-gradient` → soft field + gold keyline (`artTileStripe`), same duotone language ratified on ACCUEIL |
| Product name 14.5/700 | `{{ p.name }}` → **L129** | `homeSaleTitle` (TEXT_FAMILY_BOLD, row scale) | — |
| Seller line "vendu par … · vérifié" | `{{ p.sellerLine }}` → **L130** | sub-line = `« Repère : {landmark} »` (`homeSaleSub`) | **honesty (§5)** — `DemoOpportunity` has no seller field ({id,name,landmark,input,money}); the honest datum is the landmark. Fabricating a seller name is forbidden. |
| Net line "Gagnez ≈ {netF} net" deep tnum | `Gagnez ≈` → **L131** · `{{ p.netF }}` → **L131** | `oppNet` (deep, bold, tnum) `t('opportunity.net_label') : {net}` **then** `oppPrice` `t('opportunity.customer_price_label') : {price}` | **money law (SP-I04/I12 net-first, pinned by ui-kit.test)** — the reseller's NET leads; the app renders net **and** the customer price (net first), where the frame shows net only. Copy = catalog net_label (not the mockup's « Gagnez ≈ »). |
| Tier pill `{{ p.tier }}` | `{{ p.tier }}` → **L133** | **not rendered** | **honesty (§5)** — no per-opportunity tier/verification datum; fabrication forbidden. The surface-level « vendeurs vérifiés » claim lives in the subtitle. |
| Search field "Chercher un produit…" (L115–118) | `Chercher un produit` → **L117** | **not rendered** | **standing law (honesty + scope)** — live product search is feature work beyond the Grand Teint→Faso Premium reskin; a non-functional box is a dead control (§5). **⚑ SCOPE — founder ruling requested** (see below). |
| Category chips `sc-for oppCats` (L119–123) | `{{ oppCats }}` → **L120** | **not rendered** | **honesty (§5)** — the demo world carries no category taxonomy; fabricating categories to fill chips violates honest states. **⚑ SCOPE — founder ruling requested.** |

**Composition divergence (LISTED):** the frame has no bottom CTA — each product row is the affordance (tap → « ma sélection »). The pre-reskin `PrimaryButton "Créer ma sélection"` is removed; the `opportunites→selection` journey edge is preserved by the row `onPress`.

**States law:** `world.opportunities` is the seed catalog — structurally never empty — so no empty state is rendered here. Per the states-law test's own rule (the skeleton is excluded because it never mounts — "listing it as a live state would be a lie"), an opportunités empty state that cannot trigger would be exactly that lie, so it is deliberately not added.

## ⚑ SCOPE FORK — governs views 2–8 (founder ruling requested)

The redesign frames reference **interactive controls** (search, category filter) and **richer per-product data** (seller attribution, tier badge, category) that the demo world does not carry. Two readings collide:
- **"The planche is the bar"** → build the controls + expand the demo model.
- **"Reskin scope + honesty law"** → don't add features or fabricate data; list the gap as a divergence.

I built everything the demo can honestly support (title, subtitle, 60px art-tile rows, net-first money) and listed the data/feature-gap elements — mirroring the ratified ACCUEIL method (Mon Cercle omitted-gated; emoji→initial). **Recommendation:** keep the listed-divergence method unless you want the demo model expanded to carry seller/tier/category (a data-model decision, not a reskin) — the controls are additive if you do, so no rework either way. Awaiting your call at the gate.
