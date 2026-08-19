import { t } from '../../i18n';
import { iconCheckEnt, iconLockEnt, iconPinEnt, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
import {
  avisChip,
  controls,
  etatPhoto,
  framePhoto,
  hasPhoto,
  ventesLine,
  verifieeBare,
  type Vals,
} from '../entetes';
import type { EnteteUnit } from './registry';

/**
 * ENTETES-L · SÉRIE 9 — 46 · ENSEIGNE — « le néon de nuit ».
 *
 * SOURCE OF TRUTH: the id="enseigne" block of « En-tetes Boutique - Serie 9 »
 * and its « Relevé — Enseigne ». Origine: création originale.
 *
 * A SHOPFRONT AFTER DARK, and the relevé's own line governs the whole sheet:
 * « AUCUNE ANIMATION — LA LUMIÈRE EST PEINTE ». Every glow is a static
 * `text-shadow` or `box-shadow` stack, never a filter and never a keyframe. On a
 * 1GB Android an animated glow is a dropped frame; a painted one is free.
 *
 * THE TYPE IS THE SIGN. Her name is drawn as two tubes: a pale core with three
 * halos at 4, 14 and 34px — rose for the head, amber for the accent segment. The
 * bicolour rule of every other style becomes bi-TUBE here.
 *
 * The wall is breeze-block, the floor is wet, and the reflections are three
 * skewed columns fading downward. All CSS.
 *
 * MINIMAL is a calligraphed sign on a tube support, IN THE COLUMN — never over
 * her portrait (ENTETES-K). Verified seal on its own line. Bio not drawn.
 */

/**
 * The cauri sign above the door — a tube drawn as glow under stroke.
 *
 * THE APERTURE IS THE WHOLE SHELL. The first version drew the slit as a
 * straight dashed rule through the oval, and the screenshot settled it: it
 * read as an empty ring with a dotted line in it — a placeholder, not a
 * cowrie. What makes a cauri legible at 76×52 is the LENS-shaped opening and
 * its teeth, so both are drawn: a closed lens path down the long axis, then
 * five short ticks across it.
 */
const cauri = (): string =>
  '<svg class="eg-cauri" aria-hidden="true" width="76" height="52" viewBox="0 0 76 52" fill="none">' +
  '<ellipse cx="38" cy="26" rx="30" ry="19" stroke="#FFC24B" stroke-opacity=".16" stroke-width="7"/>' +
  '<ellipse cx="38" cy="26" rx="30" ry="19" stroke="#FFC24B" stroke-opacity=".5" stroke-width="2.6"/>' +
  '<path d="M19 26q19-7 38 0-19 7-38 0z" stroke="#FFE9BC" stroke-opacity=".62" stroke-width="2" stroke-linejoin="round"/>' +
  '<path d="M26 23.4v5.2M32 22.4v7.2M38 22.2v7.6M44 22.4v7.2M50 23.4v5.2" stroke="#FFE9BC" stroke-opacity=".45" stroke-width="1.5" stroke-linecap="round"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="eg-cell"><span class="eg-cell-i">${icon}</span><span class="eg-cell-l">${label}</span><span class="eg-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-eg" data-role="vitrine-hero">',
    '<div class="eg-hero">',
    '<span class="eg-halo eg-halo--a" aria-hidden="true"></span>',
    '<span class="eg-halo eg-halo--b" aria-hidden="true"></span>',
    '<span class="eg-sol" aria-hidden="true"></span>',
    '<span class="eg-seuil" aria-hidden="true"></span>',
    '<span class="eg-reflet eg-reflet--a" aria-hidden="true"></span>',
    '<span class="eg-reflet eg-reflet--b" aria-hidden="true"></span>',
    '<span class="eg-reflet eg-reflet--c" aria-hidden="true"></span>',
    // the portrait in its tube ring
    '<div class="eg-tube-wrap">',
    '<span class="eg-patte" aria-hidden="true"></span>',
    `<div class="eg-tube" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="eg-motif"><span class="eg-mono">${v.mono}</span></div>`,
    '</div>',
    '</div>',
    '<div class="eg-col" data-role="vitrine-identity">',
    cauri(),
    v.hasTag
      ? `<div class="eg-bienv"><span class="eg-bienv-t"><v>${v.tagline}</v></span><span class="eg-tube-tiret" aria-hidden="true"></span></div>`
      : '',
    `<div class="eg-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="eg-verif"><span class="eg-verif-i">${iconCheckEnt(9, '#141117', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="eg-zone">${iconPinEnt(12, '#FFC24B', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="eg-proof-wrap"><span class="eg-proof"><span class="eg-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="eg-stars" data-role="chip-avis">${iconStarEnt(10, '#FFC24B')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="eg-nouv-wrap"><span class="eg-nouv" data-role="chip-nouvelle"><span class="eg-fix" aria-hidden="true"></span><span class="eg-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span><span class="eg-fix" aria-hidden="true"></span></span><span class="eg-support" aria-hidden="true"></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="eg-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#141117', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#141117', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#141117', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'eg', '#F5E9F0'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 46 · ENSEIGNE (série 9) ══════════════════════
     Relevé — nuit #181420 / #141117 / #100D13 (rangee #080709) · neon rose
     #FF7AA8 (coeur #FFDCE9) · neon ambre #FFC24B (coeur #FFE9BC) · blanc rose
     #F5E9F0. AUCUNE ANIMATION — la lumiere est peinte. */
  .vt-eg {
    --eg-n1: #181420; --eg-n2: #141117; --eg-n3: #100D13; --eg-rangee: #080709;
    --eg-rose: #FF7AA8; --eg-rose-c: #FFDCE9;
    --eg-ambre: #FFC24B; --eg-ambre-c: #FFE9BC; --eg-blanc: #F5E9F0;
    background: var(--eg-n3);
  }
  /* the breeze-block wall. padding-top 74 = the relevé's 14 + the 60 status pad */
  .vt-eg .eg-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 68px;
    background-color: var(--eg-n2);
    background-image:
      repeating-linear-gradient(0deg, rgba(255,255,255,.045) 0 1px, transparent 1px 24px),
      repeating-linear-gradient(90deg, rgba(255,255,255,.025) 0 1px, transparent 1px 52px),
      linear-gradient(162deg, var(--eg-n1) 0%, var(--eg-n2) 55%, var(--eg-n3) 100%);
  }
  .vt-eg .eg-halo { position: absolute; inset: 0; }
  .vt-eg .eg-halo--a { background-image: radial-gradient(46% 34% at 30% 26%, rgba(255,122,168,.14) 0%, transparent 70%); }
  .vt-eg .eg-halo--b { background-image: radial-gradient(42% 30% at 78% 18%, rgba(255,194,75,.12) 0%, transparent 70%); }
  /* the wet floor, its lit threshold, and three skewed reflections */
  .vt-eg .eg-sol {
    position: absolute; left: 0; right: 0; bottom: 0; height: 60px;
    background-image: linear-gradient(180deg, #1A151C 0%, #0D0B10 100%);
  }
  .vt-eg .eg-seuil {
    position: absolute; left: 0; right: 0; bottom: 60px; height: 1.5px;
    background-image: linear-gradient(90deg, rgba(255,122,168,.5) 0%, rgba(255,194,75,.5) 100%);
  }
  .vt-eg .eg-reflet { position: absolute; bottom: 0; height: 60px; }
  .vt-eg .eg-reflet--a { left: 34px; width: 26px; transform: skewX(-5deg); background-image: linear-gradient(180deg, rgba(255,122,168,.22) 0%, transparent 100%); }
  .vt-eg .eg-reflet--b { left: 128px; width: 20px; transform: skewX(6deg); background-image: linear-gradient(180deg, rgba(255,194,75,.18) 0%, transparent 100%); }
  .vt-eg .eg-reflet--c { right: 56px; width: 30px; transform: skewX(-6deg); background-image: linear-gradient(180deg, rgba(255,122,168,.2) 0%, transparent 100%); }
  /* THE TUBE RING. Its glows are box-shadows and reach well past the circle;
     the column clears the visible RING with room for the light. */
  .vt-eg .eg-tube-wrap { position: absolute; top: 122px; right: 16px; width: 146px; height: 146px; }
  .vt-eg .eg-patte { position: absolute; left: 50%; top: -9px; width: 5px; height: 9px; margin-left: -2.5px; background: #0B0A0D; }
  .vt-eg .eg-tube {
    position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
    border: 2.5px solid var(--eg-rose);
    box-shadow:
      0 0 10px rgba(255,122,168,.85), 0 0 26px rgba(255,122,168,.45),
      inset 0 0 10px rgba(255,122,168,.55), 0 0 0 2px #000000;
  }
  .vt-eg .eg-tube .vt-avatar-img { object-position: 50% 26%; }
  .vt-eg .eg-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: #17131C;
  }
  .vt-eg .eg-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 54px;
    color: var(--eg-rose-c);
    text-shadow: 0 0 4px rgba(255,122,168,.9), 0 0 14px rgba(255,122,168,.55), 0 0 34px rgba(255,122,168,.35);
  }
  /* THE COLUMN CLEARS THE RING: circle at right 16, 146 wide ⇒ its edge is at
     x=198 and its light spills further; the column stops at 178. */
  .vt-eg .eg-col { position: relative; width: calc(100% - 168px); min-height: 246px; }
  .vt-eg .eg-cauri { display: block; }
  .vt-eg .eg-bienv { margin-top: 4px; }
  .vt-eg .eg-bienv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px; color: var(--eg-ambre-c);
    text-shadow: 0 0 4px rgba(255,194,75,.9), 0 0 14px rgba(255,194,75,.5);
  }
  .vt-eg .eg-tube-tiret {
    display: block; margin-top: 6px; width: 64px; height: 2px; background: var(--eg-ambre);
    box-shadow: 0 0 7px rgba(255,194,75,.9);
  }
  /* THE NAME IS TWO TUBES — pale core, three painted halos, rose then amber */
  .vt-eg .eg-name {
    margin-top: 8px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.08; letter-spacing: -.01em;
    color: var(--eg-rose-c); overflow-wrap: break-word;
    text-shadow: 0 0 4px rgba(255,122,168,.9), 0 0 14px rgba(255,122,168,.55), 0 0 34px rgba(255,122,168,.35);
  }
  .vt-eg .eg-name.vt-ent-long { font-size: 24px; }
  .vt-eg .eg-name .vt-ent-acc {
    color: var(--eg-ambre-c);
    text-shadow: 0 0 4px rgba(255,194,75,.9), 0 0 14px rgba(255,194,75,.55), 0 0 34px rgba(255,194,75,.35);
  }
  .vt-eg .eg-verif { margin-top: 12px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--eg-blanc); }
  .vt-eg .eg-verif-i {
    width: 15px; height: 15px; flex: none; border-radius: 50%; background: var(--eg-rose);
    box-shadow: 0 0 8px rgba(255,122,168,.8);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-eg .eg-zone { margin-top: 6px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--eg-blanc); }
  .vt-eg .eg-zone svg { vertical-align: -2px; margin-right: 5px; }
  /* COMPLET — the light box */
  .vt-eg .eg-proof-wrap { margin-top: 12px; }
  .vt-eg .eg-proof {
    display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 9px 14px; border-radius: 10px; background: #1C1622;
    box-shadow: inset 0 0 0 1.5px rgba(255,122,168,.75), 0 0 14px rgba(255,122,168,.3);
  }
  .vt-eg .eg-proof-l { font-size: 11px; line-height: 1.35; color: var(--eg-blanc); }
  .vt-eg .eg-proof-l b {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif;
    font-weight: 800; font-size: 19px; color: var(--eg-ambre-c);
    text-shadow: 0 0 6px rgba(255,194,75,.8);
  }
  .vt-eg .eg-stars { font-size: 10.5px; font-weight: 700; color: var(--eg-ambre); white-space: nowrap; }
  .vt-eg .eg-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — the calligraphed sign on its tube support, IN THE COLUMN */
  .vt-eg .eg-nouv-wrap { margin-top: 14px; }
  .vt-eg .eg-nouv { display: inline-flex; align-items: center; gap: 9px; }
  .vt-eg .eg-fix { width: 4px; height: 11px; flex: none; background: #0B0A0D; }
  .vt-eg .eg-nouv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 16px; color: var(--eg-ambre-c);
    text-shadow: 0 0 4px rgba(255,194,75,.9), 0 0 14px rgba(255,194,75,.55), 0 0 34px rgba(255,194,75,.35);
  }
  .vt-eg .eg-support {
    display: block; margin-top: 4px; width: 108px; height: 2px; background: var(--eg-ambre);
    box-shadow: 0 0 8px rgba(255,194,75,.8);
  }
  .vt-eg .eg-trust {
    position: relative; padding: 12px 3px; background: var(--eg-rangee);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-eg .eg-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-eg .eg-cell + .eg-cell { border-left: 1px solid rgba(255,122,168,.3); }
  .vt-eg .eg-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--eg-rose);
    box-shadow: 0 0 10px rgba(255,122,168,.45);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-eg .eg-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: var(--eg-blanc); }
  .vt-eg .eg-cell-s { font-size: 8px; line-height: 1.25; color: var(--eg-ambre); }
  .vt-eg .eg-btn { background: rgba(11,10,13,.85); box-shadow: inset 0 0 0 1px rgba(255,122,168,.6); }
  .vt-eg .vt-ent-btn { top: 70px; }
  .vt-eg .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-eg .eg-hero { padding: 74px 12px 64px; }
    .vt-eg .eg-tube-wrap { top: 118px; right: 12px; width: 128px; height: 128px; }
    /* same arithmetic at 320: circle at right 12, 128 wide ⇒ edge at x=180 */
    .vt-eg .eg-col { width: calc(100% - 150px); min-height: 228px; }
    .vt-eg .eg-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-eg .eg-name.vt-ent-long { font-size: 21px; }
    .vt-eg .eg-mono { font-size: 46px; }
    .vt-eg .eg-bienv-t { font-size: 16px; }
    .vt-eg .eg-support { width: 96px; }
    .vt-eg .eg-reflet--b { left: 110px; }
    .vt-eg .eg-trust { padding: 11px 2px; }
    .vt-eg .eg-cell { padding: 0 4px; gap: 5px; }
    .vt-eg .eg-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
