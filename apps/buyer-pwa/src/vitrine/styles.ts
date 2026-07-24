/**
 * VITRINE — the redesigned buyer-surface stylesheet (Phase-1).
 *
 * Every value is the Phase-0 computed-style table's byte (colors, fonts,
 * paddings, radii, shadows, gradients) — the table, not the prose, is the
 * build target; the Phase-4 property diff re-verifies each rule against it.
 * Theme-parametric colors read the `--vt-*` custom properties `applyTheme`
 * sets, so a theme change re-tints in one repaint (§8.5, no reflow).
 *
 * Properties the Phase-0 extractor does not capture (opacity, absolute
 * offsets, alignment, overflow) are authored from HANDOFF §2 and land under
 * the final masked visual diff — documented in the Phase-4 audit.
 */

export const VITRINE_STYLES = `
  .vt-root {
    background: #F4EFE6; color: #1C1710;
    font-family: 'Instrument Sans', system-ui, sans-serif;
    font-size: 16px; font-weight: 400; line-height: normal;
    min-height: 100vh;
  }
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

  /* Top bar — (← si venue d'une page produit) + espace + partager 40 r99. */
  .vt-topbar { display: flex; align-items: center; gap: 10px; height: 40px; }
  .vt-spacer { flex: 1; height: 0; }
  .vt-topbtn {
    width: 40px; height: 40px; border-radius: 99px;
    display: flex; align-items: center; justify-content: center;
    background: #FFFFFF; border: 1px solid #E5DCC9;
    box-shadow: 0 1px 2px rgba(28, 22, 15, 0.05);
    padding: 0; cursor: pointer; font: inherit; color: inherit;
  }
  .vt-topbtn:active { transform: scale(.92); }

  /* C-VIT1 — la couverture. */
  .vt-cover {
    position: relative; overflow: hidden; border-radius: 22px;
    height: 116px; background: var(--vt-soft); margin-top: 12px;
    transition: background .3s;
  }
  .vt-cover-live {
    height: 134px; background-color: transparent;
    background-image: linear-gradient(120deg, #8A5A3A, #5A3A22);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
  }
  .vt-cover-live .vt-glyph { font-size: 44px; }
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
    position: absolute; bottom: -34px; right: 2px;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 110px; font-weight: 800; line-height: 110px;
    color: var(--vt-accent); opacity: .16;
  }
  .vt-cover-caps {
    font-size: 9.5px; font-weight: 700; letter-spacing: 1.52px;
    color: rgba(255,246,236,.75);
  }

  /* C-VIT2 — le bloc identité (chevauche la couverture). */
  .vt-identity { margin-top: -30px; text-align: center; }
  .vt-avatar {
    display: inline-flex; align-items: center; justify-content: center;
    width: 64px; height: 64px; border-radius: 99px;
    background: var(--vt-accent); border: 3px solid #F4EFE6;
    color: var(--vt-on);
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 24px; font-weight: 800;
    transition: background .3s;
  }
  .vt-namerow {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    margin-top: 8px;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 24px; font-weight: 800; letter-spacing: -0.48px;
  }
  .vt-namerow v { display: block; }
  .vt-tagline { margin-top: 4px; font-size: 13.5px; font-weight: 600; color: #4A3F33; }
  .vt-zone { margin-top: 4px; font-size: 12.5px; font-weight: 400; color: #6F6355; }
  .vt-chips {
    display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;
    margin-top: 11px;
  }
  .vt-chip {
    display: flex; align-items: center; white-space: nowrap;
    padding: 7px 12px; border-radius: 99px;
    font-size: 11.5px; font-weight: 700;
  }
  .vt-chip-full { gap: 6px; background: var(--vt-soft); color: var(--vt-deep); transition: background .3s, color .3s; }
  .vt-chip-line { gap: 5px; background: #FFFFFF; color: #1C1710; border: 1px solid #E5DCC9; }
  .vt-rep { margin-top: 9px; font-size: 12px; font-weight: 600; color: #6F6355; }
  .vt-bio {
    margin: 12px 20px 0;
    font-size: 13px; font-weight: 400; line-height: 1.6; color: #4A3F33;
  }

  /* C-VIT6 — titre de groupe + grille. */
  .vt-group { display: flex; align-items: baseline; gap: 8px; margin-top: 22px; }
  .vt-group-first { margin-top: 22px; }
  .vt-group b { font-size: 11px; font-weight: 700; letter-spacing: 1.1px; color: #6F6355; display: block; }
  .vt-group i { font-size: 11px; font-weight: 700; color: #8A7D6B; display: block; font-variant-numeric: tabular-nums; }
  .vt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }

  /* C-VIT4 — la tuile produit v2. */
  .vt-tile {
    display: block; text-align: left; width: 100%;
    border: 1px solid #EDE4D3; border-radius: 18px; background: #FFFFFF;
    box-shadow: 0 1px 2px rgba(28, 22, 15, 0.04);
    padding: 0; overflow: hidden; cursor: pointer;
    font: inherit; color: inherit;
  }
  .vt-tile:active { transform: scale(.97); }
  .vt-tile-art {
    position: relative; height: 132px;
    display: flex; align-items: center; justify-content: center;
  }
  /* C-VIT4 — l'état SANS PHOTO (BUYER-REAL-HONESTY-1, décision fondateur).
     Un tissage ornemental, géométrique, DÉRIVÉ DU THÈME (--vt-soft / --vt-accent,
     le même vocabulaire tissé que la couverture) — donc chacun des quatre
     habillages produit le sien, et il fonctionne pour un produit sans aucune
     donnée d'image. Jamais pris pour le produit : les quatre équerres et la
     mention « SANS PHOTO » (précédent C1) le désignent comme un ornement. */
  .vt-tile-art-sansphoto {
    background-color: var(--vt-soft);
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

  /* « La voix » — the tile voice chip (tap-to-play; the play triangle +
     duration). A role="button" <span> inside the tile <button>: its own tap
     target, themed to the accent. The delegated handler plays it; the tile's
     « produit » navigation never fires on a voice tap (closest() wins here). */
  .vt-tile-voix {
    display: inline-flex; align-items: center; gap: 5px; margin-top: 8px;
    min-height: 30px; padding: 3px 10px 3px 6px; border-radius: 999px;
    background: var(--vt-soft); color: var(--vt-deep); cursor: pointer;
    font-family: 'Instrument Sans', system-ui, sans-serif;
    font-size: 11.5px; font-weight: 700; letter-spacing: .2px;
    font-variant-numeric: tabular-nums;
  }
  .vt-tile-voix:active { transform: scale(.97); }
  .vt-tile-voix-icon { width: 15px; height: 15px; flex: none; }
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
  .vt-featured .vt-tile-art { height: 140px; }
  .vt-featured .vt-sansphoto-caps { font-size: 10.5px; }
  .vt-featured-body { padding: 12px 15px 14px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; }
  .vt-featured-name { flex: 1; display: block; font-size: 15px; font-weight: 700; line-height: 1.3; }
  .vt-featured-price {
    white-space: nowrap; display: block;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-size: 16px; font-weight: 800; color: var(--vt-deep);
    font-variant-numeric: tabular-nums;
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
  .vt-sk-cover { height: 116px; border-radius: 22px; margin-top: 12px; }
  .vt-sk-identity { margin-top: -30px; text-align: center; }
  .vt-sk-avatar {
    display: inline-block; width: 64px; height: 64px; border-radius: 99px;
    background: #ECE4D4; border: 3px solid #F4EFE6;
  }
  .vt-sk-name { width: 170px; height: 20px; border-radius: 8px; margin: 10px 95px 0; }
  .vt-sk-zone { width: 120px; height: 12px; border-radius: 6px; margin: 8px 120px 0; background: #ECE4D4; }
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
