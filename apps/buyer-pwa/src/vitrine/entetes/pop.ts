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
 * ENTETES-H · SÉRIE 3 — 14 · POP — « BD bleu roi, contours noirs, ombres
 * dures ».
 *
 * SOURCE OF TRUTH: the id="pop" block of « En-tetes Boutique - Serie 3 » and
 * its « Relevé — Pop ».
 *
 * A COMIC PANEL. Every surface is a flat colour with a 2–3px black outline and
 * a hard offset shadow (no blur), the photograph sits in a browser-window card
 * tilted −1°, and the proof arrives in a speech bubble. Speed rays, two
 * halftone grids, a lightning bolt and a burst star are all CSS or inline SVG.
 *
 * FULL WIDTH BUT IT STILL HAS A TIER, and this is the trap in the series:
 * « pleine largeur (13, 14) : pas de règle fixe (Pop : 24 px si > 14) ». Prisme
 * — the other full-width style — has NO tier; Pop has one at 24px. Same clause,
 * opposite answers, so both are pinned by tests.
 *
 * THE BADGE IS TWO-TONE, AND THE STRING STAYS WHOLE. The board sets
 * « NOUVELLE » in white over « VENDEUSE » in orange italic. That is two colours
 * on one catalog string, so the split is DERIVED from `vit.nouvelle_vendeuse`
 * at its last space — never re-authored as two literals, which is what loi 6
 * forbids and what `verifieeBare` already does for the zone label. A one-word
 * string degrades to a single line rather than losing a word.
 *
 * Bio not drawn — série 3 shows a présentation on Perle and Artisan only.
 */

/** « Nouvelle vendeuse » in two tones, DERIVED from the catalog entry. The
 *  head and the last word are styled apart; nothing is re-typed here. */
function badgeDeuxTons(): string {
  const s = t('vit.nouvelle_vendeuse').trim();
  const i = s.lastIndexOf(' ');
  if (i === -1) return `<span class="po-nv-1"><v>${s}</v></span>`;
  // THE SEPARATOR SURVIVES. Slicing at the space and dropping it would leave
  // « Nouvellevendeuse » in the accessibility tree and on copy — the flex
  // column stacks the two spans whatever the markup says, so the space costs
  // nothing visually and is what keeps the rendered text equal to the catalog
  // entry. A test asserts the two tones reassemble byte for byte.
  return (
    `<span class="po-nv-1"><v>${s.slice(0, i)}</v></span> ` +
    `<span class="po-nv-2"><v>${s.slice(i + 1)}</v></span>`
  );
}

const eclair = (): string =>
  '<svg class="po-eclair" aria-hidden="true" width="20" height="30" viewBox="0 0 20 30">' +
  '<path d="M12 1L3 16h6l-3 13 11-18h-7z" fill="#F97316" stroke="#111111" stroke-width="1.6" stroke-linejoin="round"/></svg>';

const explosion = (): string =>
  '<svg class="i" aria-hidden="true" width="34" height="26" viewBox="0 0 34 26">' +
  '<path d="M17 1l3.4 6.2 7-2.4-2.4 7L31 17l-6.9 2 1 7-7.1-3.4L11 26l1-7-7-2 5.9-5.2-2.3-7 6.9 2.4z" fill="#F97316" stroke="#111111" stroke-width="1.6" stroke-linejoin="round"/></svg>';

/** The 12-point star that carries the seal's check. */
const sceauEtoile = (): string =>
  '<span class="po-seal" aria-hidden="true">' +
  '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M13 0l2.6 4.8 5.4-1.9-1.9 5.4L24 13l-4.9 2.6 1.9 5.4-5.4-1.9L13 26l-2.6-4.9-5.4 1.9 1.9-5.4L0 13l4.9-2.6-1.9-5.4 5.4 1.9z" fill="#2563EB" stroke="#111111" stroke-width="1.4" stroke-linejoin="round"/></svg>' +
  `<span class="po-seal-c">${iconCheckEnt(12, '#FFFFFF', 3.6)}</span></span>`;

