/**
 * VITRINE — the redesigned buyer-surface stylesheet (Phase-1).
 *
 * Every value is the Phase-0 computed-style table's byte (colors, fonts,
 * paddings, radii, shadows, gradients) — the table, not the prose, is the
 * build target; the Phase-4 property diff re-verifies each rule against it.
 * Theme-parametric colors read the "--vt-*" custom properties "applyTheme"
 * sets, so a theme change re-tints in one repaint (§8.5, no reflow).
 *
 * Properties the Phase-0 extractor does not capture (opacity, absolute
 * offsets, alignment, overflow) are authored from HANDOFF §2 and land under
 * the final masked visual diff — documented in the Phase-4 audit.
 */

export const VITRINE_STYLES = `
  .vt-root {
    /* BOUTIQUE-BLANC (founder order 2026-08-14): « the buyer facing boutique
       whitening it but without touching the en-tête/headers section ». The
       ground was a fixed warm paper for EVERY theme — the theme never lived
       here; it lives in the liseré, the en-tête sheets and the accents, all
       of which paint their OWN surfaces edge to edge (the en-tête bleeds
       over the page top and ends on its rounded corners + shadow). So the
       one line below whitens the products page under her themed header
       without moving a themed pixel. The tiles are white cards: their fill
       stops separating on white and their 1px hairline + the photograph
       carry the edge — same measured trade as the reseller app's white grid,
       pinned in test/vitrine-blanc.test.ts. The buyer PAYMENT pages (cl-*)
       keep their own warm ground: he named the boutique. */
    background: #FFFFFF; color: #1C1710;
    font-family: 'Instrument Sans', system-ui, sans-serif;
    font-size: 16px; font-weight: 400; line-height: normal;
    min-height: 100vh;
  }
  /* BOUTIQUE-BLANC (verifier) — the SHELL body behind this page still paints
     the warm paper, so the overscroll rubber-band flashed a warm seam that
     never existed when both grounds matched. Same idiom the payment pages
     already use — body:has(.cl-root) in cliente/styles.ts. */
  body:has(.vt-root) { background: #FFFFFF; }
  .vt-root * { box-sizing: border-box; margin: 0; }
  .vt-root b, .vt-root i, .vt-root em { font-style: normal; }
  .vt-root v { display: inline; }
  /* zone 54 + liseré 6 — partout, jamais répétés (§5). */
  .vt-status { height: 54px; }
  .vt-lisere {
    height: 6px;
    background: repeating-linear-gradient(90deg,
      var(--vt-accent) 0px, var(--vt-accent) 18px,
      #F4EFE6 18px, #F4EFE6 24px,
      #C89A3F 24px, #C89A3F 32px,
      #F4EFE6 32px, #F4EFE6 38px);
    transition: background .3s;
  }
  .vt-scroll { padding: 16px 20px 46px; }

  /* Top bar — ← si venue d'une page produit, 40 r99. (Le partage a quitté
     l'en-tête le 2026-08-18, et le spacer qui le poussait à droite avec lui.) */
  .vt-topbar { display: flex; align-items: center; gap: 10px; height: 40px; }
  .vt-topbtn {
    width: 40px; height: 40px; border-radius: 99px;
    display: flex; align-items: center; justify-content: center;
    background: #FFFFFF; border: 1px solid #E5DCC9;
    box-shadow: 0 1px 2px rgba(28, 22, 15, 0.05);
    padding: 0; cursor: pointer; font: inherit; color: inherit;
  }
  .vt-topbtn:active { transform: scale(.92); }

  /* ═══ VITRINE-NORTH-STAR-1 — the HERO (founder mockup, 2026-07-28). ═══
     Identity panel in the theme's DEEP tone, cover photo full-height beside it.
     Forêt renders the mockup's green; every habillage renders its own DNA —
     tokens only, no hardcoded brand color (design-system law). The photo column
     replaces the 134px strip that beheaded portrait photographs. */
  /* Round 3 (founder walk): the hero bleeds to the TOP EDGE — negative margins
     cancel the scroll padding, and the top buttons float OVER the photo as in
     the mockup. Radius stays on the bottom corners only. */
  .vt-hero {
    position: relative; display: grid; grid-template-columns: 54% 46%;
    border-radius: 0 0 26px 26px; overflow: hidden;
    margin: -76px -20px 0; padding-top: 60px; /* status 54 + liseré 6 + pad 16 (verifier NB1) */
    min-height: 340px;
    background: var(--vt-deep);
    transition: background .3s;
  }
  .vt-hero .vt-topbar {
    position: absolute; top: 54px; left: 12px; right: 12px; z-index: 2; height: 40px;
  }
  .vt-hero-side { position: relative; }
  .vt-hero-side .vt-chip-nouvelle {
    position: absolute; right: 10px; bottom: 12px; z-index: 1; margin-top: 0;
  }
  .vt-hero-side .vt-hero-photo { position: absolute; inset: 0; }
  .vt-hero-id {
    position: relative; z-index: 1;
    padding: 30px 26px 22px 20px;
    color: var(--vt-on);
    display: flex; flex-direction: column; align-items: flex-start; gap: 0;
    background: var(--vt-deep);
    /* Round 4 — the mockup's big convex arc into the photo, not a small corner. */
    border-radius: 0 46% 46% 0 / 0 50% 50% 0;
  }
  /* Round 4 — the mockup's avatar: gold RING on the deep green, gold letter,
     and the vérifiée bubble riding the circle's edge. */
  .vt-avatar {
    position: relative;
    display: inline-flex; align-items: center; justify-content: center;
    width: 48px; height: 48px; border-radius: 99px;
    background: transparent; border: 2px solid #C89A3F;
    color: #C89A3F;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 19px; font-weight: 800;
  }
  .vt-avatar-badge {
    position: absolute; right: -3px; bottom: -3px;
    width: 16px; height: 16px; border-radius: 99px;
    background: var(--vt-accent); border: 2px solid var(--vt-deep);
    display: inline-flex; align-items: center; justify-content: center;
  }
  /* MEDIA-2 — her portrait fills the disc; the accent stays behind a slow load. */
  .vt-avatar-photo { overflow: hidden; padding: 0; }
  .vt-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: inherit; }
  .vt-namerow {
    display: flex; align-items: center; gap: 8px;
    margin-top: 12px;
    /* Round 4, founder order (« make the headers the same ») — the mockup sets the
       shop NAME in a serif. The ONE vitrine departure from the family typeface,
       system-stack so nothing is downloaded on a patchy connection. */
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 28px; font-weight: 700; letter-spacing: -0.2px; line-height: 1.08;
  }
  .vt-rosette {
    width: 20px; height: 20px; border-radius: 99px; flex: none;
    background: #1F7A4D;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .vt-namerow v { display: block; }
  .vt-tagline { margin-top: 5px; font-size: 13.5px; font-weight: 700; color: #C89A3F; }
  .vt-zone {
    margin-top: 8px; display: flex; align-items: center; gap: 5px;
    font-size: 12px; font-weight: 400; color: color-mix(in srgb, var(--vt-on) 78%, transparent);
  }
  .vt-bio {
    margin-top: 10px;
    font-size: 12.5px; font-weight: 400; line-height: 1.55;
    color: color-mix(in srgb, var(--vt-on) 88%, transparent);
  }
  .vt-rep { margin-top: 10px; font-size: 12px; font-weight: 600; color: color-mix(in srgb, var(--vt-on) 85%, transparent); }
  .vt-chip-nouvelle {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 12px; padding: 7px 12px; border-radius: 99px;
    background: #F6F0E4; color: #1C1710;
    font-size: 11.5px; font-weight: 700;
  }
  .vt-hero-photo {
    position: relative; overflow: hidden;
    background: var(--vt-soft); transition: background .3s;
    min-height: 100%;
  }
  .vt-cover-live { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; }
  .vt-cover-live .vt-glyph { font-size: 44px; }
  .vt-cover-photo { background: var(--vt-soft); }
  .vt-cover-img {
    position: absolute; inset: 0;
    width: 100%; height: 100%; object-fit: cover; display: block;
  }
  .vt-cover-stripes {
    position: absolute; inset: 0; width: 100%; height: 100%;
    background-image: repeating-linear-gradient(135deg,
      color-mix(in srgb, var(--vt-accent) 10%, transparent) 0px,
      color-mix(in srgb, var(--vt-accent) 10%, transparent) 14px,
      rgba(0,0,0,0) 14px, rgba(0,0,0,0) 34px);
  }
  .vt-cover-stripes-photo {
    background-image: repeating-linear-gradient(135deg,
      rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 12px,
      rgba(0,0,0,0) 12px, rgba(0,0,0,0) 30px);
  }
  .vt-filigrane {
    position: absolute; bottom: -30px; right: 2px;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 100px; font-weight: 800; line-height: 100px;
    color: var(--vt-accent); opacity: .16;
  }
  .vt-cover-caps {
    font-size: 9.5px; font-weight: 700; letter-spacing: 1.52px;
    color: rgba(255,246,236,.75);
  }

  /* The TRUST BAND — the two promises the platform genuinely makes, plus real
     reviews once they exist. The mockup's invented third cell is not built. */
  .vt-trustrow {
    display: flex; gap: 8px; margin-top: 12px;
  }
  .vt-cell {
    flex: 1; display: flex; align-items: center; justify-content: flex-start; gap: 8px;
    background: #FFFFFF; border: 1px solid #E5DCC9; border-radius: 16px;
    padding: 11px 10px; min-height: 56px;
    box-shadow: 0 1px 2px rgba(28, 22, 15, 0.04);
  }
  .vt-cell-icon {
    flex: none; display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; border-radius: 99px;
    background: #F6F0E4;
  }
  .vt-cell-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .vt-cell-label { font-size: 10.5px; font-weight: 700; line-height: 1.25; color: #1C1710; }
  .vt-cell-sub { font-size: 9.5px; font-weight: 400; line-height: 1.2; color: #6F6355; }
  .vt-avisrow {
    display: flex; align-items: center; justify-content: center; gap: 7px;
    margin-top: 8px; padding: 9px 12px;
    background: #FFFFFF; border: 1px solid #E5DCC9; border-radius: 99px;
  }
  /* NORTH-STAR-1 — the REAL heart. 44px: the touch law (§5) is a floor, and the
     verifier caught this at 34px under a comment claiming compliance. */
  .vt-artwrap { position: relative; }
  .vt-fav {
    position: absolute; top: 6px; right: 6px; z-index: 1;
    width: 44px; height: 44px; border-radius: 99px;
    display: inline-flex; align-items: center; justify-content: center;
    background: #FFFFFF; box-shadow: 0 1px 3px rgba(28,22,15,.14);
    color: #1C1710; cursor: pointer;
  }
  .vt-fav:active { transform: scale(.9); }
  .vt-fav svg { display: block; }
  .vt-fav-on { color: var(--vt-accent); }
  .vt-fav-on svg path { fill: currentColor; stroke: currentColor; }
  .vt-featured-artwrap .vt-fav { top: 10px; right: 10px; }

  /* NORTH-STAR round 3 — the mockup's section heading. */
  .vt-head { display: flex; align-items: center; gap: 8px; margin-top: 24px; }
  .vt-head-glyph { display: inline-flex; flex: none; }
  .vt-head-title {
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 17px; font-weight: 800; letter-spacing: -0.2px; color: #1C1710;
  }
  .vt-head-n { font-size: 12px; font-weight: 700; color: #8A7D6B; font-variant-numeric: tabular-nums; }
  .vt-head-spacer { flex: 1; }
  .vt-head-link {
    display: inline-flex; align-items: center; gap: 2px;
    min-height: 44px; padding: 0 4px;
    font-size: 12.5px; font-weight: 700; color: #6F6355; cursor: pointer;
  }

  /* C-VIT6 — titre de groupe + grille. */
  /* GRILLE-ETAGEE (founder order 2026-08-03 — the same treatment opportunités
     got: « the size, the space scale, the square »).

     TWO INDEPENDENT COLUMNS, NOT A CSS GRID. "grid-template-columns: 1fr 1fr"
     lays out in ROWS, so the two tiles on a line always shared a top and a
     bottom — the same lock-step the reseller's "numColumns={2}" produced. Flex
     columns with "align-items: flex-start" let each column fall where its own
     cards land, and the shorter column is never stretched to match.

     THE NEGATIVE MARGIN IS THE « SPACE SCALE » (measured, not guessed). The page
     scrolls inside ".vt-scroll { padding: 16px 20px 46px }", and 20px each side
     is right for TEXT — pulling that padding in globally would shove the whole
     page against the bezel. So only the GRID escapes it: -16px leaves 4px at the
     screen edge, and the gutter is 4px to match.
       before  390 − (20×2) − 12 = 338 ⇒ 169px card (43.3% of the screen)
       after   390 − ( 4×2) −  4 = 378 ⇒ 189px card (48.5%)
     Identical arithmetic to the reseller grid, and within half a point of the
     founder's reference (206/428 = 48.1%). */
  .vt-grid { display: flex; align-items: flex-start; gap: 4px; margin: 10px -16px 0; }
  .vt-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 4px; }

  /* C-VIT4 — la tuile produit v2. */
  .vt-tile {
    display: block; text-align: left; width: 100%;
    border: 1px solid #EDE4D3; border-radius: 18px; background: #FFFFFF;
    box-shadow: 0 1px 2px rgba(28, 22, 15, 0.04);
    padding: 0; overflow: hidden; cursor: pointer;
    font: inherit; color: inherit;
  }
  .vt-tile:active { transform: scale(.97); }
  /* CADRE — the fixed 132px height is GONE (founder order: « Drop the square
     rule », extended here). A height every card shares is a height that keeps
     the columns in lock-step, and it also crops every portrait photograph to a
     letterbox. The media now sets its own height from its real proportions.

     ON THE WEB THIS NEEDS NO MEASUREMENT AT ALL: the browser knows an image's
     intrinsic ratio and "height: auto" simply obeys it. (The reseller app had to
     measure via "onLoad" because React Native has no such thing — same rule,
     cheaper implementation here.)

     The flex centring moved to the SANS-PHOTO variant, which is the only branch
     that still needs to centre anything inside a box of its own height. */
  .vt-tile-art { position: relative; }
  /* C-VIT4 — la PHOTO réelle du produit (REAL-PRODUCT-RENDER-1) : la première
     référence d'image (le héros) remplit la tuile. object-fit cover garde le
     cadrage sur toutes les proportions ; le fond sable évite le flash blanc
     pendant le chargement sur réseau lent. */
  .vt-tile-art-photo { background-color: var(--vt-soft); display: block; }
  /* CADRE — the photograph decides the card's height, WITHIN BOUNDS.
     "height: auto" obeys the real ratio; the min/max keep one panorama or one
     full-length screenshot from producing a letterbox sliver or a card taller
     than the phone, which would wreck the whole column beneath it. "object-fit:
     cover" still governs, so only those clamped extremes are trimmed — where the
     old fixed height trimmed EVERY photo that was not 4:3.
     The px bounds approximate the same band the reseller clamps by ratio
     ([0.75, 1.33] w/h ⇒ roughly 142–252px tall at a 189px card). They are px
     and not exact ratios because clamping intrinsic media by ratio needs
     container queries, and this page has to render on old Android WebViews. */
  .vt-tile-photo {
    position: static; width: 100%; height: auto; min-height: 120px; max-height: 260px;
    object-fit: cover; display: block;
  }

  /* C-VIT4 — l'état SANS PHOTO (BUYER-REAL-HONESTY-1, décision fondateur).
     Un tissage ornemental, géométrique, DÉRIVÉ DU THÈME (--vt-soft / --vt-accent,
     le même vocabulaire tissé que la couverture) — donc chacun des
     habillages produit le sien, et il fonctionne pour un produit sans aucune
     donnée d'image. Jamais pris pour le produit : les quatre équerres et la
     mention « SANS PHOTO » (précédent C1) le désignent comme un ornement. */
  /* CADRE — the SANS-PHOTO tile KEEPS a height of its own, and must: there is no
     photograph here to derive one from, so without this the woven habillage
     collapses to nothing and the card becomes a bare caption. 132px is the
     height every tile used to have, so the honest no-photo state looks exactly
     as it did. Same principle as the reseller's « unmeasured ⇒ the old square ».
     This carries the flex centring that ".vt-tile-art" used to provide. */
  .vt-tile-art-sansphoto {
    background-color: var(--vt-soft); height: 132px;
    display: flex; align-items: center; justify-content: center;
    flex-direction: column; gap: 0;
    transition: background-color .3s;
  }
  .vt-weave {
    position: absolute; inset: 0; width: 100%; height: 100%;
    background-image:
      repeating-linear-gradient(135deg,
        color-mix(in srgb, var(--vt-accent) 14%, transparent) 0px,
        color-mix(in srgb, var(--vt-accent) 14%, transparent) 7px,
        rgba(0,0,0,0) 7px, rgba(0,0,0,0) 17px),
      repeating-linear-gradient(45deg,
        color-mix(in srgb, var(--vt-accent) 9%, transparent) 0px,
        color-mix(in srgb, var(--vt-accent) 9%, transparent) 7px,
        rgba(0,0,0,0) 7px, rgba(0,0,0,0) 17px);
  }
  .vt-tick { position: absolute; width: 11px; height: 11px; }
  .vt-tick-tl { top: 10px; left: 10px; border-top: 2px solid var(--vt-deep); border-left: 2px solid var(--vt-deep); opacity: .38; }
  .vt-tick-tr { top: 10px; right: 10px; border-top: 2px solid var(--vt-deep); border-right: 2px solid var(--vt-deep); opacity: .38; }
  .vt-tick-bl { bottom: 10px; left: 10px; border-bottom: 2px solid var(--vt-deep); border-left: 2px solid var(--vt-deep); opacity: .38; }
  .vt-tick-br { bottom: 10px; right: 10px; border-bottom: 2px solid var(--vt-deep); border-right: 2px solid var(--vt-deep); opacity: .38; }
  .vt-sansphoto-caps {
    position: relative;
    font-size: 9.5px; font-weight: 700; letter-spacing: .16em;
    color: var(--vt-deep); opacity: .62;
  }
  .vt-glyph { display: block; font-size: 44px; filter: drop-shadow(0 2px 4px rgba(28,22,15,.25)); }
  .vt-veil {
    position: absolute; inset: 0; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: rgba(244, 239, 230, 0.72);
  }
  .vt-tampon {
    display: block; background: #FFFFFF; border: 1px solid #1C1710; border-radius: 10px;
    padding: 5px 11px;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 10.5px; font-weight: 800; letter-spacing: 1.89px;
  }
  .vt-tile-body { padding: 10px 12px 12px; }
  .vt-tile-name { font-size: 13.5px; font-weight: 700; line-height: 1.25; min-height: 34px; }
  .vt-tile-price {
    margin-top: 4px; white-space: nowrap;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 14.5px; font-weight: 800; color: var(--vt-deep);
    font-variant-numeric: tabular-nums;
    transition: color .3s;
  }
  .vt-tile-epuise .vt-tile-price { color: #6F6355; }
  .vt-tile-pricerow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  /* the « go » circle — decoration of this labeled tile button (its ONE action is
     opening the product page); a cart icon would claim a cart that does not exist. */
  .vt-tile-go {
    width: 32px; height: 32px; border-radius: 99px; flex: none;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--vt-deep); transition: background .3s;
  }
  .vt-tile-livree { margin-top: 3px; font-size: 10.5px; font-weight: 600; color: #6F6355; }

  /* « Note vocale » — the tile voice chip (tap-to-play; the play triangle +
     duration). A role="button" <span> inside the tile <button>: its own tap
     target, themed to the accent. The delegated handler plays it; the tile's
     « produit » navigation never fires on a voice tap (closest() wins here). */
  /* VOIX-VISIBLE (founder 2026-08-04) — it was a small pill showing only a play
     glyph and « 0:05 », which reads as a timestamp, not as an invitation: a
     buyer had no way to know a real person had recorded something about this
     product. It carries the WORD now, full width under the price, on the theme
     accent so it is the warmest thing on the tile. Still a <span role=button>
     inside the tile <button> (never a nested <button>), still one delegated
     handler, still no autoplay. */
  .vt-tile-voix {
    display: flex; width: 100%; box-sizing: border-box; align-items: center; gap: 7px; margin-top: 8px;
    min-height: 36px; padding: 5px 12px 5px 7px; border-radius: 999px;
    background: var(--vt-soft); color: var(--vt-deep); cursor: pointer;
    font-family: 'Instrument Sans', system-ui, sans-serif;
    font-size: 11.5px; font-weight: 700; letter-spacing: .2px;
    font-variant-numeric: tabular-nums;
  }
  .vt-tile-voix:active { transform: scale(.97); }
  /* The glyph sits in a filled disc — the same house listen affordance the
     product page uses, so one visual idea means « there is a voice here » in
     both places. */
  .vt-tile-voix-icon {
    width: 14px; height: 14px; flex: none; box-sizing: content-box; padding: 6px;
    border-radius: 999px; background: var(--vt-accent); color: var(--vt-on);
  }
  .vt-tile-voix-mot { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vt-tile-voix-dur { flex: none; opacity: .75; }
  .vt-featured .vt-tile-voix { flex-basis: 100%; margin-top: 2px; }

  /* C-VIT5 — tuile à la une (pleine largeur). */
  .vt-featured {
    display: block; text-align: left; width: 100%;
    border-radius: 20px; background: #FFFFFF; border: 0; padding: 0; overflow: hidden;
    box-shadow: 0 1px 2px rgba(28,22,15,.04), 0 10px 30px -16px rgba(28,22,15,.14);
    cursor: pointer; font: inherit; color: inherit; margin-top: 12px;
    border: 1px solid #EDE4D3;
  }
  .vt-featured:active { transform: scale(.985); }
  /* NORTH-STAR-1 — the big featured card: tall photo, « À LA UNE » badge (her
     true curation, never « BEST SELLER »), price large, Commander CTA. */
  .vt-featured-artwrap { position: relative; }
  /* THE « À LA UNE » HERO KEEPS ITS DESIGNED 210px. It is ONE full-width card
     with nothing beside it, so it aligns with nothing and cannot lock a column —
     the stagger has no work for it to do, and letting a portrait photo make it
     420px tall would push the whole grid below the fold. Scoped exactly like the
     reseller, where the fiche héro and the vitrine card kept their square.

     …AND ITS MEDIA IS TOLD TO FILL THAT HEIGHT. This override is load-bearing:
     the grid rule above sets "height: auto" with px bounds, and inherited here
     it would leave the hero's photo floating at its own size inside a 210px box,
     with the sand background showing through. */
  .vt-featured .vt-tile-art { height: 210px; }
  .vt-featured .vt-tile-photo,
  .vt-featured .vt-video-hero { height: 100%; min-height: 0; max-height: none; }
  .vt-featured .vt-sansphoto-caps { font-size: 10.5px; }
  .vt-featured-badge {
    position: absolute; top: 12px; left: 12px;
    background: #F6F0E4; color: #1C1710;
    font-size: 10px; font-weight: 800; letter-spacing: 1.1px;
    padding: 6px 10px; border-radius: 99px;
    box-shadow: 0 1px 3px rgba(28,22,15,.14);
  }
  .vt-featured-body { padding: 14px 16px 16px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 10px; }
  .vt-featured-name { flex-basis: 100%; display: block; font-size: 17.5px; font-weight: 800; line-height: 1.25; font-family: 'Bricolage Grotesque', sans-serif; }
  .vt-featured-price {
    white-space: nowrap; display: block;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 19px; font-weight: 800; color: var(--vt-deep);
    font-variant-numeric: tabular-nums;
  }
  .vt-featured-livree { display: block; font-size: 11px; font-weight: 600; color: #6F6355; }
  .vt-featured-cta {
    flex-basis: 100%; margin-top: 6px;
    display: flex; align-items: center; justify-content: center;
    min-height: 48px; border-radius: 14px;
    background: var(--vt-deep); color: var(--vt-on);
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 14.5px; font-weight: 700;
    transition: background .3s;
  }

  /* VITRINE-PRESENTATION-1 — her présentation under a header that gives it no
     slot: a quiet warm card, her words only, no chrome competing with the hero. */
  /* VIDEO-PRODUIT V-1e — the featured card's video hero: fills the art frame
     exactly as the photograph does; the poster shows until the observer plays. */
  /* CADRE — a CLIP sizes itself exactly as a photograph does, and under the same
     bounds: a product's video is the same product, so it may not follow a
     different height law from its photo or the grid would jump as clips load.
     "height: 100%" here would resolve against an auto-height parent and collapse
     the tile — the bug this line is written to prevent. */
  .vt-video-hero {
    width: 100%; height: auto; min-height: 120px; max-height: 260px;
    object-fit: cover; display: block;
  }

  .vt-presentation {
    margin-top: 14px; border-radius: 18px;
    background: #FFFDF8; border: 1px solid #EAE1CF;
    color: #3A3126;
    font-size: 13px; font-weight: 400; line-height: 1.6;
    padding: 13px 16px;
  }

  /* C-VIT7 — bande encre + footer. */
  .vt-band {
    margin-top: 18px; border-radius: 18px;
    background: #1C1710; color: #F6F0E4;
    font-size: 12.5px; font-weight: 400; line-height: 1.55;
    padding: 14px 16px;
  }
  .vt-band b { font-weight: 700; }
  .vt-foot1 { margin-top: 12px; text-align: center; font-size: 11.5px; color: #6F6355; }
  .vt-foot2 { margin-top: 5px; text-align: center; font-size: 11.5px; color: #6F6355; }
  .vt-foot2 b { font-weight: 700; font-variant-numeric: tabular-nums; }

  /* C-VIT8 — squelette. */
  .vt-shim {
    background-image: linear-gradient(100deg, #ECE4D4 30%, #F6F1E7 45%, #ECE4D4 60%);
    background-size: 320px 100%;
  }
  .vt-sk-cover { height: 340px; border-radius: 0 0 26px 26px; margin: -76px -20px 0; }
  .vt-sk-identity { margin-top: 12px; text-align: left; }
  .vt-sk-avatar {
    display: inline-block; width: 44px; height: 44px; border-radius: 99px;
    background: #ECE4D4; border: 2px solid #F4EFE6;
  }
  .vt-sk-name { width: 170px; height: 20px; border-radius: 8px; margin: 10px 0 0; }
  .vt-sk-zone { width: 120px; height: 12px; border-radius: 6px; margin: 8px 0 0; background: #ECE4D4; }
  .vt-sk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px; }
  .vt-sk-tile {
    border: 1px solid #EDE4D3; border-radius: 18px; background: #FFFFFF;
    box-shadow: 0 1px 2px rgba(28, 22, 15, 0.04); overflow: hidden;
  }
  .vt-sk-art { height: 132px; display: flex; }
  .vt-sk-body { padding: 10px 12px 12px; }
  .vt-sk-line1 { width: 148px; height: 12px; border-radius: 6px; background: #ECE4D4; }
  .vt-sk-line2 { width: 95px; height: 14px; border-radius: 6px; background: #ECE4D4; margin-top: 8px; }
  .vt-sk-note { margin-top: 16px; text-align: center; font-size: 11.5px; color: #8A7D6B; }
  @media (prefers-reduced-motion: no-preference) {
    .vt-shim { animation: vtShim 1.15s linear infinite; }
    @keyframes vtShim { from { background-position: -320px 0; } to { background-position: 320px 0; } }
    .vt-screen { animation: vtIn .32s cubic-bezier(.2,.8,.2,1); }
    @keyframes vtIn { from { opacity: 0; transform: translateY(10px); } }
  }

  /* C-VIT9 — états pleine page. */
  .vt-state {
    padding: 84px 10px 0;
    display: flex; flex-direction: column; align-items: center; text-align: center;
  }
  .vt-picto {
    width: 64px; height: 64px; border-radius: 20px; border: 2px solid #1C1710;
    display: flex; align-items: center; justify-content: center;
  }
  .vt-state h3 {
    display: block; gap: normal; /* the shell styles h3 as flex+gap globally */
    margin-top: 18px;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 24px; font-weight: 800; letter-spacing: -0.48px; line-height: 27.6px;
  }
  .vt-state p {
    margin-top: 8px; max-width: 300px;
    font-size: 13.5px; font-weight: 400; line-height: 21.6px; color: #4A3F33;
  }
  .vt-ghostbtn {
    margin-top: 18px; height: 48px; padding: 0 26px;
    display: flex; align-items: center; justify-content: center;
    background: #FFFFFF; border: 1px solid #E5DCC9; border-radius: 14px;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 14.5px; font-weight: 700; color: #1C1710;
    cursor: pointer;
  }

  /* V6 — la carte vide (dashed). */
  .vt-empty {
    margin-top: 24px; border-radius: 20px;
    background: #FCF9F2; border: 1px dashed #DDD2BC;
    padding: 30px 22px;
    display: flex; flex-direction: column; align-items: center; text-align: center;
  }
  .vt-empty-titre {
    margin-top: 12px;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 18px; font-weight: 800;
  }
  .vt-empty-corps { margin-top: 6px; max-width: 270px; font-size: 13px; line-height: 20.8px; color: #6F6355; }

  /* C-TOAST — toast encre (Boutik+ §2). */
  .vt-toast {
    position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%);
    background: #1C1710; color: #F6F0E4;
    font-size: 12.5px; font-weight: 400;
    padding: 11px 16px; border-radius: 12px;
    display: flex; align-items: center; gap: 8px;
    white-space: nowrap; z-index: 10;
  }
  .vt-toast svg { color: #8FD4B4; }
  @media (prefers-reduced-motion: no-preference) {
    .vt-toast { animation: vtToast 2.8s forwards; }
    @keyframes vtToast {
      0% { opacity: 0; transform: translate(-50%, 14px); }
      8%, 88% { opacity: 1; transform: translate(-50%, 0); }
      100% { opacity: 0; transform: translate(-50%, -6px); }
    }
  }
`;
