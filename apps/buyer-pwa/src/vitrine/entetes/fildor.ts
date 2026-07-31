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
 * ENTETES-L · SÉRIE 8 — 39 · FIL D'OR — « dan fani couture ».
 *
 * SOURCE OF TRUTH: the id="fildor" block of « En-tetes Boutique - Serie 8 » and
 * its « Relevé — Fil d'Or ». Origine: création originale — aucune image source.
 *
 * A LENGTH OF HAND-WOVEN DAN FANI, treated as a couture house treats cloth. The
 * weave is three superposed gradients and nothing else: a gold warp of 1px
 * threads at .13, an écru weft at .045, and 34px panel joins at .03. The left
 * SELVEDGE is the loom's own edge — gold, garance, écru — and the foot carries a
 * woven band and a fringe, so the cloth ends the way real cloth ends.
 *
 * THE PHOTOGRAPH IS A SEWN LABEL: a 146×184 panel on an écru facing, with a
 * dotted indigo topstitch inside it and a loop of gold thread at the top. The
 * facing reaches 9px beyond the panel on every side and is drawn with
 * box-shadow, so the column's clearance is measured from the FACING, not the
 * panel — the arithmetic that Calebasse cost this project.
 *
 * MINIMAL is an eyelet label: the tag a garment carries when it has no history
 * yet. It sits in the COLUMN, in the proof's own slot — never on her portrait,
 * which is the Fleurie lesson.
 *
 * Verified seal on its own line (the série 4/5/8/9 convention). Bio not drawn.
 * Split column ⇒ the 24px tier past 14 characters.
 */

