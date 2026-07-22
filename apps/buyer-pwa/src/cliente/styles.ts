/**
 * PWA CLIENTE — the stylesheet (HANDOFF Indigo §1 tokens · §2 components ·
 * §4 anatomies · §5 motion), pixel-for-pixel to `docs/PWA Cliente -
 * Redesign.dc.html`. Every hex/px/radius/shadow is the pixel source's exact
 * byte. θ-parametric properties (§1.2 « qui consomme θ » — 47 accent sites)
 * read the `--vt-*` custom properties `applyTheme` sets on the container, so
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
 * θ.on at alpha uses `color-mix` (the vitrine/achat precedent — `--vt-on` is a
 * hex); θ shadows use `rgba(var(--vt-sh), a)` (`--vt-sh` is the rgb triplet).
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
  }
  .cl-root * { box-sizing: border-box; margin: 0; }
  .cl-root button { font: inherit; cursor: pointer; }
  .cl-root a { color: var(--vt-accent); text-decoration: none; }
  .cl-root a:hover { color: var(--vt-deep); text-decoration: underline; }

  /* Chrome — zone statut 54 + liseré tissé 6 partout (§1.4). */
  .cl-status { height: 54px; flex: none; }
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
  .cl-stage { flex: 1; position: relative; }
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
  .cl-verirow { font-size: 12px; color: #6F6355; display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden; }
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
  .cl-photo {
    margin-top: 14px; position: relative; height: 238px; border-radius: 22px; overflow: hidden;
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
  .cl-cta {
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
  .cl-bill-row { display: flex; justify-content: space-between; gap: 10px; padding: 12px 0; border-bottom: 1px solid #F3EDDE; font-size: 13.5px; }
  .cl-bill-row span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cl-bill-row b { font-feature-settings: 'tnum'; white-space: nowrap; }
  .cl-bill-liv { color: #6F6355; }
  .cl-bill-liv b { color: #1C1710; }
  .cl-bill-total { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 13px 0; }
  .cl-bill-total span { font-weight: 700; font-size: 14px; }
  .cl-bill-total b { font-family: var(--cld); font-weight: 800; font-size: 20px; font-feature-settings: 'tnum'; white-space: nowrap; }
  .cl-reconcile { margin-top: 7px; text-align: right; font-size: 11.5px; font-weight: 600; color: #6F6355; font-feature-settings: 'tnum'; }
  .cl-overline-pay { margin-top: 15px; }
  .cl-payopt { margin-top: 10px; box-shadow: none; }
  .cl-payopt-ic { color: #1C1710; display: inline-flex; flex: none; }
  .cl-payopt-body { margin-top: 7px; font-size: 13.5px; line-height: 1.5; color: #6F6355; }
  .cl-payopt-body b { color: #1C1710; font-feature-settings: 'tnum'; }
  .cl-ecouter { margin-top: 9px; display: inline-flex; align-items: center; gap: 6px; color: var(--vt-accent); font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-decoration: underline; cursor: pointer; white-space: nowrap; }
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
  .cl-bar-track { width: 190px; height: 4px; border-radius: 99px; background: #EFE4D2; margin-top: 28px; overflow: hidden; }
  .cl-bar-fill { width: 100%; height: 100%; border-radius: 99px; background: var(--vt-accent); }
  @media (prefers-reduced-motion: no-preference) { .cl-bar-fill { animation: clBar 1.4s ease-in-out infinite; } }
  .cl-prov { padding: 54px 16px 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  @media (prefers-reduced-motion: no-preference) { .cl-prov { animation: clIn .3s; } }
  .cl-prov-phone { width: 64px; height: 64px; border-radius: 20px; border: 2px solid #1C1710; color: #1C1710; display: flex; align-items: center; justify-content: center; }
  .cl-prov-title { margin-top: 16px; font-family: var(--cld); font-weight: 800; font-size: 24px; line-height: 1.2; letter-spacing: -.02em; }
  .cl-prov-body { margin-top: 10px; font-size: 14px; line-height: 1.6; color: #4A3F33; max-width: 290px; }
  .cl-prov-body b { font-feature-settings: 'tnum'; color: #1C1710; }
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
  .cl-sheet { background: #FCF9F2; width: 100%; border-radius: 30px 30px 0 0; padding: 10px 22px 44px; max-height: 86%; overflow-y: auto; box-shadow: 0 -18px 50px rgba(24,18,11,.25); }
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
