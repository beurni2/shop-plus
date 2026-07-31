import { t } from '../../i18n';
import { iconCheckEnt, iconLockEnt, iconPinEnt, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
import {
  avisChip,
  controls,
  etatPhoto,
  framePhoto,
  hasPhoto,
  ventesLine,
  weldSeal,
  zoneLine,
  type Vals,
} from '../entetes';
import type { EnteteUnit } from './registry';

/**
 * ENTETES-H · SÉRIE 2 — 10 · KRAFT — « ticket artisan, polaroïd & tampon rouge ».
 *
 * SOURCE OF TRUTH: the id="kraft" block of « En-tetes Boutique - Serie 2 » and
 * its « Relevé — Kraft ». Origine: création originale série 2.
 *
 * A PARCEL TICKET. Kraft paper with a grain, a polaroid taped on at a slight
 * angle, and a detachable stub at the foot — the trust row sits BELOW a 2px
 * dashed tear line with a punched hole at each end. Everything that looks
 * physical here is CSS: the grain is a radial pattern, the tape is a
 * translucent rectangle, the rotations are static transforms.
 *
 * THE TAMPON IS THE VERIFICATION LINE. « Vendeuse vérifiée · {zone} » is not a
 * quiet caption on this style — it is stamped: dashed red frame, uppercase,
 * letter-spaced, rotated −2°. Long zones wrap INSIDE the frame rather than
 * stretching it, which is why it is an inline-flex with max-width 100 %.
 *
 * A SPLIT COLUMN like Safran, so the long-name rule applies: « nom > 14
 * caractères : 20 px fixe ». The polaroid owns the right 154px and the text
 * column takes what is left.
 *
 * THE PUNCHED HOLES ARE THE PAGE, NOT THE CARD. The relevé colours them
 * « couleur du fond hôte (démo #E7DFCE) » — the demo's own backdrop. Ours is
 * the vitrine page surface, #F4EFE6, because that is what actually sits behind
 * this header; the illusion only works if the hole shows the real page through.
 */

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="kr-cell"><span class="kr-cell-i">${icon}</span><span class="kr-cell-l">${label}</span><span class="kr-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-kr" data-role="vitrine-hero">',
    '<div class="kr-hero">',
    // the polaroid, taped on at 2.5° — square corners, generous bottom margin
    `<div class="kr-pola" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    '<div class="kr-pola-photo">',
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="kr-motif"><span class="kr-mono">${v.mono}</span></div>`,
    '</div>',
    '<span class="kr-ruban" aria-hidden="true"></span>',
    '</div>',
    '<div class="kr-col" data-role="vitrine-identity">',
    `<div class="kr-av" data-etat="${v.hasAvatar ? 'live' : 'none'}">`,
    v.hasAvatar
      ? framePhoto({ ...v, hasCover: false }, '50% 32%')
      : `<span class="kr-av-mono">${v.mono}</span>`,
    `<span class="kr-av-badge" aria-hidden="true">${iconCheckEnt(9, '#FFFFFF', 3.6)}</span>`,
    '</div>',
    `<div class="kr-name${v.longName ? ' vt-ent-long' : ''}">${weldSeal(v.tail, `<span class="kr-seal" aria-hidden="true"><span class="kr-seal-d">${iconCheckEnt(10, '#FFFFFF', 3.4)}</span><span class="kr-seal-f"></span></span>`)}</div>`,
    v.hasTag ? `<div class="kr-bienv"><v>${v.tagline}</v></div>` : '',
    // « Vendeuse vérifiée · {zone} » STAMPED — the style's verification mark
    `<div class="kr-tampon"><span>${zoneLine(v, iconPinEnt(10, '#BE3D2A', 2.6))}</span></div>`,
    v.hasBio ? `<div class="kr-bio"><v>${v.bio}</v></div>` : '',
    v.showProof
      ? `<div class="kr-proof"><span data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="kr-stars" data-role="chip-avis"> · ${iconStarEnt(11, '#D98E32')}${avisChip(v)}</span>`
            : ''
        }</div>`
      : '',
    v.nouvelle
      ? `<div class="kr-nouv-wrap"><span class="kr-nouv" data-role="chip-nouvelle">${iconStarEnt(15, '#BE3D2A')}<v>${t('vit.nouvelle_vendeuse')}</v></span></div>`
      : '',
    '</div>',
    // the tear line, punched at both ends — the stub below detaches
    '<div class="kr-perf" aria-hidden="true"><span class="kr-perf-g"></span><span class="kr-perf-d"></span></div>',
    '<div class="kr-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#33261A', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(16, '#33261A', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(16, '#33261A', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    controls(v, 'kr', 'right', '12px', '64px', '#33261A'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 10 · KRAFT (série 2) ══════════════════════
     Relevé — kraft #E9D9B8 (motif #E2CFA6, bande #F2E6CB, boutons #F6ECD3) ·
     encre #33261A · tampon #BE3D2A · terracotta #B4622A · étoile #D98E32 ·
     textes #6B583D / #8A7455 · blanc / #FFFDF6. Grain radial 1px encre .06,
     pas 7. */
  .vt-kr {
    --kr-kraft: #E9D9B8; --kr-motif: #E2CFA6; --kr-bande: #F2E6CB; --kr-btn: #F6ECD3;
    --kr-encre: #33261A; --kr-tampon: #BE3D2A; --kr-terracotta: #B4622A;
    --kr-etoile: #D98E32; --kr-t1: #6B583D; --kr-t2: #8A7455; --kr-blanc: #FFFDF6;
    background: var(--kr-kraft);
  }
  /* padding-top 76 = the relevé's 16 + the shell's 60 status pad. No bottom
     padding: the stub runs to the card's own edge. */
  .vt-kr .kr-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 76px 16px 0;
    background-color: var(--kr-kraft);
    background-image: radial-gradient(rgba(58,42,24,.06) 1px, transparent 1.4px);
    background-size: 7px 7px;
  }
  /* THE POLAROID — relevé top 62, + 60 for the status pad */
  .vt-kr .kr-pola {
    position: absolute; top: 122px; right: 10px; width: 138px;
    background: #FFFFFF; padding: 7px 7px 24px;
    box-shadow: 0 14px 30px -14px rgba(58,42,24,.5);
    transform: rotate(2.5deg);
  }
  .vt-kr .kr-pola-photo { position: relative; height: 132px; overflow: hidden; }
  .vt-kr .kr-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--kr-motif);
    background-image: repeating-linear-gradient(45deg, rgba(58,42,24,.18) 0 2px, transparent 2px 10px);
  }
  .vt-kr .kr-mono { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 52px; line-height: 1; color: rgba(58,42,24,.45); }
  /* the tape, straddling the top edge */
  .vt-kr .kr-ruban {
    position: absolute; top: -9px; left: 50%; width: 56px; height: 17px;
    transform: translateX(-50%) rotate(-4deg);
    background: rgba(255,255,255,.55); box-shadow: 0 1px 3px rgba(58,42,24,.2);
  }
  .vt-kr .kr-col { position: relative; width: calc(100% - 154px); min-height: 250px; }
  .vt-kr .kr-av {
    position: relative; width: 44px; height: 44px; border-radius: 50%;
    background: var(--kr-encre); box-shadow: 0 0 0 2px #FFFFFF;
  }
  .vt-kr .kr-av .vt-avatar-img { border-radius: 50%; }
  .vt-kr .kr-av-mono {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 21px; color: var(--kr-kraft);
  }
  .vt-kr .kr-av-badge {
    position: absolute; right: -3px; bottom: -2px; width: 17px; height: 17px; border-radius: 50%;
    background: var(--kr-tampon); border: 2px solid var(--kr-kraft);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-kr .kr-name {
    margin-top: 10px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(22px, 7.8cqw, 26px); line-height: 1.14; letter-spacing: -.02em;
    color: var(--kr-encre); overflow-wrap: break-word;
  }
  /* split column, so the fixed tier applies — the polaroid owns the right 154 */
  .vt-kr .kr-name.vt-ent-long { font-size: 20px; }
  .vt-kr .kr-name .vt-ent-acc { color: var(--kr-encre); }
  .vt-kr .kr-seal { position: relative; display: inline-flex; width: 18px; height: 18px; vertical-align: -2px; margin-left: 6px; }
  .vt-kr .kr-seal-d {
    position: absolute; inset: 0; border-radius: 50%; background: var(--kr-tampon);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-kr .kr-seal-f { position: absolute; inset: -2.5px; border-radius: 50%; border: 1.5px dashed rgba(190,61,42,.6); }
  .vt-kr .kr-bienv { margin-top: 3px; font-size: 13px; font-weight: 700; color: var(--kr-terracotta); }
  /* THE STAMP — a long zone wraps inside the frame, never stretches it */
  .vt-kr .kr-tampon {
    margin-top: 8px; display: inline-flex; max-width: 100%; transform: rotate(-2deg);
    border: 1.5px dashed var(--kr-tampon); border-radius: 8px; padding: 5px 9px;
    font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
    line-height: 1.45; color: var(--kr-tampon);
  }
  .vt-kr .kr-tampon svg { vertical-align: -1px; margin-right: 4px; }
  .vt-kr .kr-bio { margin-top: 9px; font-size: 12px; line-height: 1.5; color: var(--kr-t1); }
  .vt-kr .kr-proof { margin-top: 9px; font-size: 11.5px; line-height: 1.45; color: var(--kr-t1); }
  .vt-kr .kr-proof b { font-weight: 700; color: var(--kr-encre); }
  .vt-kr .kr-stars { white-space: nowrap; }
  .vt-kr .kr-stars svg { vertical-align: -1.5px; margin-right: 3px; }
  /* « alignée gauche (le polaroïd occupe la droite) » */
  .vt-kr .kr-nouv-wrap { margin-top: 12px; display: flex; justify-content: flex-start; }
  .vt-kr .kr-nouv {
    display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 15px;
    border-radius: 99px; background: #FFFFFF; box-shadow: 0 10px 24px -12px rgba(58,42,24,.5);
    font-size: 13px; font-weight: 700; color: var(--kr-encre); white-space: nowrap;
  }
  .vt-kr .kr-nouv svg { flex: none; }
  /* THE TEAR LINE. The holes are the PAGE surface (#F4EFE6), not the demo's
     backdrop: the punch only reads as a punch if it shows what is behind. */
  .vt-kr .kr-perf { position: relative; margin: 14px -16px 0; border-top: 2px dashed rgba(58,42,24,.32); }
  .vt-kr .kr-perf-g, .vt-kr .kr-perf-d {
    position: absolute; top: -10px; width: 18px; height: 18px; border-radius: 50%; background: #F4EFE6;
  }
  .vt-kr .kr-perf-g { left: -9px; }
  .vt-kr .kr-perf-d { right: -9px; }
  /* the detachable stub */
  .vt-kr .kr-trust {
    position: relative; margin: 0 -16px; padding: 12px 2px; background: var(--kr-bande);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-kr .kr-cell { padding: 0 7px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-kr .kr-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 8px;
    background: var(--kr-blanc); border: 1.5px solid var(--kr-encre);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-kr .kr-cell-l { font-size: 10px; font-weight: 700; line-height: 1.28; color: var(--kr-encre); }
  .vt-kr .kr-cell-s { font-size: 8.5px; line-height: 1.25; color: var(--kr-t2); }
  /* the buttons carry a real hairline BORDER here, not a shadow */
  .vt-kr .kr-btn { background: var(--kr-btn); border: 1.5px solid rgba(51,38,26,.35); }
  .vt-kr .vt-ent-btn { top: 72px; }
  .vt-kr .vt-ent-back { right: 12px; }

  @container (max-width: 339px) {
    .vt-kr .kr-hero { padding: 76px 12px 0; }
    .vt-kr .kr-pola { width: 124px; padding: 6px 6px 20px; }
    .vt-kr .kr-pola-photo { height: 118px; }
    .vt-kr .kr-mono { font-size: 46px; }
    .vt-kr .kr-col { width: calc(100% - 136px); }
    .vt-kr .kr-name { font-size: clamp(20px, 7.8cqw, 24px); }
    .vt-kr .kr-name.vt-ent-long { font-size: 19px; }
    .vt-kr .kr-perf { margin: 14px -12px 0; }
    .vt-kr .kr-trust { margin: 0 -12px; padding: 11px 1px; }
    .vt-kr .kr-cell { padding: 0 5px; gap: 5px; }
    .vt-kr .kr-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
