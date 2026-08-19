import { t } from '../../i18n';
import { iconCheckEnt, iconLockEnt, iconPinSolid, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
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
 * ENTETES-H · SÉRIE 5 — 27 · KARITÉ — « l'or des femmes ».
 *
 * SOURCE OF TRUTH: the id="karite" block of « En-tetes Boutique - Serie 5 »
 * and its « Relevé — Karité ». Origine: création originale — aucune image
 * source.
 *
 * SHEA BUTTER, DRAWN. Everything is round: a 230px butter blob behind the
 * photograph, a second soft blob low-left, and the portrait itself in a
 * CUSHION — `border-radius: 42%`, not a circle — with a leaf resting on its
 * edge. A shea branch in SVG (green stems, two bicoloured nuts) sits between
 * the title and the photo, over a scatter of nut-brown dots.
 *
 * THE ONE SÉRIE 5 STYLE AT THE 20px TIER. « Cinq colonnes fendues : nom > 14
 * caractères → taille fixe (27 : 20 px ; 26/28/29/30 : 24 px) ». Dunda, Bronze,
 * Calebasse and Pagne take 24; Karité alone takes 20, because its name is
 * Georgia rather than Bricolage and sets wider at the same size.
 *
 * The MINIMAL badge is a POT LABEL — a tilted white card with a dotted honey
 * rule inside it and a drop of honey. The relevé's intent line is the reason it
 * is not a chip like the others: « étiquette de pot artisanale ».
 *
 * Verified seal on its own line (série 4/5 convention). Bio not drawn.
 */

/** The shea branch — two stems and two bicoloured nuts, all vector. */
const branche = (): string =>
  '<svg class="ka-branche" aria-hidden="true" width="74" height="34" viewBox="0 0 74 34">' +
  '<path d="M4 30C18 30 26 22 34 12M34 12c6-6 14-8 22-8" fill="none" stroke="#7C9A5C" stroke-width="2" stroke-linecap="round"/>' +
  '<path d="M30 20c5-3 11-2 14 2-4 4-11 4-14-2z" fill="#7C9A5C"/>' +
  '<ellipse cx="52" cy="17" rx="9" ry="11" fill="#A67B4F"/><ellipse cx="52" cy="17" rx="4.5" ry="7" fill="#8A6238"/>' +
  '<ellipse cx="66" cy="26" rx="7" ry="8.5" fill="#A67B4F"/><ellipse cx="66" cy="26" rx="3.5" ry="5.5" fill="#8A6238"/></svg>';

/** A drop of honey — used on the surtitle pill and on the pot label. */
const goutte = (size: number): string =>
  `<svg class="i" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="#C98F2D"><path d="M12 2c4 6 7 9.5 7 13a7 7 0 11-14 0c0-3.5 3-7 7-13z"/></svg>`;

const feuille = (size: number, fill: string): string =>
  `<svg class="i" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}"><path d="M20 4C9 4 4 9 4 17c0 1 .2 2 .5 3C6 14 11 10 20 9c-7 3-11 7-13 12 9 1 17-4 17-17z"/></svg>`;

function render(v: Vals): string {
  const cell = (icon: string, tone: string, label: string, sub: string): string =>
    `<div class="ka-cell"><span class="ka-cell-i ka-cell-i--${tone}">${icon}</span><span class="ka-cell-l">${label}</span><span class="ka-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-ka" data-role="vitrine-hero">',
    '<div class="ka-hero">',
    '<span class="ka-blob-a" aria-hidden="true"></span>',
    '<span class="ka-blob-b" aria-hidden="true"></span>',
    '<span class="ka-pois" aria-hidden="true"></span>',
    // the cushion — border-radius 42%, never a circle
    '<div class="ka-photo-wrap">',
    `<div class="ka-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 28%')
      : `<div class="ka-motif"><span class="ka-mono">${v.mono}</span></div>`,
    '</div>',
    `<span class="ka-feuille">${feuille(22, '#7C9A5C')}</span>`,
    '</div>',
    '<div class="ka-col" data-role="vitrine-identity">',
    `<div class="ka-surtitre"><span class="ka-surtitre-p">${goutte(11)}<span>${t('vit.ka_pur')}</span></span></div>`,
    v.hasTag
      ? `<div class="ka-bienv"><span class="ka-bienv-t"><v>${v.tagline}</v></span>${feuille(13, '#7C9A5C')}</div>`
      : '',
    `<div class="ka-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    branche(),
    `<div class="ka-verif"><span class="ka-verif-i">${iconCheckEnt(9, '#FFFFFF', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="ka-zone">${iconPinSolid(12, '#C98F2D', '#FCF6E8')}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="ka-proof-wrap"><span class="ka-proof"><span class="ka-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="ka-stars" data-role="chip-avis">${iconStarEnt(10, '#7C9A5C')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="ka-nouv-wrap"><span class="ka-nouv" data-role="chip-nouvelle">${goutte(13)}<span class="ka-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="ka-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#FFFFFF', 2.1), 'f', t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#FFFFFF', 2.1), 'm', t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#FFFFFF', 2.1), 'n', t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'ka', '#4A3A22'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 27 · KARITÉ (série 5) ══════════════════════
     Relevé — beurre #FBF1DC→#F6E7C6 (blob #F1DCA8, page #FCF6E8) · brun cacao
     #4A3A22 / #6E5A3C · miel #C98F2D / #A67B29 · feuille #7C9A5C · noix
     #A67B4F / #8A6238. */
  .vt-ka {
    --ka-beurre-1: #FBF1DC; --ka-beurre-2: #F6E7C6; --ka-blob: #F1DCA8; --ka-page: #FCF6E8;
    --ka-cacao: #4A3A22; --ka-cacao-2: #6E5A3C;
    --ka-miel: #C98F2D; --ka-miel-2: #A67B29;
    --ka-feuille: #7C9A5C; --ka-noix: #A67B4F; --ka-noix-2: #8A6238;
    background: var(--ka-beurre-1);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad */
  .vt-ka .ka-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 16px;
    background: linear-gradient(160deg, var(--ka-beurre-1) 0%, var(--ka-beurre-2) 100%);
  }
  .vt-ka .ka-blob-a {
    position: absolute; top: 74px; right: -52px; width: 230px; height: 230px;
    border-radius: 46% 54% 52% 48% / 50% 44% 56% 50%; background: var(--ka-blob); opacity: .8;
  }
  .vt-ka .ka-blob-b {
    position: absolute; left: -46px; bottom: -30px; width: 150px; height: 130px;
    border-radius: 52% 48% 44% 56% / 46% 54% 46% 54%; background: var(--ka-blob); opacity: .5;
  }
  .vt-ka .ka-pois {
    position: absolute; left: 14px; bottom: 96px; width: 62px; height: 44px;
    background-image: radial-gradient(circle, rgba(166,123,79,.45) 1.4px, transparent 1.8px);
    background-size: 11px 11px;
  }
  /* THE CUSHION — border-radius 42%, deliberately NOT a circle */
  .vt-ka .ka-photo-wrap { position: absolute; top: 106px; right: 6px; width: 162px; height: 162px; }
  .vt-ka .ka-photo {
    position: absolute; inset: 0; border-radius: 42%; overflow: hidden;
    box-shadow: 0 0 0 4px var(--ka-page), 0 0 0 6px rgba(201,143,45,.55), 0 16px 34px -16px rgba(74,58,34,.4);
  }
  .vt-ka .ka-photo .vt-avatar-img { object-position: 50% 28%; }
  .vt-ka .ka-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--ka-blob);
    background-image: radial-gradient(circle, rgba(166,123,79,.4) 1.8px, transparent 2.2px);
    background-size: 15px 15px;
  }
  .vt-ka .ka-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 56px; line-height: 1; color: rgba(74,58,34,.4); }
  .vt-ka .ka-feuille { position: absolute; left: -6px; bottom: 22px; transform: rotate(-18deg); }
  .vt-ka .ka-col { position: relative; width: calc(100% - 156px); min-height: 240px; }
  .vt-ka .ka-surtitre { }
  .vt-ka .ka-surtitre-p {
    display: inline-flex; align-items: center; gap: 5px; padding: 4px 11px; border-radius: 99px;
    background: #FFFFFF; box-shadow: 0 6px 14px -8px rgba(74,58,34,.4);
    font-size: 9px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--ka-miel-2);
  }
  .vt-ka .ka-surtitre-p svg { flex: none; }
  .vt-ka .ka-bienv { margin-top: 8px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .vt-ka .ka-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px; color: var(--ka-miel); }
  .vt-ka .ka-name {
    margin-top: 6px;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(24px, 8.4cqw, 29px); line-height: 1.08;
    color: var(--ka-cacao); overflow-wrap: break-word;
  }
  /* THE SERIES' ONE 20px TIER — Georgia sets wider than Bricolage at the same
     size, which is why this style alone drops to 20 where the other four hold
     24 (« 27 : 20 px ; 26/28/29/30 : 24 px »). */
  .vt-ka .ka-name.vt-ent-long { font-size: 20px; }
  .vt-ka .ka-name .vt-ent-acc { color: var(--ka-miel); }
  .vt-ka .ka-branche { display: block; margin-top: 6px; }
  /* the dedicated verified line — série 4/5 convention */
  .vt-ka .ka-verif { margin-top: 8px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: var(--ka-cacao); }
  .vt-ka .ka-verif-i {
    width: 17px; height: 17px; flex: none; border-radius: 50%; background: var(--ka-feuille);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ka .ka-zone { margin-top: 6px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--ka-cacao-2); }
  .vt-ka .ka-zone svg { vertical-align: -2px; margin-right: 5px; }
  .vt-ka .ka-proof-wrap { margin-top: 11px; }
  .vt-ka .ka-proof {
    display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 9px 13px; border-radius: 16px; background: #FFFFFF;
    box-shadow: 0 10px 24px -14px rgba(74,58,34,.45);
  }
  /* THE RELEVÉ'S HONEY RING IS NOT DRAWN, and that is a deliberate subtraction.
     It exists to HOLD the count (« rond beurre cerclé miel “12” »), but the
     count arrives inside the ventesLine sentence and splitting that string to
     fill a circle would re-author a catalog string in markup. An empty ring
     beside the sentence carries no information and reads as a rendering bug —
     so the card keeps the sentence and drops the ring. */
  .vt-ka .ka-proof-l { font-size: 11px; line-height: 1.35; color: var(--ka-cacao-2); }
  .vt-ka .ka-proof-l b { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 13.5px; color: var(--ka-cacao); }
  .vt-ka .ka-stars { font-size: 10.5px; font-weight: 600; color: var(--ka-feuille); white-space: nowrap; }
  .vt-ka .ka-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — the POT LABEL: a tilted white card with a dotted honey rule
     inside it, not a chip like the rest of the set. « étiquette de pot
     artisanale » is the relevé's own intent. */
  .vt-ka .ka-nouv-wrap { margin-top: 12px; }
  .vt-ka .ka-nouv {
    display: inline-flex; align-items: center; gap: 8px; padding: 10px 15px; border-radius: 14px;
    background: #FFFFFF; transform: rotate(-2deg);
    box-shadow: 0 12px 26px -14px rgba(74,58,34,.5), inset 0 0 0 1.5px #FFFFFF;
    outline: 1.5px dashed rgba(201,143,45,.7); outline-offset: -6px;
  }
  .vt-ka .ka-nouv svg { flex: none; }
  .vt-ka .ka-nouv-t { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 13px; line-height: 1.2; color: var(--ka-cacao); }
  .vt-ka .ka-trust {
    position: relative; margin: 0 14px 16px; padding: 12px 3px; border-radius: 20px; background: #FFFFFF;
    box-shadow: 0 12px 28px -18px rgba(74,58,34,.45);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-ka .ka-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-ka .ka-cell-i {
    width: 38px; height: 38px; flex: none; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ka .ka-cell-i--f { background: var(--ka-feuille); }
  .vt-ka .ka-cell-i--m { background: var(--ka-miel); }
  .vt-ka .ka-cell-i--n { background: var(--ka-noix); }
  .vt-ka .ka-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: var(--ka-cacao); }
  .vt-ka .ka-cell-s { font-size: 8px; line-height: 1.25; color: var(--ka-miel-2); }
  .vt-ka .ka-btn { background: #FFFFFF; box-shadow: 0 4px 12px -3px rgba(74,58,34,.35); }
  .vt-ka .vt-ent-btn { top: 70px; }
  .vt-ka .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-ka .ka-hero { padding: 74px 12px 14px; }
    .vt-ka .ka-photo-wrap { top: 102px; right: 2px; width: 140px; height: 140px; }
    .vt-ka .ka-col { width: calc(100% - 132px); min-height: 224px; }
    .vt-ka .ka-name { font-size: clamp(21px, 8.4cqw, 26px); }
    .vt-ka .ka-name.vt-ent-long { font-size: 19px; }
    .vt-ka .ka-mono { font-size: 48px; }
    .vt-ka .ka-bienv-t { font-size: 16px; }
    .vt-ka .ka-trust { margin: 0 12px 14px; padding: 11px 2px; }
    .vt-ka .ka-cell { padding: 0 4px; gap: 5px; }
    .vt-ka .ka-cell-i { width: 33px; height: 33px; }
  }
`;

export const unit: EnteteUnit = { render, css };