/** The loop of gold thread at the label's head, with its needle. */
const aiguille = (): string =>
  '<svg class="fd-fil" aria-hidden="true" width="54" height="22" viewBox="0 0 54 22">' +
  '<path d="M2 18C10 18 14 10 22 7c7-2.6 14 1 18 6" fill="none" stroke="#CBA135" stroke-width="1.6" stroke-linecap="round"/>' +
  '<path d="M40 13l11-5-2 6z" fill="#CBA135"/><circle cx="22" cy="7" r="2.1" fill="none" stroke="#CBA135" stroke-width="1.4"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="fd-cell"><span class="fd-cell-i">${icon}</span><span class="fd-cell-l">${label}</span><span class="fd-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-fd" data-role="vitrine-hero">',
    '<div class="fd-hero">',
    '<span class="fd-lisiere" aria-hidden="true"></span>',
    '<span class="fd-bande" aria-hidden="true"></span>',
    '<span class="fd-frange" aria-hidden="true"></span>',
    // the sewn label — facing, topstitch, thread loop
    '<div class="fd-etiq-wrap">',
    `<div class="fd-etiq" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 24%')
      : `<div class="fd-motif"><span class="fd-mono">${v.mono}</span></div>`,
    '<span class="fd-piqure" aria-hidden="true"></span>',
    '</div>',
    '<span class="fd-boucle" aria-hidden="true"></span>',
    '<span class="fd-coin" aria-hidden="true"></span>',
    '</div>',
    '<div class="fd-col" data-role="vitrine-identity">',
    aiguille(),
    v.hasTag
      ? `<div class="fd-bienv"><span class="fd-bienv-t"><v>${v.tagline}</v></span><span class="fd-double" aria-hidden="true"></span></div>`
      : '',
    `<div class="fd-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="fd-verif"><span class="fd-verif-i">${iconCheckEnt(9, '#131A31', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="fd-zone">${iconPinEnt(12, '#93A3CE', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="fd-proof-wrap"><span class="fd-proof"><span class="fd-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="fd-stars" data-role="chip-avis">${iconStarEnt(10, '#CBA135')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="fd-nouv-wrap"><span class="fd-nouv" data-role="chip-nouvelle"><span class="fd-oeillet" aria-hidden="true"></span><span class="fd-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="fd-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#131A31', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#131A31', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#131A31', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'fd', 'right', '20px', '72px', '#F1E9D6'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 39 · FIL D'OR (série 8) ══════════════════════
     Relevé — indigo de nuit #1B2440 vers #131A31 (rangée #0A101E) · or file
     #CBA135 · ecru #F1E9D6 · garance #A3392C · sous-lignes #93A3CE. */
  .vt-fd {
    --fd-nuit: #1B2440; --fd-nuit-2: #131A31; --fd-rangee: #0A101E;
    --fd-or: #CBA135; --fd-ecru: #F1E9D6; --fd-garance: #A3392C; --fd-sous: #93A3CE;
    background: var(--fd-nuit-2);
  }
  /* THE WEAVE — warp, weft and panel joins, three gradients over the indigo.
     padding-top 74 = the relevé's 14 + the shell's 60 status pad. */
  .vt-fd .fd-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 70px;
    background-color: var(--fd-nuit);
    background-image:
      repeating-linear-gradient(90deg, rgba(203,161,53,.13) 0 1px, transparent 1px 10px),
      repeating-linear-gradient(0deg, rgba(241,233,214,.045) 0 1px, transparent 1px 10px),
      repeating-linear-gradient(90deg, rgba(241,233,214,.03) 0 1px, transparent 1px 34px),
      linear-gradient(158deg, var(--fd-nuit) 0%, var(--fd-nuit-2) 100%);
  }
  /* the loom's own edge, down the left */
  .vt-fd .fd-lisiere {
    position: absolute; left: 0; top: 0; bottom: 0; width: 7px;
    background-image: linear-gradient(180deg, var(--fd-or) 0 26%, var(--fd-garance) 26% 62%, var(--fd-ecru) 62% 100%);
  }
  /* the foot: a woven band, then the fringe */
  .vt-fd .fd-bande {
    position: absolute; left: 0; right: 0; bottom: 12px; height: 22px;
    background-image: repeating-linear-gradient(90deg, rgba(241,233,214,.5) 0 3px, rgba(203,161,53,.55) 3px 7px, transparent 7px 12px);
  }
  .vt-fd .fd-frange {
    position: absolute; left: 0; right: 0; bottom: 0; height: 12px;
    background-image: repeating-linear-gradient(90deg, rgba(241,233,214,.42) 0 1.5px, transparent 1.5px 6px);
  }
  /* THE SEWN LABEL. The facing is a box-shadow reaching 9px past the panel on
     every side, and NO layout box accounts for it — so the column below clears
     the FACING (x=193 at 360), never the 146 panel. */
  /* TOP 134, NOT 118, AND THE THREAD LOOP IS WHY. The loop hangs 18px
     ABOVE this box and no layout box accounts for it — the same class of
     arithmetic Calebasse's rim and the facing below already cost this project.
     At 118 the loop occupied y=100..122 and tangled with the share control,
     which owns y=70..114: the screenshot showed a stray gold arc wrapped round
     the button. At 134 the loop starts at 116 and the controls are clear.
     The label's foot lands at 318 = the column's own bottom (74 + 244), so the
     hero does not grow by a pixel. */
  .vt-fd .fd-etiq-wrap { position: absolute; top: 134px; right: 12px; width: 146px; height: 184px; }
  .vt-fd .fd-etiq {
    position: absolute; inset: 0; border-radius: 4px; overflow: hidden;
    box-shadow: 0 0 0 9px var(--fd-ecru), 0 14px 30px -16px rgba(10,16,30,.8);
  }
  .vt-fd .fd-etiq .vt-avatar-img { object-position: 50% 24%; }
  .vt-fd .fd-piqure {
    position: absolute; inset: 4px; border: 1.5px dashed rgba(19,26,49,.55); border-radius: 4px;
  }
  .vt-fd .fd-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: #16203A;
    background-image:
      repeating-linear-gradient(90deg, rgba(203,161,53,.34) 0 1px, transparent 1px 8px),
      repeating-linear-gradient(0deg, rgba(241,233,214,.2) 0 1px, transparent 1px 8px);
  }
  .vt-fd .fd-mono { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 54px; color: rgba(241,233,214,.72); }
  .vt-fd .fd-boucle {
    position: absolute; left: 50%; top: -18px; width: 22px; height: 22px; margin-left: -11px;
    border: 2px solid var(--fd-or); border-radius: 50%; border-bottom-color: transparent;
  }
  /* the garance selvedge, striped, at the label's bottom-right corner */
  .vt-fd .fd-coin {
    position: absolute; right: -9px; bottom: -9px; width: 34px; height: 12px;
    background-image: repeating-linear-gradient(90deg, var(--fd-garance) 0 4px, var(--fd-ecru) 4px 7px);
  }
  /* THE COLUMN CLEARS THE FACING: the label sits at right 12 and is 146 wide,
     and the écru facing reaches 9px further, so the label owns everything past
     x=193. 100% is the hero's PADDED box (332 at 360) — 168 off it lands the
     right edge at 178, fifteen clear. */
  .vt-fd .fd-col { position: relative; width: calc(100% - 168px); min-height: 244px; }
  .vt-fd .fd-fil { display: block; }
  .vt-fd .fd-bienv { margin-top: 5px; }
  .vt-fd .fd-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px; color: var(--fd-or); }
  /* the double thread: a solid gold rule with a dotted écru one offset below */
  .vt-fd .fd-double {
    display: block; margin-top: 5px; width: 78px; height: 4px;
    background-image:
      linear-gradient(90deg, var(--fd-or) 0 100%),
      repeating-linear-gradient(90deg, rgba(241,233,214,.75) 0 2px, transparent 2px 5px);
    background-size: 100% 2px, 100% 1.5px;
    background-position: 0 0, 3px 2.5px;
    background-repeat: no-repeat, repeat-x;
  }
  .vt-fd .fd-name {
    margin-top: 8px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.05; letter-spacing: -.015em;
    color: var(--fd-ecru); overflow-wrap: break-word;
  }
  .vt-fd .fd-name.vt-ent-long { font-size: 24px; }
  .vt-fd .fd-name .vt-ent-acc { color: var(--fd-or); }
  .vt-fd .fd-verif { margin-top: 11px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--fd-ecru); }
  .vt-fd .fd-verif-i {
    width: 15px; height: 15px; flex: none; border-radius: 50%; background: var(--fd-or);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-fd .fd-zone { margin-top: 6px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--fd-sous); }
  .vt-fd .fd-zone svg { vertical-align: -2px; margin-right: 5px; }
  /* COMPLET — a garment label: écru card, indigo filet, striped selvedge left */
  .vt-fd .fd-proof-wrap { margin-top: 12px; }
  .vt-fd .fd-proof {
    position: relative; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 9px 13px 9px 17px; border-radius: 3px;
    background: var(--fd-ecru); box-shadow: inset 0 0 0 1px rgba(19,26,49,.5);
  }
  .vt-fd .fd-proof::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 6px;
    background-image: repeating-linear-gradient(180deg, var(--fd-garance) 0 4px, var(--fd-ecru) 4px 7px, var(--fd-or) 7px 11px);
  }
  .vt-fd .fd-proof-l { font-size: 11px; line-height: 1.35; color: #3A3626; }
  .vt-fd .fd-proof-l b {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif;
    font-weight: 800; font-size: 19px; color: #10182E;
  }
  .vt-fd .fd-stars { font-size: 10.5px; font-weight: 700; color: #7A5F14; white-space: nowrap; }
  .vt-fd .fd-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — the eyelet label, IN THE COLUMN. Never on her portrait: a badge
     over a real seller's face is the defect ENTETES-K fixed on Fleurie. */
  .vt-fd .fd-nouv-wrap { margin-top: 12px; }
  .vt-fd .fd-nouv {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 8px 14px 8px 10px; border-radius: 3px; transform: rotate(-2deg);
    background: var(--fd-ecru); box-shadow: inset 0 0 0 1px rgba(19,26,49,.4), 0 8px 18px -12px rgba(10,16,30,.9);
  }
  .vt-fd .fd-oeillet {
    width: 13px; height: 13px; flex: none; border-radius: 50%;
    background: var(--fd-nuit-2); box-shadow: 0 0 0 2px var(--fd-or);
  }
  .vt-fd .fd-nouv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 13px; color: var(--fd-nuit-2); }
  .vt-fd .fd-trust {
    position: relative; padding: 12px 3px; background: var(--fd-rangee);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-fd .fd-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-fd .fd-cell + .fd-cell { border-left: 1px solid rgba(203,161,53,.3); }
  .vt-fd .fd-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--fd-or);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-fd .fd-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: var(--fd-ecru); }
  .vt-fd .fd-cell-s { font-size: 8px; line-height: 1.25; color: var(--fd-sous); }
  .vt-fd .fd-btn { background: rgba(19,26,49,.8); box-shadow: inset 0 0 0 1px rgba(203,161,53,.55); }
  .vt-fd .vt-ent-btn { top: 70px; }
  .vt-fd .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-fd .fd-hero { padding: 74px 12px 66px; }
    /* 134 here too — the controls band is 70..114 at BOTH widths, so the loop
       needs the same clearance, and 162 + 134 = 296 still sits inside the
       column's 300. */
    .vt-fd .fd-etiq-wrap { top: 134px; right: 10px; width: 128px; height: 162px; }
    /* same arithmetic at 320: label at right 10, 128 wide, facing 9 further out
       ⇒ it owns past x=173, and the column stops at 160 */
    .vt-fd .fd-col { width: calc(100% - 148px); min-height: 226px; }
    .vt-fd .fd-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-fd .fd-name.vt-ent-long { font-size: 21px; }
    .vt-fd .fd-mono { font-size: 46px; }
    .vt-fd .fd-bienv-t { font-size: 16px; }
    .vt-fd .fd-trust { padding: 11px 2px; }
    .vt-fd .fd-cell { padding: 0 4px; gap: 5px; }
    .vt-fd .fd-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
