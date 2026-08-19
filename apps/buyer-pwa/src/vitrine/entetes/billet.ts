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
 * ENTETES-L · SÉRIE 9 — 45 · BILLET — « la gravure fiduciaire ».
 *
 * SOURCE OF TRUTH: the id="billet" block of « En-tetes Boutique - Serie 9 » and
 * its « Relevé — Billet ». Origine: création originale.
 *
 * BANKNOTE INTAGLIO, AND IT IS ALL LINE — the relevé is explicit that no dark
 * flat may appear in the hero. The paper's own moiré is two `repeating-linear`
 * trames one degree apart; the great GUILLOCHE behind the portrait is a
 * `repeating-conic` of rays crossed with a `repeating-radial` of rings, then
 * dissolved back into the paper by a radial mask. That dissolve is what keeps it
 * ornament instead of noise.
 *
 * THE PORTRAIT IS AN ENGRAVED OVAL, and in the COMPLET state it carries an
 * intaglio hatch OVER the photograph — the way a bank note prints a face.
 *
 * MINIMAL is a SPÉCIMEN overprint, in the column. Never over her portrait
 * (ENTETES-K). Verified seal on its own line. Bio not drawn. 24px tier past 14.
 */

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="bi-cell"><span class="bi-cell-i">${icon}</span><span class="bi-cell-l">${label}</span><span class="bi-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-bi" data-role="vitrine-hero">',
    '<div class="bi-hero">',
    '<span class="bi-guilloche bi-guilloche--a" aria-hidden="true"></span>',
    '<span class="bi-guilloche bi-guilloche--b" aria-hidden="true"></span>',
    '<span class="bi-coupe bi-coupe--h" aria-hidden="true"></span>',
    '<span class="bi-coupe bi-coupe--b" aria-hidden="true"></span>',
    '<span class="bi-lisere" aria-hidden="true"></span>',
    // the engraved oval
    '<div class="bi-ovale-wrap">',
    `<div class="bi-ovale" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 25%')
      : `<div class="bi-motif"><span class="bi-mono">${v.mono}</span></div>`,
    '<span class="bi-taille" aria-hidden="true"></span>',
    '</div>',
    '</div>',
    '<div class="bi-col" data-role="vitrine-identity">',
    v.hasTag
      ? `<div class="bi-bienv"><span class="bi-bienv-t"><v>${v.tagline}</v></span><span class="bi-micro" aria-hidden="true"></span></div>`
      : '',
    `<div class="bi-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="bi-verif"><span class="bi-verif-i">${iconCheckEnt(9, '#EDE6D2', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="bi-zone">${iconPinEnt(12, '#1F5148', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="bi-proof-wrap"><span class="bi-proof"><span class="bi-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="bi-stars" data-role="chip-avis">${iconStarEnt(10, '#9C4A26')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="bi-nouv-wrap"><span class="bi-nouv" data-role="chip-nouvelle"><span class="bi-nouv-k"><v>${t('vit.bi_specimen')}</v></span><span class="bi-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="bi-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#1F5148', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#1F5148', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#1F5148', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'bi', '#17342E'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 45 · BILLET (série 9) ══════════════════════
     Relevé — papier #EDE6D2 (chip #F4EFDE) · encre sarcelle #1F5148 / texte
     #17342E (rangee #143B34) · encre terre #9C4A26 · sous-lignes #A8C3B8.
     BICHROMIE TAILLE-DOUCE — que du trait, aucun aplat sombre dans le heros. */
  .vt-bi {
    --bi-papier: #EDE6D2; --bi-chip: #F4EFDE;
    --bi-sarcelle: #1F5148; --bi-texte: #17342E; --bi-rangee: #143B34;
    --bi-terre: #9C4A26; --bi-sous: #A8C3B8;
    background: var(--bi-papier);
  }
  /* the paper's moiré: two trames three degrees apart, interfering.
     padding-top 76 = the relevé's 16 + the shell's 60 status pad. */
  .vt-bi .bi-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 76px 14px 58px;
    background-color: var(--bi-papier);
    background-image:
      repeating-linear-gradient(0deg, rgba(31,81,72,.07) 0 1px, transparent 1px 6px),
      repeating-linear-gradient(3deg, rgba(31,81,72,.06) 0 1px, transparent 1px 6px);
  }
  /* THE GUILLOCHE — rays crossed with rings, dissolved back into the paper by a
     radial mask. Without the dissolve it reads as noise, not as engraving. */
  .vt-bi .bi-guilloche {
    position: absolute; border-radius: 50%;
    background-image:
      radial-gradient(circle, transparent 40%, var(--bi-papier) 71%),
      repeating-radial-gradient(circle, rgba(31,81,72,.26) 0 1px, transparent 1px 4.5px),
      repeating-conic-gradient(rgba(31,81,72,.3) 0 .7deg, transparent .7deg 3.8deg);
  }
  .vt-bi .bi-guilloche--a { width: 250px; height: 250px; right: -52px; top: -8px; }
  .vt-bi .bi-guilloche--b {
    width: 200px; height: 200px; left: -58px; bottom: -46px;
    background-image:
      radial-gradient(circle, transparent 40%, var(--bi-papier) 71%),
      repeating-conic-gradient(rgba(156,74,38,.22) 0 .8deg, transparent .8deg 4.2deg);
  }
  .vt-bi .bi-coupe { position: absolute; left: 10px; right: 10px; height: 1px; background-image: repeating-linear-gradient(90deg, rgba(31,81,72,.5) 0 4px, transparent 4px 8px); }
  .vt-bi .bi-coupe--h { top: 68px; }
  .vt-bi .bi-coupe--b { bottom: 50px; }
  .vt-bi .bi-lisere {
    position: absolute; inset: 4px; border-radius: 20px; border: 1px solid rgba(31,81,72,.5);
  }
  .vt-bi .bi-lisere::after {
    content: ''; position: absolute; inset: 4px; border-radius: 17px; border: 1px solid rgba(31,81,72,.22);
  }
  /* THE ENGRAVED OVAL. The outer filet is a box-shadow reaching 8px past the
     oval, so the column clears x=196 at 360, not the 142 panel's own edge. */
  .vt-bi .bi-ovale-wrap { position: absolute; top: 122px; right: 14px; width: 142px; height: 176px; }
  .vt-bi .bi-ovale {
    position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
    box-shadow: 0 0 0 1.5px rgba(31,81,72,.6), 0 0 0 4px var(--bi-papier), 0 0 0 5.5px rgba(31,81,72,.5), 0 0 0 8px var(--bi-papier);
  }
  .vt-bi .bi-ovale .vt-avatar-img { object-position: 50% 25%; }
  /* the intaglio hatch, printed OVER the photograph as a bank note prints a face */
  .vt-bi .bi-taille {
    position: absolute; inset: 0; border-radius: 50%;
    background-image: repeating-linear-gradient(0deg, rgba(31,81,72,.16) 0 1px, transparent 1px 3.5px);
  }
  .vt-bi .bi-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--bi-chip);
    background-image:
      radial-gradient(circle, var(--bi-chip) 26%, transparent 27%),
      repeating-conic-gradient(rgba(31,81,72,.42) 0 .9deg, transparent .9deg 4deg);
  }
  .vt-bi .bi-mono { position: relative; font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 50px; color: var(--bi-sarcelle); }
  /* THE COLUMN CLEARS THE OUTER FILET, not the oval. */
  .vt-bi .bi-col { position: relative; width: calc(100% - 172px); min-height: 240px; }
  .vt-bi .bi-bienv { margin-top: 2px; }
  .vt-bi .bi-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px; color: var(--bi-sarcelle); }
  /* the microtext rule — dashes 3/5, the line a note carries under its legend */
  .vt-bi .bi-micro {
    display: block; margin-top: 5px; width: 84px; height: 2px;
    background-image: repeating-linear-gradient(90deg, rgba(31,81,72,.7) 0 3px, transparent 3px 5px);
  }
  .vt-bi .bi-name {
    margin-top: 8px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.05; letter-spacing: -.015em;
    color: var(--bi-texte); overflow-wrap: break-word;
  }
  .vt-bi .bi-name.vt-ent-long { font-size: 24px; }
  .vt-bi .bi-name .vt-ent-acc { color: var(--bi-terre); }
  .vt-bi .bi-verif { margin-top: 11px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--bi-texte); }
  .vt-bi .bi-verif-i {
    width: 15px; height: 15px; flex: none; border-radius: 50%; background: var(--bi-sarcelle);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-bi .bi-zone { margin-top: 6px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: #2E4A42; }
  .vt-bi .bi-zone svg { vertical-align: -2px; margin-right: 5px; }
  /* COMPLET — the struck value: a plate with a double filet, the count ringed */
  .vt-bi .bi-proof-wrap { margin-top: 12px; }
  .vt-bi .bi-proof {
    display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 9px 14px; border-radius: 4px; background: var(--bi-chip);
    box-shadow: inset 0 0 0 1px rgba(31,81,72,.45), inset 0 0 0 3px var(--bi-chip), inset 0 0 0 4px rgba(31,81,72,.45);
  }
  .vt-bi .bi-proof-l { font-size: 11px; line-height: 1.35; color: #2E4A42; }
  .vt-bi .bi-proof-l b {
    position: relative; display: inline-block; padding: 0 5px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif;
    font-weight: 800; font-size: 20px; color: var(--bi-terre);
    border: 1px solid rgba(156,74,38,.4); border-radius: 50%;
  }
  .vt-bi .bi-stars { font-size: 10.5px; font-weight: 700; color: var(--bi-terre); white-space: nowrap; }
  .vt-bi .bi-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — the SPÉCIMEN overprint, IN THE COLUMN */
  .vt-bi .bi-nouv-wrap { margin-top: 13px; }
  .vt-bi .bi-nouv {
    display: inline-flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 9px 16px; transform: rotate(2deg);
    border: 1.5px solid var(--bi-sarcelle);
    box-shadow: inset 0 0 0 2.5px var(--bi-papier), inset 0 0 0 3.5px rgba(31,81,72,.45);
  }
  .vt-bi .bi-nouv-k { font-size: 8px; font-weight: 700; letter-spacing: .24em; text-transform: uppercase; color: var(--bi-sarcelle); }
  .vt-bi .bi-nouv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 13px; color: var(--bi-sarcelle); }
  .vt-bi .bi-trust {
    position: relative; padding: 12px 3px; background: var(--bi-rangee);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-bi .bi-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-bi .bi-cell + .bi-cell { border-left: 1px solid rgba(237,230,210,.25); }
  .vt-bi .bi-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--bi-papier);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-bi .bi-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: var(--bi-papier); }
  .vt-bi .bi-cell-s { font-size: 8px; line-height: 1.25; color: var(--bi-sous); }
  .vt-bi .bi-btn { background: rgba(237,230,210,.92); box-shadow: inset 0 0 0 1.5px rgba(31,81,72,.6); }
  .vt-bi .vt-ent-btn { top: 70px; }
  .vt-bi .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-bi .bi-hero { padding: 76px 12px 54px; }
    .vt-bi .bi-ovale-wrap { top: 118px; right: 12px; width: 124px; height: 154px; }
    /* same arithmetic at 320: oval at right 12, 124 wide, filet 8 further ⇒ it
       owns past x=176, and the column stops at 158 */
    .vt-bi .bi-col { width: calc(100% - 150px); min-height: 222px; }
    .vt-bi .bi-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-bi .bi-name.vt-ent-long { font-size: 21px; }
    .vt-bi .bi-mono { font-size: 44px; }
    .vt-bi .bi-bienv-t { font-size: 16px; }
    .vt-bi .bi-guilloche--a { width: 210px; height: 210px; right: -60px; }
    .vt-bi .bi-trust { padding: 11px 2px; }
    .vt-bi .bi-cell { padding: 0 4px; gap: 5px; }
    .vt-bi .bi-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
