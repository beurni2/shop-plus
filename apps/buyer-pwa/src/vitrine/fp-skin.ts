/**
 * RE-SKIN (FP) — the vitrine's design language over the buyer journey
 * (produit · localisation · livraison · paiement · confirmation · suivi ·
 * protections, plus the order states and the C1 skeleton surface), WITHOUT
 * touching layout, markup, or behaviour.
 *
 * Every byte below is lifted from a treatment the vitrine ALREADY ships —
 * cited rule-by-rule against its source: `vitrine/styles.ts` (.vt-*),
 * `vitrine/themes.ts` (θ recipes), `vitrine/entries.ts` (.ent*), and the
 * reseller K-screens' CTA recipe (k-styles `cta`: the one consumer of the
 * `rgba(θ.sh, .5)` shadow the theme record documents). Nothing here is a new
 * design decision; where the vitrine defines no treatment, the Grand Teint
 * treatment stays (token-bridged) and the gap is reported in JOURNAL.md.
 *
 * HOW IT WORKS — a scoped token bridge, not a rewrite: `.fp-screen` re-points
 * the Grand Teint custom properties the existing markup reads (`--c-*`) at the
 * vitrine palette and at the SAME `--vt-*` theme properties `applyTheme` sets.
 * The reseller's habillage (§1.2 closed set) therefore drives the product and
 * checkout chrome exactly as it drives her vitrine: one property swap,
 * repaint, no reflow (§8.5). Money VALUES are untouched — this file contains
 * colours, radii, and type only; every FCFA figure keeps its byte.
 */

