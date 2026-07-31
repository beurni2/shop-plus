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
 * ENTETES-M · SÉRIE 11 — 56 · PAPILLONS — « l'envol ».
 *
 * SOURCE OF TRUTH: the id="papillons" block of « En-tetes Boutique - Serie 11 »
 * and its « Relevé — Papillons ». Origine: création originale.
 *
 * LIGHTNESS, AND ONE BUTTERFLY CHOOSES HER. A dotted flight loop crosses the
 * hero in three curves; two butterflies ride it; a third — fuchsia — has
 * LANDED on her portrait, overlapping the ring at its top-right. That landed
 * butterfly is the whole idea of the style: the garden's attention settles on
 * the seller.
 *
 * BUTTERFLY 1 FLIES ABOVE THE KICKER BAND and the relevé flags it: its group
 * transform is `translate(4 -26) rotate(-14)`, deliberately lifted. Lowering it
 * to look more balanced would drop it onto « L'ENVOL · OUAGADOUGOU ».
 *
 * THE ORBIT is a dotted SVG ring (`dasharray 2 6.5`, round caps — dots, not
 * dashes) around a 126 circle, plus a thin violet circle inside it. The flight
 * turns around the portrait rather than merely decorating beside it.
 *
 * MINIMAL is a flight card, IN THE COLUMN (ENTETES-K) — and it is the one
 * MINIMAL of the six that sets « Nouvelle vendeuse » on ONE line, because the
 * card is wide rather than round. Verified seal on its own line. Bio not drawn.
 * 24px tier past 14 characters.
 */

/** One butterfly — four wing ellipses, capsule body, antennae, cream ocelli. */
const papillon = (dark: string, light: string, scale: number): string =>
  `<g transform="scale(${scale})">` +
  `<ellipse cx="-9" cy="-7" rx="9.5" ry="6.5" fill="${dark}" transform="rotate(-34 -9 -7)"/>` +
  `<ellipse cx="9" cy="-7" rx="9.5" ry="6.5" fill="${dark}" transform="rotate(34 9 -7)"/>` +
  `<ellipse cx="-7" cy="5" rx="7" ry="5" fill="${light}" transform="rotate(-16 -7 5)"/>` +
  `<ellipse cx="7" cy="5" rx="7" ry="5" fill="${light}" transform="rotate(16 7 5)"/>` +
  '<rect x="-1.5" y="-9" width="3" height="18" rx="1.5" fill="#2E2440"/>' +
  '<path d="M-1-9c-2-4-5-5-7-5M1-9c2-4 5-5 7-5" stroke="#2E2440" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
  '<circle cx="-9" cy="-7" r="1.8" fill="#FFF8EE" opacity=".8"/><circle cx="9" cy="-7" r="1.8" fill="#FFF8EE" opacity=".8"/>' +
  '</g>';

/** The flight: dotted loop, two butterflies, three lilac sparks. */
const envol = (): string =>
  '<svg class="pp-envol" aria-hidden="true" width="332" height="150" viewBox="0 0 332 150" fill="none">' +
  '<path d="M-10 96C40 52 78 116 132 74 186 32 218 92 268 56 296 36 314 30 340 34" ' +
  'stroke="#B9A2D9" stroke-width="1.8" stroke-dasharray="2 5.5" stroke-linecap="round"/>' +
  // BUTTERFLY 1 — lifted clear of the kicker band. Do not lower.
  `<g transform="translate(74 44) translate(4 -26) rotate(-14)">${papillon('#7C4DC4', '#B98FE8', 1)}</g>` +
  `<g transform="translate(258 40) rotate(18)">${papillon('#D4438C', '#F2ABCD', 0.8)}</g>` +
  '<g fill="#C9A6F0"><circle cx="176" cy="98" r="2.4" opacity=".7"/>' +
  '<circle cx="212" cy="76" r="1.9" opacity=".6"/><circle cx="140" cy="112" r="2.1" opacity=".55"/></g></svg>';

/** The butterfly that has landed on her portrait. */
const papillonPose = (): string =>
  '<svg class="pp-pose" aria-hidden="true" width="40" height="36" viewBox="-20 -18 40 36" fill="none">' +
  papillon('#D4438C', '#F2ABCD', 0.86) +
  '</svg>';

/** The orbit: dotted ring plus a thin violet circle. */
const orbite = (): string =>
  '<svg class="pp-orbite" aria-hidden="true" width="146" height="146" viewBox="0 0 146 146" fill="none">' +
  '<circle cx="73" cy="73" r="70" stroke="#B9A2D9" stroke-width="2" stroke-dasharray="2 6.5" stroke-linecap="round"/>' +
  '<circle cx="73" cy="73" r="63" stroke="#7C4DC4" stroke-width="1" opacity=".55"/></svg>';

