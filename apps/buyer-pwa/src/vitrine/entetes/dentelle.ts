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
 * ENTETES-M · SÉRIE 10 — 49 · DENTELLE — « la broderie anglaise ».
 *
 * SOURCE OF TRUTH: the id="dentelle" block of « En-tetes Boutique - Serie 10 »
 * and its « Relevé — Dentelle ». Origine: création originale.
 *
 * BRODERIE ANGLAISE, AND THE EYELET IS THE WHOLE IDIOM. The veil behind the
 * photo is a 172px band carrying three layers and no image: eyelets as a
 * `radial-gradient` ring (transparent core, white rim, transparent again) at a
 * 26px step; tulle as a doubled 13px dot semis, the second offset half a step
 * so it reads as staggered rather than gridded; and a `mask-image` fade so the
 * lace NEVER reaches the text column. That mask is the reason the column stays
 * legible over a busy ground — it is load-bearing, not decoration.
 *
 * THE SCALLOPED HEM is the detail that sells the cloth: a radial half-circle
 * repeat at the hero's foot, so the fabric is CUT into the trust row instead of
 * ending at a straight edge.
 *
 * THE PHOTO IS A COLLERETTE: a 126 circle under two SVG rings — white picots
 * (`dasharray 0.1 8.4` with a round linecap, which draws dots, not dashes) and
 * an old-rose basting ring. Both are inside the 144 wrap, so unlike Calebasse's
 * rim the decoration is INSIDE the box the column clears.
 *
 * MINIMAL is an embroidery hoop — wooden ring, tensioning screw, canvas — and
 * it sits IN THE COLUMN, in the proof's own slot, never on her portrait
 * (ENTETES-K). Verified seal on its own line. Bio not drawn. 24px tier past 14.
 */

/** Two cross-stitches — the mark that leads the proof label. */
const pointsCroix = (): string =>
  '<svg class="dt-croix" aria-hidden="true" width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="#8E3B52" stroke-width="1.7" stroke-linecap="round">' +
  '<path d="M2 2.5l6 7M8 2.5l-6 7M13 2.5l6 7M19 2.5l-6 7"/></svg>';

/** The kicker's eyelet — a ring, the motif in miniature. */
const oeilletPuce = (): string =>
  '<svg class="dt-oeil" aria-hidden="true" width="9" height="9" viewBox="0 0 9 9" fill="none">' +
  '<circle cx="4.5" cy="4.5" r="3.2" stroke="#C46E7F" stroke-width="2"/></svg>';

/**
 * The collerette: white picots outside, old-rose basting just inside them.
 *
 * BOTH RINGS NEEDED A GROUND AND A RADIUS THE SCREENSHOT CHOSE. White picots
 * on the veil's own white tulle dots were invisible, and the basting at r62
 * sat UNDER the photo (inset 9 ⇒ r63) where nothing could see it. The wrap now
 * carries a plain VOILE disc — pink, so white lace reads — and the basting
 * moved out to r66, into the collar itself.
 */
