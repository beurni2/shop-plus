/**
 * PWA CLIENTE — the stylesheet (HANDOFF Indigo §1 tokens · §2 components ·
 * §4 anatomies · §5 motion), pixel-for-pixel to "docs/PWA Cliente -
 * Redesign.dc.html". Every hex/px/radius/shadow is the pixel source's exact
 * byte. θ-parametric properties (§1.2 « qui consomme θ » — 47 accent sites)
 * read the "--vt-*" custom properties "applyTheme" sets on the container, so
 * the four habillages drive the whole flow the way the vitrine does — one
 * property flip, repaint, no reflow. Indigo is the themeless fallback (flow.ts).
 *
 * The « Jamais θ » set (§1.2) is authored in literal values so a theme change
 * can never touch it: the recording dot #E4572E, the épuisé band #9A8465→
 * #6F5E45 (fg follows θ.on by construction — §8.3), sable, gold #C89A3F, the
 * semantic statuses, the ink voice bar, the door checks #0B5B47, the ink
 * offline banner — and EVERYTHING danger: the problème/signalement surfaces
 * keep #F8E1DE / #7E1A15 / #8C1D18 / #C4574B / #D9A49C under every habillage
 * (gate-locked by the e2e; never ghost, never themed).
 *
 * θ.on at alpha uses "color-mix" (the vitrine/achat precedent — "--vt-on" is a
 * hex); θ shadows use "rgba(var(--vt-sh), a)" ("--vt-sh" is the rgb triplet).
 */

