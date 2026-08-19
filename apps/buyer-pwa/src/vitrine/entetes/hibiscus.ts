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
 * ENTETES-M · SÉRIE 11 — 55 · HIBISCUS — « le bissap ».
 *
 * SOURCE OF TRUTH: the id="hibiscus" block of « En-tetes Boutique - Serie 11 »
 * and its « Relevé — Hibiscus ». Origine: création originale.
 *
 * THE PORTRAIT BECOMES THE PISTIL. This is the one style whose photo is not
 * framed BY a decoration but sits INSIDE one: a giant hibiscus — four curved
 * petal paths radiating from the centre, one darker shadow petal behind them —
 * and her 110 circle rests on the corolla. The composition only works because
 * the circle is offset (left 24 / top 22 of the 158×168 block) rather than
 * centred: a centred circle reads as a logo, an offset one reads as a flower
 * with a face in it.
 *
 * THE PISTIL SHOOTS OUT OF THE FLOWER at 45° with five pollen grains at its
 * head — the detail that makes it a hibiscus and not a generic bloom.
 *
 * A SECOND GHOST FLOWER at .5 opacity is cut by the frame in the bottom-left
 * corner. Cut deliberately: a whole second flower would compete with the first,
 * a cropped one reads as depth.
 *
 * MINIMAL is a corolla cockade, IN THE COLUMN (ENTETES-K). Verified seal on its
 * own line. Bio not drawn. 24px tier past 14 characters.
 */

/** The giant hibiscus: shadow petal, four petals, pistil, pollen. */
const fleur = (): string =>
  '<svg class="hb-fleur" aria-hidden="true" width="158" height="168" viewBox="-4 -16 166 190" fill="none">' +
  // THE PETALS REACH ~76 FROM THE CENTRE, and the first screenshot is why they
  // had to be redrawn: at their original reach they stopped at the same radius
  // as the 110 circle laid on them, so the whole corolla disappeared behind
  // her portrait and only a crimson sliver survived. A flower the photo hides
  // is not a flower. Each lobe now clears the circle by ~20px.
  '<path d="M79 76C58 40 44 2 84 2c34 0 46 30 24 52-8 8-18 16-29 22z" fill="#A81B41" opacity=".55"/>' +
  '<g>' +
  '<path d="M79 76C40 58 4 34 22 8 38-14 74-2 84 30c5 18 3 34-5 46z" fill="url(#hbCr)" opacity=".96"/>' +
  '<path d="M79 76c38-16 78-8 76 22-2 24-38 32-60 10-11-11-17-22-16-32z" fill="url(#hbCr)" opacity=".9"/>' +
  '<path d="M79 76c18 36 16 76-18 82-28 5-42-26-24-52 11-16 28-26 42-30z" fill="url(#hbCr)" opacity=".92"/>' +
  '<path d="M79 76c-36 12-74 2-72-28 2-24 36-32 58-12 12 11 16 28 14 40z" fill="url(#hbCr)" opacity=".88"/></g>' +
  '<path d="M79 76L124 30" stroke="#F2C94C" stroke-width="2.6" stroke-linecap="round"/>' +
  '<g fill="#F2C94C"><circle cx="124" cy="30" r="3"/><circle cx="117" cy="28" r="2.4"/>' +
  '<circle cx="128" cy="37" r="2.4"/><circle cx="130" cy="24" r="2.2"/><circle cx="119" cy="36" r="2.2"/></g>' +
  '<defs><radialGradient id="hbCr" cx="79" cy="76" r="84" gradientUnits="userSpaceOnUse">' +
  '<stop offset="0" stop-color="#E85277"/><stop offset="1" stop-color="#C4224E"/></radialGradient></defs></svg>';

/** The ghost flower, cut by the frame. */
const fleurFantome = (): string =>
  '<svg class="hb-fantome" aria-hidden="true" width="120" height="120" viewBox="0 0 120 120" fill="none" opacity=".5">' +
  '<g fill="#E85277">' +
  '<ellipse cx="60" cy="30" rx="26" ry="30"/><ellipse cx="90" cy="60" rx="30" ry="26"/>' +
  '<ellipse cx="60" cy="90" rx="26" ry="30"/><ellipse cx="30" cy="60" rx="30" ry="26"/></g>' +
  '<circle cx="60" cy="60" r="12" fill="#F2C94C"/></svg>';

/** The kicker's three-petal bullet. */
const hibiscusPuce = (): string =>
  '<svg class="hb-puce" aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none">' +
  '<circle cx="5" cy="3" r="2.6" fill="#C4224E"/><circle cx="2.4" cy="7" r="2.6" fill="#E85277"/>' +
  '<circle cx="7.6" cy="7" r="2.6" fill="#E85277"/><circle cx="5" cy="5.4" r="1.6" fill="#F2C94C"/></svg>';

