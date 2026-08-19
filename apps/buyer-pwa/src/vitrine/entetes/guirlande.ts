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
 * ENTETES-M · SÉRIE 11 — 58 · GUIRLANDE — « la fête de cour ».
 *
 * SOURCE OF TRUTH: the id="guirlande" block of « En-tetes Boutique - Serie 11 »
 * and its « Relevé — Guirlande ». Origine: création originale.
 *
 * THE DAY OF THE PARTY: someone strung the line, threaded the flowers, and
 * pegged up the patronne's photograph. That is the entire style, and the
 * pegged photo is what makes it warm rather than merely decorated — a shop
 * that hangs the owner's picture is a shop with a person in it.
 *
 * TWO SVGS, DELIBERATELY SEPARATE. The string uses
 * `preserveAspectRatio="none"` so it STRETCHES with the card from 360 to 320 —
 * a garland must span whatever width it is given. The flowers sit in a second,
 * aspect-PRESERVED svg, because rosettes stretched horizontally stop being
 * rosettes. One element could not do both.
 *
 * THE POLAROID HANGS: `transform-origin: top center` with a 2° rotation, so it
 * pivots from the pegs like a real print, instead of tilting about its middle.
 * Two wooden clothespegs hold it to the line.
 *
 * MINIMAL is a prize rosette with dovetailed ribbons, IN THE COLUMN
 * (ENTETES-K). Verified seal on its own line. Bio not drawn. 24px past 14.
 */

/** The string — stretched to the card's width, aspect deliberately unpreserved. */
const ficelle = (): string =>
  '<svg class="gu-ficelle" aria-hidden="true" width="360" height="80" viewBox="0 0 360 80" ' +
  'preserveAspectRatio="none" fill="none">' +
  // THE LINE FALLS TO THE PEGS. Measured off the first screenshot: the old
  // curve passed at y≈76 and y≈90 where the two pegs sit at y≈116 — thirty
  // pixels of daylight, so the polaroid hung from nothing. This curve keeps
  // the left arc under the three threaded flowers (y≈26/35/34 at x 42/100/152)
  // and then falls to y≈42 and y≈69 at the pegs' own x, which the peg bodies
  // below now cross.
  '<path d="M-4 8C50 34 96 40 150 34 220 26 250 66 364 74" stroke="#8A5A3B" stroke-width="1.8" stroke-linecap="round"/></svg>';

/** One threaded rosette — five petals at a 72° step. */
const rosette = (cx: number, cy: number, s: number, petal: string, heart: string): string =>
  `<g transform="translate(${cx} ${cy}) scale(${s})">` +
  `<g fill="${petal}">` +
  '<ellipse cx="0" cy="-7" rx="4.4" ry="6"/>' +
  '<ellipse cx="6.7" cy="-2.2" rx="4.4" ry="6" transform="rotate(72 6.7 -2.2)"/>' +
  '<ellipse cx="4.1" cy="5.7" rx="4.4" ry="6" transform="rotate(144 4.1 5.7)"/>' +
  '<ellipse cx="-4.1" cy="5.7" rx="4.4" ry="6" transform="rotate(216 -4.1 5.7)"/>' +
  '<ellipse cx="-6.7" cy="-2.2" rx="4.4" ry="6" transform="rotate(288 -6.7 -2.2)"/></g>' +
  `<circle cx="0" cy="0" r="3.4" fill="${heart}"/></g>`;

/** The flowers and leaves on the line — aspect preserved. */
const fleurs = (): string =>
  '<svg class="gu-fleurs" aria-hidden="true" width="360" height="64" viewBox="0 0 360 64" fill="none">' +
  '<g fill="#4E7A52">' +
  '<ellipse cx="66" cy="30" rx="7" ry="4" transform="rotate(-28 66 30)"/>' +
  '<ellipse cx="126" cy="42" rx="6.4" ry="3.6" transform="rotate(18 126 42)"/>' +
  '<ellipse cx="176" cy="44" rx="6.6" ry="3.8" transform="rotate(-14 176 44)"/></g>' +
  rosette(42, 22, 1, '#E2568C', '#F2A93B') +
  rosette(100, 36, 0.82, '#F2A93B', '#C13A72') +
  rosette(152, 40, 0.9, '#E8654F', '#FFF8EE') +
  '</svg>';

