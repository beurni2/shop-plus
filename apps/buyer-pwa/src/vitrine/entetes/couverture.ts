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
 * ENTETES-L · SÉRIE 9 — 44 · COUVERTURE — « le magazine de mode ».
 *
 * SOURCE OF TRUTH: the id="couverture" block of « En-tetes Boutique - Serie 9 »
 * and its « Relevé — Couverture ». Origine: création originale.
 *
 * A FASHION COVER, AND THE DISCIPLINE IS THE POINT: strict duotone, ink and
 * printer's red on flat porcelain, and NOT ONE GRADIENT anywhere in the sheet.
 * Every other style in this app reaches for a gradient; this one is forbidden
 * them, and that is what makes it read as print rather than as screen.
 *
 * The masthead « L'Édition » is set 64px in OUTLINE — `-webkit-text-stroke` over
 * a .07 fill — turned vertical and left BEHIND the photograph, exactly as a
 * cover's title sits behind its subject. Two registration crosses and a column
 * rule complete the press furniture.
 *
 * THE PHOTOGRAPH IS FULL-HEIGHT, flush right, with a red flat offset behind it —
 * the mis-registration of a two-plate press. The controls float over it, as they
 * do on every photo-backed header here, and carry their own ground so they stay
 * legible on any image.
 *
 * MINIMAL is a printer's stamp, IN THE COLUMN (ENTETES-K: never on her face).
 * Verified seal on its own line. Bio not drawn. 24px tier past 14 characters.
 */

