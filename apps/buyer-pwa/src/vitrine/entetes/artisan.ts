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
 * ENTETES-H · SÉRIE 3 — 18 · ARTISAN — « cadre cuir gravé, panneau vert, or ».
 *
 * SOURCE OF TRUTH: the id="artisan" block of « En-tetes Boutique - Serie 3 »
 * and its « Relevé — Artisan ».
 *
 * A FRAMED PANEL. A 10px leather border — engraved with a CSS grid and gold
 * dots — wraps a deep-green panel with a gold hairline inset. Her photograph
 * fills the right column with its LEFT edge arched (a 130px radius on that side
 * only), which is the detail that makes the whole thing read as tooled rather
 * than drawn.
 *
 * THE SECOND OF THE TWO STYLES THAT DRAW HER PRÉSENTATION — « seuls visuels qui
 * la montrent », with Perle. The other eight assert it absent.
 *
 * The relevé's named deviations, carried as written: photoreal engraved leather
 * becomes a CSS grid, and the board's plant and blurred background are dropped
 * — « hors cadre (rien à l'exécution) ».
 *
 * The motto « ARTISANAT · AUTHENTICITÉ · CONFIANCE » is a fixed decorative
 * string of the board. It is already French, so unlike Chrome's « LEVEL UP » it
 * needs no ruling — it goes in the catalog with a register tag like every
 * user-facing string.
 *
 * SPLIT COLUMN, so the > 14 chars → 20px tier applies.
 */

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ar-cell"><span class="ar-cell-i">${icon}</span><span class="ar-cell-l">${label}</span><span class="ar-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-ar" data-role="vitrine-hero">',
    '<div class="ar-cuir">',
    '<div class="ar-panneau">',
    // the right column, arched on its left edge
    `<div class="ar-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '56% 22%')
      : `<div class="ar-motif"><span class="ar-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="ar-col" data-role="vitrine-identity">',
    `<div class="ar-av" data-etat="${v.hasAvatar ? 'live' : 'none'}">`,
    v.hasAvatar
      ? framePhoto({ ...v, hasCover: false }, '50% 30%')
      : `<span class="ar-av-mono">${v.mono}</span>`,
    '</div>',
    `<div class="ar-name${v.longName ? ' vt-ent-long' : ''}">${weldSeal(v.tail, `<span class="ar-seal" aria-hidden="true"><span class="ar-seal-d">${iconCheckEnt(10, '#22392C', 3.4)}</span><span class="ar-seal-f"></span></span>`)}</div>`,
    v.hasTag
      ? `<div class="ar-bienv"><span class="ar-fil" aria-hidden="true"></span><span class="ar-bienv-t"><v>${v.tagline}</v></span><span class="ar-fil" aria-hidden="true"></span></div>`
      : '',
    `<div class="ar-zone">${zoneLine(v, iconPinSolid(11, '#C9A45C', '#22392C'))}</div>`,
    '<div class="ar-filet" aria-hidden="true"><span></span><i></i><span></span></div>',
    // THE PRÉSENTATION — Artisan and Perle only
    v.hasBio ? `<div class="ar-bio"><v>${v.bio}</v></div>` : '',
    v.showProof
      ? `<div class="ar-proof"><span data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="ar-stars" data-role="chip-avis"> · ${iconStarEnt(11, '#C9A45C')}${avisChip(v)}</span>`
            : ''
        }<span class="ar-pinceau" aria-hidden="true"></span></div>`
      : '',
    v.nouvelle
      ? `<div class="ar-nouv-wrap"><span class="ar-nouv" data-role="chip-nouvelle"><span class="ar-nouv-i">${iconStarEnt(13, '#F3EBD8')}</span><span class="ar-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '<div class="ar-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#C9A45C', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#C9A45C', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#C9A45C', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    `<div class="ar-devise" aria-hidden="true"><i></i><span>${t('vit.ar_devise')}</span><i></i></div>`,
    '</div>',
    '</div>',
    controls(v, 'ar', 'right', '20px', '72px', '#F3EBD8'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 18 · ARTISAN (série 3) ══════════════════════
     Relevé — cuir #5C3A1E (trame gravée or .13–.16) · vert profond #22392C
     (radial #2B4636→#1C3024, motif #24382C) · or #C9A45C / clair #E7C98A ·
     crème #F3EBD8 (sceau #E9DCC3) · terracotta #C96F2C · encre #2B2418 ·
     textes #EFE6D2 / #8A7455. */
  .vt-ar {
    --ar-cuir: #5C3A1E; --ar-vert: #22392C; --ar-vert-2: #2B4636; --ar-vert-3: #1C3024;
    --ar-motif: #24382C; --ar-or: #C9A45C; --ar-or-clair: #E7C98A;
    --ar-creme: #F3EBD8; --ar-sceau: #E9DCC3; --ar-terracotta: #C96F2C;
    --ar-encre: #2B2418; --ar-t1: #EFE6D2; --ar-t2: #8A7455;
    background: var(--ar-cuir);
  }
  /* THE LEATHER FRAME — 10px all round, engraved with a CSS grid and gold
     dots. padding-top 70 = the relevé's 10 + the shell's 60 status pad. */
  .vt-ar .ar-cuir {
    position: relative; overflow: hidden; margin-top: -60px; padding: 70px 10px 10px;
    background-color: var(--ar-cuir);
    background-image:
      repeating-linear-gradient(0deg, rgba(201,164,92,.13) 0 1px, transparent 1px 9px),
      repeating-linear-gradient(90deg, rgba(201,164,92,.13) 0 1px, transparent 1px 9px),
      radial-gradient(circle, rgba(201,164,92,.16) 1px, transparent 1.4px);
    background-size: auto, auto, 18px 18px;
  }
  .vt-ar .ar-panneau {
    position: relative; overflow: hidden; border-radius: 20px;
    background: radial-gradient(120% 90% at 30% 0%, var(--ar-vert-2) 0%, var(--ar-vert-3) 100%);
    box-shadow: inset 0 0 0 1px rgba(201,164,92,.55);
  }
  /* the right column, ARCHED on its left edge only — the tooled detail */
  .vt-ar .ar-photo {
    position: absolute; top: 0; right: 0; bottom: 0; width: 126px; overflow: hidden;
    border-radius: 130px 0 0 130px; box-shadow: inset 1px 0 0 rgba(201,164,92,.55);
  }
  .vt-ar .ar-photo .vt-avatar-img { object-position: 56% 22%; }
  .vt-ar .ar-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--ar-motif);
    background-image: repeating-conic-gradient(rgba(201,164,92,.22) 0% 25%, transparent 0% 50%);
    background-size: 16px 16px;
  }
  .vt-ar .ar-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 56px; line-height: 1; color: rgba(201,164,92,.38); }
  .vt-ar .ar-col { position: relative; width: calc(100% - 132px); padding: 16px 0 16px 16px; }
  .vt-ar .ar-av {
    position: relative; width: 44px; height: 44px; border-radius: 50%;
    background: var(--ar-vert-3); box-shadow: 0 0 0 1.5px var(--ar-or);
  }
  .vt-ar .ar-av .vt-avatar-img { border-radius: 50%; }
  .vt-ar .ar-av-mono {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 20px; color: var(--ar-or-clair);
  }
  .vt-ar .ar-name {
    margin-top: 10px;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(24px, 8.4cqw, 29px); line-height: 1.08;
    color: var(--ar-or-clair); overflow-wrap: break-word;
  }
  /* split column ⇒ the fixed tier applies */
  .vt-ar .ar-name.vt-ent-long { font-size: 20px; }
  .vt-ar .ar-name .vt-ent-acc { color: var(--ar-or-clair); }
  .vt-ar .ar-seal { position: relative; display: inline-flex; width: 19px; height: 19px; vertical-align: -2px; margin-left: 7px; }
  .vt-ar .ar-seal-d {
    position: absolute; inset: 0; border-radius: 50%; background: var(--ar-sceau);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ar .ar-seal-f { position: absolute; inset: -2.5px; border-radius: 50%; border: 1.5px dashed rgba(201,164,92,.6); }
  .vt-ar .ar-bienv { margin-top: 7px; display: flex; align-items: center; gap: 8px; }
  .vt-ar .ar-fil { flex: 1; max-width: 22px; height: 1px; background: rgba(201,164,92,.5); }
  .vt-ar .ar-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 14.5px; color: var(--ar-or); }
  .vt-ar .ar-zone { margin-top: 7px; font-size: 10.5px; font-weight: 500; line-height: 1.4; color: var(--ar-creme); }
  .vt-ar .ar-zone svg { vertical-align: -1.5px; margin-right: 4px; }
  .vt-ar .ar-filet { margin-top: 9px; display: flex; align-items: center; gap: 7px; }
  .vt-ar .ar-filet span { flex: 1; border-top: 1px dotted rgba(201,164,92,.55); }
  .vt-ar .ar-filet i { width: 5px; height: 5px; flex: none; background: var(--ar-or); transform: rotate(45deg); }
  /* THE PRÉSENTATION — Artisan and Perle only */
  .vt-ar .ar-bio { margin-top: 9px; font-size: 11.5px; line-height: 1.5; color: var(--ar-creme); }
  .vt-ar .ar-proof { position: relative; margin-top: 10px; padding-bottom: 8px; font-size: 11px; line-height: 1.45; color: var(--ar-creme); }
  .vt-ar .ar-proof b { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 16px; color: var(--ar-or); }
  .vt-ar .ar-stars { white-space: nowrap; color: var(--ar-or); font-weight: 600; }
  .vt-ar .ar-stars svg { vertical-align: -1.5px; margin-right: 3px; }
  /* the brush stroke under the proof — the board's own mark */
  .vt-ar .ar-pinceau { position: absolute; left: 0; bottom: 0; width: 44px; height: 3px; background: var(--ar-terracotta); border-radius: 2px; }
  /* MINIMAL — the cream pennant, notched on its right edge */
  .vt-ar .ar-nouv-wrap { margin-top: 12px; }
  .vt-ar .ar-nouv {
    display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 5px 22px 5px 12px;
    background: var(--ar-creme); clip-path: polygon(0 0, 100% 0, calc(100% - 11px) 50%, 100% 100%, 0 100%);
  }
  .vt-ar .ar-nouv-i {
    width: 27px; height: 27px; flex: none; border-radius: 50%; background: #6B4A2A;
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ar .ar-nouv-t { font-family: Georgia, 'Times New Roman', serif; font-size: 12.5px; line-height: 1.2; color: var(--ar-encre); }
  .vt-ar .ar-trust {
    position: relative; margin: 0 16px 12px; padding: 10px 3px; border-radius: 14px; background: var(--ar-creme);
    box-shadow: inset 0 0 0 1px rgba(201,164,92,.45);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-ar .ar-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .vt-ar .ar-cell + .ar-cell { border-left: 1px solid rgba(201,164,92,.35); }
  .vt-ar .ar-cell-i {
    width: 34px; height: 34px; flex: none; border-radius: 50%; background: var(--ar-vert);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ar .ar-cell-l { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 10.5px; line-height: 1.25; color: var(--ar-encre); }
  .vt-ar .ar-cell-s { font-size: 8px; line-height: 1.25; color: var(--ar-t2); }
  /* THE MOTTO, between two lozenges — decorative, already French.
     POSITION: RELATIVE IS LOAD-BEARING, and it took four measurements to find
     out why. The motto rendered as « … CONFIA » and lost its closing lozenge,
     and I twice mis-diagnosed it — first as the text overflowing the panel,
     then as the panel's 20px corner radius eating the ends. Both were wrong:
     every DOM metric said it fitted (271px of text in a 271px box, 45→315
     inside a 10→350 panel). The real cause is PAINT ORDER: .ar-photo is
     absolutely positioned and spans the panel's full height, so it paints over
     any STATIC sibling underneath it — and this row was the only one that had
     not been given a stacking context. .ar-trust already had one, which is
     why the trust card was never affected and the bug looked like a text
     problem. With the row raised, the relevé's own .3em fits and reads whole. */
  .vt-ar .ar-devise { position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 12px 14px; }
  .vt-ar .ar-devise i { width: 4px; height: 4px; flex: none; background: var(--ar-or); transform: rotate(45deg); }
  .vt-ar .ar-devise span {
    min-width: 0; font-size: 8px; font-weight: 700; letter-spacing: .3em; line-height: 1.5;
    text-transform: uppercase; color: var(--ar-or); text-align: center;
  }
  .vt-ar .ar-btn { background: rgba(34,57,44,.8); box-shadow: inset 0 0 0 1px rgba(201,164,92,.55); }
  .vt-ar .vt-ent-btn { top: 70px; }
  .vt-ar .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-ar .ar-cuir { padding: 70px 8px 8px; }
    .vt-ar .ar-photo { width: 108px; }
    .vt-ar .ar-col { width: calc(100% - 114px); padding: 14px 0 14px 13px; }
    .vt-ar .ar-name { font-size: clamp(21px, 8.4cqw, 26px); }
    .vt-ar .ar-name.vt-ent-long { font-size: 19px; }
    .vt-ar .ar-mono { font-size: 48px; }
    .vt-ar .ar-trust { margin: 0 13px 10px; padding: 9px 2px; }
    .vt-ar .ar-cell { padding: 0 4px; gap: 4px; }
    .vt-ar .ar-cell-i { width: 30px; height: 30px; }
    .vt-ar .ar-devise span { letter-spacing: .2em; }
  }
`;

export const unit: EnteteUnit = { render, css };