/** The kicker's rosette bullet. */
const puce = (): string =>
  '<svg class="gu-puce" aria-hidden="true" width="11" height="11" viewBox="-5.5 -5.5 11 11" fill="none">' +
  rosette(0, 0, 0.42, '#E2568C', '#F2A93B') +
  '</svg>';

/** The heart in the polaroid's caption. */
const coeur = (): string =>
  '<svg class="gu-coeur" aria-hidden="true" width="10" height="9" viewBox="0 0 10 9" fill="none">' +
  '<path d="M5 8.4C1.6 6 0 4.4 0 2.8 0 1.3 1.1.3 2.4.3c.9 0 1.9.5 2.6 1.4C5.7.8 6.7.3 7.6.3 8.9.3 10 1.3 10 2.8c0 1.6-1.6 3.2-5 5.6z" fill="#E2568C"/></svg>';

/** The mini-garland leading the proof pill. */
const miniGuirlande = (): string =>
  '<svg class="gu-mini" aria-hidden="true" width="26" height="12" viewBox="0 0 26 12" fill="none">' +
  '<path d="M1 2C7 9 19 9 25 2" stroke="#8A5A3B" stroke-width="1.3" stroke-linecap="round"/>' +
  '<circle cx="6" cy="6.4" r="3" fill="#E2568C"/><circle cx="13" cy="8" r="3" fill="#F2A93B"/>' +
  '<circle cx="20" cy="6.4" r="3" fill="#E8654F"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="gu-cell"><span class="gu-cell-i">${icon}</span><span class="gu-cell-l">${label}</span><span class="gu-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-gu" data-role="vitrine-hero">',
    '<div class="gu-hero">',
    ficelle(),
    fleurs(),
    // the pegged polaroid
    '<div class="gu-pola-wrap">',
    '<span class="gu-pince gu-pince--a" aria-hidden="true"></span>',
    '<span class="gu-pince gu-pince--b" aria-hidden="true"></span>',
    '<div class="gu-pola">',
    `<div class="gu-tirage" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 30%')
      : `<div class="gu-motif"><span class="gu-mono">${v.mono}</span></div>`,
    '</div>',
    `<div class="gu-legende">${coeur()}<span>${t('vit.gu_legende')}</span></div>`,
    '</div>',
    '</div>',
    '<div class="gu-col" data-role="vitrine-identity">',
    `<div class="gu-kick">${puce()}<span>${t('vit.gu_kicker')}</span></div>`,
    v.hasTag
      ? `<div class="gu-bienv"><span class="gu-bienv-t"><v>${v.tagline}</v></span><span class="gu-tiret" aria-hidden="true"></span></div>`
      : '',
    `<div class="gu-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="gu-verif"><span class="gu-verif-i">${iconCheckEnt(9, '#FFF8EE', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="gu-zone">${iconPinEnt(12, '#B0396A', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="gu-proof-wrap"><span class="gu-proof">${miniGuirlande()}<span class="gu-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="gu-stars" data-role="chip-avis">${iconStarEnt(10, '#F2A93B')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="gu-nouv-wrap"><span class="gu-nouv" data-role="chip-nouvelle"><span class="gu-ruban gu-ruban--a" aria-hidden="true"></span><span class="gu-ruban gu-ruban--b" aria-hidden="true"></span><span class="gu-disque" aria-hidden="true"></span><span class="gu-coeur-r"><span class="gu-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="gu-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#3A2230', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#3A2230', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#3A2230', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'gu', '#3A2230'),
    '</div>',
  ].join('');
}