export const CLIENTE_STYLES = `
  .cl-root {
    --cld: 'Bricolage Grotesque', sans-serif;
    --clt: 'Instrument Sans', system-ui, sans-serif;
    position: relative;
    background: #F4EFE6; color: #1C1710;
    font-family: var(--clt); min-height: 100vh;
    display: flex; flex-direction: column;
    -webkit-font-smoothing: antialiased;
    /* SCREEN-FIT (founder, 2026-07-22): the flow OWNS the viewport — full
       width on every phone; on wider screens a phone-shaped column centered
       on the pixel's desk background (the out-of-frame #EDE6D8). */
    width: 100%; max-width: 430px; margin: 0 auto;
    /* SCALE-UP ×1.15 (founder, 2026-07-22 — « still small »): a UNIFORM zoom
       of the whole flow — type, spacing, icons, photo, touch targets scale
       together, layout reflows (unlike transform), text stays crisp. The
       pixel handoff's px values remain the anatomy; this is the founder's
       global magnification on top. */
    zoom: 1.15;
  }
  /* Kill the legacy Grand Teint main{padding:16px} box around the flow — it
     shrank every screen ~32px below design (founder: « everything is looking
     small »). And the legacy « main > div » display:grid rule turned the
     stage into a grid whose auto track floors at content min-content — THE
     360px-overflow root cause: the track grew to 386px and every screen
     stretched with it. The flow's own §1.4 paddings are the only chrome. */
  main.cl-root { padding: 0; }
  main.cl-root > div { display: block; }
  /* The desk behind the column on wide screens (pixel out-of-frame bg). */
  body:has(.cl-root) { background: #EDE6D8; }
  .cl-root * { box-sizing: border-box; margin: 0; }
  /* color:inherit — iOS Safari paints unstyled <button> text in its own
     BLUE; the C4/C5 card titles and amounts must be the design INK
     (founder screenshot, 2026-07-22). :where() keeps specificity at 0,0,1
     so every explicitly-colored button (danger .cl-c7-report, .cl-door-bad)
     still wins with its single class. */
  .cl-root button { font: inherit; cursor: pointer; }
  :where(.cl-root) button { color: inherit; }
  .cl-root a { color: var(--vt-accent); text-decoration: none; }
  .cl-root a:hover { color: var(--vt-deep); text-decoration: underline; }

  /* Chrome — liseré tissé 6 partout (§1.4). The pixel's « zone 54 » models
     the PHONE STATUS BAR, which the frame provided in the prototype and the
     OS provides on a real device — so here it is the safe-area inset (0 in a
     browser tab, the real notch inset installed/standalone). 54px of dead
     paper at the top was screen the buyer paid for (founder, 2026-07-22). */
  .cl-status { height: env(safe-area-inset-top, 0px); flex: none; }
  .cl-lisere {
    height: 6px; flex: none;
    background: repeating-linear-gradient(90deg,
      var(--vt-accent) 0 18px, #F4EFE6 18px 24px, #C89A3F 24px 32px, #F4EFE6 32px 38px);
    transition: background .3s;
  }
  /* Bandeau hors-ligne global — bande encre, sous le liseré (Jamais θ). */
  .cl-offline {
    flex: none; display: flex; align-items: center; justify-content: center; gap: 8px;
    background: #1C1710; color: #F6F0E4; padding: 9px 16px;
    font-size: 12px; font-weight: 600;
  }
  /* min-width:0 — a column-flex item's stretched width is floored at its
     content min-content (Blink); without this the STAGE itself grew past the
     viewport on 360px phones and every screen stretched with it. */
  .cl-stage { flex: 1; position: relative; min-width: 0; }
  .cl-screen { padding: 16px 20px 46px; }
  @media (prefers-reduced-motion: no-preference) {
    .cl-screen { animation: clIn .32s cubic-bezier(.2,.8,.2,1); }
  }

  /* ══ SKELETON (état loading — mêmes dimensions que le contenu) ══ */
  .cl-skel { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
  .cl-skel > div {
    border-radius: 12px;
    background: linear-gradient(90deg, #ECE4D4 25%, #F6F1E7 50%, #ECE4D4 75%);
    background-size: 640px 100%;
  }
  @media (prefers-reduced-motion: no-preference) { .cl-skel > div { animation: clShimmer 1.2s linear infinite; } }
  .cl-skel-title { height: 18px; width: 170px; border-radius: 9px; }
  .cl-skel-photo { height: 240px; border-radius: 22px; }
  .cl-skel-name { height: 34px; width: 230px; }
  .cl-skel-band { height: 92px; border-radius: 22px; }
  .cl-skel-cta { height: 54px; border-radius: 16px; }

  /* ══ C1 — en-tête boutique ══ */
  .cl-head { display: flex; align-items: center; gap: 12px; }
  .cl-avatar {
    width: 40px; height: 40px; border-radius: 14px; flex: none;
    background: var(--vt-accent); color: var(--vt-on);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--cld); font-weight: 800; font-size: 15px;
    transition: background .3s;
  }
  .cl-idcol { flex: 1; min-width: 0; }
  .cl-shopname { font-family: var(--cld); font-weight: 800; font-size: 17px; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cl-verirow { font-size: 12px; color: #6F6355; display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden; min-width: 0; }
  .cl-verirow > * { min-width: 0; flex-shrink: 1; }
  .cl-veri-txt { overflow: hidden; text-overflow: ellipsis; }
  .cl-voir { flex: none; }
  .cl-veri-check { color: var(--vt-accent); display: inline-flex; flex: none; }
  .cl-dotsep { color: #D8CDBA; }
  .cl-voir { color: var(--vt-accent); font-weight: 700; cursor: pointer; border: none; background: transparent; padding: 0; font-size: 12px; }
  .cl-shield {
    width: 40px; height: 40px; border-radius: 99px; flex: none;
    border: 1px solid #E5DCC9; background: #FFFFFF;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 1px 2px rgba(28,22,15,.05); color: var(--vt-accent);
    transition: transform .15s;
  }
  .cl-shield:active { transform: scale(.92); }
  .cl-round-btn {
    width: 40px; height: 40px; border-radius: 99px; flex: none;
    border: 1px solid #E5DCC9; background: #FFFFFF; color: #1C1710;
    display: flex; align-items: center; justify-content: center;
    transition: transform .15s;
  }
  .cl-round-btn:active { transform: scale(.92); }

  /* ══ C1 — photo sable + ticks encre ══ */
  /* REAL-PRODUCT-RENDER-1 — la PHOTO réelle remplit le cadre ; sans photo, le
     même tissage ornemental que les tuiles, dérivé de l'habillage. */
  /* CADRE-C1 (founder order 2026-08-03: « the square frame there on that screen
     is cropping part of images, drop the square rule on that screen as well »).

     The media is now IN FLOW and sets the frame's height from its own real
     proportions — "position: absolute; inset: 0" inside a fixed 238px box is
     exactly what beheaded his portrait photographs. Bounded so one panorama
     cannot make a sliver and one full-length shot cannot fill the screen; inside
     those bounds nothing is trimmed at all, which is the point of the order.

     "z-index: 1" IS LOAD-BEARING. ".cl-photo-caps" is an in-flow flex child that
     the absolutely-positioned media used to paint over — that is why « PHOTO
     RÉELLE DU PRODUIT » is not visible on a card that has a photo. Now that the
     media is in flow, the caption is pushed OUT of flow (below) and the media
     is lifted above it, so the frame looks exactly as it did. Without this the
     caption would suddenly appear across his product photo. */
  .cl-photo-img {
    position: relative; z-index: 1;
    width: 100%; height: auto; min-height: 200px; max-height: 70vh;
    object-fit: cover; display: block;
  }
  /* …and the caption goes under the media rather than beneath it in flow. */
  .cl-photo[data-role="photo-reelle"] .cl-photo-caps { position: absolute; z-index: 0; }
  /* The overlays must clear the lifted media: ticks, count and the épuisé veil
     all sat above it purely by DOM order before, which "z-index: 1" broke. */
  .cl-photo .cl-tick, .cl-photo-count, .cl-photo-veil { z-index: 2; }
  .cl-photo-sansphoto { background: var(--vt-soft, #F1E7D3); }
  .cl-weave {
    position: absolute; inset: 0; width: 100%; height: 100%;
    background-image:
      repeating-linear-gradient(135deg,
        color-mix(in srgb, var(--vt-accent, #C2571B) 14%, transparent) 0px,
        color-mix(in srgb, var(--vt-accent, #C2571B) 14%, transparent) 9px,
        rgba(0,0,0,0) 9px, rgba(0,0,0,0) 22px),
      repeating-linear-gradient(45deg,
        color-mix(in srgb, var(--vt-accent, #C2571B) 9%, transparent) 0px,
        color-mix(in srgb, var(--vt-accent, #C2571B) 9%, transparent) 9px,
        rgba(0,0,0,0) 9px, rgba(0,0,0,0) 22px);
  }
  .cl-photo-sansphoto .cl-photo-caps { position: relative; }
  /* CADRE-C1 — "height: 238px" REMOVED. It cropped every photograph that was
     not that shape, which is precisely the founder's report. The frame now
     takes the media's height; "min-height" keeps the SANS-PHOTO state (which
     has no media to measure) at exactly the box it always had. */
  .cl-photo {
    margin-top: 14px; position: relative; min-height: 238px; border-radius: 22px; overflow: hidden;
    background: #F1E7D3; border: 1px solid #EDE4D3;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px;
    box-shadow: 0 16px 36px -18px rgba(28,22,15,.3);
  }
  .cl-tick { position: absolute; width: 14px; height: 14px; }
  .cl-tick-tl { top: 14px; left: 14px; border-top: 2px solid rgba(28,22,15,.4); border-left: 2px solid rgba(28,22,15,.4); }
  .cl-tick-tr { top: 14px; right: 14px; border-top: 2px solid rgba(28,22,15,.4); border-right: 2px solid rgba(28,22,15,.4); }
  .cl-tick-bl { bottom: 14px; left: 14px; border-bottom: 2px solid rgba(28,22,15,.4); border-left: 2px solid rgba(28,22,15,.4); }
  .cl-tick-br { bottom: 14px; right: 14px; border-bottom: 2px solid rgba(28,22,15,.4); border-right: 2px solid rgba(28,22,15,.4); }
  .cl-photo-glyph { color: #1C1710; display: flex; filter: drop-shadow(0 6px 12px rgba(0,0,0,.18)); }
  .cl-photo-glyph svg { width: 64px; height: 64px; }
  .cl-photo-caps { font-size: 10.5px; font-weight: 700; letter-spacing: .16em; color: #8D7C64; }
  .cl-photo-veil { position: absolute; inset: 0; background: rgba(244,239,230,.78); display: flex; align-items: center; justify-content: center; }
  .cl-epuise-stamp { border: 2px solid #1C1710; background: #FFFFFF; border-radius: 12px; padding: 9px 18px; font-family: var(--cld); font-weight: 800; font-size: 14px; letter-spacing: .2em; }
  .cl-caption-row { margin-top: 9px; display: flex; justify-content: space-between; gap: 10px; font-size: 12px; color: #6F6355; }
  .cl-vendu { font-weight: 700; color: #1C1710; white-space: nowrap; }
  .cl-prodtitle { margin-top: 14px; font-family: var(--cld); font-weight: 800; font-size: 26px; line-height: 1.1; letter-spacing: -.02em; }
  .cl-chiprow { margin-top: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .cl-variant { font-size: 11px; font-weight: 700; padding: 5px 11px; border-radius: 99px; white-space: nowrap; border: 1.5px solid #1C1710; }
  .cl-prod-zone { font-size: 12.5px; color: #6F6355; white-space: nowrap; }

  /* ══ C-VOIX — lecteur note vocale (§2) ══ */
  .cl-voix { margin-top: 14px; display: flex; align-items: center; gap: 12px; background: #FFFFFF; border: 1px solid #EDE4D3; border-radius: 18px; padding: 11px 14px; box-shadow: 0 1px 2px rgba(28,22,15,.04); }
  .cl-voix-play {
    width: 44px; height: 44px; border-radius: 99px; border: none; flex: none;
    background: var(--vt-accent); color: var(--vt-on);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 10px 22px -10px rgba(var(--vt-sh),.55);
    transition: transform .15s, background .3s;
  }
  .cl-voix-play:active { transform: scale(.92); }
  .cl-voix-col { flex: 1; min-width: 0; }
  .cl-voix-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .cl-voix-title { font-size: 13px; font-weight: 700; }
  .cl-voix-dur { font-size: 10.5px; font-weight: 700; font-feature-settings: 'tnum'; color: #6F6355; background: #EFE8DA; border-radius: 99px; padding: 3px 8px; white-space: nowrap; }
  .cl-wave { display: flex; align-items: flex-end; gap: 2px; height: 22px; margin-top: 7px; }
  .cl-wavebar { width: 3px; border-radius: 99px; background: var(--vt-accent); transition: background .3s; }

  /* ══ C-PB — bande prix signature (§2) ══ */
  .cl-pb {
    margin-top: 14px; border-radius: 22px; overflow: hidden; position: relative;
    background: linear-gradient(140deg, var(--vt-accent), var(--vt-deep)); color: var(--vt-on);
    box-shadow: 0 16px 36px -14px rgba(var(--vt-sh),.5);
    transition: background .3s;
  }
  .cl-pb-fil { height: 3px; background: repeating-linear-gradient(90deg, #C89A3F 0 10px, color-mix(in srgb, var(--vt-on) 32%, transparent) 10px 14px); }
  .cl-pb-tex { position: absolute; inset: 0; background: repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 12px, transparent 12px 30px); pointer-events: none; }
  .cl-pb-inner { padding: 15px 18px 14px; position: relative; }
  .cl-pb-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .cl-pb-overline { font-size: 10.5px; font-weight: 700; letter-spacing: .14em; opacity: .85; }
  .cl-pb-pill { display: inline-flex; align-items: center; gap: 5px; border: 1px solid color-mix(in srgb, var(--vt-on) 40%, transparent); border-radius: 99px; padding: 4px 9px; font-size: 9.5px; font-weight: 700; letter-spacing: .12em; white-space: nowrap; }
  .cl-pb-amount { display: flex; align-items: baseline; margin-top: 6px; }
  .cl-pb-hero { font-family: var(--cld); font-weight: 800; font-size: 40px; line-height: 1; letter-spacing: -.02em; font-feature-settings: 'tnum'; white-space: nowrap; }
  .cl-pb-suffix { font-family: var(--cld); font-weight: 700; font-size: 16px; }
  .cl-pb-foot { margin-top: 11px; padding-top: 10px; border-top: 1px solid color-mix(in srgb, var(--vt-on) 22%, transparent); font-size: 11px; line-height: 1.5; opacity: .85; }
  /* Épuisée — fond neutre (Jamais θ) ; fg suit θ.on par construction (§8.3). */
  .cl-pb-epuise { background: linear-gradient(140deg, #9A8465, #6F5E45); box-shadow: 0 16px 36px -14px rgba(28,22,15,.35); }
  .cl-pb-epuise .cl-pb-fil { background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--vt-on) 40%, transparent) 0 10px, color-mix(in srgb, var(--vt-on) 15%, transparent) 10px 14px); }
  .cl-pb-epuise .cl-pb-amount { opacity: .85; }
  .cl-pb-epuise .cl-pb-hero { text-decoration: line-through; text-decoration-thickness: 3px; text-decoration-color: color-mix(in srgb, var(--vt-on) 55%, transparent); }

  /* ══ C1 — carte confiance ══ */
  .cl-trust { margin-top: 12px; border-radius: 20px; border: 1px solid #EDE4D3; background: #FFFFFF; box-shadow: 0 1px 2px rgba(28,22,15,.04); overflow: hidden; }
  .cl-trust-row { display: flex; align-items: center; gap: 11px; min-height: 46px; padding: 0 16px; border-bottom: 1px solid #F3EDDE; }
  .cl-trust-row:last-child { border-bottom: none; }
  .cl-trust-ic { color: #1C1710; display: inline-flex; flex: none; }
  .cl-trust-txt { flex: 1; font-size: 13.5px; font-weight: 600; }
  .cl-trust-link { display: flex; align-items: center; gap: 11px; min-height: 46px; padding: 0 16px; width: 100%; border: none; background: transparent; text-align: left; }
  .cl-trust-link:active { background: #FBF6EB; }
  .cl-trust-link .cl-trust-ic, .cl-trust-link .cl-trust-chev { color: var(--vt-accent); display: inline-flex; flex: none; }
  .cl-trust-link-txt { flex: 1; font-size: 13.5px; font-weight: 700; color: var(--vt-accent); }
  .cl-epuise-card { margin-top: 12px; padding: 13px 15px; border-radius: 16px; background: #F1E7D3; color: #4A3F33; font-size: 12.5px; line-height: 1.55; }

  /* ══ CTA ══ */
  /* THE display: block BELOW IS LOAD-BEARING, not tidying (round 5, verifier).
     A button's UA display is inline-block, and the C5 orphan sweep enumerates
     text blocks by COMPUTED DISPLAY — so the CTA, the one element on the money
     screen that both carries an amount and IS the screen's single primary
     action, could not enter the swept set at all. At a large basket its label
     wraps, and it was measured BELOW the bar every other sentence on that screen
     is held to, with no gate able to see it. That is the third accidental
     narrowing of this sweep: by selector (round 2), by state (round 4), by
     computed display (here). The button lays out identically — full width, its
     own line, contents still centred — and the e2e now asserts it was swept. */
  .cl-cta {
    display: block;
    margin-top: 14px; width: 100%; height: 56px; border-radius: 16px; border: none;
    background: var(--vt-accent); color: var(--vt-on);
    font-family: var(--cld); font-weight: 700; font-size: 16px;
    font-feature-settings: 'tnum';
    box-shadow: 0 12px 26px -10px rgba(var(--vt-sh),.5);
    transition: transform .15s, background .2s;
  }
  .cl-cta:active { transform: scale(.98); }
  .cl-cta-c1 { font-size: 16.5px; }
  .cl-cta-off { background: #DDD5C3; color: #8A7D6B; box-shadow: none; cursor: default; }
  .cl-footnote { margin-top: 10px; text-align: center; font-size: 11.5px; color: #6F6355; }

  /* ══ C-STEP — en-tête d'étape ══ */
  .cl-stephead { display: flex; align-items: center; gap: 10px; }
  .cl-steptitle { flex: 1; font-family: var(--cld); font-weight: 800; font-size: 20px; letter-spacing: -.02em; }
  .cl-intro { margin-top: 10px; font-size: 13.5px; line-height: 1.55; color: #4A3F33; }
  .cl-overline { margin-top: 18px; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #6F6355; }

  /* ══ C3 — zones · repère · voix ══ */
  .cl-chips { margin-top: 9px; display: flex; flex-wrap: wrap; gap: 8px; }
  .cl-chip {
    display: inline-flex; align-items: center; height: 40px; padding: 0 15px; border-radius: 99px; white-space: nowrap;
    border: 1.5px solid #E5DCC9; background: #FFFFFF; color: #1C1710;
    font-size: 13.5px; font-weight: 600;
    transition: transform .15s, background .2s;
  }
  .cl-chip:active { transform: scale(.95); }
  .cl-chip-on { border-color: var(--vt-accent); background: var(--vt-soft); color: var(--vt-deep); }
  .cl-field {
    margin-top: 8px; width: 100%; font: inherit; font-size: 15.5px; padding: 15px;
    border-radius: 14px; border: 1.5px solid #E5DCC9; background: #FFFFFF; color: #1C1710; outline: none;
  }
  .cl-field-indic { margin-top: 9px; font-size: 14.5px; padding: 14px 15px; }
  .cl-field:focus { border-color: var(--vt-accent); box-shadow: 0 0 0 3px rgba(var(--vt-sh),.12); }
  .cl-voice-idle {
    margin-top: 9px; display: flex; align-items: center; justify-content: center; gap: 9px;
    width: 100%; height: 52px; border-radius: 15px; border: 1.5px solid #1C1710; background: #FFFFFF; color: #1C1710;
    font-weight: 700; font-size: 14px; transition: transform .15s;
  }
  .cl-voice-idle:active { transform: scale(.98); }
  .cl-voice-rec { margin-top: 9px; display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 8px 0 16px; border-radius: 15px; background: #1C1710; color: #F6F0E4; }
  .cl-rec-dot { width: 10px; height: 10px; border-radius: 99px; background: #E4572E; flex: none; }
  @media (prefers-reduced-motion: no-preference) { .cl-rec-dot { animation: clPulse 1s ease infinite; } }
  .cl-rec-time { flex: 1; font-weight: 700; font-size: 16px; font-feature-settings: 'tnum'; }
  .cl-rec-stop { height: 40px; padding: 0 16px; border-radius: 11px; border: none; background: #F6F0E4; color: #1C1710; font-weight: 700; font-size: 12.5px; letter-spacing: .06em; }
  .cl-rec-hint { margin-top: 8px; font-size: 12px; color: #6F6355; }
  .cl-voice-done { margin-top: 9px; display: flex; align-items: center; gap: 11px; height: 56px; padding: 0 12px 0 8px; border-radius: 15px; border: 1.5px solid #1C1710; background: #FFFFFF; }
  .cl-voice-done-play { width: 40px; height: 40px; border-radius: 11px; border: none; background: #1C1710; color: #F6F0E4; display: flex; align-items: center; justify-content: center; flex: none; }
  .cl-voice-done-wave { color: #1C1710; display: flex; flex: 1; min-width: 0; }
  .cl-voice-done-time { font-weight: 700; font-size: 13px; font-feature-settings: 'tnum'; flex: none; }
  .cl-refaire { border: none; background: transparent; color: var(--vt-accent); font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-decoration: underline; white-space: nowrap; flex: none; }
  .cl-voice-note { margin-top: 9px; display: flex; align-items: center; gap: 10px; padding: 13px 15px; border-radius: 15px; font-size: 12.5px; line-height: 1.5; }
  .cl-voice-note svg { flex: none; }
  .cl-voice-queued { background: #F6E9C8; color: #5F4403; }
  .cl-voice-refused { background: #F1E7D3; color: #4A3F33; align-items: flex-start; }
  .cl-privline { margin-top: 14px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6F6355; }
  .cl-privline svg { flex: none; }
  .cl-cta-c3 { margin-top: 16px; }

  /* ══ C4 — récap + options livraison ══ */
  .cl-recap { margin-top: 14px; display: flex; gap: 12px; align-items: flex-start; padding: 14px 15px; border-radius: 18px; border: 1px solid #EDE4D3; background: #FFFFFF; box-shadow: 0 1px 2px rgba(28,22,15,.04); }
  .cl-recap-flag { color: var(--vt-accent); display: inline-flex; flex: none; margin-top: 2px; }
  .cl-recap-col { flex: 1; min-width: 0; }
  .cl-recap-zone { font-size: 10.5px; font-weight: 700; letter-spacing: .12em; color: #6F6355; }
  .cl-recap-rep { margin-top: 3px; font-size: 14px; font-weight: 600; line-height: 1.4; }
  .cl-modifier { border: none; background: transparent; color: var(--vt-accent); font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-decoration: underline; flex: none; }
  .cl-law { margin-top: 14px; font-size: 13px; line-height: 1.55; color: #4A3F33; }
  .cl-opt {
    margin-top: 11px; display: block; width: 100%; position: relative; padding: 16px;
    border-radius: 18px; border: 1.5px solid #E0D6C2; background: #FFFFFF; text-align: left;
    transition: transform .15s, border-color .2s;
    box-shadow: 0 1px 2px rgba(28,22,15,.04);
  }
  .cl-opt:active { transform: scale(.98); }
  .cl-opt-on { border: 2px solid var(--vt-accent); box-shadow: 0 12px 30px -14px rgba(var(--vt-sh),.35); }
  .cl-opt-mark { position: absolute; top: 12px; right: 12px; width: 26px; height: 26px; border-radius: 99px; background: var(--vt-accent); color: var(--vt-on); display: flex; align-items: center; justify-content: center; }
  @media (prefers-reduced-motion: no-preference) { .cl-opt-mark { animation: clPop .3s; } }
  .cl-opt-row { display: flex; align-items: center; gap: 10px; padding-right: 34px; }
  .cl-opt-title { flex: 1; font-weight: 700; font-size: 14.5px; }
  .cl-opt-fee { font-family: var(--cld); font-weight: 800; font-size: 17px; font-feature-settings: 'tnum'; white-space: nowrap; }
  .cl-opt-sub { margin-top: 5px; font-size: 13px; line-height: 1.5; color: #6F6355; }
  .cl-quote { margin-top: 15px; border-left: 3px solid #1C1710; padding: 2px 0 2px 13px; font-size: 13.5px; font-weight: 600; line-height: 1.5; }
  .cl-cta-step { margin-top: 16px; }

  /* ══ C5 — récap montants + modes ══ */
  .cl-bill { margin-top: 14px; padding: 4px 17px; border-radius: 20px; border: 1px solid #EDE4D3; background: #FFFFFF; box-shadow: 0 1px 2px rgba(28,22,15,.04); }
  .cl-bill-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 12px 0; border-bottom: 1px solid #F3EDDE; font-size: 13.5px; }
  /* THE LABEL WRAPS; IT NEVER TRUNCATES (SP3.3b1, founder finding).
     It used to carry white-space nowrap + overflow hidden + text-overflow
     ellipsis, and at 360px that rendered « Livraison Séra — ja… » — deleting
     « jamais cachée », which IS that row's promise: the one line telling her the
     delivery fee is not buried in the product price. The article name lost its
     end the same way. §5: « French long-text tested (labels don't truncate
     meaning) » — an ellipsis on a money row is a sentence the buyer never reads.
     A second line costs 20px; the amount keeps nowrap and stays hard-right. */
  .cl-bill-row span { min-width: 0; overflow-wrap: anywhere; }
  .cl-bill-row b { font-feature-settings: 'tnum'; white-space: nowrap; flex: none; }
  .cl-bill-liv { color: #6F6355; }
  .cl-bill-liv b { color: #1C1710; }
  .cl-bill-total { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 13px 0; }
  .cl-bill-total span { font-weight: 700; font-size: 14px; }
  .cl-bill-total b { font-family: var(--cld); font-weight: 800; font-size: 20px; font-feature-settings: 'tnum'; white-space: nowrap; }
  /* THE HONESTY LINE READS LIKE A SENTENCE, not like a layout accident.
     Right-aligned it wrapped « … chaque franc a / sa place. », stranding two
     words against the right edge. It needs 422px on one line and the column is
     273px, so it MUST wrap; what it must not do is wrap badly. The promise
     clause is one no-wrap unit (see renderC5), so the break can only fall at
     the em dash — deterministic on every engine, no modern-CSS dependency.
     LEFT, because a wrapped sentence with a ragged right edge reads as prose
     and a ragged left one reads as an accident. */
  .cl-reconcile { margin-top: 7px; text-align: left; font-size: 11.5px; font-weight: 600; color: #6F6355; font-feature-settings: 'tnum'; }
  .cl-reconcile-promesse { white-space: nowrap; }
  .cl-overline-pay { margin-top: 15px; }
  .cl-payopt { margin-top: 10px; box-shadow: none; padding: 16px 13px; }
  /* §6.1's option NAMES are longer than C4's (« Tout payer maintenant —
     recommandé »), and the shared 34px check-mark reserve broke the A label
     over three lines. The mark is 26px wide at right:12px, so 30px clears it
     with 4px to spare and the label gets two lines instead of three. */
  .cl-payopt .cl-opt-row { padding-right: 30px; }
  .cl-payopt .cl-opt-title { font-size: 14px; line-height: 1.3; }
  .cl-payopt-ic { color: #1C1710; display: inline-flex; flex: none; }
  .cl-payopt-body { margin-top: 7px; font-size: 13.5px; line-height: 1.5; color: #6F6355; }
  .cl-payopt-body b { color: #1C1710; font-feature-settings: 'tnum'; }
  /* §6.1 — LES DEUX LIGNES EN GRAS, one per option, the money before the prose.
     Ink (not the muted body): they are the answer to « combien maintenant ».
     12px is MEASURED, not chosen: at 360px the longest of the four lines
     (« À payer à la livraison : 11 500 FCFA ») needs 293px of the card's 275px
     at 13px, and a line that wraps on one option but not the next reads as an
     accident. The pay cards give back 3px of side padding for the same reason.
     Hierarchy is intact: the Total above stays the headline at 20px.
     A big amount (a 250 000 FCFA article) may still wrap, and MUST be allowed
     to: white-space nowrap here would push the card past a 360px phone, and a
     horizontal scrollbar on the payment screen is worse than a second line. */
  .cl-payline { margin-top: 7px; font-weight: 700; font-size: 12px; line-height: 1.45; color: #1C1710; font-feature-settings: 'tnum'; }
  .cl-payline + .cl-payline { margin-top: 2px; }
  .cl-payline + .cl-payopt-body { margin-top: 9px; }
  /* §6.1's non-refundable-delivery warning. Sober, never alarmist: it states a
     consequence, so it earns weight and the sable ground, not the danger set. */
  .cl-payopt-warn { margin-top: 9px; padding: 9px 11px; border-radius: 12px; background: #FBF6EB; border: 1px solid #EDE4D3; font-size: 12.5px; font-weight: 600; line-height: 1.45; color: #6F6355; }
  /* §6.1's one-line replay, immediately above the CTA: what she is about to
     agree to, in her own numbers, before the payment leaves. */
  .cl-redite { margin-top: 13px; text-align: center; font-size: 13.5px; font-weight: 700; line-height: 1.45; color: #1C1710; font-feature-settings: 'tnum'; }
  /* THE QUESTION IS NEVER LEFT ALONE (round 4). « … à la livraison — » /
     « d'accord ? » stranded the question she is agreeing to on a third line at
     28.6% of the block — the same defect the honesty line had, on the sentence
     that asks for her consent. The closing clause is one no-wrap unit, so the
     break falls before it and the last line is always a full one. It carries no
     amount, so it cannot grow past the card and force a horizontal scroll. */
  .cl-redite-fin { white-space: nowrap; }
  /* …and the same device on option B's NAME (round 5). « Payer le produit à la
     livraison » cannot fit one line at 360px (needs 267px, has 215px), and it
     was breaking as « … à la / livraison », stranding the word that says WHICH
     option this is. Glued, it reads « Payer le produit / à la livraison ». Used
     by BOTH sites that name option B — the payable card and the « Pas
     disponible » head — because it is one string. */
  .cl-titre-fin { white-space: nowrap; }
  /* « Écouter la note de la vendeuse » — the reseller's own note, back on the
     payment screen (founder ruling 2026-07-30). It WHISPERS: the CTA is the one
     primary action on this screen, so this is a small underlined link with the
     play glyph, never a second button.

     WHY IT IS SELECTED WITH TWO CLASSES AND NOT ONE, which is a measured cascade
     fact and not a style preference: the ".cl-root button" rule above sets the
     FONT SHORTHAND to inherit, which resets font-size AND font-weight, and it is
     specificity (0,1,1). A single-class button rule is (0,1,0) and LOSES to it,
     so this control rendered at the inherited 16px/400 instead of 11.5px/700 —
     measured in Chromium — and at 16px the nowrap label overflowed a 360px phone
     (scrollWidth 377) and failed SCREEN-FIT. Two classes, (0,2,0), beat it.

     FLAGGED, NOT FIXED HERE: ".cl-refaire" and ".cl-modifier" have the identical
     shape and lose the identical way — both measured at 16px/400 in the same run.
     That is a pre-existing module-wide defect, fixing it moves C3 and C4 pixels,
     and it is not this work order's scope.

     NOWRAP because a control LABEL that breaks mid-phrase reads as prose rather
     than as something to tap. It is invisible to the C5 orphan sweep either way
     (inline-flex is not a text block, and its svg child computes display block,
     so the glue filter skips it too) — so it is asserted on its own, by name, in
     the « Écouter la note » e2e rather than left to the sweep.

     ═══ min-height: 44px — THE HIT AREA, AND WHY IT IS NOT OPTIONAL ═══

     §5 is explicit: « ≥44px touch targets ». Whispering is about WEIGHT, never
     about REACH, and this control had none: measured in Chromium at 360px it
     rendered 272.61 × 19.83px, because an unpadded inline-flex at 11.5px/1.5 is
     one 17.25px line box and nothing more (× the module's 1.15 zoom on
     ".cl-root"). Nowrap, one line, fits its column and smaller than the CTA were
     all asserted — not one of them is a hit area, and a control that looks
     available and cannot be hit is worse than no control at all. This is the ONE
     thing on the money screen that reaches a mid-literacy buyer in her own
     language rather than in text; she taps it with a thumb, in the sun, on a hot
     phone.

     min-height rather than a transform, because a transform paints a bigger
     control without enlarging the box that receives the tap — the exact lie this
     rule exists to remove. box-sizing is border-box module-wide (".cl-root *"),
     so 44px is the real outer box; "align-items: center" keeps the label
     optically where it already was, with the added reach split above and below.

     44px IS THE CSS BOX, NOT THE RENDERED ONE, and that is deliberate: the 1.15
     zoom renders it at 50.59px, so the target clears §5 twice over and would
     still clear it if that zoom were ever removed. The e2e asserts BOTH numbers
     for exactly that reason.

     "margin-top: 9px" GOES, and is not merely deleted: the 13.4px of centring
     space above the label now does that margin's job, so keeping both would push
     the CTA a further 9px down a screen that already scrolls at 360px (Ten Laws
     #7). Net vertical cost of the hit area is +17.75px of CSS box (+20.4px as
     rendered), paid once.

     THE GLYPH AND THE LABEL SHARE ONE HIT AREA, not two: both are children of
     this single "button" element, so the 44px box is one target and the triangle
     is inside it. The e2e asserts exactly that, in both C5 states that render
     this control. */
  .cl-root .cl-ecouter { min-height: 44px; padding: 0; border: none; background: transparent; display: inline-flex; align-items: center; gap: 6px; color: var(--vt-accent); font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-decoration: underline; cursor: pointer; white-space: nowrap; }
  .cl-payinel { margin-top: 10px; padding: 16px; border-radius: 18px; border: 1px solid #EDE4D3; background: #FBF6EB; }
  .cl-payinel-head { display: flex; align-items: center; gap: 10px; opacity: .45; }
  .cl-payinel-head span { font-weight: 700; font-size: 14.5px; }
  .cl-payinel-body { margin-top: 7px; font-size: 13px; line-height: 1.55; color: #6F6355; }
  .cl-cta-c5 { margin-top: 15px; }
  .cl-providers { margin-top: 10px; text-align: center; font-size: 10.5px; font-weight: 700; letter-spacing: .12em; color: #6F6355; }
  .cl-footnote-c5 { margin-top: 5px; }

  /* ══ C5 — envoi / opérateur ══ */
  .cl-sub { padding: 70px 16px 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  @media (prefers-reduced-motion: no-preference) { .cl-sub { animation: clIn .3s; } }
  .cl-sub-overline { font-size: 11px; font-weight: 700; letter-spacing: .14em; color: #6F6355; }
  .cl-sub-title { margin-top: 10px; font-family: var(--cld); font-weight: 800; font-size: 28px; letter-spacing: -.02em; }
  .cl-sub-body { margin-top: 10px; font-size: 14px; line-height: 1.55; color: #4A3F33; max-width: 280px; }
  .cl-sub-body b { font-feature-settings: 'tnum'; color: #1C1710; }
  /* « ENVOI SÉCURISÉ » — THE PARTY THE MONEY IS GOING TO IS NEVER LEFT ALONE
     (round 6). « Nous envoyons votre demande de / paiement de {X} FCFA à /
     l'opérateur. » stranded « l'opérateur. » at 0.334 of the block — below the
     0.35 orphan bar, in all four combinations (both modes × both baskets), and
     FIXED regardless of the amount, because the last line was the tail alone.
     This is the moment the payment leaves her hands; the stranded word is who
     is receiving it.
     Same device as cl-reconcile-promesse, cl-redite-fin and cl-titre-fin,
     for the fourth time: the closing clause is one no-wrap unit, so the break
     falls BEFORE « à » and the last line reads « à l'opérateur. » → 0.388.
     WHY THE TAIL STOPS HERE and does not reach back to « de paiement de »:
     everything further back drags the AMOUNT onto the last line, and a last
     line carrying francs grows with the basket — measured 0.92 at 19 753 086,
     but one digit more and it wraps again, putting the same stub back. An
     amount-free tail is worth less headroom that never moves: 0.388 is the same
     number at every basket this screen can be given. */
  .cl-envoi-fin { white-space: nowrap; }
  .cl-bar-track { width: 190px; height: 4px; border-radius: 99px; background: #EFE4D2; margin-top: 28px; overflow: hidden; }
  .cl-bar-fill { width: 100%; height: 100%; border-radius: 99px; background: var(--vt-accent); }
  @media (prefers-reduced-motion: no-preference) { .cl-bar-fill { animation: clBar 1.4s ease-in-out infinite; } }
  .cl-prov { padding: 54px 16px 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  @media (prefers-reduced-motion: no-preference) { .cl-prov { animation: clIn .3s; } }
  .cl-prov-phone { width: 64px; height: 64px; border-radius: 20px; border: 2px solid #1C1710; color: #1C1710; display: flex; align-items: center; justify-content: center; }
  .cl-prov-title { margin-top: 16px; font-family: var(--cld); font-weight: 800; font-size: 24px; line-height: 1.2; letter-spacing: -.02em; }
  .cl-prov-body { margin-top: 10px; font-size: 14px; line-height: 1.6; color: #4A3F33; max-width: 290px; }
  .cl-prov-body b { font-feature-settings: 'tnum'; color: #1C1710; }
  /* THE OPERATOR SCREEN, TREATED LIKE THE TITLE RATHER THAN LEFT ON ITS MARGIN
     (round 6). « Composez votre code secret / Orange Money pour valider /
     {X} FCFA. » sat at 0.363 — 1.3% above the bar, the same thin margin the
     option-B title was carrying when the founder reversed « leave it ». It also
     MOVED with the basket (0.363 · 0.404 · 0.498 · 0.537), so what passed was
     the fixture, not the setting.
     WHERE THE NO-WRAP UNIT BELONGS, and why it is a HEAD and not a tail here:
     the last line is the AMOUNT, and no unit containing an amount may ever be
     glued on this screen (the cl-payline rule — nowrap on francs pushes the
     card past a 360px phone, and a horizontal scrollbar on a payment screen is
     worse than a second line). A tail is therefore unavailable; gluing « pour
     valider » alone changes nothing, measured, because those words already sit
     together. What DOES move the break is « code secret Orange Money » — the
     name of the credential she is being asked to compose, which was itself
     being split across two lines. Held together it reads « Composez votre /
     code secret Orange Money / pour valider {X} FCFA. » → 0.581 at the smallest
     basket and 0.754 at the largest. The unit is 273px and carries no amount,
     so it cannot grow past the 290px measure. Used by BOTH screens that ask for
     the code — C5's opérateur and C8's door leg — because it is one sentence. */
  .cl-prov-cle { white-space: nowrap; }
  .cl-prov-wait { margin-top: 22px; display: flex; align-items: center; gap: 10px; padding: 12px 17px; border-radius: 15px; border: 1.5px solid #E0D6C2; background: #FFFFFF; }
  .cl-prov-dots { display: inline-flex; gap: 4px; }
  .cl-prov-dot { width: 7px; height: 7px; border-radius: 99px; background: #1C1710; }
  @media (prefers-reduced-motion: no-preference) {
    .cl-prov-dot { animation: clPulse 1.2s ease infinite; }
    .cl-prov-dot:nth-child(2) { animation-delay: .2s; }
    .cl-prov-dot:nth-child(3) { animation-delay: .4s; }
  }
  .cl-prov-wait span:last-child { font-size: 12.5px; font-weight: 700; }
  .cl-prov-law { margin-top: 16px; font-size: 12.5px; line-height: 1.55; color: #6F6355; max-width: 290px; }

  /* ══ C6 — confirmation (3 variantes) ══ */
  .cl-conf { padding: 40px 0 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .cl-conf-disc { width: 78px; height: 78px; border-radius: 99px; background: var(--vt-accent); color: var(--vt-on); display: flex; align-items: center; justify-content: center; box-shadow: 0 18px 40px -12px rgba(var(--vt-sh),.55); transition: background .3s; }
  @media (prefers-reduced-motion: no-preference) { .cl-conf-disc { animation: clPop .45s cubic-bezier(.2,.8,.2,1); } }
  .cl-conf-ring { width: 78px; height: 78px; border-radius: 99px; border: 2px solid #1C1710; color: #1C1710; display: flex; align-items: center; justify-content: center; }
  .cl-conf-title { margin-top: 18px; font-family: var(--cld); font-weight: 800; font-size: 27px; letter-spacing: -.02em; }
  .cl-conf-title-pending { font-size: 26px; }
  .cl-conf-title-offline { font-size: 25px; }
  .cl-conf-body { margin-top: 8px; font-size: 14px; line-height: 1.55; color: #4A3F33; }
  .cl-conf-body-max { line-height: 1.6; max-width: 300px; }
  .cl-conf-body b { font-feature-settings: 'tnum'; color: #1C1710; }
  .cl-conf-chip { margin-top: 16px; padding: 10px 16px; border-radius: 12px; background: #F6E9C8; color: #5F4403; font-size: 12px; font-weight: 700; letter-spacing: .06em; }
  /* SP3.3c — « Vérifier à nouveau », offered only once the automatic checks
     have stopped. A SECONDARY action: it whispers (§5, one primary action per
     screen — the primary here is « Suivre ma commande » below). 44px tall. */
  /* SP3.3c — the read did not reach the service. A NOTE, not an alarm: the
     order is fine, we simply could not ask about it. */
  .cl-conf-horsportee { margin-top: 12px; padding: 11px 14px; border-radius: 14px; border: 1px solid #E0D6C2; background: #FFFFFF; font-size: 13px; line-height: 1.5; color: #6F6355; max-width: 300px; }
  /* SANDBOX-PAY-1 — the order reference WHISPERS below the state card: small,
     sub colour, selectable so a long finger-press can copy it. The id itself
     breaks anywhere rather than pushing the screen wide. */
  .cl-conf-ref { margin-top: 14px; text-align: center; font-size: 12px; color: #6F6355; }
  .cl-conf-ref-id { display: inline-block; word-break: break-all; user-select: all; -webkit-user-select: all; font-weight: 700; }
  .cl-conf-relance { margin-top: 14px; min-height: 44px; padding: 12px 20px; border-radius: 14px; border: 1.5px solid #E0D6C2; background: #FFFFFF; color: #4A3F33; font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; }
  /* …and the failed payment's ring. The danger tokens this app already uses on
     the problem banner, at ring weight — a border, never a filled alarm. */
  .cl-conf-ring-echec { border-color: #7E1A15; color: #7E1A15; }
  .cl-cta-echec { margin-top: 22px; }
  /* SP4.2b — the door's own failure, same family as C6's: a ring, never a
     filled alarm, and the retry as the one primary action. */
  /* §6.2's buyer-risk line — a quiet, honest note above the two doors. It is
     not a warning banner: it protects her by being read, not by shouting. */
  .cl-door-risque { margin-top: 14px; padding: 11px 14px; border-radius: 14px; background: #F6E9C8; color: #5F4403; font-size: 12.5px; line-height: 1.5; }
  .cl-door-echec { padding: 34px 0 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .cl-steps { margin-top: 22px; padding: 4px 17px; border-radius: 20px; border: 1px solid #EDE4D3; background: #FFFFFF; box-shadow: 0 1px 2px rgba(28,22,15,.04); }
  .cl-step-row { display: flex; align-items: center; gap: 12px; padding: 13px 0; border-bottom: 1px solid #F3EDDE; }
  .cl-step-row:last-child { border-bottom: none; }
  .cl-step-num { width: 24px; height: 24px; border-radius: 8px; background: var(--vt-soft); color: var(--vt-deep); display: flex; align-items: center; justify-content: center; font-family: var(--cld); font-weight: 800; font-size: 12px; flex: none; transition: background .3s, color .3s; }
  .cl-step-txt { font-size: 13.5px; font-weight: 600; }
  .cl-cta-c6 { margin-top: 22px; }

  /* ══ C7 — le suivi ══ */
  .cl-cmd { font-size: 11.5px; font-weight: 700; padding: 6px 11px; border-radius: 99px; white-space: nowrap; border: 1.5px solid #1C1710; font-feature-settings: 'tnum'; }
  .cl-c7-intro { margin-top: 8px; font-size: 13px; line-height: 1.5; color: #4A3F33; }
  /* Bannière problème — danger, gate-locked (Jamais θ, jamais ghost). */
  .cl-problem { margin-top: 12px; padding: 13px 15px; border-radius: 16px; background: #F8E1DE; color: #7E1A15; font-size: 13px; font-weight: 600; line-height: 1.5; }
  .cl-tl { margin-top: 16px; padding: 17px 17px 5px; border-radius: 20px; border: 1px solid #EDE4D3; background: #FFFFFF; box-shadow: 0 1px 2px rgba(28,22,15,.04); }
  .cl-tl-row { display: flex; gap: 13px; }
  .cl-tl-rail { display: flex; flex-direction: column; align-items: center; width: 22px; flex: none; }
  .cl-tl-dot { width: 20px; height: 20px; border-radius: 99px; display: flex; align-items: center; justify-content: center; flex: none; box-sizing: border-box; background: #FFFFFF; border: 2px solid #E0D6C2; }
  .cl-tl-dot-done { background: var(--vt-accent); border-color: var(--vt-accent); color: var(--vt-on); }
  .cl-tl-dot-now { border-color: var(--vt-accent); }
  .cl-tl-heart { width: 8px; height: 8px; border-radius: 99px; background: var(--vt-accent); }
  @media (prefers-reduced-motion: no-preference) { .cl-tl-heart { animation: clPulse 1.2s ease infinite; } }
  .cl-tl-bar { width: 2.5px; flex: 1; min-height: 20px; background: #EDE4D3; }
  .cl-tl-bar-done { background: var(--vt-accent); }
  .cl-tl-body { padding-bottom: 15px; flex: 1; }
  .cl-tl-toprow { display: flex; align-items: center; gap: 8px; }
  .cl-tl-t { font-size: 14px; }
  .cl-tl-t-done { font-weight: 700; }
  .cl-tl-t-now { font-weight: 800; }
  .cl-tl-t-future { font-weight: 500; color: #8A7D6B; }
  .cl-now-badge { background: var(--vt-accent); color: var(--vt-on); font-size: 9px; font-weight: 800; letter-spacing: .1em; padding: 3px 7px; border-radius: 99px; white-space: nowrap; }
  .cl-tl-d { margin-top: 2px; font-size: 12.5px; line-height: 1.45; color: #6F6355; }
  .cl-sim { margin-top: 12px; width: 100%; height: 46px; border-radius: 14px; border: 1.5px dashed #C9BDA3; background: transparent; color: #6F6355; font-weight: 600; font-size: 13px; transition: transform .15s; }
  .cl-sim:active { transform: scale(.98); }
  .cl-c7-actions { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .cl-c7-btn { height: 50px; border-radius: 14px; border: 1.5px solid #E5DCC9; background: #FFFFFF; color: #1C1710; font-weight: 700; font-size: 12.5px; transition: transform .15s; }
  .cl-c7-btn:active { transform: scale(.97); }
  /* « Signaler un problème » — danger affordance, gate-locked (Jamais θ). */
  .cl-c7-report { border-color: #D9A49C; color: #8C1D18; }
  .cl-cta-door { margin-top: 14px; }

  /* ══ C8 — à la porte ══ */
  .cl-door-title { margin-top: 16px; font-family: var(--cld); font-weight: 800; font-size: 25px; line-height: 1.15; letter-spacing: -.02em; }
  .cl-door-sub { margin-top: 9px; font-size: 13.5px; line-height: 1.55; color: #4A3F33; }
  .cl-checklist { margin-top: 14px; padding: 4px 17px; border-radius: 20px; border: 1px solid #EDE4D3; background: #FFFFFF; box-shadow: 0 1px 2px rgba(28,22,15,.04); }
  .cl-check-row { display: flex; align-items: center; gap: 11px; padding: 13px 0; border-bottom: 1px solid #F3EDDE; }
  .cl-check-row:last-child { border-bottom: none; }
  .cl-check-row svg { flex: none; color: #0B5B47; }
  .cl-check-row span { font-size: 14px; font-weight: 600; }
  .cl-owing { margin-top: 12px; display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 14px 16px; border-radius: 16px; background: #F1E7D3; }
  .cl-owing span { font-size: 13.5px; font-weight: 600; }
  .cl-owing b { font-family: var(--cld); font-weight: 800; font-size: 18px; font-feature-settings: 'tnum'; white-space: nowrap; }
  .cl-door-paths { margin-top: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .cl-door-good { height: 56px; border-radius: 16px; border: none; background: var(--vt-accent); color: var(--vt-on); font-family: var(--cld); font-weight: 700; font-size: 14.5px; box-shadow: 0 12px 26px -10px rgba(var(--vt-sh),.5); transition: transform .15s; }
  .cl-door-good:active { transform: scale(.98); }
  /* « Un problème » — danger à poids égal, gate-locked (Jamais θ, jamais ghost). */
  .cl-door-bad { height: 56px; border-radius: 16px; border: 1.5px solid #C4574B; background: #FFFFFF; color: #8C1D18; font-family: var(--cld); font-weight: 700; font-size: 14.5px; transition: transform .15s; }
  .cl-door-bad:active { transform: scale(.98); }
  .cl-door-equal { margin-top: 11px; text-align: center; font-size: 12px; line-height: 1.5; color: #6F6355; }
  .cl-door-pay { padding: 44px 0 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  @media (prefers-reduced-motion: no-preference) { .cl-door-pay { animation: clIn .3s; } }
  .cl-report-title { margin-top: 16px; font-family: var(--cld); font-weight: 800; font-size: 23px; letter-spacing: -.02em; }
  .cl-report-sub { margin-top: 7px; font-size: 13.5px; line-height: 1.5; color: #4A3F33; }
  .cl-reasons { margin-top: 13px; display: flex; flex-direction: column; gap: 9px; }
  .cl-reason { display: flex; align-items: center; gap: 11px; width: 100%; padding: 15px; border-radius: 16px; border: 1.5px solid #E0D6C2; background: #FFFFFF; color: #1C1710; font-size: 14px; font-weight: 600; text-align: left; transition: transform .15s, background .2s; }
  .cl-reason:active { transform: scale(.98); }
  .cl-reason-on { border: 2px solid var(--vt-accent); background: var(--vt-soft); color: var(--vt-deep); }
  /* Note refus — danger, gate-locked. */
  .cl-report-note { margin-top: 14px; padding: 14px 16px; border-radius: 16px; background: #F8E1DE; color: #7E1A15; font-size: 13px; font-weight: 600; line-height: 1.55; }
  @media (prefers-reduced-motion: no-preference) { .cl-report-note { animation: clIn .3s; } }
  .cl-report-cta { margin-top: 13px; width: 100%; height: 54px; border-radius: 16px; border: none; background: #1C1710; color: #F6F0E4; font-family: var(--cld); font-weight: 700; font-size: 15px; transition: transform .15s; }
  .cl-report-cta:active { transform: scale(.98); }
  @media (prefers-reduced-motion: no-preference) { .cl-report-cta { animation: clIn .3s; } }

  /* ══ C9 — le code de remise ══ */
  .cl-code-hidden { padding: 56px 0 0; display: flex; flex-direction: column; align-items: center; text-align: center; color: #8D7C64; }
  .cl-code-dots { margin-top: 26px; font-family: var(--cld); font-weight: 800; font-size: 34px; letter-spacing: .28em; font-feature-settings: 'tnum'; }
  .cl-code-hidden-body { margin-top: 22px; font-size: 14px; line-height: 1.6; color: #4A3F33; max-width: 290px; }
  .cl-code-revealed { padding: 30px 0 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .cl-code-overline { font-size: 10.5px; font-weight: 700; letter-spacing: .16em; color: #6F6355; }
  .cl-code-card { position: relative; margin-top: 14px; border: 2px solid #1C1710; border-radius: 22px; padding: 28px 36px; background: #FFFFFF; box-shadow: 0 18px 40px -16px rgba(28,22,15,.3); }
  @media (prefers-reduced-motion: no-preference) { .cl-code-card { animation: clPop .45s cubic-bezier(.2,.8,.2,1); } }
  .cl-code-tick { position: absolute; width: 12px; height: 12px; }
  .cl-code-tick-tl { top: 9px; left: 9px; border-top: 2px solid var(--vt-accent); border-left: 2px solid var(--vt-accent); }
  .cl-code-tick-tr { top: 9px; right: 9px; border-top: 2px solid var(--vt-accent); border-right: 2px solid var(--vt-accent); }
  .cl-code-tick-bl { bottom: 9px; left: 9px; border-bottom: 2px solid var(--vt-accent); border-left: 2px solid var(--vt-accent); }
  .cl-code-tick-br { bottom: 9px; right: 9px; border-bottom: 2px solid var(--vt-accent); border-right: 2px solid var(--vt-accent); }
  .cl-code-figure { font-family: var(--cld); font-weight: 800; font-size: 46px; letter-spacing: .12em; font-feature-settings: 'tnum'; white-space: nowrap; }
  .cl-code-proof { margin-top: 18px; font-weight: 700; font-size: 16px; }
  .cl-code-how { margin-top: 7px; font-size: 13.5px; line-height: 1.6; color: #4A3F33; max-width: 280px; }
  .cl-code-kept { margin-top: 20px; display: flex; align-items: center; gap: 8px; padding: 11px 15px; border-radius: 14px; background: #F1E7D3; color: #4A3F33; font-size: 12.5px; font-weight: 600; }
  .cl-code-kept svg { flex: none; }

  /* ══ C2 — sheet protections ══ */
  .cl-scrim { position: fixed; inset: 0; z-index: 60; background: rgba(24,18,11,.45); display: flex; align-items: flex-end; }
  @media (prefers-reduced-motion: no-preference) { .cl-scrim { animation: clFade .2s ease; } }
  .cl-sheet { background: #FCF9F2; width: 100%; max-width: 430px; margin: 0 auto; border-radius: 30px 30px 0 0; padding: 10px 22px 44px; max-height: 86%; overflow-y: auto; box-shadow: 0 -18px 50px rgba(24,18,11,.25); }
  @media (prefers-reduced-motion: no-preference) { .cl-sheet { animation: clUp .34s cubic-bezier(.32,.72,.25,1); } }
  .cl-grabber { width: 40px; height: 5px; border-radius: 99px; background: #DDD2BC; margin: 6px auto 16px; }
  .cl-sheet-title { font-family: var(--cld); font-weight: 800; font-size: 20px; letter-spacing: -.01em; }
  .cl-prot-row { margin-top: 16px; display: flex; gap: 13px; align-items: flex-start; }
  .cl-prot-row + .cl-prot-row { margin-top: 14px; }
  .cl-prot-ic { width: 38px; height: 38px; border-radius: 12px; background: var(--vt-soft); color: var(--vt-deep); display: flex; align-items: center; justify-content: center; flex: none; transition: background .3s, color .3s; }
  .cl-prot-t { font-weight: 700; font-size: 14.5px; }
  .cl-prot-d { margin-top: 2px; font-size: 13px; line-height: 1.5; color: #6F6355; }
  .cl-sheet-cta { margin-top: 18px; width: 100%; height: 52px; border-radius: 15px; border: none; background: var(--vt-accent); color: var(--vt-on); font-family: var(--cld); font-weight: 700; font-size: 15px; transition: transform .15s; }
  .cl-sheet-cta:active { transform: scale(.98); }

  /* ══ TOASTS ══ */
  .cl-toasts { position: fixed; top: 66px; left: 0; right: 0; z-index: 80; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
  .cl-toast { background: #1C1710; color: #F6F0E4; font-size: 13px; font-weight: 600; padding: 12px 17px; border-radius: 99px; max-width: 86%; box-shadow: 0 12px 30px rgba(0,0,0,.35); }
  @media (prefers-reduced-motion: no-preference) { .cl-toast { animation: clToast .25s cubic-bezier(.2,.8,.2,1); } }

  /* ══ GALERIE PHOTOS (RESELLER-UX-2 item 4 — founder order on his own C1) ══
     Full-screen over solid ink (photography on a dark field; no translucency to
     shimmer on a low-end GPU). Nav targets ≥44px; the counter is tabular. The
     frame's affordance: cursor + the photo-count pill when more than one. */
  .cl-photo[data-action="photo-galerie"] { cursor: pointer; }
  .cl-photo-count {
    position: absolute; right: 10px; bottom: 10px;
    background: rgba(28,23,16,.72); color: #F4EFE6;
    font-family: var(--clt); font-size: 11.5px; font-weight: 700;
    padding: 4px 10px; border-radius: 999px; letter-spacing: .2px;
    font-variant-numeric: tabular-nums;
  }
  .cl-galerie {
    position: fixed; inset: 0; z-index: 60; background: #1C1710;
    display: flex; flex-direction: column;
  }
  @media (prefers-reduced-motion: no-preference) { .cl-galerie { animation: clFade .18s ease; } }
  .cl-galerie-top {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 16px 16px 10px;
  }
  .cl-galerie-titre {
    color: #F4EFE6; font-family: var(--clt); font-size: 14px; font-weight: 700;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cl-galerie-fermer {
    min-height: 44px; padding: 0 16px; border-radius: 12px;
    background: none; border: 1.5px solid #F4EFE6; color: #F4EFE6;
    font-family: var(--clt); font-size: 13px; font-weight: 700; cursor: pointer;
  }
  .cl-galerie-scene { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; }
  .cl-galerie-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  .cl-galerie-bas {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 10px 16px 22px;
  }
  .cl-galerie-nav {
    min-height: 44px; padding: 0 14px; border-radius: 12px;
    background: none; border: 1.5px solid #F4EFE6; color: #F4EFE6;
    font-family: var(--clt); font-size: 13px; font-weight: 700; cursor: pointer;
  }
  .cl-galerie-nav:disabled { opacity: .35; cursor: default; }
  .cl-galerie-compteur {
    color: #F4EFE6; font-family: var(--clt); font-size: 12.5px; font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  /* ══ MOTION (§5 — pixel keyframes; reduced-motion coupe tout) ══ */
  @keyframes clIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes clUp { from { opacity: .4; transform: translateY(44px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes clFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes clToast { from { opacity: 0; transform: translateY(-14px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes clShimmer { 0% { background-position: -320px 0; } 100% { background-position: 320px 0; } }
  @keyframes clPulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  @keyframes clPop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
  @keyframes clBar { 0% { transform: scaleX(0); transform-origin: left; } 55% { transform: scaleX(1); transform-origin: left; } 56% { transform-origin: right; } 100% { transform: scaleX(0); transform-origin: right; } }
`;
