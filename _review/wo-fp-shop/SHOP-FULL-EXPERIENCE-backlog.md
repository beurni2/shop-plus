# SHOP-FULL-EXPERIENCE — the logged backlog (Option A boundary)

**WO-FP-SHOP is a token/anatomy reskin of the 8 EXISTING reseller screens.** Everything the redesign planche (« Shop Plus - Redesign.dc.html » / « Shop Plus - Ecrans.dc.html ») shows *beyond* those 8 screens' current capabilities is **logged here, NOT built** — it is future feature work, sequenced behind its gates and (where relevant) the money-architecture decision. This doc is the honest boundary so nothing is silently dropped or silently smuggled in.

Founder ruling (Option A, 2026-07-15): "the 8 existing screens to frame anatomy; the 9 unbuilt frames + search/filters + the margin slider are the logged backlog, NOT built."

---

## A. The 9 unbuilt frames (Ecrans board screens with no existing app screen)

| Ecrans # | Frame | Gate / reason it is backlog |
|---|---|---|
| 06 | Vitrine publique (vue cliente, lecture seule) | Customer-facing read-only view; separate surface, not in the reseller walking-skeleton 8. |
| 09 | Cercle | **SP9 build-gate** (Law #8) — Cercle after the drop-code→settlement loop is stable 4 wks + the SP9 gate. |
| 10 | Nouvelle campagne | **SP9** (Cercle cluster). |
| 11 | Campagne active | **SP9** (Cercle cluster). |
| 12 | Membres | **SP9** (Cercle cluster) + consent design. |
| 13 | Financement | **SP9** (Cercle cluster) — « gains réglés uniquement ». |
| 14 | Avis vérifiés | **SP9**-adjacent — Séra-validated delivery reviews. |
| 15 | Ma réputation (« 4,8 ★ ») | **S8 star-score is barred** (SP8 count-not-score, ruling 3): réputation is « N ventes livrées », not a star. Any rebuild lives on the buyer PWA, not here. |
| 17 | Comment ça marche | Onboarding/explainer screen — no existing app screen (the accueil pill is non-navigating). New screen = backlog. |

---

## B. Features the existing screens' frames show but the reskin does NOT build

| Feature | Frame (Redesign line) | Why backlog |
|---|---|---|
| **Search field** (« Chercher un produit… ») on Opportunités | L115–118 | New interactive capability; the demo world has no product-search state. Feature work. |
| **Category filters** (chips) on Opportunités | L119–123 | The demo world has no category taxonomy; honest filters need real category data (a data-model addition). Feature work. |
| **Margin slider** (« Votre marge » + `range`) on Fiche | L166–169 | Live markup→waterfall recompute. The RN bundle **cannot** run `computeWaterfall` (Metro bars the `@platform/contracts` barrel; the seed is pre-computed). Requires a money-architecture decision — **§7**, founder-gated. |
| Single-product **Fiche detail** composition (170px hero, full waterfall card, single share CTA) | L142–189 | `selection` is a multi-select list; a per-product detail screen is a new screen/flow. Feature work. |
| **Format selector** (story/carré/affiche) on Partager | L200–204 | New interactive format-switch; the app renders one canonical share card. Feature work. |
| **« Partager sur WhatsApp »** deep-link | L219 | New share action (WhatsApp intent). Feature work. |
| **« Voir comme cliente »** + **« Aperçu du lien » (OG)** | L220 · L235 | New view-as-client navigation + a separate OG-preview screen. Feature work. |
| **Net-is-private line** on the share card | L216 | `ShareCard` carries **no net field** by SP-I03 leak-proof construction; surfacing the reseller's net needs a share-model change. Data-model + feature work. |

---

## C. Money surfaces explicitly barred (never built, not "backlog")

| Element | Frame | Bar |
|---|---|---|
| « Gain brut » gross line | Fiche L174 | **Law #1** — reseller sees net; gross-first UI prohibited. `earnings.ts` renders `[resellerNet, customerPrice]` only. |
| « Frais Ma Boutique » | Fiche L175 | **Law #10** — retired name; canon « Part Shop+ ». |
| Diaspora block | Fiche L152–157 | **Law #8 / §7** — out of scope until the founder reopens Diaspora. |
| PackLab block | Fiche L158–163 | **Law #8** — B+9 gated. |

---

*Maintained per-view as the reskin proceeds. Views covered: 2 (Opportunités), 3 (Fiche→selection), 4 (Partager→lien). Extended through view 8.*
