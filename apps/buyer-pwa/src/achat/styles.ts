/**
 * PARCOURS D'ACHAT — the stylesheet (§1 tokens · §2 components · §7 motion).
 *
 * Pixel-for-pixel to `handoff_achat/Achat - HANDOFF.md` + the pixel source. Every
 * hex/px/radius/shadow is the handoff's exact byte. Theme-parametric properties
 * (§1.2 « qui consomme θ ») read the `--vt-*` custom properties `applyTheme`
 * sets — so the reseller's habillage drives the whole flow with one property
 * flip, no reflow. The « Jamais θ » set — semantic statuses, the custody frame
 * (ink + gold), « Un souci ? » (danger), the relais band (ink) — is authored in
 * literal values here, so a theme change can never touch it (§0 loi 3, QA §8.6).
 *
 * θ.on-alpha recipes use `color-mix` (the vitrine stylesheet's established
 * mechanism) since `--vt-on` is a hex, not a triplet; `--vt-sh` IS the rgb
 * triplet, so `rgba(var(--vt-sh), a)` is used directly for the θ shadows.
 */

export const ACHAT_STYLES = `
  .ac-root {
    --acd: 'Bricolage Grotesque', sans-serif;
    --act: 'Instrument Sans', system-ui, sans-serif;
    background: #F4EFE6; color: #1C1710;
    font-family: var(--act); min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  .ac-root * { box-sizing: border-box; margin: 0; }
  .ac-root button { font: inherit; cursor: pointer; }

  /* Frame chrome — zone statut 54 + liseré 6 θ + padding latéral 20 (§1.4). */
  .ac-status { height: 54px; }
  .ac-lisere {
    height: 6px;
    background: repeating-linear-gradient(90deg,
      var(--vt-accent) 0 18px, #F4EFE6 18px 24px, #C89A3F 24px 32px, #F4EFE6 32px 38px);
    transition: background .3s;
  }
  .ac-body { padding: 16px 20px 44px; }
  .ac-body-conf { padding: 26px 20px 44px; display: flex; flex-direction: column; align-items: center; }
  @media (prefers-reduced-motion: no-preference) {
    .ac-screen { animation: acIn .32s cubic-bezier(.2,.8,.2,1); }
    @keyframes acIn { from { opacity: 0; transform: translateY(10px); } }
  }

  /* ---- S1 header ------------------------------------------------------- */
  .ac-head { display: flex; align-items: center; gap: 12px; }
  .ac-avatar {
    width: 40px; height: 40px; border-radius: 14px; flex: none;
    background: var(--vt-accent); color: var(--vt-on);
    display: flex; align-items: center; justify-content: center;
    font: 800 17px var(--acd); transition: background .3s;
  }
  .ac-idcol { flex: 1; min-width: 0; }
  .ac-shopname { font: 800 17px/1.15 var(--acd); letter-spacing: -.01em; color: #1C1710; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ac-verirow { display: flex; align-items: center; gap: 6px; margin-top: 3px; font: 600 12px var(--act); color: #6F6355; white-space: nowrap; }
  .ac-veri-check { color: var(--vt-accent); display: inline-flex; flex: none; }
  .ac-dotsep { color: #D8CDBA; }
  .ac-voir { color: var(--vt-accent); font-weight: 700; }
  .ac-shield {
    width: 40px; height: 40px; border-radius: 99px; flex: none;
    border: 1px solid #E5DCC9; background: #FFFFFF; color: #1C1710;
    display: flex; align-items: center; justify-content: center;
  }

  /* ---- photo ----------------------------------------------------------- */
  .ac-photo { position: relative; height: 238px; border-radius: 22px; overflow: hidden; margin-top: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
  .ac-photo-tex { position: absolute; inset: 0; background: repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 10px, transparent 10px 26px); }
  .ac-photo-glyph { position: relative; filter: drop-shadow(0 6px 12px rgba(0,0,0,.3)); display: flex; }
  .ac-photo-glyph svg { width: 64px; height: 64px; }
  .ac-photo-caps { position: relative; font: 700 9.5px var(--act); letter-spacing: .16em; color: color-mix(in srgb, var(--vt-on) 80%, transparent); }
  .ac-tick { position: absolute; width: 13px; height: 13px; }
  .ac-tick-tl { top: 12px; left: 12px; border-top: 2px solid rgba(255,255,255,.5); border-left: 2px solid rgba(255,255,255,.5); }
  .ac-tick-tr { top: 12px; right: 12px; border-top: 2px solid rgba(255,255,255,.5); border-right: 2px solid rgba(255,255,255,.5); }
  .ac-tick-bl { bottom: 12px; left: 12px; border-bottom: 2px solid rgba(255,255,255,.5); border-left: 2px solid rgba(255,255,255,.5); }
  .ac-tick-br { bottom: 12px; right: 12px; border-bottom: 2px solid rgba(255,255,255,.5); border-right: 2px solid rgba(255,255,255,.5); }
  .ac-photo-veil { position: absolute; inset: 0; background: rgba(244,239,230,.72); }
  .ac-epuise-stamp { position: relative; border: 1.5px solid #1C1710; background: #FFFFFF; border-radius: 10px; padding: 6px 13px; font: 800 11.5px var(--acd); letter-spacing: .18em; color: #1C1710; }
  .ac-caption-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-top: 10px; }
  .ac-caption { font: 400 12px var(--act); color: #6F6355; }
  .ac-vendu { font: 700 12px var(--act); color: #1C1710; white-space: nowrap; }

  .ac-prodtitle { margin-top: 14px; font: 800 26px/1.12 var(--acd); letter-spacing: -.02em; color: #1C1710; }
  .ac-chiprow { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
  .ac-variant { border: 1.5px solid #1C1710; border-radius: 99px; padding: 5px 11px; font: 700 11px var(--act); letter-spacing: .06em; color: #1C1710; white-space: nowrap; }
  .ac-prod-zone { font: 400 12.5px var(--act); color: #6F6355; white-space: nowrap; }

  /* ---- C-VOIX ---------------------------------------------------------- */
  .ac-voix { margin-top: 14px; display: flex; align-items: center; gap: 12px; background: #FFFFFF; border: 1px solid #EDE4D3; border-radius: 18px; padding: 11px 14px; box-shadow: 0 1px 2px rgba(28,22,15,.04); }
  .ac-voix-play { width: 44px; height: 44px; border-radius: 99px; border: none; flex: none; background: var(--vt-accent); color: var(--vt-on); display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 22px -10px rgba(var(--vt-sh),.55); transition: background .3s; }
  .ac-voix-play:active { transform: scale(.92); }
  .ac-voix-col { flex: 1; min-width: 0; }
  .ac-voix-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .ac-voix-title { font: 700 13px var(--act); color: #1C1710; }
  .ac-voix-dur { font: 700 10.5px var(--act); font-feature-settings: 'tnum'; color: #6F6355; background: #EFE8DA; border-radius: 99px; padding: 3px 8px; }
  .ac-wave { display: flex; align-items: flex-end; gap: 2px; height: 22px; margin-top: 7px; }
  .ac-wavebar { width: 3px; border-radius: 99px; background: var(--vt-accent); transition: background .3s; }

  /* ---- C-PB price band ------------------------------------------------- */
  .ac-pb { margin-top: 16px; border-radius: 22px; overflow: hidden; position: relative; background: linear-gradient(140deg, var(--vt-accent), var(--vt-deep)); box-shadow: 0 16px 36px -14px rgba(var(--vt-sh),.5); transition: background .3s; }
  .ac-pb-fil { height: 3px; background: repeating-linear-gradient(90deg, #C89A3F 0 10px, color-mix(in srgb, var(--vt-on) 32%, transparent) 10px 14px); }
  .ac-pb-tex { position: absolute; inset: 0; background: repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 12px, transparent 12px 30px); pointer-events: none; }
  .ac-pb-inner { padding: 15px 18px 14px; position: relative; }
  .ac-pb-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .ac-pb-overline { font: 700 10.5px var(--act); letter-spacing: .14em; color: color-mix(in srgb, var(--vt-on) 85%, transparent); }
  .ac-pb-signed { display: inline-flex; align-items: center; gap: 5px; border: 1px solid color-mix(in srgb, var(--vt-on) 40%, transparent); border-radius: 99px; padding: 4px 9px; font: 700 9.5px var(--act); letter-spacing: .12em; color: var(--vt-on); white-space: nowrap; }
  .ac-pb-amount { display: flex; align-items: baseline; margin-top: 6px; }
  .ac-pb-hero { font: 800 40px/1 var(--acd); letter-spacing: -.02em; font-feature-settings: 'tnum'; color: var(--vt-on); white-space: nowrap; }
  .ac-pb-suffix { font: 700 16px var(--acd); color: var(--vt-on); white-space: nowrap; }
  .ac-pb-foot { margin-top: 11px; padding-top: 10px; border-top: 1px solid color-mix(in srgb, var(--vt-on) 22%, transparent); font: 400 11px/1.5 var(--act); color: color-mix(in srgb, var(--vt-on) 85%, transparent); }
  .ac-pb-total .ac-pb-hero { font-size: 34px; }
  .ac-pb-total .ac-pb-suffix { font-size: 15px; }
  .ac-pb-footrow { margin-top: 11px; padding-top: 10px; border-top: 1px solid color-mix(in srgb, var(--vt-on) 22%, transparent); display: flex; justify-content: space-between; font: 400 11.5px var(--act); color: color-mix(in srgb, var(--vt-on) 85%, transparent); }
  .ac-pb-footrow b { font-weight: 700; }
  .ac-pb-center { text-align: center; }
  .ac-pb-center .ac-pb-amount { justify-content: center; }
  .ac-pb-center .ac-pb-foot { color: color-mix(in srgb, var(--vt-on) 85%, transparent); }
  /* Épuisé — déteinte (Jamais θ) : literal gradient + neutral shadow. */
  .ac-pb-epuise { background: linear-gradient(140deg, #9A8465, #6F5E45); box-shadow: 0 16px 36px -14px rgba(28,22,15,.35); }
  .ac-pb-epuise .ac-pb-fil { background: repeating-linear-gradient(90deg, rgba(255,246,236,.4) 0 10px, rgba(255,246,236,.15) 10px 14px); }
  .ac-pb-epuise .ac-pb-overline, .ac-pb-epuise .ac-pb-foot { color: rgba(255,246,236,.85); }
  .ac-pb-epuise .ac-pb-signed { color: #FFF6EC; border-color: rgba(255,246,236,.4); }
  .ac-pb-epuise .ac-pb-amount { opacity: .85; }
  .ac-pb-epuise .ac-pb-hero { color: #FFF6EC; text-decoration: line-through; text-decoration-thickness: 3px; text-decoration-color: rgba(255,246,236,.55); }
  .ac-pb-epuise .ac-pb-suffix { color: #FFF6EC; }

  /* ---- trust card ------------------------------------------------------ */
  .ac-trust { margin-top: 14px; background: #FFFFFF; border: 1px solid #EDE4D3; border-radius: 18px; box-shadow: 0 1px 2px rgba(28,22,15,.04); }
  .ac-trust-row { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 0 16px; }
  .ac-trust-ic { color: var(--vt-accent); display: inline-flex; flex: none; transition: color .3s; }
  .ac-trust-txt { font: 600 13px var(--act); color: #1C1710; }
  .ac-trust-div { height: 1px; background: #F3EDDE; margin: 0 16px; }
  .ac-trust-link { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 0 16px; width: 100%; border: none; background: transparent; text-align: left; }
  .ac-trust-link-txt { font: 700 13.5px var(--act); color: var(--vt-accent); flex: 1; }
  .ac-trust-link-chev { color: var(--vt-accent); display: inline-flex; }

  /* ---- CTA + footnote + soft/ghost ------------------------------------- */
  .ac-cta { margin-top: 16px; width: 100%; height: 56px; border-radius: 16px; border: none; background: var(--vt-accent); color: var(--vt-on); font: 700 16px var(--acd); box-shadow: 0 12px 26px -10px rgba(var(--vt-sh),.5); display: flex; align-items: center; justify-content: center; gap: 8px; transition: background .3s; }
  .ac-cta:active { transform: scale(.98); }
  .ac-cta-off { background: #DDD5C3; color: #8A7D6B; box-shadow: none; cursor: default; }
  .ac-footnote { margin-top: 12px; text-align: center; font: 400 11.5px var(--act); color: #6F6355; }
  .ac-soft { margin-top: 11px; width: 100%; height: 48px; border-radius: 14px; border: none; background: var(--vt-soft); color: var(--vt-deep); font: 700 14.5px var(--acd); display: flex; align-items: center; justify-content: center; gap: 8px; transition: background .3s, color .3s; }
  .ac-epuise-card { margin-top: 14px; background: #F1E7D3; border: 1px solid #EDE4D3; border-radius: 18px; padding: 14px 16px; }
  .ac-epuise-text { font: 400 12.5px/1.55 var(--act); color: #4A3F33; }

  /* ---- C-STEP ---------------------------------------------------------- */
  .ac-stephead { display: flex; align-items: center; gap: 10px; }
  .ac-back { width: 40px; height: 40px; border-radius: 99px; flex: none; border: 1px solid #E5DCC9; background: #FFFFFF; color: #1C1710; display: flex; align-items: center; justify-content: center; }
  .ac-steptitle-wrap { flex: 1; min-width: 0; }
  .ac-steptitle { font: 800 19px var(--acd); letter-spacing: -.02em; color: #1C1710; }
  .ac-track-sub { margin-top: 2px; font: 400 12px var(--act); color: #6F6355; }
  .ac-steppill { font: 700 11px var(--act); font-feature-settings: 'tnum'; color: var(--vt-deep); background: var(--vt-soft); border-radius: 99px; padding: 5px 11px; white-space: nowrap; transition: background .3s, color .3s; }
  .ac-stepbars { display: flex; gap: 5px; margin-top: 14px; }
  .ac-stepseg { flex: 1; height: 4px; border-radius: 99px; background: #E5DCC9; }
  .ac-stepseg-on { background: var(--vt-accent); transition: background .3s; }

  .ac-overline { font: 700 11px var(--act); letter-spacing: .1em; text-transform: uppercase; color: #6F6355; margin: 18px 2px 0; }
  .ac-overline-row { display: flex; justify-content: space-between; align-items: baseline; margin: 18px 2px 0; }
  .ac-overline-row .ac-overline { margin: 0; }
  .ac-counter { font: 700 11px var(--act); font-feature-settings: 'tnum'; color: #8A7D6B; }

  /* ---- S2 recap -------------------------------------------------------- */
  .ac-recap { margin-top: 9px; background: #FFFFFF; border: 1px solid #EDE4D3; border-radius: 18px; padding: 13px; display: flex; align-items: center; gap: 12px; box-shadow: 0 1px 2px rgba(28,22,15,.04); }
  .ac-recap-thumb { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex: none; overflow: hidden; position: relative; }
  .ac-recap-thumb-tex { position: absolute; inset: 0; background: repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 8px, transparent 8px 20px); }
  .ac-recap-glyph { position: relative; filter: drop-shadow(0 3px 6px rgba(0,0,0,.25)); display: flex; }
  .ac-recap-glyph svg { width: 24px; height: 24px; }
  .ac-recap-info { flex: 1; min-width: 0; }
  .ac-recap-name { font: 700 14.5px var(--act); color: #1C1710; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ac-recap-sub { margin-top: 2px; font: 400 12.5px var(--act); color: #6F6355; white-space: nowrap; }
  .ac-recap-price { font: 800 15.5px var(--acd); font-feature-settings: 'tnum'; color: var(--vt-deep); white-space: nowrap; transition: color .3s; }

  .ac-choicelist { margin-top: 9px; display: flex; flex-direction: column; gap: 10px; }
  .ac-choice { display: flex; align-items: center; gap: 12px; padding: 14px 15px; border-radius: 18px; border: 1.5px solid #E5DCC9; background: #FFFFFF; text-align: left; transition: border-color .2s, box-shadow .2s; }
  .ac-choice-on { border: 2px solid var(--vt-accent); box-shadow: 0 12px 30px -14px rgba(var(--vt-sh),.35); }
  .ac-choice-ic { width: 40px; height: 40px; border-radius: 12px; flex: none; display: flex; align-items: center; justify-content: center; background: #EFE8DA; color: #6F6355; }
  .ac-choice-on .ac-choice-ic { background: var(--vt-soft); color: var(--vt-deep); }
  .ac-choice-body { flex: 1; min-width: 0; }
  .ac-choice-title { display: block; font: 700 14.5px var(--act); color: #1C1710; }
  .ac-choice-sub { display: block; margin-top: 2px; font: 400 12px/1.45 var(--act); color: #6F6355; }
  .ac-radio { width: 24px; height: 24px; border-radius: 99px; flex: none; border: 1.5px solid #E5DCC9; background: #FFFFFF; display: flex; align-items: center; justify-content: center; }
  .ac-choice-on .ac-radio { border: none; background: var(--vt-accent); color: var(--vt-on); }

  .ac-totals { margin-top: 18px; background: #FFFFFF; border: 1px solid #EDE4D3; border-radius: 18px; padding: 15px 16px; box-shadow: 0 1px 2px rgba(28,22,15,.04); }
  .ac-totline { display: flex; justify-content: space-between; align-items: baseline; font: 400 14px var(--act); padding: 3px 0; }
  .ac-totline-prod { color: #4A3F33; }
  .ac-totline-prod b { font-feature-settings: 'tnum'; color: #1C1710; }
  .ac-totline-liv { color: #6F6355; }
  .ac-totline-liv .ac-liv-pending { font: 600 12.5px var(--act); white-space: nowrap; }
  .ac-totsep { display: flex; justify-content: space-between; align-items: baseline; border-top: 1.5px dashed #E5DCC9; margin-top: 8px; padding-top: 12px; }
  .ac-totlabel { font: 700 15px var(--act); color: #1C1710; }
  .ac-totamount { font: 800 20px var(--acd); font-feature-settings: 'tnum'; color: var(--vt-deep); white-space: nowrap; transition: color .3s; }
  .ac-totnote { margin-top: 8px; font: 400 12px/1.5 var(--act); color: #6F6355; }

  /* ---- S3 ------------------------------------------------------------- */
  .ac-chips { margin-top: 9px; display: flex; flex-wrap: wrap; gap: 8px; }
  .ac-chip { padding: 9px 14px; border-radius: 99px; border: 1.5px solid #E5DCC9; background: #FFFFFF; font: 600 13px var(--act); color: #6F6355; white-space: nowrap; }
  .ac-chip:active { transform: scale(.96); }
  .ac-chip-on { border-color: var(--vt-accent); background: var(--vt-soft); color: var(--vt-deep); transition: background .3s, color .3s, border-color .3s; }
  .ac-field { margin-top: 8px; background: #FFFFFF; border: 1.5px solid #E5DCC9; border-radius: 14px; padding: 14px 15px; }
  .ac-field-focus { border-color: var(--vt-accent); box-shadow: 0 0 0 3px rgba(var(--vt-sh),.12); }
  .ac-field-err { border-color: #C4574B; }
  .ac-field-text { font: 400 16px/1.5 var(--act); color: #1C1710; }
  .ac-caret { display: inline-block; width: 2px; height: 18px; background: var(--vt-accent); vertical-align: -3px; margin-left: 1px; }
  .ac-help { margin-top: 8px; font: 400 12px/1.5 var(--act); color: #6F6355; }
  .ac-err-note { margin-top: 6px; font: 600 12px var(--act); color: #8C1D18; }
  .ac-voixpath { margin-top: 14px; background: #FFFFFF; border: 1.5px dashed #DDD2BC; border-radius: 18px; padding: 13px 15px; display: flex; align-items: center; gap: 12px; }
  .ac-voixpath-ic { width: 44px; height: 44px; border-radius: 99px; flex: none; background: var(--vt-soft); color: var(--vt-deep); display: flex; align-items: center; justify-content: center; transition: background .3s, color .3s; }
  .ac-voixpath-body { flex: 1; min-width: 0; }
  .ac-voixpath-title { display: block; font: 700 13.5px var(--act); color: #1C1710; }
  .ac-voixpath-sub { display: block; margin-top: 2px; font: 400 12px/1.45 var(--act); color: #6F6355; }
  .ac-voixpath-act { font: 700 12px var(--act); color: var(--vt-accent); white-space: nowrap; }
  .ac-phone { margin-top: 8px; background: #FFFFFF; border: 1.5px solid #E5DCC9; border-radius: 14px; padding: 14px 15px; display: flex; align-items: center; gap: 10px; }
  .ac-phone-num { font: 400 16px var(--act); font-feature-settings: 'tnum'; color: #1C1710; flex: 1; }
  .ac-phone-lock { color: #8A7D6B; display: inline-flex; }
  .ac-relais { margin-top: 10px; border-radius: 18px; background: #1C1710; padding: 13px 15px; font: 400 12px/1.55 var(--act); color: #F6F0E4; }
  .ac-relais b { font-weight: 700; }

  /* ---- S4 delivery ----------------------------------------------------- */
  .ac-s4repere { margin-top: 16px; display: flex; align-items: center; gap: 8px; font: 600 12.5px var(--act); color: #4A3F33; }
  .ac-s4repere-pin { color: var(--vt-accent); display: inline-flex; flex: none; }
  .ac-s4repere-txt { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ac-dchoice { border: 1.5px solid #E5DCC9; background: #FFFFFF; border-radius: 20px; padding: 15px 16px; text-align: left; position: relative; transition: border-color .2s, box-shadow .2s; }
  .ac-dchoice-on { border: 2px solid var(--vt-accent); box-shadow: 0 12px 30px -14px rgba(var(--vt-sh),.35); }
  .ac-dradio { position: absolute; top: 14px; right: 14px; width: 24px; height: 24px; border-radius: 99px; border: 1.5px solid #E5DCC9; background: #FFFFFF; }
  .ac-dchoice-on .ac-dradio { border: none; background: var(--vt-accent); color: var(--vt-on); display: flex; align-items: center; justify-content: center; }
  .ac-drow { display: flex; align-items: center; gap: 8px; }
  .ac-dtitle { font: 700 15px var(--act); color: #1C1710; }
  .ac-dconseil { font: 700 10px var(--act); letter-spacing: .08em; color: #14603A; background: #DFEEE3; border-radius: 99px; padding: 3px 8px; }
  .ac-dbolt { color: #6F6355; display: inline-flex; }
  .ac-dslot { display: block; margin-top: 3px; font: 400 12.5px/1.5 var(--act); color: #6F6355; }
  .ac-dfee { display: flex; align-items: baseline; margin-top: 10px; }
  .ac-dfee-num { font: 800 22px/1 var(--acd); font-feature-settings: 'tnum'; color: #1C1710; }
  .ac-dfee-suffix { font: 700 12.5px var(--acd); color: #1C1710; }
  .ac-dchoice-on .ac-dfee-num, .ac-dchoice-on .ac-dfee-suffix { color: var(--vt-deep); }

  /* ---- S4 loading / error --------------------------------------------- */
  .ac-loading-line { margin-top: 16px; font: 600 12.5px var(--act); color: #4A3F33; }
  .ac-sk-card { border: 1.5px solid #EDE4D3; background: #FFFFFF; border-radius: 20px; padding: 15px 16px; }
  .ac-shim { background: linear-gradient(100deg, #ECE4D4 30%, #F6F1E7 45%, #ECE4D4 60%); background-size: 320px 100%; }
  @media (prefers-reduced-motion: no-preference) { .ac-shim { animation: acShim 1.15s linear infinite; } }
  @keyframes acShim { from { background-position: -320px 0; } to { background-position: 320px 0; } }
  .ac-sk-bar { border-radius: 8px; background: #ECE4D4; }
  .ac-sk-total { margin-top: 18px; border-radius: 22px; border: 1.5px dashed #DDD2BC; background: #FCF9F2; padding: 15px 18px; }
  .ac-sk-total-lbl { font: 700 10.5px var(--act); letter-spacing: .14em; color: #8A7D6B; }
  .ac-danger-banner { border-radius: 18px; background: #F8E1DE; padding: 13px 15px; font: 400 12.5px/1.55 var(--act); color: #7E1A15; }
  .ac-ghost { margin-top: 12px; width: 100%; height: 48px; border-radius: 14px; border: 1.5px solid #E5DCC9; background: #FFFFFF; color: #1C1710; font: 700 14.5px var(--acd); display: flex; align-items: center; justify-content: center; gap: 8px; }

  /* ---- S5 status pills (semantic — Jamais θ) --------------------------- */
  .ac-pill { font: 700 11px var(--act); border-radius: 99px; padding: 5px 11px; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
  .ac-pill-tnum { font-feature-settings: 'tnum'; }
  .ac-pill-success { color: #14603A; background: #DFEEE3; }
  .ac-pill-warning { color: #7A5104; background: #F6E9C8; }
  .ac-pill-danger { color: #8C1D18; background: #F8E1DE; }
  .ac-pill-neutral { color: #6F6355; background: #EFE8DA; }
  .ac-pill-dot { width: 7px; height: 7px; border-radius: 99px; background: currentColor; }

  /* ---- C-TL timeline --------------------------------------------------- */
  .ac-tl { margin-top: 18px; background: #FFFFFF; border: 1px solid #EDE4D3; border-radius: 20px; padding: 17px; box-shadow: 0 1px 2px rgba(28,22,15,.04); }
  .ac-tl-row { display: flex; gap: 12px; }
  .ac-tl-rail { display: flex; flex-direction: column; align-items: center; flex: none; padding-top: 2px; }
  .ac-tl-dot { width: 22px; height: 22px; border-radius: 99px; display: flex; align-items: center; justify-content: center; }
  .ac-tl-dot-done { background: var(--vt-accent); color: var(--vt-on); }
  .ac-tl-dot-now { border: 2px solid var(--vt-accent); background: #FFFFFF; }
  .ac-tl-dot-now-heart { width: 8px; height: 8px; border-radius: 99px; background: var(--vt-accent); }
  .ac-tl-dot-future { border: 2px solid #E0D6C2; background: #FFFFFF; }
  .ac-tl-conn { width: 2px; flex: 1; min-height: 20px; }
  .ac-tl-conn-done { background: var(--vt-accent); }
  .ac-tl-conn-future { background: #E8DFCC; }
  .ac-tl-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 19px; }
  .ac-tl-nowrow { display: flex; align-items: center; gap: 8px; }
  .ac-tl-steptitle { font: 700 13.5px var(--act); color: #1C1710; white-space: nowrap; }
  .ac-tl-steptitle-future { color: #8A7D6B; }
  .ac-tl-stamp { font: 400 11.5px var(--act); font-feature-settings: 'tnum'; color: #8A7D6B; margin-top: 1px; }
  .ac-tl-note { font: 400 11.5px/1.5 var(--act); color: #6F6355; margin-top: 2px; }
  .ac-tl-note-future { color: #8A7D6B; }
  .ac-now-badge { font: 800 9px var(--acd); letter-spacing: .14em; color: var(--vt-on); background: var(--vt-accent); border-radius: 99px; padding: 3px 8px; flex: none; }

  /* ---- C-GARDE custody frame (Jamais θ — encre + or) ------------------- */
  .ac-garde { margin-top: 16px; border-radius: 22px; overflow: hidden; background: #1C1710; box-shadow: 0 18px 44px -16px rgba(28,23,16,.55); position: relative; }
  .ac-garde-fil { height: 4px; background: repeating-linear-gradient(90deg, #C89A3F 0 12px, rgba(246,240,228,.18) 12px 18px); }
  .ac-garde-inner { padding: 17px 18px 16px; }
  .ac-garde-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .ac-garde-label { font: 700 10.5px var(--act); letter-spacing: .14em; color: #C89A3F; }
  .ac-garde-pill { display: inline-flex; align-items: center; gap: 5px; border-radius: 99px; padding: 4px 9px; font: 700 9.5px var(--act); letter-spacing: .12em; white-space: nowrap; }
  .ac-garde-pill-sealed { border: 1px solid rgba(246,240,228,.35); color: #F6F0E4; }
  .ac-garde-pill-revealed { background: #DFEEE3; color: #14603A; }
  .ac-garde-sealed { margin-top: 12px; border: 1.5px dashed rgba(200,154,63,.55); border-radius: 16px; background: repeating-linear-gradient(135deg, rgba(246,240,228,.06) 0 8px, transparent 8px 16px); padding: 18px 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .ac-garde-cases { display: flex; gap: 9px; }
  .ac-garde-case { width: 34px; height: 44px; border-radius: 10px; background: rgba(246,240,228,.1); border: 1px solid rgba(246,240,228,.18); display: flex; align-items: center; justify-content: center; font: 800 22px var(--acd); color: rgba(246,240,228,.5); }
  .ac-garde-sep { width: 14px; display: flex; align-items: center; justify-content: center; font: 800 20px var(--acd); color: rgba(246,240,228,.4); }
  .ac-garde-caption { font: 400 11.5px/1.5 var(--act); color: rgba(246,240,228,.75); text-align: center; }
  .ac-garde-note { margin-top: 12px; font: 400 11px/1.55 var(--act); color: rgba(246,240,228,.65); }
  .ac-garde-revealed { margin-top: 12px; border: 1.5px solid rgba(200,154,63,.75); border-radius: 16px; background: rgba(200,154,63,.08); padding: 20px 16px; display: flex; flex-direction: column; align-items: center; gap: 9px; }
  .ac-garde-code { font: 800 46px/1 var(--acd); letter-spacing: .14em; font-feature-settings: 'tnum'; color: #F6F0E4; white-space: nowrap; }
  .ac-garde-reveal-cap { font: 400 12px/1.5 var(--act); color: rgba(246,240,228,.8); text-align: center; }
  .ac-garde-reveal-cap b { color: #F6F0E4; }
  .ac-garde-footrow { margin-top: 12px; display: flex; justify-content: space-between; align-items: center; font: 400 11px var(--act); color: rgba(246,240,228,.65); }
  .ac-garde-proof { font: 700 10px var(--act); letter-spacing: .1em; color: #C89A3F; }
  @media (prefers-reduced-motion: no-preference) { .ac-garde-reveal-anim { animation: acPop .4s cubic-bezier(.32,.72,.25,1); } }

  /* ---- C-SOUCI (danger — Jamais θ, Jamais ghost) ----------------------- */
  .ac-souci { margin-top: 16px; width: 100%; min-height: 54px; border-radius: 16px; border: 1.5px solid #8C1D18; background: #F8E1DE; display: flex; align-items: center; gap: 12px; padding: 8px 15px; text-align: left; }
  .ac-souci:active { transform: scale(.98); }
  .ac-souci-ic { width: 36px; height: 36px; border-radius: 99px; background: #8C1D18; color: #F8E1DE; display: flex; align-items: center; justify-content: center; flex: none; }
  .ac-souci-body { flex: 1; min-width: 0; }
  .ac-souci-title { display: block; font: 700 15px var(--acd); color: #8C1D18; }
  .ac-souci-sub { display: block; font: 400 11.5px var(--act); color: #7E1A15; }
  .ac-souci-chev { color: #8C1D18; display: inline-flex; flex: none; }

  /* ---- S5-B tempo banner (attention — Jamais θ) ------------------------ */
  .ac-tempo { margin-top: 14px; background: #F6E9C8; border-radius: 18px; padding: 13px 15px; display: flex; gap: 10px; align-items: flex-start; }
  .ac-tempo-ic { color: #7A5104; display: inline-flex; flex: none; margin-top: 1px; }
  .ac-tempo-txt { font: 400 12.5px/1.55 var(--act); color: #5F4403; }
  .ac-tempo-txt b { font-weight: 700; }

  /* ---- S6 confirmation ------------------------------------------------- */
  .ac-conf-disc { width: 78px; height: 78px; border-radius: 99px; background: var(--vt-accent); color: var(--vt-on); display: flex; align-items: center; justify-content: center; box-shadow: 0 18px 40px -12px rgba(var(--vt-sh),.55); transition: background .3s; }
  @media (prefers-reduced-motion: no-preference) { .ac-conf-disc { animation: acPop .3s cubic-bezier(.32,.72,.25,1); } }
  .ac-conf-title { margin-top: 16px; font: 800 27px/1.1 var(--acd); letter-spacing: -.02em; color: #1C1710; text-align: center; }
  .ac-conf-body { margin-top: 8px; font: 400 13.5px/1.6 var(--act); color: #4A3F33; text-align: center; max-width: 300px; }
  .ac-conf-body b { font-weight: 700; }
  .ac-conf-pb { margin-top: 18px; width: 100%; }
  .ac-steps { margin-top: 14px; width: 100%; background: #FFFFFF; border: 1px solid #EDE4D3; border-radius: 20px; padding: 15px 16px; box-shadow: 0 1px 2px rgba(28,22,15,.04); display: flex; flex-direction: column; gap: 12px; }
  .ac-stepitem { display: flex; align-items: center; gap: 11px; }
  .ac-stepnum { width: 24px; height: 24px; border-radius: 8px; background: var(--vt-soft); color: var(--vt-deep); display: flex; align-items: center; justify-content: center; font: 800 12px var(--acd); flex: none; transition: background .3s, color .3s; }
  .ac-steptext { font: 600 13px var(--act); color: #1C1710; }
  .ac-conf-cta { width: 100%; }
  .ac-ghost-boutique { margin-top: 10px; width: 100%; height: 50px; border-radius: 16px; border: 1.5px solid #E5DCC9; background: #FFFFFF; color: var(--vt-accent); font: 700 14.5px var(--acd); display: flex; align-items: center; justify-content: center; gap: 8px; }
  .ac-conf-subline { margin-top: 10px; font: 400 11.5px var(--act); color: #6F6355; text-align: center; }

  /* ---- S7 protections sheet -------------------------------------------- */
  .ac-scrim { position: absolute; inset: 0; background: rgba(24,18,11,.45); }
  .ac-sheet { position: relative; background: #FCF9F2; border-radius: 30px 30px 0 0; box-shadow: 0 -18px 50px rgba(24,18,11,.25); padding: 10px 22px 44px; }
  @media (prefers-reduced-motion: no-preference) { .ac-sheet { animation: acUp .34s cubic-bezier(.32,.72,.25,1); } }
  .ac-grabber { width: 44px; height: 5px; border-radius: 99px; background: #DDD2BC; margin: 0 auto; }
  .ac-sheet-title { margin-top: 16px; font: 800 20px var(--acd); letter-spacing: -.01em; color: #1C1710; }
  .ac-sheet-intro { margin-top: 4px; font: 400 12.5px/1.55 var(--act); color: #6F6355; }
  .ac-protlist { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
  .ac-protrow { background: #FFFFFF; border: 1px solid #EDE4D3; border-radius: 18px; padding: 13px 14px; display: flex; gap: 12px; align-items: flex-start; }
  .ac-protic { width: 38px; height: 38px; border-radius: 12px; background: var(--vt-soft); color: var(--vt-deep); display: flex; align-items: center; justify-content: center; flex: none; transition: background .3s, color .3s; }
  .ac-protbody { flex: 1; min-width: 0; }
  .ac-prottitle { display: block; font: 700 13.5px var(--act); color: #1C1710; }
  .ac-prottext { display: block; margin-top: 2px; font: 400 12px/1.5 var(--act); color: #6F6355; }
  .ac-protrow-danger { border: 1.5px solid #8C1D18; }
  .ac-protrow-danger .ac-protic { background: #8C1D18; color: #F8E1DE; }
  .ac-protrow-danger .ac-prottitle { color: #8C1D18; }
  .ac-protrow-danger .ac-prottext { color: #7E1A15; }
  .ac-sheet-cta { margin-top: 16px; width: 100%; height: 52px; border-radius: 16px; border: none; background: #1C1710; color: #F6F0E4; font: 700 15px var(--acd); }

  @keyframes acPop { from { opacity: 0; transform: scale(.96); } }
  @keyframes acUp { from { opacity: 0; transform: translateY(24px); } }
  @keyframes acPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.82); } }
  @media (prefers-reduced-motion: no-preference) { .ac-pulse { animation: acPulse 1.6s ease-in-out infinite; } }
`;
