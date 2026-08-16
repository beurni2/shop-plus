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
 * ENTETES-L · SÉRIE 8 — 41 · BAZIN — « damas calandré ».
 *
 * SOURCE OF TRUTH: the id="bazin" block of « En-tetes Boutique - Serie 8 » and
 * its « Relevé — Bazin ». Origine: création originale — aucune image source.
 *
 * BAZIN RICHE, THE CLOTH OF CEREMONY, and the whole style is one optical trick:
 * the MOIRÉ is not a texture, it is INTERFERENCE. Two oblique trames at 112° and
 * 96°, with deliberately mismatched steps (16/34 and 11/26), beat against each
 * other and produce the shimmer the calender press leaves in real bazin. Both
 * sit at .05 and .032 — barely present alone, unmistakable together.
 *
 * THE PHOTOGRAPH IS A CAMEO-BROOCH: an oval in a silver mount with a pearl set
 * at its crown. The mount is a box-shadow reaching 8px beyond the oval, so — as
 * on Calebasse — the column's clearance is measured from the MOUNT.
 *
 * MINIMAL is a notched ribbon, cut with `clip-path`, and it lives IN THE COLUMN
 * in the proof's own slot. Never over her portrait (ENTETES-K).
 *
 * Verified seal on its own line. Bio not drawn. 24px tier past 14 characters.
 */

