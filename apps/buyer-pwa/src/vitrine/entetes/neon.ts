import { t } from '../../i18n';
import { iconCheckEnt, iconLockEnt, iconPinSolid, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
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
 * ENTETES-H · SÉRIE 3 — 16 · NÉON — « street noir & vert fluo, collage ».
 *
 * SOURCE OF TRUTH: the id="neon" block of « En-tetes Boutique - Serie 3 » and
 * its « Relevé — Néon ».
 *
 * A PASTED-UP WALL. Two dark scraps sit at angles under everything, two clouds
 * of fluo speckle scatter over them, and her photograph is taped on inside a
 * fluo-edged frame that glows. Between the identity and the trust band runs a
 * TORN PAPER EDGE — a `clip-path` zig-zag on a paper-coloured strip, which is
 * the one thing on this header that reads as physical.
 *
 * The contract's own named deviations, carried as written: the photoreal
 * poster wall becomes CSS scraps and grids, its drips are omitted, and the
 * brush lettering becomes Bricolage italic. The board's smiley and barcode are
 * omitted too — the relevé calls them « bruit ».
 *
 * SPLIT COLUMN, so the > 14 chars → 20px tier applies.
 *
 * « Street vibes » is English on the board. Per the same ruling taken on
 * Chrome's « LEVEL UP », the French Voice Standard (Execution Contract §10.5)
 * outranks the design brief, so the chip carries a French string from the
 * catalog. Flagged to the founder in the commit, reversible in one edit.
 *
 * Bio not drawn — série 3 shows a présentation on Perle and Artisan only.
 */

/** « Nouvelle vendeuse » as the board's two stacked chips — DERIVED from the
 *  catalog entry at its last space, separator preserved, never re-typed. */
function chipsEmpilees(): string {
  const s = t('vit.nouvelle_vendeuse').trim();
  const i = s.lastIndexOf(' ');
  if (i === -1) return `<span class="ne-chip ne-chip--f"><v>${s}</v></span>`;
  return (
    `<span class="ne-chip ne-chip--f"><v>${s.slice(0, i)}</v></span> ` +
    `<span class="ne-chip ne-chip--b"><v>${s.slice(i + 1)}</v></span>`
  );
}

/** The fluo cross of the collage. Drawn as an SVG, NOT as the multiplication
 *  glyph the relevé shows: Grand Teint §8 bans glyph characters in chrome, and
 *  the no-emoji gate caught the character version of this before it shipped —
 *  including inside a comment, because that gate reads comments too. Two
 *  strokes on a viewBox render identically and scale on a size token. */
const croix = (): string =>
  '<svg class="ne-croix" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">' +
  '<path d="M3 3l10 10M13 3L3 13" stroke="#CCFF14" stroke-width="2.2" stroke-linecap="round"/></svg>';

const couronne = (): string =>
  '<svg class="ne-couronne" aria-hidden="true" width="26" height="16" viewBox="0 0 26 16">' +
  '<path d="M2 14L1 3l6 4L13 1l6 6 6-4-1 11z" fill="none" stroke="#CCFF14" stroke-width="1.6" stroke-linejoin="round"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ne-cell"><span class="ne-cell-i">${icon}</span><span class="ne-cell-l">${label}</span><span class="ne-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-ne" data-role="vitrine-hero">',
    '<div class="ne-hero">',
    // the collage: two scraps, two speckle clouds, a fluo cross
    '<span class="ne-scrap-a" aria-hidden="true"></span>',
    '<span class="ne-scrap-b" aria-hidden="true"></span>',
    '<span class="ne-ecl-a" aria-hidden="true"></span>',
    '<span class="ne-ecl-b" aria-hidden="true"></span>',
    croix(),
    // her photograph, taped on inside a glowing fluo frame
    `<div class="ne-cadre" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 24%')
      : `<div class="ne-motif"><span class="ne-mono">${v.mono}</span></div>`,
    '<span class="ne-ruban ne-ruban--h" aria-hidden="true"></span>',
    '<span class="ne-ruban ne-ruban--b" aria-hidden="true"></span>',
    '</div>',
    `<span class="ne-street">${t('vit.ne_street')}</span>`,
    '<div class="ne-tete">',
    couronne(),
    '</div>',
    '<div class="ne-col" data-role="vitrine-identity">',
    `<div class="ne-name${v.longName ? ' vt-ent-long' : ''}">${weldSeal(v.tail, `<span class="ne-seal" aria-hidden="true">${iconCheckEnt(11, '#CCFF14', 3.2)}</span>`)}</div>`,
    '<span class="ne-brosse" aria-hidden="true"></span>',
    v.hasTag ? `<div class="ne-bienv"><span class="ne-bienv-c"><span class="ne-bienv-t"><v>${v.tagline}</v></span></span></div>` : '',
    `<div class="ne-zone">${zoneLine(v, iconPinSolid(12, '#CCFF14', '#121212'))}</div>`,
    v.showProof
      ? `<div class="ne-proof"><span data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="ne-stars" data-role="chip-avis"> · ${iconStarEnt(11, '#CCFF14')}${avisChip(v)}</span>`
            : ''
        }</div>`
      : '',
    v.nouvelle ? `<div class="ne-nouv" data-role="chip-nouvelle">${chipsEmpilees()}</div>` : '',
    '</div>',
    // THE TORN EDGE — a paper strip cut by a zig-zag clip-path
    '<span class="ne-dechirure" aria-hidden="true"></span>',
    '<div class="ne-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#121212', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#121212', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#121212', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    controls(v, 'ne', 'right', '20px', '72px', '#CCFF14'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 16 · NÉON (série 3) ══════════════════════
     Relevé — noir #121212 (scraps #1E1E1E / #1B1B1B, motif #1A1A1A, bande
     #181818) · vert fluo #CCFF14 · papier #F5F0E6 · adhésif gris
     rgba(190,190,185,.55–.65) · texte #D8D8D2. */
  .vt-ne {
    --ne-noir: #121212; --ne-scrap-a: #1E1E1E; --ne-scrap-b: #1B1B1B;
    --ne-motif: #1A1A1A; --ne-bande: #181818;
    --ne-fluo: #CCFF14; --ne-papier: #F5F0E6; --ne-txt: #D8D8D2;
    background: var(--ne-noir);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad. No bottom
     padding: the torn edge and the band run to the card's own edge. */
  .vt-ne .ne-hero { position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 0; background: var(--ne-noir); }
  .vt-ne .ne-scrap-a { position: absolute; left: -18px; top: 56px; width: 150px; height: 120px; background: var(--ne-scrap-a); transform: rotate(-5deg); }
  .vt-ne .ne-scrap-b { position: absolute; right: -24px; bottom: 96px; width: 132px; height: 104px; background: var(--ne-scrap-b); transform: rotate(4deg); }
  .vt-ne .ne-ecl-a {
    position: absolute; left: 10px; top: 190px; width: 84px; height: 64px;
    background-image:
      radial-gradient(circle, rgba(204,255,20,.5) 2px, transparent 2.4px),
      radial-gradient(circle, rgba(204,255,20,.22) 1.2px, transparent 1.5px);
    background-size: 22px 22px, 11px 11px;
  }
  .vt-ne .ne-ecl-b {
    position: absolute; right: 96px; top: 92px; width: 62px; height: 58px;
    background-image: radial-gradient(circle, rgba(204,255,20,.3) 1.6px, transparent 2px);
    background-size: 14px 14px;
  }
  .vt-ne .ne-croix { position: absolute; left: 120px; top: 96px; }
  /* THE TAPED FRAME — relevé top 58, + 60 for the status pad */
  .vt-ne .ne-cadre {
    position: absolute; top: 118px; right: 10px; width: 150px; height: 184px; overflow: visible;
    border: 3px solid var(--ne-fluo); box-shadow: 0 0 22px rgba(204,255,20,.35);
    transform: rotate(2deg); background: var(--ne-noir);
  }
  .vt-ne .ne-cadre .vt-cover-img, .vt-ne .ne-cadre .vt-avatar-img { object-position: 50% 24%; }
  .vt-ne .ne-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--ne-motif);
    background-image: radial-gradient(circle, rgba(204,255,20,.34) 2px, transparent 2.4px);
    background-size: 18px 18px;
  }
  .vt-ne .ne-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    font-size: 62px; line-height: 1; color: rgba(204,255,20,.55);
  }
  .vt-ne .ne-ruban { position: absolute; width: 54px; height: 16px; background: rgba(190,190,185,.6); }
  .vt-ne .ne-ruban--h { top: -8px; left: 14px; transform: rotate(-7deg); }
  .vt-ne .ne-ruban--b { bottom: -8px; right: 12px; transform: rotate(5deg); background: rgba(190,190,185,.55); }
  /* the paper chip under the frame */
  .vt-ne .ne-street {
    position: absolute; top: 312px; right: 22px; z-index: 2;
    display: inline-block; padding: 3px 10px; background: var(--ne-papier);
    transform: rotate(-6deg);
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 11.5px; color: var(--ne-noir);
    border-bottom: 2px solid var(--ne-fluo);
  }
  .vt-ne .ne-tete { position: relative; }
  .vt-ne .ne-couronne { display: block; }
  .vt-ne .ne-col { position: relative; margin-top: 10px; width: calc(100% - 158px); min-height: 252px; }
  .vt-ne .ne-name {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    font-size: clamp(24px, 8.4cqw, 29px); line-height: 1.06; letter-spacing: -.015em;
    color: #FFFFFF; overflow-wrap: break-word;
  }
  /* split column ⇒ the fixed tier applies */
  .vt-ne .ne-name.vt-ent-long { font-size: 20px; }
  .vt-ne .ne-name .vt-ent-acc { color: var(--ne-fluo); }
  .vt-ne .ne-seal {
    display: inline-flex; align-items: center; justify-content: center;
    width: 21px; height: 21px; border-radius: 50%; margin-left: 7px; vertical-align: -3px;
    box-shadow: inset 0 0 0 2.5px var(--ne-fluo);
  }
  .vt-ne .ne-brosse { display: block; width: 52px; height: 5px; margin-top: 7px; background: #FFFFFF; transform: rotate(-2deg); }
  .vt-ne .ne-bienv { margin-top: 10px; }
  .vt-ne .ne-bienv-c { display: inline-flex; min-height: 28px; align-items: center; padding: 4px 12px; background: var(--ne-fluo); transform: skew(-5deg); }
  .vt-ne .ne-bienv-t {
    transform: skew(5deg);
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    text-transform: uppercase; font-size: 12.5px; line-height: 1.2; color: var(--ne-noir);
  }
  .vt-ne .ne-zone { margin-top: 9px; font-size: 11px; font-weight: 600; line-height: 1.4; color: #FFFFFF; }
  .vt-ne .ne-zone svg { vertical-align: -2px; margin-right: 4px; }
  .vt-ne .ne-proof { margin-top: 9px; font-size: 11px; line-height: 1.4; color: var(--ne-txt); }
  .vt-ne .ne-proof b {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    font-size: 15px; color: var(--ne-fluo);
  }
  .vt-ne .ne-stars { white-space: nowrap; color: var(--ne-fluo); font-weight: 600; }
  .vt-ne .ne-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — the board's two stacked, offset chips. They sit in the text
     column, far from the control corner. */
  .vt-ne .ne-nouv { margin-top: 12px; display: flex; flex-direction: column; align-items: flex-start; }
  .vt-ne .ne-chip {
    display: inline-block; padding: 4px 11px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    text-transform: uppercase; font-size: 12.5px; line-height: 1.2; color: var(--ne-noir);
  }
  .vt-ne .ne-chip--f { background: var(--ne-fluo); transform: rotate(-3deg); }
  .vt-ne .ne-chip--b { background: #FFFFFF; transform: rotate(2deg); margin-left: 14px; margin-top: 2px; }
  /* THE TORN EDGE — a paper strip cut by a zig-zag, full width */
  .vt-ne .ne-dechirure {
    position: relative; display: block; margin: 14px -14px 0; height: 12px; background: var(--ne-papier);
    clip-path: polygon(0 0, 100% 0, 100% 55%, 96% 100%, 92% 55%, 88% 100%, 84% 55%, 80% 100%, 76% 55%, 72% 100%, 68% 55%, 64% 100%, 60% 55%, 56% 100%, 52% 55%, 48% 100%, 44% 55%, 40% 100%, 36% 55%, 32% 100%, 28% 55%, 24% 100%, 20% 55%, 16% 100%, 12% 55%, 8% 100%, 4% 55%, 0 100%);
  }
  .vt-ne .ne-trust {
    position: relative; margin: 0 -14px; padding: 12px 3px; background: var(--ne-bande);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-ne .ne-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-ne .ne-cell + .ne-cell { border-left: 2px solid var(--ne-fluo); }
  .vt-ne .ne-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--ne-fluo);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ne .ne-cell-l {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    text-transform: uppercase; font-size: 9.5px; line-height: 1.25; color: #FFFFFF;
  }
  .vt-ne .ne-cell-s { font-size: 8px; line-height: 1.25; color: var(--ne-fluo); }
  .vt-ne .ne-btn { background: rgba(18,18,18,.75); box-shadow: inset 0 0 0 1.5px var(--ne-fluo); }
  .vt-ne .vt-ent-btn { top: 70px; }
  .vt-ne .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-ne .ne-hero { padding: 74px 12px 0; }
    .vt-ne .ne-cadre { top: 114px; right: 8px; width: 130px; height: 162px; }
    .vt-ne .ne-street { top: 288px; right: 16px; font-size: 10.5px; }
    .vt-ne .ne-col { width: calc(100% - 134px); min-height: 236px; }
    .vt-ne .ne-name { font-size: clamp(21px, 8.4cqw, 26px); }
    .vt-ne .ne-name.vt-ent-long { font-size: 19px; }
    .vt-ne .ne-mono { font-size: 52px; }
    .vt-ne .ne-dechirure { margin: 14px -12px 0; }
    .vt-ne .ne-trust { margin: 0 -12px; padding: 11px 2px; }
    .vt-ne .ne-cell { padding: 0 4px; gap: 5px; }
    .vt-ne .ne-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