/** A registration cross — the mark a press uses to align its plates. */
const repere = (cls: string): string =>
  `<svg class="${cls}" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#141312" stroke-width="1">` +
  '<path d="M8 0v16M0 8h16"/><circle cx="8" cy="8" r="4.5"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="cv-cell"><span class="cv-cell-i">${icon}</span><span class="cv-cell-l">${label}</span><span class="cv-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-cv" data-role="vitrine-hero">',
    '<div class="cv-hero">',
    '<span class="cv-barre" aria-hidden="true"></span>',
    `<span class="cv-manchette" aria-hidden="true"><v>${t('vit.cv_manchette')}</v></span>`,
    '<span class="cv-filet-col" aria-hidden="true"></span>',
    '<span class="cv-filet-pied" aria-hidden="true"></span>',
    repere('cv-repere cv-repere--a'),
    repere('cv-repere cv-repere--b'),
    // full-height photograph, flush right, over its red mis-registration
    '<div class="cv-photo-wrap">',
    `<div class="cv-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 22%')
      : `<div class="cv-motif"><span class="cv-mono">${v.mono}</span><span class="cv-cale" aria-hidden="true"></span></div>`,
    '</div>',
    '</div>',
    '<div class="cv-col" data-role="vitrine-identity">',
    `<div class="cv-kicker"><span class="cv-puce" aria-hidden="true"></span><v>${t('vit.cv_kicker')}</v></div>`,
    `<div class="cv-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    v.hasTag
      ? `<div class="cv-bienv"><span class="cv-tiret" aria-hidden="true"></span><span class="cv-bienv-t"><v>${v.tagline}</v></span></div>`
      : '',
    `<div class="cv-verif"><span class="cv-verif-i">${iconCheckEnt(9, '#F4EFE6', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="cv-zone">${iconPinEnt(12, '#C8332A', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="cv-proof-wrap"><span class="cv-proof"><span class="cv-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="cv-stars" data-role="chip-avis">${iconStarEnt(10, '#C8332A')}${avisChip(v)}</span>`
            : ''
        }<span class="cv-codebarre" aria-hidden="true"></span></span></div>`
      : '',
    v.nouvelle
      ? `<div class="cv-nouv-wrap"><span class="cv-nouv" data-role="chip-nouvelle"><span class="cv-nouv-k"><v>${t('vit.cv_edition')}</v></span><span class="cv-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="cv-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#141312', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#141312', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#141312', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'cv', '#141312'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 44 · COUVERTURE (série 9) ══════════════════════
     Relevé — porcelaine #F4EFE6 · encre #141312 · rouge d'imprimeur #C8332A ·
     gris photo #E4DED2 · sous-lignes corail #E58B7B.
     BICHROMIE STRICTE, FOND PLAT — aucun degrade dans cette feuille. */
  .vt-cv {
    --cv-porcelaine: #F4EFE6; --cv-encre: #141312; --cv-rouge: #C8332A;
    --cv-gris: #E4DED2; --cv-corail: #E58B7B;
    background: var(--cv-porcelaine);
  }
  /* padding-top 76 = the relevé's 16 + the shell's 60 status pad */
  .vt-cv .cv-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 76px 14px 18px;
    background: var(--cv-porcelaine);
  }
  .vt-cv .cv-barre { position: absolute; left: 0; right: 0; top: 60px; height: 4px; background: var(--cv-rouge); }
  /* the masthead: outlined, vertical, and BEHIND the photograph */
  .vt-cv .cv-manchette {
    position: absolute; right: 106px; top: 78px;
    writing-mode: vertical-rl; text-orientation: mixed;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 64px; line-height: 1; letter-spacing: -.02em; text-transform: uppercase;
    color: rgba(20,19,18,.07); -webkit-text-stroke: 1.5px rgba(20,19,18,.14);
  }
  .vt-cv .cv-filet-col { position: absolute; left: 158px; top: 68px; bottom: 14px; width: 1px; background: rgba(20,19,18,.16); }
  .vt-cv .cv-filet-pied { position: absolute; left: 14px; right: 14px; bottom: 8px; height: 1px; background: rgba(20,19,18,.2); }
  .vt-cv .cv-repere { position: absolute; }
  .vt-cv .cv-repere--a { left: 16px; top: 70px; }
  .vt-cv .cv-repere--b { right: 16px; bottom: 10px; }
  /* THE PHOTOGRAPH — full height, flush right, its red flat offset behind it.
     The offset reaches 8px to the LEFT of the panel (shadow -14 with spread -6),
     so the column below clears x=202 at 360, not the panel's own 210. */
  .vt-cv .cv-photo-wrap { position: absolute; top: 84px; right: -14px; width: 150px; bottom: 0; }
  .vt-cv .cv-photo {
    position: absolute; inset: 0; overflow: hidden;
    box-shadow: 0 0 0 2px var(--cv-encre), -14px 14px 0 -6px var(--cv-rouge);
  }
  .vt-cv .cv-photo .vt-avatar-img { object-position: 50% 22%; }
  .vt-cv .cv-motif {
    position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 12px; background: var(--cv-gris);
  }
  /* MINIMAL avatar — a drop cap in OUTLINE, the cover's own lettering */
  .vt-cv .cv-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 92px; line-height: 1; color: transparent; -webkit-text-stroke: 2px var(--cv-encre);
  }
  .vt-cv .cv-cale { width: 26px; height: 4px; background: var(--cv-rouge); }
  /* THE COLUMN CLEARS THE RED FLAT, not the photo panel. */
  .vt-cv .cv-col { position: relative; width: calc(100% - 172px); min-height: 252px; }
  .vt-cv .cv-kicker {
    display: flex; align-items: center; gap: 6px;
    font-size: 9px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--cv-encre);
  }
  .vt-cv .cv-puce { width: 7px; height: 7px; flex: none; background: var(--cv-rouge); }
  .vt-cv .cv-name {
    margin-top: 8px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(30px, 10.6cqw, 36px); line-height: .98; letter-spacing: -.02em;
    text-transform: uppercase; color: var(--cv-encre); overflow-wrap: break-word;
  }
  .vt-cv .cv-name.vt-ent-long { font-size: 24px; }
  .vt-cv .cv-name .vt-ent-acc { color: var(--cv-rouge); }
  .vt-cv .cv-bienv { margin-top: 9px; display: flex; align-items: center; gap: 8px; }
  .vt-cv .cv-tiret { width: 58px; height: 2px; flex: none; background: var(--cv-rouge); }
  .vt-cv .cv-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px; color: var(--cv-encre); }
  .vt-cv .cv-verif { margin-top: 11px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--cv-encre); }
  .vt-cv .cv-verif-i {
    width: 15px; height: 15px; flex: none; border-radius: 50%; background: var(--cv-encre);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-cv .cv-zone { margin-top: 6px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: #3A362E; }
  .vt-cv .cv-zone svg { vertical-align: -2px; margin-right: 5px; }
  /* COMPLET — the price block: white, hard filet, hard shadow, then a barcode */
  .vt-cv .cv-proof-wrap { margin-top: 12px; }
  .vt-cv .cv-proof {
    display: inline-flex; align-items: center; gap: 9px; flex-wrap: wrap;
    padding: 8px 12px; background: #FFFFFF;
    box-shadow: inset 0 0 0 1.5px var(--cv-encre), 5px 5px 0 0 rgba(20,19,18,.16);
  }
  .vt-cv .cv-proof-l { font-size: 11px; line-height: 1.35; color: #3A362E; }
  .vt-cv .cv-proof-l b {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif;
    font-weight: 800; font-size: 19px; color: var(--cv-encre);
  }
  .vt-cv .cv-stars { font-size: 10.5px; font-weight: 700; color: var(--cv-rouge); white-space: nowrap; }
  .vt-cv .cv-stars svg { vertical-align: -1px; margin-right: 3px; }
  .vt-cv .cv-codebarre {
    width: 30px; height: 26px; flex: none;
    background-image: repeating-linear-gradient(90deg, var(--cv-encre) 0 1px, transparent 1px 2px, var(--cv-encre) 2px 3.5px, transparent 3.5px 6px);
  }
  /* MINIMAL — the printer's stamp, IN THE COLUMN */
  .vt-cv .cv-nouv-wrap { margin-top: 13px; }
  .vt-cv .cv-nouv {
    display: inline-flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 9px 16px; transform: rotate(-2deg);
    border: 2px solid var(--cv-rouge);
    box-shadow: inset 0 0 0 2.5px var(--cv-porcelaine), inset 0 0 0 3.5px rgba(200,51,42,.5);
  }
  .vt-cv .cv-nouv-k { font-size: 8px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: var(--cv-rouge); }
  .vt-cv .cv-nouv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 13px; color: var(--cv-rouge); }
  .vt-cv .cv-trust {
    position: relative; padding: 12px 3px; background: var(--cv-encre);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-cv .cv-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-cv .cv-cell + .cv-cell { border-left: 1px solid rgba(244,239,230,.22); }
  .vt-cv .cv-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--cv-porcelaine);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-cv .cv-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: var(--cv-porcelaine); }
  .vt-cv .cv-cell-s { font-size: 8px; line-height: 1.25; color: var(--cv-corail); }
  .vt-cv .cv-btn { background: var(--cv-porcelaine); box-shadow: inset 0 0 0 1.5px var(--cv-encre); }
  .vt-cv .vt-ent-btn { top: 70px; }
  .vt-cv .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-cv .cv-hero { padding: 76px 12px 16px; }
    .vt-cv .cv-photo-wrap { top: 84px; right: -12px; width: 132px; }
    /* same arithmetic at 320: panel at right -12, 132 wide, red flat 8 further
       left ⇒ it owns past x=180, and the column stops at 164 */
    .vt-cv .cv-col { width: calc(100% - 152px); min-height: 234px; }
    .vt-cv .cv-name { font-size: clamp(25px, 10.6cqw, 30px); }
    .vt-cv .cv-name.vt-ent-long { font-size: 21px; }
    .vt-cv .cv-manchette { right: 96px; font-size: 54px; }
    .vt-cv .cv-filet-col { left: 138px; }
    .vt-cv .cv-mono { font-size: 76px; }
    .vt-cv .cv-bienv-t { font-size: 16px; }
    .vt-cv .cv-tiret { width: 40px; }
    .vt-cv .cv-trust { padding: 11px 2px; }
    .vt-cv .cv-cell { padding: 0 4px; gap: 5px; }
    .vt-cv .cv-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