/** One damask medallion — the mango-paisley of a bazin panel, in outline. */
const damas = (cls: string, size: number): string =>
  `<svg class="${cls}" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 120 120" fill="none" stroke="rgba(239,241,250,.22)" stroke-width="1.4">` +
  '<path d="M60 12c22 0 40 18 40 40 0 26-22 34-40 56C42 86 20 78 20 52c0-22 18-40 40-40z"/>' +
  '<path d="M60 30c13 0 23 10 23 23 0 15-13 20-23 33-10-13-23-18-23-33 0-13 10-23 23-23z"/>' +
  '<circle cx="60" cy="52" r="8"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="bz-cell"><span class="bz-cell-i">${icon}</span><span class="bz-cell-l">${label}</span><span class="bz-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-bz" data-role="vitrine-hero">',
    '<div class="bz-hero">',
    '<span class="bz-lustre" aria-hidden="true"></span>',
    '<span class="bz-calandre" aria-hidden="true"></span>',
    damas('bz-damas bz-damas--a', 210),
    damas('bz-damas bz-damas--b', 104),
    '<span class="bz-ourlet" aria-hidden="true"></span>',
    // the cameo-brooch — oval, silver mount, set pearl
    '<div class="bz-camee-wrap">',
    `<div class="bz-camee" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 25%')
      : `<div class="bz-motif"><span class="bz-mono">${v.mono}</span></div>`,
    '</div>',
    '<span class="bz-perle" aria-hidden="true"></span>',
    '</div>',
    '<div class="bz-col" data-role="vitrine-identity">',
    v.hasTag
      ? `<div class="bz-bienv"><span class="bz-bienv-t"><v>${v.tagline}</v></span><span class="bz-hem" aria-hidden="true"></span></div>`
      : '',
    `<div class="bz-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="bz-verif"><span class="bz-verif-i">${iconCheckEnt(9, '#1B1F4E', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="bz-zone">${iconPinEnt(12, '#9BA6D8', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="bz-proof-wrap"><span class="bz-proof"><span class="bz-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="bz-stars" data-role="chip-avis">${iconStarEnt(10, '#8A93BE')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="bz-nouv-wrap"><span class="bz-nouv" data-role="chip-nouvelle"><span class="bz-losange" aria-hidden="true"></span><span class="bz-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="bz-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#1B1F4E', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#1B1F4E', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#1B1F4E', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'bz', 'right', '20px', '72px', '#EFF1FA'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 41 · BAZIN (série 8) ══════════════════════
     Relevé — indigo damasse #262B63 / #1B1F4E / #141737 (rangee #101334) ·
     nacre #EFF1FA / #DDE3F8 · argent #AEB4D6 / #8A93BE · bleuet #B4C1F0 ·
     sous-lignes #9BA6D8. */
  .vt-bz {
    --bz-i1: #262B63; --bz-i2: #1B1F4E; --bz-i3: #141737; --bz-rangee: #101334;
    --bz-nacre: #EFF1FA; --bz-nacre-2: #DDE3F8;
    --bz-argent: #AEB4D6; --bz-argent-2: #8A93BE; --bz-bleuet: #B4C1F0; --bz-sous: #9BA6D8;
    background: var(--bz-i3);
  }
  /* THE MOIRÉ IS INTERFERENCE, not a texture: two oblique trames with
     mismatched steps beat against each other. Neither is visible alone.
     padding-top 74 = the relevé's 14 + the shell's 60 status pad. */
  .vt-bz .bz-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 58px;
    background-color: var(--bz-i2);
    background-image:
      repeating-linear-gradient(112deg, rgba(255,255,255,.05) 0 16px, transparent 16px 34px),
      repeating-linear-gradient(96deg, rgba(255,255,255,.032) 0 11px, transparent 11px 26px),
      linear-gradient(154deg, var(--bz-i1) 0%, var(--bz-i2) 52%, var(--bz-i3) 100%);
  }
  .vt-bz .bz-lustre {
    position: absolute; inset: 0;
    background-image: radial-gradient(58% 44% at 84% 8%, rgba(255,255,255,.17) 0%, transparent 68%);
  }
  /* the calender's own stroke — one light band across the cloth */
  .vt-bz .bz-calandre {
    position: absolute; inset: 0;
    background-image: linear-gradient(115deg, transparent 30%, rgba(255,255,255,.1) 44%, transparent 58%);
  }
  .vt-bz .bz-damas { position: absolute; }
  .vt-bz .bz-damas--a { left: -46px; bottom: -34px; }
  /* RIGHT 166, NOT 128. At 128 this 104px medallion spanned x=128..232 while
     the cameo owns everything past x=202, so a THIRD of the paisley was cut
     off by the oval — and the teardrop that survived read as a giant map pin
     sitting next to the zone line, which already carries a pin icon. A motif
     that is half-hidden is not a motif. At 166 it spans 90..194 and clears the
     cameo by 8px; it still sits BEHIND her name, which is where a damask
     ground belongs. */
  .vt-bz .bz-damas--b { right: 166px; top: 74px; opacity: .7; }
  /* the hem: two nacre filets, inset 8 and 12 */
  .vt-bz .bz-ourlet {
    position: absolute; inset: 8px; border-radius: 14px; border: 1px solid rgba(239,241,250,.35);
  }
  .vt-bz .bz-ourlet::after {
    content: ''; position: absolute; inset: 4px; border-radius: 11px; border: 1px solid rgba(239,241,250,.16);
  }
  /* THE CAMEO. The silver mount is a box-shadow 8px beyond the oval and no
     layout box accounts for it, so the column clears the MOUNT (x=194 at 360). */
  .vt-bz .bz-camee-wrap { position: absolute; top: 124px; right: 14px; width: 144px; height: 178px; }
  .vt-bz .bz-camee {
    position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
    box-shadow: 0 0 0 3px var(--bz-i3), 0 0 0 8px var(--bz-argent), 0 16px 34px -18px rgba(16,19,52,.9);
  }
  .vt-bz .bz-camee .vt-avatar-img { object-position: 50% 25%; }
  .vt-bz .bz-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: #20255A;
    background-image:
      repeating-linear-gradient(112deg, rgba(239,241,250,.3) 0 1px, transparent 1px 13px),
      repeating-linear-gradient(-112deg, rgba(239,241,250,.18) 0 1px, transparent 1px 13px);
  }
  .vt-bz .bz-mono { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 52px; color: var(--bz-nacre); }
  .vt-bz .bz-perle {
    position: absolute; left: 50%; top: -13px; width: 9px; height: 9px; margin-left: -4.5px;
    border-radius: 50%; background: radial-gradient(circle at 34% 30%, #FFFFFF 0%, #B9BFDC 100%);
    box-shadow: 0 0 0 2.5px var(--bz-argent-2);
  }
  /* THE COLUMN CLEARS THE MOUNT: oval at right 14, 144 wide, mount 8 further
     ⇒ it owns past x=194. 100% is the hero's PADDED box (332 at 360). */
  .vt-bz .bz-col { position: relative; width: calc(100% - 172px); min-height: 238px; }
  .vt-bz .bz-bienv { margin-top: 2px; }
  .vt-bz .bz-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px; color: var(--bz-nacre); }
  /* the double hem, offset — the finish of a bazin panel */
  .vt-bz .bz-hem {
    display: block; margin-top: 6px; width: 72px; height: 4px;
    background-image:
      linear-gradient(90deg, rgba(239,241,250,.8) 0 100%),
      linear-gradient(90deg, rgba(239,241,250,.35) 0 100%);
    background-size: 100% 2px, 66% 1px;
    background-position: 0 0, 6px 3px;
    background-repeat: no-repeat;
  }
  .vt-bz .bz-name {
    margin-top: 8px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.05; letter-spacing: -.015em;
    color: #F1F2FA; overflow-wrap: break-word;
  }
  .vt-bz .bz-name.vt-ent-long { font-size: 24px; }
  .vt-bz .bz-name .vt-ent-acc { color: var(--bz-bleuet); }
  .vt-bz .bz-verif { margin-top: 11px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--bz-nacre); }
  .vt-bz .bz-verif-i {
    width: 15px; height: 15px; flex: none; border-radius: 50%; background: var(--bz-nacre);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-bz .bz-zone { margin-top: 6px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--bz-sous); }
  .vt-bz .bz-zone svg { vertical-align: -2px; margin-right: 5px; }
  /* COMPLET — the brooch-pill: nacre, double silver filet */
  .vt-bz .bz-proof-wrap { margin-top: 12px; }
  .vt-bz .bz-proof {
    display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 9px 14px; border-radius: 99px; background: var(--bz-nacre);
    box-shadow: inset 0 0 0 1px rgba(138,147,190,.5), inset 0 0 0 3px rgba(239,241,250,.5), inset 0 0 0 4px rgba(138,147,190,.5);
  }
  .vt-bz .bz-proof-l { font-size: 11px; line-height: 1.35; color: #3A3F63; }
  .vt-bz .bz-proof-l b {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif;
    font-weight: 800; font-size: 19px; color: #232858;
  }
  .vt-bz .bz-stars { font-size: 10.5px; font-weight: 700; color: #4A5182; white-space: nowrap; }
  .vt-bz .bz-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — the notched ribbon, IN THE COLUMN (ENTETES-K: never on her face) */
  .vt-bz .bz-nouv-wrap { margin-top: 12px; }
  .vt-bz .bz-nouv {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 20px; transform: rotate(-2deg); background: var(--bz-nacre);
    clip-path: polygon(0 0, 100% 0, calc(100% - 9px) 50%, 100% 100%, 0 100%, 9px 50%);
  }
  .vt-bz .bz-losange {
    width: 7px; height: 7px; flex: none; background: var(--bz-argent-2); transform: rotate(45deg);
  }
  .vt-bz .bz-nouv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 13px; color: var(--bz-i2); }
  .vt-bz .bz-trust {
    position: relative; padding: 12px 3px; background: var(--bz-rangee);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-bz .bz-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-bz .bz-cell + .bz-cell { border-left: 1px solid rgba(239,241,250,.25); }
  .vt-bz .bz-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--bz-nacre);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-bz .bz-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: var(--bz-nacre); }
  .vt-bz .bz-cell-s { font-size: 8px; line-height: 1.25; color: var(--bz-sous); }
  .vt-bz .bz-btn { background: rgba(20,23,55,.8); box-shadow: inset 0 0 0 1px rgba(239,241,250,.45); }
  .vt-bz .vt-ent-btn { top: 70px; }
  .vt-bz .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-bz .bz-hero { padding: 74px 12px 54px; }
    .vt-bz .bz-camee-wrap { top: 120px; right: 12px; width: 126px; height: 156px; }
    /* same arithmetic at 320: oval at right 12, 126 wide, mount 8 further ⇒ it
       owns past x=174, and the column stops at 154 */
    .vt-bz .bz-col { width: calc(100% - 154px); min-height: 220px; }
    .vt-bz .bz-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-bz .bz-name.vt-ent-long { font-size: 21px; }
    .vt-bz .bz-mono { font-size: 44px; }
    .vt-bz .bz-bienv-t { font-size: 16px; }
    /* 150 at 320: the cameo starts at x=182, the medallion ends at 170. */
    .vt-bz .bz-damas--b { right: 150px; }
    .vt-bz .bz-trust { padding: 11px 2px; }
    .vt-bz .bz-cell { padding: 0 4px; gap: 5px; }
    .vt-bz .bz-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
