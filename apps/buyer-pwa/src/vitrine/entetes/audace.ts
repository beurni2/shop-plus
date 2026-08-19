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
 * ENTETES-H · SÉRIE 3 — 11 · AUDACE — « marine, orange & bleu, géométrie
 * diagonale ».
 *
 * SOURCE OF TRUTH: the id="audace" block of « En-tetes Boutique - Serie 3 »
 * and its « Relevé — Audace ». Série 3 is a faithful replica of ten supplied
 * boards, so unlike série 2 there IS an original image behind every number.
 *
 * DIAGONALS EVERYWHERE. Four `clip-path` triangles and two dot grids build the
 * geometry; the photo is a 172px circle pushed off the right edge at −42, so a
 * third of it is cut. All CSS — no image is fetched at runtime.
 *
 * THE NAME IS BICOLORE, which is new in this series: « le dernier segment porte
 * la couleur d'accent ». The head stays white and the accent segment turns
 * orange, through `.vt-ent-acc` — the same span `nameTail` already produces for
 * the anti-orphan rule, now carrying colour as well.
 *
 * NO BUTTONS IN THE CONTRACT, and that is a real gap, not an oversight of
 * mine: série 3's boards carry an app bar that the CTO adaptation removes, so
 * the standalone draws no partager/retour at all. They follow série 4's
 * convention — the other app-bar-adapted series — rather than being invented
 * per style: right 20 / 72, top 70, back in the near slot.
 */

/** The proof glyph — a pair of silhouettes, the visual's own « clientes » mark.
 *  Local to this style: it appears nowhere else, so it does not earn a place in
 *  the shared icon set. */
const iconGroupe = (size: number, fill: string): string =>
  `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}"><path d="M16 11a3 3 0 10-3-3 3 3 0 003 3zM8 11a3 3 0 10-3-3 3 3 0 003 3zm8 2c-2.2 0-4.4 1-4.4 3v2h8.8v-2c0-2-2.2-3-4.4-3zm-8 0c-.3 0-.6 0-.9.1A4.4 4.4 0 019.6 16v2H3.2v-2c0-2 2.6-3 4.8-3z"/></svg>`;

/** The flame on the MINIMAL banner — likewise this style's own. */
const iconFlamme = (size: number, fill: string): string =>
  `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}"><path d="M13.5 2s.7 2.6-.9 4.9C11.2 9 9.3 9.9 9.3 12.2c0 1.5 1 2.6 2.3 2.9-.6-1.4.1-2.7 1.2-3.4 1.6 1.1 4.2 1 4.2-2.2 2 1.7 3 4 3 6.1 0 3.9-3.2 6.4-7 6.4s-7.2-2.6-7.2-6.8C5.8 8.9 13.5 8.1 13.5 2z"/></svg>`;