/** Five-petal flower leading the proof pill. */
const fleurPreuve = (): string =>
  '<svg class="hb-mini" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">' +
  '<g fill="#C4224E"><ellipse cx="8" cy="3.4" rx="2.6" ry="3.4"/>' +
  '<ellipse cx="12.4" cy="6.6" rx="2.6" ry="3.4" transform="rotate(72 12.4 6.6)"/>' +
  '<ellipse cx="10.8" cy="12" rx="2.6" ry="3.4" transform="rotate(144 10.8 12)"/>' +
  '<ellipse cx="5.2" cy="12" rx="2.6" ry="3.4" transform="rotate(216 5.2 12)"/>' +
  '<ellipse cx="3.6" cy="6.6" rx="2.6" ry="3.4" transform="rotate(288 3.6 6.6)"/></g>' +
  '<circle cx="8" cy="8" r="2.4" fill="#F2C94C"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="hb-cell"><span class="hb-cell-i">${icon}</span><span class="hb-cell-l">${label}</span><span class="hb-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-hb" data-role="vitrine-hero">',
    '<div class="hb-hero">',
    fleurFantome(),
    // the corolla, with her portrait as its pistil
    '<div class="hb-bloc">',
    fleur(),
    `<div class="hb-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="hb-motif"><span class="hb-mono">${v.mono}</span></div>`,
    '</div>',
    '</div>',
    '<div class="hb-col" data-role="vitrine-identity">',
    `<div class="hb-kick">${hibiscusPuce()}<span>${t('vit.hb_kicker')}</span></div>`,
    v.hasTag
      ? `<div class="hb-bienv"><span class="hb-bienv-t"><v>${v.tagline}</v></span><span class="hb-tiret" aria-hidden="true"></span></div>`
      : '',
    `<div class="hb-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="hb-verif"><span class="hb-verif-i">${iconCheckEnt(9, '#FFEEF0', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="hb-zone">${iconPinEnt(12, '#A81B41', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="hb-proof-wrap"><span class="hb-proof">${fleurPreuve()}<span class="hb-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="hb-stars" data-role="chip-avis">${iconStarEnt(10, '#F2C94C')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="hb-nouv-wrap"><span class="hb-nouv" data-role="chip-nouvelle"><span class="hb-cocarde" aria-hidden="true"></span><span class="hb-coeur"><span class="hb-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="hb-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#3B1622', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#3B1622', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#3B1622', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'hb', '#3B1622'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════ 55 · HIBISCUS (série 11) ══════════════════
     Relevé — rose thé #FFEEF0→#FFE2E6 · cramoisi #C4224E→#E85277
     (profond #A81B41) · pollen #F2C94C · prune #3B1622 ·
     rangée #3B1622, sous-lignes #D98BA0. */
  .vt-hb {
    --hb-rose: #FFEEF0; --hb-rose-2: #FFE2E6; --hb-cram: #C4224E; --hb-cram-2: #E85277;
    --hb-cram-d: #A81B41; --hb-pollen: #F2C94C; --hb-prune: #3B1622; --hb-sous: #D98BA0;
    background: var(--hb-rose);
  }
  .vt-hb .hb-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 22px;
    background: linear-gradient(180deg, var(--hb-rose) 0%, var(--hb-rose-2) 100%);
  }
  /* the ghost flower, deliberately cut by the frame — depth, not a second bloom */
  .vt-hb .hb-fantome { position: absolute; left: -44px; bottom: -44px; }
  /* THE COROLLA BLOCK. The flower and the circle both live inside it, and no
     decoration reaches past it, so the column clears the BLOCK: 158 at right 8
     ⇒ it owns past x=194, and 158 off the padded box stops the column at 174. */
  .vt-hb .hb-bloc { position: absolute; top: 24px; right: 8px; width: 158px; height: 168px; }
  .vt-hb .hb-fleur { position: absolute; inset: 0; }
  /* OFFSET, NOT CENTRED — a centred circle reads as a logo, this reads as a
     face in a flower. left 24 / top 22 are the relevé's own numbers. */
  .vt-hb .hb-photo {
    position: absolute; left: 24px; top: 22px; width: 110px; height: 110px;
    border-radius: 50%; overflow: hidden; background: var(--hb-rose-2);
    box-shadow: 0 0 0 3px #FFF6F4, 0 0 0 3.5px rgba(196,34,78,.5);
  }
  .vt-hb .hb-photo .vt-avatar-img { object-position: 50% 26%; }
  .vt-hb .hb-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: var(--hb-cram-d);
  }
  .vt-hb .hb-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 50px; color: var(--hb-rose);
  }
  .vt-hb .hb-col { position: relative; width: calc(100% - 158px); min-height: 236px; }
  .vt-hb .hb-kick {
    display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 700;
    letter-spacing: .18em; text-transform: uppercase; color: var(--hb-cram-d);
  }
  .vt-hb .hb-puce { flex: none; display: block; }
  .vt-hb .hb-bienv { margin-top: 9px; }
  .vt-hb .hb-bienv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px;
    color: #5E2438;
  }
  .vt-hb .hb-tiret {
    display: block; margin-top: 7px; width: 62px; height: 2.5px; border-radius: 2px;
    background: linear-gradient(90deg, var(--hb-cram) 0%, var(--hb-pollen) 100%);
  }
  .vt-hb .hb-name {
    margin-top: 10px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.02; letter-spacing: -.015em;
    color: var(--hb-prune);
  }
  .vt-hb .hb-name .vt-ent-acc { color: var(--hb-cram); }
  .vt-hb .hb-name.vt-ent-long { font-size: 24px; }
  .vt-hb .hb-verif { display: flex; align-items: center; gap: 7px; margin-top: 10px; font-size: 13px; font-weight: 700; color: var(--hb-prune); }
  .vt-hb .hb-verif-i {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 17px; height: 17px; border-radius: 50%; background: var(--hb-cram);
    box-shadow: 0 0 0 1.5px var(--hb-rose), 0 0 0 2.8px rgba(196,34,78,.4);
  }
  .vt-hb .hb-zone { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: 12.5px; color: #7E5563; }
  .vt-hb .hb-proof-wrap { margin-top: 12px; }
  .vt-hb .hb-proof {
    display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 34px;
    padding: 9px 15px; border-radius: 99px; background: #FFFAF6;
    box-shadow: inset 0 0 0 1.5px rgba(196,34,78,.4), 0 10px 20px -16px rgba(59,22,34,.5);
  }
  .vt-hb .hb-mini { flex: none; display: block; }
  .vt-hb .hb-proof-l { font-size: 13px; color: #6E4A56; }
  .vt-hb .hb-proof-l b { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 19px; color: var(--hb-cram-d); }
  .vt-hb .hb-stars { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: #9B7080; }
  /* THE COROLLA COCKADE — five petals at a 72° step around an ivory heart
     ringed in dotted pollen. In the column (ENTETES-K). */
  .vt-hb .hb-nouv-wrap { margin-top: 14px; }
  .vt-hb .hb-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 96px; height: 96px; transform: rotate(-3deg);
  }
  .vt-hb .hb-cocarde {
    position: absolute; inset: 0; border-radius: 50%;
    background: repeating-conic-gradient(from 0deg, var(--hb-cram) 0 26deg, var(--hb-cram-2) 26deg 36deg, transparent 36deg 72deg),
      repeating-conic-gradient(from 36deg, var(--hb-cram-2) 0 26deg, transparent 26deg 72deg);
    -webkit-mask-image: radial-gradient(circle, transparent 25px, #000 26px);
    mask-image: radial-gradient(circle, transparent 25px, #000 26px);
  }
  .vt-hb .hb-coeur {
    position: relative; display: flex; align-items: center; justify-content: center;
    width: 52px; height: 52px; border-radius: 50%; background: #FFFAF6;
    box-shadow: 0 0 0 2px rgba(242,201,76,.9);
  }
  .vt-hb .hb-nouv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 11.5px;
    line-height: 1.15; text-align: center; color: var(--hb-cram-d); max-width: 46px;
  }
  .vt-hb .hb-trust {
    display: flex; align-items: stretch; padding: 13px 4px; background: var(--hb-prune);
  }
  .vt-hb .hb-cell {
    flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 0 6px; text-align: center;
  }
  .vt-hb .hb-cell + .hb-cell { border-left: 1px solid rgba(255,238,240,.22); }
  .vt-hb .hb-cell-i {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--hb-rose);
  }
  .vt-hb .hb-cell-l { font-size: 11.5px; font-weight: 700; line-height: 1.2; color: #FFEEF0; }
  .vt-hb .hb-cell-s { font-size: 10px; line-height: 1.2; color: var(--hb-sous); }
  .vt-hb .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-hb .hb-hero { padding: 74px 12px 20px; }
    /* 140 at right 6 ⇒ the block owns past x=174, and the column stops at 160. */
    .vt-hb .hb-bloc { right: 6px; width: 140px; height: 150px; }
    .vt-hb .hb-fleur { width: 140px; height: 150px; }
    .vt-hb .hb-photo { left: 20px; top: 20px; width: 98px; height: 98px; }
    .vt-hb .hb-col { width: calc(100% - 142px); min-height: 224px; }
    .vt-hb .hb-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-hb .hb-name.vt-ent-long { font-size: 21px; }
    .vt-hb .hb-mono { font-size: 44px; }
    .vt-hb .hb-bienv-t { font-size: 16px; }
    .vt-hb .hb-trust { padding: 11px 2px; }
    .vt-hb .hb-cell { padding: 0 4px; gap: 5px; }
    .vt-hb .hb-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