const collerette = (): string =>
  '<svg class="dt-coll" aria-hidden="true" width="144" height="144" viewBox="0 0 144 144" fill="none">' +
  '<circle cx="72" cy="72" r="69" stroke="#FFFFFF" stroke-width="2.8" stroke-dasharray="0.1 8.4" stroke-linecap="round"/>' +
  '<circle cx="72" cy="72" r="66" stroke="#C46E7F" stroke-width="1.4" stroke-dasharray="4 3.4"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="dt-cell"><span class="dt-cell-i">${icon}</span><span class="dt-cell-l">${label}</span><span class="dt-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-dt" data-role="vitrine-hero">',
    '<div class="dt-hero">',
    '<span class="dt-voile" aria-hidden="true"></span>',
    // the collerette — picots and basting around her portrait
    '<div class="dt-photo-wrap">',
    collerette(),
    `<div class="dt-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="dt-motif"><span class="dt-mono">${v.mono}</span></div>`,
    '</div>',
    '</div>',
    '<div class="dt-col" data-role="vitrine-identity">',
    `<div class="dt-kick">${oeilletPuce()}<span>${t('vit.dt_kicker')}</span></div>`,
    v.hasTag
      ? `<div class="dt-bienv"><span class="dt-bienv-t"><v>${v.tagline}</v></span><span class="dt-bati" aria-hidden="true"></span></div>`
      : '',
    `<div class="dt-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="dt-verif"><span class="dt-verif-i">${iconCheckEnt(9, '#FBEFF0', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="dt-zone">${iconPinEnt(12, '#C46E7F', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="dt-proof-wrap"><span class="dt-proof">${pointsCroix()}<span class="dt-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="dt-stars" data-role="chip-avis">${iconStarEnt(10, '#B04A66')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="dt-nouv-wrap"><span class="dt-nouv" data-role="chip-nouvelle"><span class="dt-vis" aria-hidden="true"></span><span class="dt-toile"><span class="dt-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="dt-trust" data-role="vitrine-trust">',
    '<span class="dt-feston" aria-hidden="true"></span>',
    cell(iconShieldEnt(16, '#47242E', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#47242E', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#47242E', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'dt', 'right', '20px', '72px', '#5A2334'),
    '</div>',
  ].join('');
}

const css = `
  /* ═════════════════════ 49 · DENTELLE (série 10) ═════════════════════
     Relevé — blush #FBEFF0 · rose voile #F2CFD7 · vieux rose #C46E7F ·
     framboise #8E3B52 / #B04A66 · prune de fil #47242E / #5A2334 · bois de
     tambour #B98A54 / #D9B98A · rangée #6E2B3E, sous-lignes #D79AA6. */
  .vt-dt {
    --dt-blush: #FBEFF0; --dt-voile: #F2CFD7; --dt-vieux: #C46E7F;
    --dt-framb: #8E3B52; --dt-framb-2: #B04A66; --dt-prune: #47242E;
    --dt-prune-2: #5A2334; --dt-bois: #B98A54; --dt-bois-2: #D9B98A;
    --dt-rangee: #6E2B3E; --dt-sous: #D79AA6;
    background: var(--dt-blush);
  }
  .vt-dt .dt-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 22px;
    background: var(--dt-blush);
  }
  /* THE VEIL — eyelets over tulle, and the MASK IS LOAD-BEARING. Without the
     90deg fade the lace runs under her name and the column stops being
     readable; the relevé's « fondu au masque » is a legibility rule wearing a
     decorative name. Layer 1 eyelets (step 26), layers 2/3 tulle staggered by
     half a step (6.5 of 13), which is what stops it reading as graph paper. */
  .vt-dt .dt-voile {
    position: absolute; right: 0; top: 0; bottom: 0; width: 172px;
    background-color: var(--dt-voile);
    background-image:
      radial-gradient(circle, transparent 2.6px, rgba(255,255,255,.9) 3.1px 4.3px, transparent 4.8px),
      radial-gradient(circle, rgba(255,255,255,.85) 0 1.5px, transparent 1.6px),
      radial-gradient(circle, rgba(255,255,255,.85) 0 1.5px, transparent 1.6px);
    background-size: 26px 26px, 13px 13px, 13px 13px;
    background-position: 6px 6px, 0 0, 6.5px 6.5px;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 34%);
    mask-image: linear-gradient(90deg, transparent, #000 34%);
  }
  /* THE SCALLOPED HEM LIVES IN THE TRUST ROW, NOT IN THE HERO — and the first
     screenshot is why. Inside the hero it painted BLUSH half-circles on a
     BLUSH ground: perfectly correct CSS, completely invisible. The relevé's
     own words say what it is for — « le tissu se découpe en demi-cercles sur
     la rangée framboise » — the cloth is cut ON the raspberry, so the cut has
     to be drawn where the raspberry is. */
  .vt-dt .dt-feston {
    position: absolute; left: 0; right: 0; top: 0; height: 10px; z-index: 2;
    background-image: radial-gradient(circle at 50% 0, var(--dt-blush) 7px, rgba(90,35,52,.12) 7.6px, transparent 8.4px);
    background-size: 16px 10px; background-position: 50% 0;
  }
  /* THE COLLERETTE. Both rings live INSIDE the 144 wrap — unlike Calebasse's
     rim, no decoration reaches past this box, so the
     column's clearance is the box itself. 144 at right 12 ⇒ it owns past
     x=204; 100% is the hero's padded box (332 at 360) and 156 off it stops the
     column at 176. */
  .vt-dt .dt-photo-wrap { position: absolute; top: 118px; right: 12px; width: 144px; height: 144px; }
  /* A PLAIN BLUSH DISC UNDER THE COLLERETTE. The picots are WHITE and the veil
     they sit on is white-dotted tulle — the first screenshot showed a bare
     circle, because white lace on white dots is nothing at all. A collar is
     laid ON the cloth, so it gets its own ground; this is the relevé's intent
     rather than a departure from it. */
  .vt-dt .dt-photo-wrap::before {
    content: ''; position: absolute; inset: -4px; border-radius: 50%;
    background: var(--dt-voile);
  }
  .vt-dt .dt-coll { position: absolute; inset: 0; }
  .vt-dt .dt-photo {
    position: absolute; inset: 9px; border-radius: 50%; overflow: hidden;
    background: var(--dt-voile);
  }
  .vt-dt .dt-photo .vt-avatar-img { object-position: 50% 26%; }
  .vt-dt .dt-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: #F6DCE1;
    background-image: radial-gradient(circle, rgba(255,255,255,.9) 0 1.4px, transparent 1.5px);
    background-size: 11px 11px;
  }
  .vt-dt .dt-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 56px; color: var(--dt-framb);
  }
  .vt-dt .dt-col { position: relative; width: calc(100% - 156px); min-height: 236px; }
  .vt-dt .dt-kick {
    display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 700;
    letter-spacing: .18em; text-transform: uppercase; color: var(--dt-vieux);
  }
  .vt-dt .dt-oeil { flex: none; display: block; }
  .vt-dt .dt-bienv { margin-top: 9px; }
  .vt-dt .dt-bienv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px;
    color: #7A3247;
  }
  /* the basting-stitch rule — dashed, because the whole style is hand-work */
  .vt-dt .dt-bati {
    display: block; margin-top: 7px; width: 62px; border-top: 2px dashed var(--dt-vieux);
  }
  .vt-dt .dt-name {
    margin-top: 10px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.02; letter-spacing: -.015em;
    color: var(--dt-prune);
  }
  .vt-dt .dt-name .vt-ent-acc { color: var(--dt-framb-2); }
  .vt-dt .dt-name.vt-ent-long { font-size: 24px; }
  .vt-dt .dt-verif { display: flex; align-items: center; gap: 7px; margin-top: 10px; font-size: 13px; font-weight: 700; color: var(--dt-prune); }
  .vt-dt .dt-verif-i {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 17px; height: 17px; border-radius: 50%; background: var(--dt-framb);
    box-shadow: 0 0 0 1.5px var(--dt-blush), 0 0 0 2.8px rgba(142,59,82,.4);
  }
  .vt-dt .dt-zone { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: 12.5px; color: #8A6470; }
  /* THE EMBROIDERED LABEL — a white card with a dashed topstitch inset 4px,
     led by the cross-stitches. */
  .vt-dt .dt-proof-wrap { margin-top: 12px; }
  .vt-dt .dt-proof {
    position: relative; display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px;
    min-height: 34px; padding: 9px 14px; border-radius: 9px; background: #FFFFFF;
    box-shadow: 0 10px 20px -16px rgba(71,36,46,.55);
  }
  .vt-dt .dt-proof::after {
    content: ''; position: absolute; inset: 4px; border: 1.5px dashed var(--dt-vieux);
    border-radius: 6px; pointer-events: none;
  }
  .vt-dt .dt-croix { flex: none; display: block; }
  .vt-dt .dt-proof-l { font-size: 13px; color: #6B4A54; }
  .vt-dt .dt-proof-l b { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 19px; color: var(--dt-prune); }
  .vt-dt .dt-stars { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: #A56B79; }
  /* THE EMBROIDERY HOOP — wood ring, counter-ring, tensioning screw, canvas.
     It sits IN THE COLUMN, in the proof's own slot (ENTETES-K), never over
     her face. */
  .vt-dt .dt-nouv-wrap { margin-top: 14px; }
  .vt-dt .dt-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 96px; height: 96px; border-radius: 50%; border: 5px solid var(--dt-bois);
    box-shadow: inset 0 0 0 3px #FFF9F5, inset 0 0 0 4.5px var(--dt-bois-2);
    transform: rotate(-3deg);
  }
  .vt-dt .dt-vis {
    position: absolute; top: -13px; left: 50%; margin-left: -7.5px; width: 15px; height: 9px;
    border-radius: 3px; background: var(--dt-bois);
  }
  .vt-dt .dt-toile {
    display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;
    border-radius: 50%; background-color: #FFF9F5;
    background-image: radial-gradient(circle, rgba(196,110,127,.35) 0 1.3px, transparent 1.4px);
    background-size: 9px 9px;
  }
  .vt-dt .dt-nouv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 12.5px;
    line-height: 1.15; text-align: center; color: var(--dt-framb);
  }
  .vt-dt .dt-trust {
    position: relative; display: flex; align-items: stretch; padding: 18px 4px 13px;
    background: var(--dt-rangee);
  }
  .vt-dt .dt-cell {
    flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 0 6px; text-align: center;
  }
  .vt-dt .dt-cell + .dt-cell { border-left: 1px solid rgba(251,239,240,.25); }
  .vt-dt .dt-cell-i {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--dt-blush);
  }
  .vt-dt .dt-cell-l { font-size: 11.5px; font-weight: 700; line-height: 1.2; color: #FFF3F5; }
  .vt-dt .dt-cell-s { font-size: 10px; line-height: 1.2; color: var(--dt-sous); }
  .vt-dt .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-dt .dt-hero { padding: 74px 12px 20px; }
    .vt-dt .dt-voile { width: 152px; }
    /* 128 at right 10 ⇒ the collerette owns past x=182, and the column stops
       at 168. Every ring is inside the box, so this is the whole arithmetic. */
    .vt-dt .dt-photo-wrap { top: 116px; right: 10px; width: 128px; height: 128px; }
    .vt-dt .dt-coll { width: 128px; height: 128px; }
    .vt-dt .dt-col { width: calc(100% - 140px); min-height: 222px; }
    .vt-dt .dt-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-dt .dt-name.vt-ent-long { font-size: 21px; }
    .vt-dt .dt-mono { font-size: 48px; }
    .vt-dt .dt-bienv-t { font-size: 16px; }
    .vt-dt .dt-trust { padding: 11px 2px; }
    .vt-dt .dt-cell { padding: 0 4px; gap: 5px; }
    .vt-dt .dt-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