/** The kicker's butterfly bullet. */
const puce = (): string =>
  '<svg class="pp-puce" aria-hidden="true" width="11" height="9" viewBox="-5.5 -4.5 11 9" fill="none">' +
  papillon('#7C4DC4', '#B98FE8', 0.3) +
  '</svg>';

/** The two-tone butterfly leading the proof chip. */
const papillonPreuve = (): string =>
  '<svg class="pp-mini" aria-hidden="true" width="18" height="14" viewBox="-9 -7 18 14" fill="none">' +
  papillon('#7C4DC4', '#D4438C', 0.46) +
  '</svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="pp-cell"><span class="pp-cell-i">${icon}</span><span class="pp-cell-l">${label}</span><span class="pp-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-pp" data-role="vitrine-hero">',
    '<div class="pp-hero">',
    envol(),
    // the portrait in its dotted orbit, with the third butterfly landed on it
    '<div class="pp-orb-wrap">',
    orbite(),
    `<div class="pp-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="pp-motif"><span class="pp-mono">${v.mono}</span></div>`,
    '</div>',
    papillonPose(),
    '</div>',
    '<div class="pp-col" data-role="vitrine-identity">',
    `<div class="pp-kick">${puce()}<span>${t('vit.pp_kicker')}</span></div>`,
    v.hasTag
      ? `<div class="pp-bienv"><span class="pp-bienv-t"><v>${v.tagline}</v></span><span class="pp-tiret" aria-hidden="true"></span></div>`
      : '',
    `<div class="pp-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="pp-verif"><span class="pp-verif-i">${iconCheckEnt(9, '#F6F1FB', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="pp-zone">${iconPinEnt(12, '#7C4DC4', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="pp-proof-wrap"><span class="pp-proof">${papillonPreuve()}<span class="pp-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="pp-stars" data-role="chip-avis">${iconStarEnt(10, '#D4438C')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="pp-nouv-wrap"><span class="pp-nouv" data-role="chip-nouvelle">${papillonPreuve()}<span class="pp-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="pp-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#2E2440', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#2E2440', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#2E2440', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'pp', 'right', '20px', '72px', '#2E2440'),
    '</div>',
  ].join('');
}

const css = `
  /* ═════════════════ 56 · PAPILLONS (série 11) ═════════════════
     Relevé — lilas d'air #F6F1FB→#EFE7F8 · violette #7C4DC4→#A77BE0
     (sombre #5E35A0) · fuchsia #D4438C→#F2ABCD · encre de nuit #2E2440 ·
     trace #B9A2D9 · rangée #2E2440, sous-lignes #A992C8. */
  .vt-pp {
    --pp-lilas: #F6F1FB; --pp-lilas-2: #EFE7F8; --pp-vio: #7C4DC4; --pp-vio-2: #A77BE0;
    --pp-vio-d: #5E35A0; --pp-fu: #D4438C; --pp-encre: #2E2440; --pp-trace: #B9A2D9;
    --pp-sous: #A992C8;
    background: var(--pp-lilas);
  }
  .vt-pp .pp-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 22px;
    background: linear-gradient(180deg, var(--pp-lilas) 0%, var(--pp-lilas-2) 100%);
  }
  .vt-pp .pp-envol { position: absolute; left: 14px; top: 0; }
  /* THE ORBIT. The dotted ring is the outermost thing and it lives inside the
     146 box; the landed butterfly reaches ~10px past the top-right corner, but
     UPWARD and OUTWARD — never into the column below-left — so the column's
     clearance is the box. 146 at right 10 ⇒ it owns past x=204, and 156 off
     the padded box stops the column at 176. */
  .vt-pp .pp-orb-wrap { position: absolute; top: 118px; right: 10px; width: 146px; height: 146px; }
  .vt-pp .pp-orbite { position: absolute; inset: 0; }
  .vt-pp .pp-photo {
    position: absolute; inset: 10px; border-radius: 50%; overflow: hidden;
    background: var(--pp-lilas-2);
  }
  .vt-pp .pp-photo .vt-avatar-img { object-position: 50% 26%; }
  .vt-pp .pp-pose { position: absolute; right: -4px; top: -10px; transform: rotate(22deg); }
  .vt-pp .pp-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(180deg, #EFE3FB 0%, #E2D2F5 100%);
  }
  .vt-pp .pp-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 56px; color: var(--pp-vio);
  }
  /* 38px clear of the flight, per the relevé */
  .vt-pp .pp-col { position: relative; margin-top: 38px; width: calc(100% - 156px); min-height: 226px; }
  /* the lilac halo — the flight loop passes behind this line */
  .vt-pp .pp-kick {
    display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 700;
    letter-spacing: .18em; text-transform: uppercase; color: #6E3F9E;
    text-shadow: 0 0 5px var(--pp-lilas), 0 0 5px var(--pp-lilas), 0 0 8px var(--pp-lilas);
  }
  .vt-pp .pp-puce {
    flex: none; display: block;
    filter: drop-shadow(0 0 3px var(--pp-lilas)) drop-shadow(0 0 3px var(--pp-lilas));
  }
  .vt-pp .pp-bienv { margin-top: 9px; }
  .vt-pp .pp-bienv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px;
    color: #4A3568;
  }
  .vt-pp .pp-tiret {
    display: block; margin-top: 7px; width: 62px; height: 2.5px; border-radius: 2px;
    background: linear-gradient(90deg, var(--pp-vio) 0%, var(--pp-fu) 100%);
  }
  .vt-pp .pp-name {
    margin-top: 10px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.02; letter-spacing: -.015em;
    color: var(--pp-encre);
  }
  .vt-pp .pp-name .vt-ent-acc { color: var(--pp-vio); }
  .vt-pp .pp-name.vt-ent-long { font-size: 24px; }
  .vt-pp .pp-verif { display: flex; align-items: center; gap: 7px; margin-top: 10px; font-size: 13px; font-weight: 700; color: var(--pp-encre); }
  .vt-pp .pp-verif-i {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 17px; height: 17px; border-radius: 50%; background: var(--pp-vio);
    box-shadow: 0 0 0 1.5px var(--pp-lilas), 0 0 0 2.8px rgba(124,77,196,.35);
  }
  .vt-pp .pp-zone { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: 12.5px; color: #6C5D80; }
  .vt-pp .pp-proof-wrap { margin-top: 12px; }
  .vt-pp .pp-proof {
    display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 34px;
    padding: 9px 14px; border-radius: 14px; background: #FFFFFF;
    box-shadow: inset 0 0 0 1.5px rgba(124,77,196,.35), 0 10px 20px -16px rgba(46,36,64,.5);
  }
  .vt-pp .pp-mini { flex: none; display: block; }
  .vt-pp .pp-proof-l { font-size: 13px; color: #5E5270; }
  .vt-pp .pp-proof-l b { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 19px; color: var(--pp-vio-d); }
  .vt-pp .pp-stars { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: #8A7A9E; }
  /* THE FLIGHT CARD — the one MINIMAL of the six on a single line, because the
     card is wide rather than round. In the column (ENTETES-K). */
  .vt-pp .pp-nouv-wrap { margin-top: 14px; }
  .vt-pp .pp-nouv {
    display: inline-flex; align-items: center; gap: 9px; min-height: 40px;
    padding: 9px 16px; border-radius: 16px; background: #FFFFFF;
    box-shadow: inset 0 0 0 1.5px rgba(124,77,196,.3), 0 10px 22px -16px rgba(46,36,64,.55);
    transform: rotate(-2deg);
  }
  .vt-pp .pp-nouv-t {
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 14px;
    color: var(--pp-vio-d);
  }
  .vt-pp .pp-trust {
    display: flex; align-items: stretch; padding: 13px 4px; background: var(--pp-encre);
  }
  .vt-pp .pp-cell {
    flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 0 6px; text-align: center;
  }
  .vt-pp .pp-cell + .pp-cell { border-left: 1px solid rgba(246,241,251,.2); }
  .vt-pp .pp-cell-i {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--pp-lilas);
  }
  .vt-pp .pp-cell-l { font-size: 11.5px; font-weight: 700; line-height: 1.2; color: #F6F1FB; }
  .vt-pp .pp-cell-s { font-size: 10px; line-height: 1.2; color: var(--pp-sous); }
  .vt-pp .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-pp .pp-hero { padding: 74px 12px 20px; }
    .vt-pp .pp-envol { left: 0; }
    /* 128 at right 10 ⇒ the orbit owns past x=182, and the column stops at 168. */
    .vt-pp .pp-orb-wrap { top: 116px; right: 10px; width: 128px; height: 128px; }
    .vt-pp .pp-orbite { width: 128px; height: 128px; }
    .vt-pp .pp-col { width: calc(100% - 140px); min-height: 214px; }
    .vt-pp .pp-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-pp .pp-name.vt-ent-long { font-size: 21px; }
    .vt-pp .pp-mono { font-size: 48px; }
    .vt-pp .pp-bienv-t { font-size: 16px; }
    .vt-pp .pp-trust { padding: 11px 2px; }
    .vt-pp .pp-cell { padding: 0 4px; gap: 5px; }
    .vt-pp .pp-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
