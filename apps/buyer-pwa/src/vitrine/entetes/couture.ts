import { t } from '../../i18n';
import { iconCheckEnt, iconLockEnt, iconPinSolid, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
import {
  avisChip,
  controls,
  etatPhoto,
  framePhoto,
  hasPhoto,
  ventesLine,
  zoneLine,
  weldSeal,
  type Vals,
} from '../entetes';
import type { EnteteUnit } from './registry';

/**
 * ENTETES-H · SÉRIE 2 — 7 · COUTURE — « manchette noir & crème, surpiqûres champagne ».
 *
 * SOURCE OF TRUTH: the `id="couture"` block of « En-tetes Boutique - Serie 2 »
 * and its « Relevé — Couture ». Origine: création originale série 2.
 *
 * A MAGAZINE MASTHEAD: « tout est centré, monochrome, une seule couleur
 * d'accent ». Everything is centre-aligned — the one header in the whole set
 * that is, which is why it reads as a printed page rather than an app screen.
 * The discipline is that champagne is the ONLY accent: no second colour enters
 * anywhere, not even on the star or the badge.
 *
 * THE SURPIQÛRES ARE THE STYLE. Two « stitching » rules (1px dashed champagne
 * with a 6px lozenge at the centre) frame the name block, and the avatar wears
 * an outer scalloped ring beyond its champagne circle. They are decoration in
 * the strict sense — `aria-hidden`, never tappable — but they are what makes
 * the thing look sewn rather than drawn.
 *
 * SQUARE CORNERS ON THE PHOTO, DELIBERATELY: « Angles droits (r0) : seul style
 * de la série sans arrondi photo ». A letterbox band under the second rule with
 * a passe-partout — a mounted print, not a rounded card. Do not "fix" it.
 */

const surpiqure = (): string =>
  '<span class="co-stitch" aria-hidden="true"><i class="co-loz"></i></span>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="co-cell"><span class="co-cell-i">${icon}</span><span class="co-cell-t"><span class="co-cell-l">${label}</span><span class="co-cell-s">${sub}</span></span></div>`;
  return [
    '<div class="vt-ent vt-co" data-role="vitrine-hero">',
    '<div class="co-hero">',
    '<span class="co-vignette" aria-hidden="true"></span>',
    // her portrait, ringed twice — the champagne circle and the scalloped
    // outer ring the relevé asks for
    '<div class="co-av-wrap">',
    `<div class="co-av" data-role="vitrine-avatar" data-etat="${v.hasAvatar ? 'live' : 'none'}">`,
    v.hasAvatar ? framePhoto({ ...v, hasCover: false }, '50% 26%') : `<span class="co-av-mono">${v.mono}</span>`,
    '<span class="co-av-fest" aria-hidden="true"></span>',
    '</div>',
    '</div>',
    '<div class="co-col" data-role="vitrine-identity">',
    surpiqure(),
    `<div class="co-name">${weldSeal(v.tail, `<span class="co-seal" aria-hidden="true">${iconCheckEnt(12, '#161210', 3.4)}</span>`)}</div>`,
    surpiqure(),
    v.hasTag ? `<div class="co-bienv"><v>${v.tagline}</v></div>` : '',
    `<div class="co-zone">${zoneLine(v, iconPinSolid(13, '#C4AE7E', '#161210'))}</div>`,
    v.hasBio ? `<div class="co-bio"><v>${v.bio}</v></div>` : '',
    v.showProof
      ? `<div class="co-proof"><span data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="co-stars" data-role="chip-avis"> · ${iconStarEnt(11, '#C4AE7E')}${avisChip(v)}</span>`
            : ''
        }</div>`
      : '',
    v.nouvelle
      ? `<div class="co-nouv-wrap"><span class="co-nouv" data-role="chip-nouvelle">${iconStarEnt(12, '#B39763')}<v>${t('vit.nouvelle_vendeuse')}</v></span></div>`
      : '',
    '</div>',
    // the letterbox band — a mounted print: passe-partout, square corners
    `<div class="co-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    '<div class="co-mat">',
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="co-motif"><span class="co-mono">${v.mono}</span></div>`,
    '</div>',
    '</div>',
    '</div>',
    '<div class="co-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#161210', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#161210', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#161210', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    // symmetric composition: back LEFT, share RIGHT — and share does NOT move
    // when there is no provenance (near === far), which is the relevé's rule
    controls(v, 'co', 'right', '12px', '12px', '#F2EAD9'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 7 · COUTURE (série 2) ══════════════════════
     Relevé — noir #161210 (motif #1E1913, avatar #241E16) · crème #F2EAD9
     (titre #F7F0E1) · champagne #C4AE7E (sceau #D9C79A→#B39763) · textes
     #CDC4B2 / #A89F8D / #8A7F6C · hairline boutons #4B4336. « une seule
     couleur d'accent » — champagne is the only accent in the whole sheet. */
  .vt-co {
    --co-noir: #161210; --co-motif: #1E1913; --co-av: #241E16;
    --co-creme: #F2EAD9; --co-titre: #F7F0E1;
    --co-champagne: #C4AE7E; --co-sceau-a: #D9C79A; --co-sceau-b: #B39763;
    --co-txt: #CDC4B2; --co-txt2: #A89F8D; --co-txt3: #8A7F6C; --co-hair: #4B4336;
    background: var(--co-noir);
  }
  .vt-co .co-hero { position: relative; margin-top: -60px; padding: 74px 16px 16px; background: var(--co-noir); text-align: center; }
  .vt-co .co-vignette { position: absolute; inset: 0; background: radial-gradient(90% 46% at 50% 0%, rgba(242,234,217,.06) 0%, rgba(242,234,217,0) 100%); }
  .vt-co .co-av-wrap { position: relative; display: flex; justify-content: center; }
  .vt-co .co-av {
    position: relative; width: 54px; height: 54px; border-radius: 50%; overflow: visible;
    box-shadow: 0 0 0 1.5px var(--co-champagne); background: var(--co-av);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-co .co-av .vt-avatar-img { border-radius: 50%; }
  .vt-co .co-av-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 23px; color: var(--co-champagne); }
  /* the outer scalloped ring — decoration, never a control */
  .vt-co .co-av-fest { position: absolute; inset: -5px; border-radius: 50%; border: 1px dashed rgba(196,174,126,.5); }
  .vt-co .co-col { position: relative; }
  /* THE SURPIQÛRE: a dashed rule with a lozenge sewn into its centre */
  .vt-co .co-stitch { display: block; position: relative; margin: 14px 0; border-top: 1px dashed rgba(196,174,126,.55); }
  .vt-co .co-loz {
    position: absolute; top: -3px; left: 50%; width: 6px; height: 6px; margin-left: -3px;
    background: var(--co-champagne); transform: rotate(45deg);
  }
  .vt-co .co-name {
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(28px, 9.6cqw, 34px); line-height: 1.08; letter-spacing: .01em;
    color: var(--co-titre); overflow-wrap: break-word;
  }
  /* « centré pleine largeur (pas de règle fixe) » — no long-name tier here:
     the line is the whole width, so a long name wraps rather than shrinks. */
  .vt-co .co-name .vt-ent-acc { color: var(--co-titre); }
  .vt-co .co-seal {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 50%; margin-left: 7px; vertical-align: middle;
    background: linear-gradient(150deg, var(--co-sceau-a), var(--co-sceau-b));
  }
  .vt-co .co-bienv { margin-top: 10px; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 17px; line-height: 1.3; color: var(--co-champagne); }
  /* « petites capitales espacées » — the masthead's dateline */
  /* A BLOCK, NOT A FLEX ROW. zoneLine emits « pin + Vendeuse vérifiée · +
     zone » as sibling inline nodes; in a flex container each became its own
     item and justify-content:center pushed them to opposite ends of the
     line — a dateline with a hole in the middle. As inline text it centres and
     wraps as one sentence, which is what a masthead dateline is. */
  .vt-co .co-zone {
    margin-top: 10px; text-align: center;
    font-weight: 600; font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase;
    line-height: 1.5; color: var(--co-txt2);
  }
  .vt-co .co-zone svg { vertical-align: -2px; margin-right: 5px; }
  .vt-co .co-bio { margin: 10px auto 0; max-width: 300px; font-size: 12.5px; line-height: 1.55; color: var(--co-txt); }
  .vt-co .co-proof { margin-top: 10px; font-size: 12px; line-height: 1.45; color: var(--co-txt); }
  .vt-co .co-proof b { font-weight: 700; color: var(--co-creme); }
  .vt-co .co-stars { font-weight: 600; color: var(--co-champagne); }
  .vt-co .co-stars svg { vertical-align: -1px; margin-right: 3px; }
  .vt-co .co-nouv-wrap { margin-top: 12px; display: flex; justify-content: center; }
  .vt-co .co-nouv {
    display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 18px;
    border-radius: 99px; background: var(--co-creme); font-weight: 700; font-size: 13px; color: var(--co-noir);
  }
  /* THE MOUNTED PRINT — square corners, a 5px passe-partout, champagne rule */
  .vt-co .co-photo { margin-top: 16px; height: 138px; }
  .vt-co .co-mat {
    position: relative; height: 100%; overflow: hidden; border-radius: 0;
    padding: 5px; background: var(--co-noir);
    box-shadow: inset 0 0 0 1px rgba(196,174,126,.45), inset 0 0 0 6px rgba(242,234,217,.25);
  }
  .vt-co .co-mat .vt-cover-img, .vt-co .co-mat .vt-avatar-img { position: absolute; inset: 5px; width: auto; height: auto; }
  .vt-co .co-motif {
    position: absolute; inset: 5px; display: flex; align-items: center; justify-content: center;
    background-color: var(--co-motif);
    background-image:
      repeating-linear-gradient(0deg, rgba(196,174,126,.16) 0 1px, transparent 1px 12px),
      repeating-linear-gradient(90deg, rgba(196,174,126,.16) 0 1px, transparent 1px 12px);
  }
  .vt-co .co-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 84px; line-height: 1; color: rgba(242,234,217,.2); }
  /* the editorial trust card — crème, wire circles, Georgia titles */
  .vt-co .co-trust {
    margin: 0 16px 16px; padding: 10px 4px; border-radius: 10px; background: var(--co-creme);
    display: grid; grid-template-columns: 1.1fr 1fr 1.04fr; align-items: center;
  }
  .vt-co .co-cell { padding: 0 5px; display: flex; align-items: center; gap: 7px; text-align: left; }
  .vt-co .co-cell + .co-cell { border-left: 1px solid rgba(22,18,16,.14); }
  .vt-co .co-cell-i {
    width: 32px; height: 32px; flex: none; border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--co-noir);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-co .co-cell-l { display: block; font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 10px; line-height: 1.2; color: var(--co-noir); }
  .vt-co .co-cell-s { display: block; font-size: 8.5px; line-height: 1.2; color: var(--co-txt3); }
  /* symmetric: back LEFT, share RIGHT, both hairline on bare ground */
  .vt-co .co-btn { background: transparent; box-shadow: inset 0 0 0 1px var(--co-hair); }
  .vt-co .vt-ent-btn { top: 72px; }
  .vt-co .vt-ent-back { left: 12px; }

  @container (max-width: 339px) {
    .vt-co .co-hero { padding: 74px 12px 12px; }
    .vt-co .co-name { font-size: clamp(25px, 9.6cqw, 30px); }
    .vt-co .co-photo { height: 120px; }
    .vt-co .co-mono { font-size: 70px; }
    .vt-co .co-bienv { font-size: 15px; }
    .vt-co .co-trust { margin: 0 12px 12px; padding: 9px 3px; }
    .vt-co .co-cell { gap: 6px; padding: 0 4px; }
    .vt-co .co-cell-i { width: 28px; height: 28px; }
  }
`;

export const unit: EnteteUnit = { render, css };