const burst = (): string =>
  '<svg class="po-burst" aria-hidden="true" width="52" height="52" viewBox="0 0 52 52">' +
  '<path d="M26 2l5 9.6 10.4-3.6-3.6 10.4L47.4 22 38 27l3.8 10.4-10.4-3.6L26 44l-5.4-10.2-10.4 3.6L14 27l-9.4-5 9.6-3.6L10.6 8l10.4 3.6z" fill="#FFFFFF" stroke="#111111" stroke-width="1.6" stroke-linejoin="round" opacity=".9"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, tone: string, label: string, sub: string): string =>
    `<div class="po-cell po-cell--${tone}"><span class="po-cell-i">${icon}</span><span class="po-cell-l">${label}</span><span class="po-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-po" data-role="vitrine-hero">',
    '<div class="po-hero">',
    '<span class="po-pts-c" aria-hidden="true"></span>',
    '<span class="po-pts-n" aria-hidden="true"></span>',
    eclair(),
    '<div class="po-tete">',
    `<span class="po-marque">Shop<span class="po-marque-p">+</span></span>`,
    explosion(),
    '</div>',
    '<div class="po-col" data-role="vitrine-identity">',
    `<div class="po-name${v.longName ? ' vt-ent-long' : ''}">${weldSeal(v.tail, sceauEtoile())}</div>`,
    v.hasTag ? `<div class="po-bienv"><span class="po-bienv-c"><span class="po-bienv-t"><v>${v.tagline}</v></span></span></div>` : '',
    `<div class="po-zone-wrap"><span class="po-zone">${zoneLine(v, iconPinSolid(12, '#2563EB', '#F5E9D0'))}</span></div>`,
    '</div>',
    // the browser window — flat crème, 3px outline, hard shadow, tilted −1°
    `<div class="po-fenetre" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    '<div class="po-barre" aria-hidden="true"><i></i><i></i><i></i></div>',
    '<div class="po-ecran">',
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="po-motif"><span class="po-mono">${v.mono}</span></div>`,
    '</div>',
    '</div>',
    '<div class="po-pied">',
    v.showProof
      ? `<span class="po-bulle" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="po-avis" data-role="chip-avis">${iconStarEnt(12, '#F97316')}${avisChip(v)}</span>`
            : ''
        }`
      : '',
    v.nouvelle
      ? `<span class="po-nouv-wrap" data-role="chip-nouvelle">${burst()}<span class="po-nouv">${badgeDeuxTons()}</span></span>`
      : '',
    '</div>',
    // the tricolour band bleeds to the card's edges
    '<div class="po-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#F5E9D0', 2.1), 'b', t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#F5E9D0', 2.1), 'o', t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#F5E9D0', 2.1), 'b', t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    controls(v, 'po', 'right', '20px', '72px', '#F5E9D0'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 14 · POP (série 3) ══════════════════════
     Relevé — bleu roi #1D4ED8 (motif #2953C4, sceau #2563EB) · orange #F97316 ·
     crème BD #F5E9D0 · noir contour #111111 (traits 2–3, ombres DURES 3–5px 0,
     jamais floues) · sourds #BFD0FA / #5C2604. */
  .vt-po {
    --po-bleu: #1D4ED8; --po-motif: #2953C4; --po-sceau: #2563EB;
    --po-orange: #F97316; --po-creme: #F5E9D0; --po-noir: #111111;
    --po-sourd: #BFD0FA;
    background: var(--po-bleu);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad */
  .vt-po .po-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 16px;
    background-color: var(--po-bleu);
    background-image: repeating-conic-gradient(from 0deg at 50% 30%, rgba(255,255,255,.07) 0 4deg, transparent 4deg 14deg);
  }
  /* halftone grids — relevé top 8 (+60) and bottom 120 (anchored, unchanged) */
  .vt-po .po-pts-c {
    position: absolute; top: 68px; right: 10px; width: 64px; height: 48px;
    background-image: radial-gradient(circle, rgba(245,233,208,.5) 1.6px, transparent 1.8px);
    background-size: 9px 9px;
  }
  .vt-po .po-pts-n {
    position: absolute; left: 8px; bottom: 120px; width: 52px; height: 64px;
    background-image: radial-gradient(circle, rgba(0,0,0,.4) 1.6px, transparent 1.8px);
    background-size: 9px 9px;
  }
  /* relevé top 120, + 60 */
  .vt-po .po-eclair { position: absolute; right: 14px; top: 180px; }
  .vt-po .po-tete { position: relative; display: flex; align-items: center; justify-content: space-between; }
  .vt-po .po-marque {
    display: inline-flex; align-items: center; height: 30px; padding: 0 12px; border-radius: 8px;
    background: var(--po-noir); border: 2px solid var(--po-creme);
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 13px; color: #FFFFFF;
  }
  .vt-po .po-marque-p { color: var(--po-orange); }
  .vt-po .po-col { position: relative; }
  .vt-po .po-name {
    margin-top: 12px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.02; letter-spacing: -.01em;
    text-transform: uppercase; color: var(--po-creme);
    text-shadow: 3px 3px 0 var(--po-noir); overflow-wrap: break-word;
  }
  /* « Pop : 24 px si > 14 » — full width AND a tier, unlike Prisme */
  .vt-po .po-name.vt-ent-long { font-size: 24px; }
  /* the accent segment is orange AND italic here */
  .vt-po .po-name .vt-ent-acc { color: var(--po-orange); font-style: italic; }
  .vt-po .po-seal { position: relative; display: inline-flex; width: 26px; height: 26px; vertical-align: -3px; margin-left: 8px; }
  .vt-po .po-seal svg { position: absolute; inset: 0; }
  .vt-po .po-seal-c { position: absolute; top: 7px; left: 7px; display: flex; }
  .vt-po .po-bienv { position: relative; margin-top: 9px; }
  .vt-po .po-bienv-c {
    display: inline-flex; min-height: 30px; align-items: center; padding: 4px 13px;
    background: var(--po-noir); transform: skew(-8deg); border-radius: 4px;
  }
  .vt-po .po-bienv-t {
    transform: skew(8deg);
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 14px; font-style: italic; text-transform: uppercase; color: var(--po-creme); line-height: 1.2;
  }
  .vt-po .po-zone-wrap { position: relative; margin-top: 8px; }
  .vt-po .po-zone {
    display: inline-flex; align-items: center; gap: 5px; min-height: 30px; padding: 5px 12px;
    border-radius: 8px; background: var(--po-creme); border: 2px solid var(--po-noir);
    box-shadow: 3px 3px 0 var(--po-noir);
    font-size: 11px; font-weight: 700; line-height: 1.35; color: var(--po-noir);
  }
  .vt-po .po-zone svg { flex: none; }
  /* THE BROWSER WINDOW — hard shadow, no blur, tilted −1° */
  .vt-po .po-fenetre {
    position: relative; margin-top: 12px; background: var(--po-creme);
    border: 3px solid var(--po-noir); border-radius: 10px;
    box-shadow: 5px 5px 0 rgba(0,0,0,.55); transform: rotate(-1deg);
  }
  .vt-po .po-barre { display: flex; align-items: center; gap: 5px; padding: 6px 9px; border-bottom: 3px solid var(--po-noir); }
  .vt-po .po-barre i { width: 9px; height: 9px; border-radius: 50%; }
  .vt-po .po-barre i:nth-child(1) { background: var(--po-noir); }
  .vt-po .po-barre i:nth-child(2) { background: var(--po-orange); }
  .vt-po .po-barre i:nth-child(3) { background: var(--po-sceau); }
  .vt-po .po-ecran { position: relative; height: 158px; overflow: hidden; border-radius: 0 0 6px 6px; }
  .vt-po .po-ecran .vt-avatar-img { object-position: 50% 26%; }
  .vt-po .po-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--po-motif);
    background-image: radial-gradient(circle, rgba(245,233,208,.4) 1.8px, transparent 2px);
    background-size: 12px 12px;
  }
  .vt-po .po-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 66px; line-height: 1; color: rgba(245,233,208,.5); text-shadow: 3px 3px 0 rgba(0,0,0,.5);
  }
  .vt-po .po-pied { position: relative; margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  /* THE SPEECH BUBBLE — one square corner is what makes it a bubble */
  .vt-po .po-bulle {
    display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px;
    background: var(--po-creme); border: 2.5px solid var(--po-noir);
    border-radius: 14px 14px 14px 3px; box-shadow: 3px 3px 0 var(--po-noir);
    font-size: 10.5px; font-weight: 700; line-height: 1.25; color: var(--po-noir); max-width: 100%;
  }
  .vt-po .po-bulle b { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 15px; }
  .vt-po .po-avis {
    display: inline-flex; align-items: center; gap: 5px; height: 34px; padding: 0 12px;
    border-radius: 99px; background: var(--po-noir); border: 2px solid var(--po-creme);
    font-size: 11px; font-weight: 700; color: var(--po-creme); white-space: nowrap;
  }
  .vt-po .po-avis svg { flex: none; }
  /* MINIMAL — the burst behind a tilted black chip. It lives in the footer row,
     well clear of the control corner. */
  .vt-po .po-nouv-wrap { position: relative; display: inline-flex; margin-left: auto; }
  .vt-po .po-burst { position: absolute; left: -18px; top: -8px; }
  .vt-po .po-nouv {
    position: relative; display: inline-flex; flex-direction: column; align-items: flex-start;
    padding: 7px 13px; background: var(--po-noir); border: 2px solid var(--po-creme);
    border-radius: 6px; transform: rotate(-2deg); box-shadow: 4px 4px 0 rgba(0,0,0,.5);
  }
  .vt-po .po-nv-1, .vt-po .po-nv-2 {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 13px; text-transform: uppercase; line-height: 1.1;
  }
  .vt-po .po-nv-1 { color: #FFFFFF; }
  .vt-po .po-nv-2 { color: var(--po-orange); font-style: italic; }
  /* the tricolour band, bleeding to the card's own edges */
  .vt-po .po-trust {
    position: relative; margin: 14px -14px -16px; display: grid; grid-template-columns: 1fr 1fr 1fr;
    border-top: 3px solid var(--po-noir);
  }
  .vt-po .po-cell { padding: 11px 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .vt-po .po-cell--b { background: var(--po-bleu); }
  .vt-po .po-cell--o { background: var(--po-orange); }
  .vt-po .po-cell + .po-cell { border-left: 3px solid var(--po-noir); }
  .vt-po .po-cell-i {
    width: 32px; height: 32px; flex: none; border-radius: 8px; background: var(--po-noir);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-po .po-cell-l {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 9.5px; text-transform: uppercase; line-height: 1.25; color: var(--po-creme);
    text-shadow: 1.5px 1.5px 0 var(--po-noir);
  }
  .vt-po .po-cell--o .po-cell-l { color: #FFFFFF; }
  .vt-po .po-cell-s { font-size: 8px; font-weight: 600; line-height: 1.25; color: var(--po-sourd); }
  .vt-po .po-cell--o .po-cell-s { color: #5C2604; }
  .vt-po .po-btn { background: var(--po-noir); box-shadow: inset 0 0 0 2px var(--po-creme); }
  .vt-po .vt-ent-btn { top: 70px; }
  .vt-po .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-po .po-hero { padding: 74px 12px 14px; }
    .vt-po .po-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-po .po-name.vt-ent-long { font-size: 21px; }
    .vt-po .po-ecran { height: 140px; }
    .vt-po .po-mono { font-size: 56px; }
    .vt-po .po-bienv-t { font-size: 13px; }
    .vt-po .po-trust { margin: 14px -12px -14px; }
    .vt-po .po-cell { padding: 10px 4px; gap: 4px; }
    .vt-po .po-cell-i { width: 28px; height: 28px; }
  }
`;

export const unit: EnteteUnit = { render, css };