const css = `
  /* ═════════════════ 58 · GUIRLANDE (série 11) ═════════════════
     Relevé — crème de fête #FFF8EE · rose #E2568C→#F27CA8 (profond
     #C13A72 / #B0396A) · soleil #F2A93B · corail #E8654F · feuille #4E7A52 ·
     ficelle #8A5A3B · pince #C89A5B · prune #3A2230, sous-lignes #E2A0BC. */
  .vt-gu {
    --gu-creme: #FFF8EE; --gu-rose: #E2568C; --gu-rose-2: #F27CA8; --gu-rose-d: #C13A72;
    --gu-rose-d2: #B0396A; --gu-soleil: #F2A93B; --gu-corail: #E8654F;
    --gu-ficelle: #8A5A3B; --gu-pince: #C89A5B; --gu-prune: #3A2230; --gu-sous: #E2A0BC;
    background: var(--gu-creme);
  }
  .vt-gu .gu-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 22px;
    background: var(--gu-creme);
  }
  /* THE STRING STRETCHES, THE FLOWERS DO NOT. preserveAspectRatio:none lets the
     line span 360 or 320; the rosettes keep their aspect in a second svg,
     because a horizontally stretched rosette stops reading as a flower. */
  .vt-gu .gu-ficelle { position: absolute; left: 0; top: 60px; width: 100%; height: 80px; }
  .vt-gu .gu-fleurs { position: absolute; left: 0; top: 60px; }
  /* THE POLAROID HANGS FROM THE LINE. transform-origin: top center is what
     makes the 2° read as a print pivoting on its pegs rather than a card
     tilted about its middle. 148 at right 12 ⇒ it owns past x=200 (the 2°
     rotation of a 148×184 box adds ~3px of horizontal reach at the foot, which
     the 158 column offset already absorbs); the column stops at 174. */
  .vt-gu .gu-pola-wrap { position: absolute; top: 128px; right: 12px; width: 148px; }
  .vt-gu .gu-pince {
    position: absolute; width: 7px; height: 18px; border-radius: 3px; z-index: 2;
    background: var(--gu-pince); box-shadow: inset 0 0 0 1px rgba(122,80,40,.45);
  }
  /* peg A reaches UP to meet the line at y≈102, peg B is crossed by it at
     y≈129 — both measured, neither guessed. Peg A sits at x≈222 and peg B at
     x≈319; the controls own 70..114, so B starts at 116 and clears them. */
  .vt-gu .gu-pince--a { left: 22px; top: -26px; height: 30px; }
  .vt-gu .gu-pince--b { right: 22px; top: -12px; height: 20px; }
  .vt-gu .gu-pola {
    position: relative; padding: 8px 8px 0; border-radius: 4px; background: #FFFFFF;
    transform: rotate(2deg); transform-origin: top center;
    box-shadow: 0 14px 26px -18px rgba(58,34,48,.65);
  }
  .vt-gu .gu-tirage { position: relative; height: 132px; overflow: hidden; background: #F3E7DE; }
  .vt-gu .gu-tirage .vt-avatar-img { object-position: 50% 30%; }
  .vt-gu .gu-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(180deg, #FCE7EF 0%, #F8D3E2 100%);
  }
  .vt-gu .gu-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 54px; color: var(--gu-rose-d);
  }
  .vt-gu .gu-legende {
    display: flex; align-items: center; justify-content: center; gap: 5px; height: 34px;
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 10px;
    color: #8A6E7B;
  }
  .vt-gu .gu-coeur { flex: none; display: block; }
  /* 44px clear of the garland, per the relevé */
  .vt-gu .gu-col { position: relative; margin-top: 44px; width: calc(100% - 158px); min-height: 226px; }
  .vt-gu .gu-kick {
    display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 700;
    letter-spacing: .18em; text-transform: uppercase; color: var(--gu-rose-d2);
  }
  .vt-gu .gu-puce { flex: none; display: block; }
  .vt-gu .gu-bienv { margin-top: 9px; }
  .vt-gu .gu-bienv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px;
    color: #5E3044;
  }
  .vt-gu .gu-tiret {
    display: block; margin-top: 7px; width: 64px; height: 2.5px; border-radius: 2px;
    background: linear-gradient(90deg, var(--gu-rose) 0%, var(--gu-soleil) 55%, var(--gu-corail) 100%);
  }
  .vt-gu .gu-name {
    margin-top: 10px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.02; letter-spacing: -.015em;
    color: var(--gu-prune);
  }
  .vt-gu .gu-name .vt-ent-acc { color: var(--gu-rose); }
  .vt-gu .gu-name.vt-ent-long { font-size: 24px; }
  .vt-gu .gu-verif { display: flex; align-items: center; gap: 7px; margin-top: 10px; font-size: 13px; font-weight: 700; color: var(--gu-prune); }
  .vt-gu .gu-verif-i {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 17px; height: 17px; border-radius: 50%; background: var(--gu-rose-d);
    box-shadow: 0 0 0 1.5px var(--gu-creme), 0 0 0 2.8px rgba(193,58,114,.35);
  }
  .vt-gu .gu-zone { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: 12.5px; color: #7E5F6C; }
  .vt-gu .gu-proof-wrap { margin-top: 12px; }
  .vt-gu .gu-proof {
    display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 34px;
    padding: 9px 15px; border-radius: 99px; background: #FFFFFF;
    box-shadow: inset 0 0 0 1.5px rgba(226,86,140,.4), 0 10px 20px -16px rgba(58,34,48,.5);
  }
  .vt-gu .gu-mini { flex: none; display: block; }
  .vt-gu .gu-proof-l { font-size: 13px; color: #6E5560; }
  .vt-gu .gu-proof-l b { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 19px; color: var(--gu-rose-d); }
  .vt-gu .gu-stars { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: #96707F; }
  /* THE PRIZE ROSETTE — pleated crown, cream heart with a dotted sun ring, and
     two dovetailed ribbons cut with clip-path. In the column (ENTETES-K). */
  .vt-gu .gu-nouv-wrap { margin-top: 14px; }
  .vt-gu .gu-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 84px; height: 84px; margin-bottom: 22px;
  }
  .vt-gu .gu-disque {
    position: absolute; inset: 0; border-radius: 50%;
    background: repeating-conic-gradient(from 0deg, var(--gu-rose) 0 7.5deg, var(--gu-rose-d) 7.5deg 12.1deg);
  }
  .vt-gu .gu-coeur-r {
    position: relative; display: flex; align-items: center; justify-content: center;
    width: 54px; height: 54px; border-radius: 50%; background: var(--gu-creme);
    box-shadow: 0 0 0 2px var(--gu-soleil);
  }
  .vt-gu .gu-ruban {
    position: absolute; top: 58px; border-radius: 1px;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%);
  }
  .vt-gu .gu-ruban--a { left: 26px; width: 11px; height: 26px; background: var(--gu-rose); }
  .vt-gu .gu-ruban--b { right: 26px; width: 11px; height: 22px; background: var(--gu-soleil); }
  .vt-gu .gu-nouv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 11.5px;
    line-height: 1.15; text-align: center; color: var(--gu-rose-d2); max-width: 46px;
  }
  .vt-gu .gu-trust {
    display: flex; align-items: stretch; padding: 13px 4px; background: var(--gu-prune);
  }
  .vt-gu .gu-cell {
    flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 0 6px; text-align: center;
  }
  .vt-gu .gu-cell + .gu-cell { border-left: 1px solid rgba(255,248,238,.22); }
  .vt-gu .gu-cell-i {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--gu-creme);
  }
  .vt-gu .gu-cell-l { font-size: 11.5px; font-weight: 700; line-height: 1.2; color: #FFF8EE; }
  .vt-gu .gu-cell-s { font-size: 10px; line-height: 1.2; color: var(--gu-sous); }
  .vt-gu .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-gu .gu-hero { padding: 74px 12px 20px; }
    /* 130 at right 10 ⇒ the print owns past x=180, and the column stops at 166. */
    .vt-gu .gu-pola-wrap { top: 126px; right: 10px; width: 130px; }
    .vt-gu .gu-tirage { height: 118px; }
    .vt-gu .gu-col { width: calc(100% - 140px); min-height: 214px; }
    .vt-gu .gu-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-gu .gu-name.vt-ent-long { font-size: 21px; }
    .vt-gu .gu-mono { font-size: 46px; }
    .vt-gu .gu-bienv-t { font-size: 16px; }
    .vt-gu .gu-trust { padding: 11px 2px; }
    .vt-gu .gu-cell { padding: 0 4px; gap: 5px; }
    .vt-gu .gu-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