export const FP_SKIN_STYLES = `
  /* Ground — .vt-root bytes (paper, ink, Instrument Sans) + the token bridge. */
  .fp-screen {
    background: #F4EFE6; color: #1C1710;
    font-family: 'Instrument Sans', system-ui, sans-serif;
    min-height: 100vh;
    --c-paper: #F4EFE6;            /* .vt-root background */
    --c-ink: #1C1710;              /* .vt-root color */
    --c-body: #4A3F33;             /* .vt-tagline / .vt-bio / .vt-state p */
    --c-muted: #6F6355;            /* .vt-zone / .vt-rep / .vt-group b */
    --c-soft: #8A7D6B;             /* .vt-group i / .vt-sk-note */
    --c-sand: var(--vt-soft);      /* .vt-cover default background (θ.soft) */
    --c-hairline: #EDE4D3;         /* .vt-tile border */
    --c-hairlineStrong: #E5DCC9;   /* .vt-topbtn / .vt-ghostbtn / .vt-chip-line border */
    --c-surfaceMuted: #FCF9F2;     /* .vt-empty background */
    --c-primary: var(--vt-accent);
    --c-primaryStrong: var(--vt-deep);
    --c-primarySoft: color-mix(in srgb, var(--vt-on) 75%, transparent); /* .vt-cover-caps: θ.on à 75 % */
    --c-onPrimary: var(--vt-on);
    --c-onInk: #F6F0E4;            /* .vt-band color */
    --c-danger: #C4574B;           /* K fieldInputError byte (the vitrine error red) */
  }

  /* Display type — .vt-namerow / .vt-state h3 bytes (Bricolage 800, -0.48px). */
  .fp-screen h2 {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-weight: 800; letter-spacing: -0.48px;
  }
  .fp-screen .checkout-option h3 {
    font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; /* .vt-empty-titre */
  }

  /* Money figures — .vt-tile-price / .vt-featured-price bytes (Bricolage 800,
     tabular, θ.deep, .3s re-tint). Sizes stay the Grand Teint scale (layout). */
  .fp-screen .fcfa-hero,
  .fp-screen .fcfa-figure,
  .fp-screen .fcfa-figure-inline {
    font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800;
  }
  .fp-screen .fcfa-figure { color: var(--vt-deep); transition: color .3s; }
  .fp-screen .fcfa-figure-inline { color: var(--vt-deep); }

  /* THE PRICE BAND (§2.2), re-expressed: θ.accent surface + θ.on ink (the
     .vt-avatar / K-CTA pairing), .vt-band radius, .vt-cover-caps label
     (letterspaced caps at θ.on 75 %). Background/colour arrive via the bridge;
     the .3s transition is §8.5's re-tint law, the vitrine's own byte. */
  .fp-screen .price-band { border-radius: 18px; transition: background .3s; }
  .fp-screen .price-band-label { letter-spacing: 1.52px; }

  /* The premium photo frame (§5.4) — .vt-featured art radius + .vt-tile border;
     the documentary corner ticks stay (no vitrine tick treatment exists — gap
     reported), now drawn in vitrine ink via the bridge. */
  .fp-screen .product-photo { border-radius: 20px; border-color: #EDE4D3; }
  .fp-screen .product-photo-initial { font-family: 'Bricolage Grotesque', sans-serif; } /* .vt-avatar face */

  /* Trust chips — .vt-chip / .vt-chip-full bytes (pill, θ.soft on θ.deep). */
  .fp-screen .trust-chip {
    border: 0; border-radius: 99px; padding: 7px 12px;
    background: var(--vt-soft); color: var(--vt-deep);
    font-size: 11.5px; font-weight: 700;
    letter-spacing: normal; text-transform: none;
    transition: background .3s, color .3s;
  }
  /* Fallback verified badge — .ent1-verified bytes (quiet, never a green box). */
  .fp-screen .verified-badge {
    background: transparent; border: 0; padding: 0;
    color: #6F6355; font-size: 12px; font-weight: 400;
    letter-spacing: normal; text-transform: none;
  }

  /* THE CTA — the K-screen cta recipe verbatim (h 54 · r 16 · θ.accent ·
     Bricolage 700 16.5 · θ.on · shadow 0 12 13 rgba(θ.sh, .5)) — the one
     consumer of --vt-sh, exactly as themes.ts documents the recipe. Press is
     the vitrine press (.ent3:active scale), not the Grand Teint opacity dip. */
  .fp-screen .primary-action {
    min-height: 54px; border-radius: 16px;
    background: var(--vt-accent); color: var(--vt-on);
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 16.5px; font-weight: 700;
    letter-spacing: normal; text-transform: none;
    box-shadow: 0 12px 13px rgba(var(--vt-sh), .5);
    transition: background .3s;
  }
  .fp-screen .primary-action:active { opacity: 1; transform: scale(.98); }

  /* Quiet links (protections · back) — .ent2 bytes (Instrument 13.5 700,
     θ.accent, no underline, no caps). */
  .fp-screen .link-quiet {
    color: var(--vt-accent);
    font-family: 'Instrument Sans', system-ui, sans-serif;
    font-size: 13.5px; font-weight: 700;
    letter-spacing: normal; text-transform: none; text-decoration: none;
  }

  /* Checkout options — .vt-tile card bytes (white, r 18, hairline, soft lift);
     the ineligible option is the .vt-empty dashed card (dignified, never grey
     bureaucracy); the fee warning is the K noteRose recipe (θ.soft/θ.deep). */
  .fp-screen .checkout-option {
    border: 1px solid #EDE4D3; border-radius: 18px; background: #FFFFFF;
    box-shadow: 0 1px 2px rgba(28, 22, 15, 0.04);
  }
  .fp-screen .checkout-option-unavailable {
    background: #FCF9F2; border: 1px dashed #DDD2BC; box-shadow: none; color: #6F6355;
  }
  .fp-screen .fee-warning {
    background: var(--vt-soft); color: var(--vt-deep);
    border-radius: 14px; padding: 12px;
    transition: background .3s, color .3s;
  }

  /* Equal-weight actions (order states + the two choose buttons) —
     .vt-ghostbtn bytes. BOTH buttons of a pair share this one rule: the
     prominence law survives the skin by construction. */
  .fp-screen .action.action-equal {
    min-height: 48px; border: 1px solid #E5DCC9; border-radius: 14px;
    background: #FFFFFF; color: #1C1710;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 14.5px; font-weight: 700;
    letter-spacing: normal; text-transform: none;
  }
  .fp-screen .action.action-equal:active { background: #FBF6EB; } /* .ent4:active */

  /* « La voix » player + audio notes — .vt-tile-voix bytes (θ.soft pill,
     θ.deep ink); height keeps the ≥ touch Grand Teint floor (the vitrine's
     30 px chip rides inside a 44 px tile — a standalone player may not). */
  .fp-screen .voix-btn, .fp-screen .audio-note {
    border: 0; border-radius: 999px;
    background: var(--vt-soft); color: var(--vt-deep);
    transition: background .3s, color .3s;
  }
  .fp-screen .voix-icon { color: var(--vt-deep); }
  .fp-screen .voix-duration { color: var(--vt-deep); }
  .fp-screen .voix-label, .fp-screen .audio-note-label {
    letter-spacing: 0.2px; text-transform: none; text-decoration: none;
    font-size: 11.5px; font-weight: 700;
  }
  .fp-screen .audio-note-pending {
    background: transparent; border: 1px dashed #DDD2BC; color: #6F6355; /* .vt-empty dash */
  }

  /* Offline stays the ink band — .vt-band radius joins it (same ink, same text
     ink #F6F0E4 via the bridge). */
  .fp-screen .offline-banner { border-radius: 18px; }

  /* ------------------------------------------------------------------------
     MID-JOURNEY (part 2) — localisation · livraison · suivi · confirmation ·
     protections join the same language. Colours largely arrive via the bridge
     above; the rules below add only the treatments the bridge cannot express,
     each cited to its vitrine/K source byte. */

  /* Caps labels (field-label · step-line) — the K fieldLabel byte, identical
     to .vt-group b (11 · 700 · ls 1.1 · muted via bridge). */
  .fp-screen .field-label, .fp-screen .step-line {
    font-size: 11px; font-weight: 700; letter-spacing: 1.1px;
  }

  /* Inputs — K fieldInput bytes (r 14 · 1.5 #E5DCC9 · white); focus rides the
     habillage (K fieldInputFocus is θ.accent — θ-parametric here). */
  .fp-screen .field-input {
    border-radius: 14px; border: 1.5px solid #E5DCC9; background: #FFFFFF;
  }
  .fp-screen .field-input:focus { outline: none; border-color: var(--vt-accent); }

  /* Zone chips — rest is the .vt-chip-line pill (white · 1 #E5DCC9); selected
     is the K themeCardSelected recipe (2px θ.accent border) over the
     .vt-chip-full ink (θ.soft on θ.deep). Selection stays structural. */
  .fp-screen .chip {
    border-radius: 99px; border: 1px solid #E5DCC9; background: #FFFFFF;
  }
  .fp-screen .chip-on {
    border: 2px solid var(--vt-accent); background: var(--vt-soft); color: var(--vt-deep);
    transition: background .3s, color .3s, border-color .3s;
  }

  /* Séra's quote rows — the .vt-tile card (white · #EDE4D3 · soft lift), r 14
     (the K fieldInput/row radius); overflow clips the structural accent edge
     inside the rounding. Selected = the K themeCardSelected recipe: 2px
     θ.accent border + shadow 0 12 15 rgba(θ.accent, .35); the Grand Teint
     accent edge + corner mark re-tint through the bridge and stay. */
  .fp-screen .quote-row {
    border-radius: 14px; border: 1px solid #EDE4D3; background: #FFFFFF;
    box-shadow: 0 1px 2px rgba(28, 22, 15, 0.04);
    overflow: hidden;
  }
  .fp-screen .quote-row-on {
    border: 2px solid var(--vt-accent);
    box-shadow: 0 12px 15px rgba(var(--vt-sh), .35);
    transition: border-color .3s;
  }

  /* Tracking — timeline colours re-tint via the bridge (done = ink, now =
     θ.accent ring, later = hairline); the MAINTENANT chip takes the vitrine
     pill (r 99, .vt-chip). */
  .fp-screen .now-chip { border-radius: 99px; transition: background .3s; }
  .fp-screen .status-chip { border-radius: 99px; padding: 7px 12px; }

  /* The door block — the .vt-tile card bytes (white, r 18, hairline, lift). */
  .fp-screen .door-block {
    border-radius: 18px; border: 1px solid #EDE4D3; background: #FFFFFF;
    box-shadow: 0 1px 2px rgba(28, 22, 15, 0.04);
  }

  /* The drop-code frame — NO vitrine treatment exists (gap reported): it keeps
     the part-1 photo-frame precedent — rounded (r 20) with the documentary
     ticks kept, ticks re-tinted to θ.accent through the bridge. */
  .fp-screen .code-box { border-radius: 20px; }

  /* The landmark voice block — the .ent3-encart radius (r 16); its surface and
     hairline arrive via the bridge (#FCF9F2 · #E5DCC9). */
  .fp-screen .voice-note { border-radius: 16px; }

  /* Secondary actions — the .vt-ghostbtn bytes (the same language the equal
     actions already ride). The problem path KEEPS its danger border/ink
     (SP-I10 — this rule outranks .problem-path, so restate it, on the K error
     byte the bridge carries). */
  .fp-screen .secondary-action {
    border-radius: 14px; border: 1px solid #E5DCC9; background: #FFFFFF; color: #1C1710;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 14.5px; font-weight: 700;
    letter-spacing: normal; text-transform: none;
  }
  .fp-screen .secondary-action:active { background: #FBF6EB; } /* .ent4:active */
  .fp-screen .secondary-action.problem-path {
    border-color: var(--c-danger); color: var(--c-danger);
  }

  /* « Vos protections » — the K vSheet bytes verbatim: card #FBF7EF, top
     radius 24, the 44×5 r99 #DDD2BC handle. The rows' quote-rule left border
     re-tints to vitrine ink through the bridge. */
  .fp-screen .protections-sheet {
    background: #FBF7EF; border-top: 0; border-radius: 24px 24px 0 0;
  }
  .fp-screen .sheet-handle {
    width: 44px; height: 5px; border-radius: 99px; background: #DDD2BC;
  }

  /* C1 skeleton (§2.1) — the .vt-shim treatment verbatim (the woven shimmer),
     same exact boxes (CLS 0 by construction, unchanged markup). */
  .fp-screen .skeleton-fill, .fp-screen .skeleton-line {
    background: #ECE4D4;
    background-image: linear-gradient(100deg, #ECE4D4 30%, #F6F1E7 45%, #ECE4D4 60%);
    background-size: 320px 100%;
    border-radius: 8px; /* .vt-sk-name */
  }
  .fp-screen .product-photo.skeleton-fill { border-radius: 20px; }
  @media (prefers-reduced-motion: no-preference) {
    .fp-screen .skeleton-fill, .fp-screen .skeleton-line {
      animation: fpShim 1.15s linear infinite; /* .vt-shim cadence */
    }
    @keyframes fpShim { from { background-position: -320px 0; } to { background-position: 320px 0; } }
  }
`;