function render(v: Vals): string {
  const cell = (icon: string, tone: string, label: string, sub: string): string =>
    `<div class="au-cell"><span class="au-cell-i au-cell-i--${tone}">${icon}</span><span class="au-cell-l">${label}</span><span class="au-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-au" data-role="vitrine-hero">',
    '<div class="au-hero">',
    // the diagonal geometry — four triangles and two dot grids, all CSS
    '<span class="au-tri-o" aria-hidden="true"></span>',
    '<span class="au-tri-b" aria-hidden="true"></span>',
    '<span class="au-tri-bd" aria-hidden="true"></span>',
    '<span class="au-pts-b" aria-hidden="true"></span>',
    '<span class="au-pts-g" aria-hidden="true"></span>',
    // the app chip + the visual's fixed line, from the catalog like every string
    '<div class="au-marque">',
    `<span class="au-marque-c">${v.mono}</span>`,
    `<span class="au-marque-t">${t('vit.au_partenaire')}</span>`,
    '</div>',
    // the photograph: a 172 circle pushed off the right edge, a third cut away
    `<div class="au-cercle" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '40% 28%')
      : `<div class="au-motif"><span class="au-mono">${v.mono}</span></div>`,
    '</div>',
    '<span class="au-tri-s" aria-hidden="true"></span>',
    '<div class="au-col" data-role="vitrine-identity">',
    `<div class="au-name${v.longName ? ' vt-ent-long' : ''}">${weldSeal(v.tail, `<span class="au-seal" aria-hidden="true"><span class="au-seal-d">${iconCheckEnt(12, '#FFFFFF', 3.4)}</span><span class="au-seal-f"></span></span>`)}</div>`,
    v.hasTag ? `<div class="au-bienv"><v>${v.tagline}</v><span class="au-barre" aria-hidden="true"></span></div>` : '',
    `<div class="au-zone">${zoneLine(v, iconPinSolid(12, '#2563EB', '#0F1D2B'))}</div>`,
    v.showProof
      ? `<div class="au-proof"><span class="au-proof-i">${iconGroupe(17, '#FFFFFF')}</span><span class="au-proof-t"><span data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="au-stars" data-role="chip-avis"> · ${iconStarEnt(10, '#F97316')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="au-nouv-wrap"><span class="au-nouv" data-role="chip-nouvelle"><span class="au-nouv-i">${iconFlamme(15, '#F97316')}</span><span class="au-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '<div class="au-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#FFFFFF', 2), 'b', t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(16, '#FFFFFF', 2), 'o', t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(16, '#FFFFFF', 2), 'b', t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    controls(v, 'au', '#FFFFFF'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 11 · AUDACE (série 3) ══════════════════════
     Relevé — marine #0F1D2B (motif #142C42) · orange #F97316→#EA580C · bleu
     #2563EB / clair #5B8DEF · crème #FCEBDD · encre #12263A · sourds #D7E3F2 /
     #8C7B68 · séparateur #EDD9C4. */
  .vt-au {
    --au-marine: #0F1D2B; --au-motif: #142C42;
    --au-orange: #F97316; --au-orange-2: #EA580C;
    --au-bleu: #2563EB; --au-bleu-clair: #5B8DEF;
    --au-creme: #FCEBDD; --au-encre: #12263A;
    --au-sourd: #D7E3F2; --au-sourd-2: #8C7B68; --au-sep: #EDD9C4;
    background: var(--au-marine);
  }
  /* padding-top 76 = the relevé's 16 + the shell's 60 status pad */
  .vt-au .au-hero { position: relative; overflow: hidden; margin-top: -60px; padding: 76px 16px 16px; background: var(--au-marine); }
  /* the corner triangles keep their raw 0: they are anchored to the card's real
     corner, above the status pad — the série 2 sunburst placement */
  .vt-au .au-tri-o {
    position: absolute; top: 0; left: 0; width: 80px; height: 80px; opacity: .95;
    background: linear-gradient(135deg, var(--au-orange) 0%, var(--au-orange-2) 100%);
    clip-path: polygon(0 0, 100% 0, 0 100%);
  }
  .vt-au .au-tri-b {
    position: absolute; top: 0; left: 34px; width: 56px; height: 56px; opacity: .85;
    background: var(--au-bleu); clip-path: polygon(0 0, 100% 0, 0 100%);
  }
  .vt-au .au-tri-bd {
    position: absolute; right: 0; bottom: 0; width: 140px; height: 110px; opacity: .8;
    background: linear-gradient(315deg, var(--au-orange) 0%, rgba(249,115,22,0) 70%);
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }
  /* relevé top 10, + 60 for the status pad */
  .vt-au .au-pts-b {
    position: absolute; right: 12px; top: 70px; width: 64px; height: 46px;
    background-image: radial-gradient(circle, rgba(255,255,255,.55) 1.3px, transparent 1.5px);
    background-size: 10px 10px;
  }
  /* anchored to the BOTTOM, so it keeps the relevé's value untouched */
  .vt-au .au-pts-g {
    position: absolute; left: 8px; bottom: 96px; width: 46px; height: 60px;
    background-image: radial-gradient(circle, rgba(37,99,235,.6) 1.3px, transparent 1.5px);
    background-size: 10px 10px;
  }
  .vt-au .au-marque { position: relative; display: flex; align-items: center; gap: 9px; }
  .vt-au .au-marque-c {
    width: 36px; height: 36px; flex: none; border-radius: 10px; background: var(--au-bleu);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 6px 14px -6px rgba(37,99,235,.8);
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 19px; color: #FFFFFF;
  }
  .vt-au .au-marque-t { font-size: 9.5px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: var(--au-bleu-clair); }
  /* THE PHOTOGRAPH — relevé top 64, + 60 */
  .vt-au .au-cercle {
    position: absolute; top: 124px; right: -42px; width: 172px; height: 172px;
    border-radius: 50%; overflow: hidden;
    box-shadow: 0 0 0 4px var(--au-creme), 0 18px 40px -16px rgba(0,0,0,.7);
  }
  .vt-au .au-cercle .vt-avatar-img { object-position: 40% 28%; }
  .vt-au .au-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--au-motif);
    background-image:
      repeating-linear-gradient(45deg, rgba(249,115,22,.28) 0 2px, transparent 2px 13px),
      repeating-linear-gradient(-45deg, rgba(37,99,235,.25) 0 2px, transparent 2px 13px);
  }
  /* the monogram shifts LEFT, toward the part of the circle that is on screen */
  .vt-au .au-mono {
    margin-right: 36px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 60px; line-height: 1; color: rgba(255,255,255,.3);
  }
  /* relevé top 210, + 60 */
  .vt-au .au-tri-s {
    position: absolute; top: 270px; right: 6px; width: 52px; height: 52px; opacity: .9;
    background: var(--au-bleu); clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }
  /* the text column stops short of the circle */
  .vt-au .au-col { position: relative; margin-top: 12px; width: calc(100% - 128px); }
  .vt-au .au-name {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(24px, 8.4cqw, 29px); line-height: 1.04; letter-spacing: -.03em;
    color: #FFFFFF; overflow-wrap: break-word;
  }
  /* split column ⇒ the fixed tier applies */
  .vt-au .au-name.vt-ent-long { font-size: 20px; }
  /* NOM BICOLORE — « le dernier segment porte la couleur d'accent » */
  .vt-au .au-name .vt-ent-acc { color: var(--au-orange); }
  .vt-au .au-seal { position: relative; display: inline-flex; width: 22px; height: 22px; vertical-align: -2px; margin-left: 7px; }
  .vt-au .au-seal-d {
    position: absolute; inset: 0; border-radius: 50%; background: var(--au-bleu);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-au .au-seal-f { position: absolute; inset: -3px; border-radius: 50%; border: 1.5px dashed rgba(37,99,235,.65); }
  .vt-au .au-bienv { margin-top: 6px; font-size: 15px; font-weight: 700; color: var(--au-creme); }
  .vt-au .au-barre { display: block; width: 34px; height: 3px; margin-top: 4px; background: var(--au-orange); border-radius: 2px; }
  .vt-au .au-zone { margin-top: 8px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: #FFFFFF; }
  .vt-au .au-zone svg { vertical-align: -2px; margin-right: 4px; }
  .vt-au .au-proof { margin-top: 10px; display: flex; align-items: center; gap: 8px; }
  .vt-au .au-proof-i {
    width: 34px; height: 34px; flex: none; border-radius: 50%; background: var(--au-bleu);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-au .au-proof-t { font-size: 11.5px; line-height: 1.35; color: var(--au-sourd); }
  .vt-au .au-proof-t b { font-weight: 800; font-size: 14px; color: #FFFFFF; }
  .vt-au .au-stars { white-space: nowrap; }
  .vt-au .au-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — the skewed banner, right-aligned as the board places it. The
     inner pieces counter-skew so the type and the disc stay upright. */
  .vt-au .au-nouv-wrap { position: relative; margin-top: 14px; display: flex; justify-content: flex-end; }
  .vt-au .au-nouv {
    display: inline-flex; align-items: center; gap: 9px; height: 44px; padding: 0 16px 0 7px;
    background: linear-gradient(115deg, var(--au-orange), var(--au-orange-2));
    transform: skew(-6deg); border-radius: 6px; white-space: nowrap;
    box-shadow: 0 10px 24px -10px rgba(249,115,22,.8);
  }
  .vt-au .au-nouv-i {
    width: 30px; height: 30px; flex: none; border-radius: 50%; background: var(--au-marine);
    display: flex; align-items: center; justify-content: center; transform: skew(6deg);
  }
  .vt-au .au-nouv-t {
    transform: skew(6deg);
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 13.5px; letter-spacing: .02em; text-transform: uppercase; color: #FFFFFF;
  }
  .vt-au .au-trust {
    position: relative; margin-top: 14px; padding: 12px 2px; border-radius: 16px; background: var(--au-creme);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-au .au-cell { padding: 0 7px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-au .au-cell + .au-cell { border-left: 1px solid var(--au-sep); }
  .vt-au .au-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }
  /* the board alternates blue / orange / blue */
  .vt-au .au-cell-i--b { background: var(--au-bleu); }
  .vt-au .au-cell-i--o { background: var(--au-orange); }
  .vt-au .au-cell-l { font-size: 10px; font-weight: 700; line-height: 1.28; color: var(--au-encre); }
  .vt-au .au-cell-s { font-size: 8.5px; line-height: 1.25; color: var(--au-sourd-2); }
  .vt-au .au-btn { background: rgba(15,29,43,.55); box-shadow: inset 0 0 0 1px rgba(255,255,255,.3); }
  .vt-au .vt-ent-btn { top: 70px; }
  .vt-au .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-au .au-hero { padding: 76px 12px 12px; }
    .vt-au .au-cercle { top: 120px; right: -52px; width: 156px; height: 156px; }
    .vt-au .au-col { width: calc(100% - 106px); }
    .vt-au .au-name { font-size: clamp(21px, 8.4cqw, 26px); }
    .vt-au .au-name.vt-ent-long { font-size: 19px; }
    .vt-au .au-mono { font-size: 52px; margin-right: 32px; }
    .vt-au .au-marque-t { letter-spacing: .16em; }
    .vt-au .au-trust { padding: 11px 1px; }
    .vt-au .au-cell { padding: 0 5px; gap: 5px; }
    .vt-au .au-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
