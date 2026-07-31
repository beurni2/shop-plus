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
 * ENTETES-H · SÉRIE 5 — 30 · PAGNE — « le pagne des grands jours ».
 *
 * SOURCE OF TRUTH: the id="pagne" block of « En-tetes Boutique - Serie 5 » and
 * its « Relevé — Pagne ». Origine: création originale — aucune image source.
 *
 * THE ONE LIGHT HEADER OF THE SERIES, and the loudest. Cream ground, ink type,
 * and wax motifs stated frankly: concentric quarter-discs hanging off two
 * corners, a scatter of fat orange dots, two four-petal wax stars, and a CROWN
 * OF EIGHT BEADS ringing the portrait. The relevé's own intent line is the
 * brief for the restraint — « joie maîtrisée sur fond crème pour rester
 * e-commerce » — so the colour lives in the ornament and never in the type.
 *
 * THE BEAD CROWN IS PLACED IN PERCENTAGES, not pixels. Eight beads on a circle
 * whose radius is 52% of the frame reads identically at 146 and at 128, so one
 * set of eight rules serves both widths instead of sixteen. The crown also
 * fixes the header's two hard clearances: it reaches ~9px beyond the white
 * liseré, so BOTH the column's right edge and the controls above are measured
 * from the OUTERMOST BEAD, never from the circle.
 *
 * THE RELEVÉ'S « padding-top: 42px » BUYS CLEARANCE FROM THE CORNER MOTIF, and
 * I had to be shown that. I first read it as clearance from the portrait's arc,
 * decided the column already got that from its width, and dropped it — and the
 * first screenshot put « Bienvenue chez moi » in teal ON TOP of the fuchsia
 * quarter-disc, unreadable. The disc is anchored at the corner and reaches
 * 46px in; no text can start at the padded edge and clear it. The 42px is the
 * relevé being right about its own drawing.
 *
 * Verified seal on its own line (série 4/5 convention). Bio not drawn.
 * Split column ⇒ the série 5 tier of 24px.
 */

/** A four-petal wax star. */
const etoile = (size: number, fill: string, cls: string): string =>
  `<svg class="${cls}" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}">` +
  '<path d="M12 0c1.1 8.2 3.8 10.9 12 12-8.2 1.1-10.9 3.8-12 12-1.1-8.2-3.8-10.9-12-12C8.2 10.9 10.9 8.2 12 0z"/></svg>';

/** The heart beside her welcome line. */
const coeur = (size: number): string =>
  `<svg class="pg-coeur" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="#E0407F">` +
  '<path d="M12 21S3 14.6 3 8.8A5.3 5.3 0 0 1 12 5.3 5.3 5.3 0 0 1 21 8.8C21 14.6 12 21 12 21z"/></svg>';

/** The scalloped wax flower behind the MINIMAL badge — twelve lobes on a disc. */
const fleur = (): string => {
  const lobes = [
    [94, 52], [88.4, 73], [73, 88.4], [52, 94], [31, 88.4], [15.6, 73],
    [10, 52], [15.6, 31], [31, 15.6], [52, 10], [73, 15.6], [88.4, 31],
  ]
    .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="10"/>`)
    .join('');
  return (
    '<svg class="pg-fleur" aria-hidden="true" width="104" height="104" viewBox="0 0 104 104">' +
    `<g fill="#E0407F"><circle cx="52" cy="52" r="43"/>${lobes}</g>` +
    '<circle cx="52" cy="52" r="35" fill="none" stroke="#FFFFFF" stroke-width="1.4" stroke-dasharray="2 4.5"/></svg>'
  );
};

/** The crown — eight wax beads, alternating, ringing the portrait. */
const couronne = (): string =>
  [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<span class="pg-perle pg-perle--${i}" aria-hidden="true"></span>`).join('');

function render(v: Vals): string {
  const cell = (icon: string, tone: string, label: string, sub: string): string =>
    `<div class="pg-cell"><span class="pg-cell-i pg-cell-i--${tone}">${icon}</span><span class="pg-cell-l">${label}</span><span class="pg-cell-s pg-cell-s--${tone}">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-pg" data-role="vitrine-hero">',
    '<div class="pg-hero">',
    '<span class="pg-anneau-a" aria-hidden="true"></span>',
    '<span class="pg-disque-a" aria-hidden="true"></span>',
    '<span class="pg-anneau-b" aria-hidden="true"></span>',
    '<span class="pg-disque-b" aria-hidden="true"></span>',
    '<span class="pg-pois" aria-hidden="true"></span>',
    etoile(20, '#F2B21E', 'pg-etoile pg-etoile--a'),
    etoile(15, '#1F9E8E', 'pg-etoile pg-etoile--b'),
    // the portrait and its crown of eight beads
    '<div class="pg-photo-wrap">',
    `<div class="pg-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="pg-motif"><span class="pg-mono">${v.mono}</span></div>`,
    '</div>',
    couronne(),
    '</div>',
    '<div class="pg-col" data-role="vitrine-identity">',
    v.hasTag ? `<div class="pg-bienv"><span class="pg-bienv-t">${coeur(13)}<v>${v.tagline}</v></span></div>` : '',
    `<div class="pg-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    '<span class="pg-perles" aria-hidden="true"><i></i><i></i><i></i></span>',
    `<div class="pg-verif"><span class="pg-verif-i">${iconCheckEnt(9, '#FFFFFF', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="pg-zone">${iconPinEnt(12, '#178073', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="pg-proof-wrap"><span class="pg-proof"><span class="pg-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="pg-stars" data-role="chip-avis">${iconStarEnt(10, '#F28C28')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="pg-nouv-wrap"><span class="pg-nouv" data-role="chip-nouvelle">${fleur()}<span class="pg-nouv-in">${etoile(
          13,
          '#F2B21E',
          'pg-etoile-n',
        )}<span class="pg-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="pg-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#FFFFFF', 2.1), 'f', t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#FFFFFF', 2.1), 'o', t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#FFFFFF', 2.1), 's', t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'pg', 'right', '20px', '72px', '#2A1E22'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 30 · PAGNE (série 5) ══════════════════════
     Relevé — crème #FFF6EC · fuchsia #E0407F (fond preuve #FBE3EE, texte
     #8A3A5C) · orange #F28C28 / #C46A18 · sarcelle #1F9E8E / #178073 ·
     soleil #F2B21E · encre #2A1E22. */
  .vt-pg {
    --pg-creme: #FFF6EC; --pg-fuchsia: #E0407F; --pg-rose: #FBE3EE; --pg-vin: #8A3A5C;
    --pg-orange: #F28C28; --pg-orange-2: #C46A18;
    --pg-sarcelle: #1F9E8E; --pg-sarcelle-2: #178073; --pg-soleil: #F2B21E;
    --pg-encre: #2A1E22;
    background: var(--pg-creme);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad */
  .vt-pg .pg-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 16px;
    background: var(--pg-creme);
  }
  /* MOTIFS WAX — concentric quarter-discs hanging off two corners. The circles
     are whole; the hero's overflow is what makes them quarters. */
  .vt-pg .pg-disque-a { position: absolute; left: -42px; top: 2px; width: 84px; height: 84px; border-radius: 50%; background: var(--pg-fuchsia); }
  .vt-pg .pg-anneau-a { position: absolute; left: -64px; top: -24px; width: 128px; height: 128px; border-radius: 50%; border: 5px solid var(--pg-orange); }
  .vt-pg .pg-disque-b { position: absolute; right: -42px; bottom: -42px; width: 84px; height: 84px; border-radius: 50%; background: var(--pg-sarcelle); }
  .vt-pg .pg-anneau-b { position: absolute; right: -70px; bottom: -70px; width: 140px; height: 140px; border-radius: 50%; border: 4px dotted var(--pg-fuchsia); }
  .vt-pg .pg-pois {
    position: absolute; left: 6px; bottom: 18px; width: 118px; height: 74px;
    background-image: radial-gradient(circle, rgba(242,140,40,.55) 3.2px, transparent 3.6px);
    background-size: 22px 22px;
  }
  .vt-pg .pg-etoile { position: absolute; }
  .vt-pg .pg-etoile--a { right: 128px; top: 78px; }
  .vt-pg .pg-etoile--b { left: 128px; bottom: 26px; }
  /* THE PORTRAIT AND ITS CROWN. The wrap IS the circle box, so the beads can be
     placed as percentages of it and read the same at 146 and at 128. */
  .vt-pg .pg-photo-wrap { position: absolute; top: 126px; right: 14px; width: 146px; height: 146px; }
  .vt-pg .pg-photo {
    position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
    box-shadow: 0 0 0 3px #FFFFFF, 0 14px 30px -16px rgba(42,30,34,.5);
  }
  .vt-pg .pg-photo .vt-avatar-img { object-position: 50% 26%; }
  .vt-pg .pg-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: #FBE9F1;
    background-image:
      radial-gradient(circle, rgba(224,64,127,.5) 3px, transparent 3.4px),
      radial-gradient(circle, rgba(31,158,142,.45) 2.4px, transparent 2.8px);
    background-size: 26px 26px, 26px 26px;
    background-position: 0 0, 13px 13px;
  }
  .vt-pg .pg-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 56px; line-height: 1; color: var(--pg-fuchsia);
  }
  .vt-pg .pg-perle {
    position: absolute; width: 13px; height: 13px; border-radius: 50%;
    transform: translate(-50%, -50%); background: var(--pg-orange);
  }
  .vt-pg .pg-perle--2, .vt-pg .pg-perle--4, .vt-pg .pg-perle--6, .vt-pg .pg-perle--8 { background: var(--pg-sarcelle); }
  .vt-pg .pg-perle--1 { left: 102%; top: 50%; }
  .vt-pg .pg-perle--2 { left: 86.8%; top: 86.8%; }
  .vt-pg .pg-perle--3 { left: 50%; top: 102%; }
  .vt-pg .pg-perle--4 { left: 13.2%; top: 86.8%; }
  .vt-pg .pg-perle--5 { left: -2%; top: 50%; }
  .vt-pg .pg-perle--6 { left: 13.2%; top: 13.2%; }
  .vt-pg .pg-perle--7 { left: 50%; top: -2%; }
  .vt-pg .pg-perle--8 { left: 86.8%; top: 13.2%; }
  /* THE COLUMN CLEARS THE CROWN, not the circle: the outermost bead reaches
     ~9px past the liseré, so the portrait owns everything from x=190.6 at 360.
     100% here is the hero's PADDED box (332 at 360) — 168 off it, indented 4,
     lands the right edge at 182. */
  .vt-pg .pg-col { position: relative; margin-left: 4px; padding-top: 42px; width: calc(100% - 168px); min-height: 238px; }
  /* THE HEART LIVES INSIDE THE ROTATED BOX, and it took three tries to get
     there. As a flex sibling it was pushed to the middle of the wrapped second
     line at 320. As an inline sibling it fell onto a line of its own, because
     the tilt forces the tagline to be an inline-BLOCK — one atomic box that
     drops whole rather than breaking. Inside that box it leads the first line
     and the words wrap around it, at any width and any tagline she writes. */
  .vt-pg .pg-bienv { line-height: 1.2; }
  .vt-pg .pg-coeur { vertical-align: -1px; margin-right: 6px; }
  .vt-pg .pg-bienv-t {
    display: inline-block; transform: rotate(-2deg);
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px;
    color: var(--pg-sarcelle-2);
  }
  .vt-pg .pg-name {
    margin-top: 9px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.05; letter-spacing: -.015em;
    color: var(--pg-encre); overflow-wrap: break-word;
  }
  /* série 5's split columns take 24px (Karité alone takes 20) */
  .vt-pg .pg-name.vt-ent-long { font-size: 24px; }
  .vt-pg .pg-name .vt-ent-acc { color: var(--pg-fuchsia); }
  /* the three beads under the name — orange, sarcelle, soleil */
  .vt-pg .pg-perles { display: flex; gap: 5px; margin-top: 8px; }
  .vt-pg .pg-perles i { width: 9px; height: 9px; border-radius: 50%; background: var(--pg-orange); }
  .vt-pg .pg-perles i:nth-child(2) { background: var(--pg-sarcelle); }
  .vt-pg .pg-perles i:nth-child(3) { background: var(--pg-soleil); }
  .vt-pg .pg-verif { margin-top: 11px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--pg-encre); }
  .vt-pg .pg-verif-i {
    width: 15px; height: 15px; flex: none; border-radius: 50%; background: var(--pg-fuchsia);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-pg .pg-zone { margin-top: 6px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--pg-sarcelle-2); }
  .vt-pg .pg-zone svg { vertical-align: -2px; margin-right: 5px; }
  .vt-pg .pg-proof-wrap { margin-top: 12px; }
  .vt-pg .pg-proof {
    display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 8px 13px; border-radius: 99px;
    background: var(--pg-rose); box-shadow: inset 0 0 0 1.5px rgba(224,64,127,.55);
  }
  .vt-pg .pg-proof-l { font-size: 11px; line-height: 1.35; color: var(--pg-vin); }
  .vt-pg .pg-proof-l b {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif;
    font-weight: 800; font-size: 19px; color: var(--pg-fuchsia);
  }
  .vt-pg .pg-stars { font-size: 10.5px; font-weight: 700; color: var(--pg-orange-2); white-space: nowrap; }
  .vt-pg .pg-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — the scalloped wax flower, tilted four degrees */
  .vt-pg .pg-nouv-wrap { margin-top: 13px; }
  .vt-pg .pg-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 104px; height: 104px; transform: rotate(-4deg);
  }
  .vt-pg .pg-fleur { position: absolute; left: 0; top: 0; }
  .vt-pg .pg-nouv-in {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px;
    width: 74px; text-align: center;
  }
  .vt-pg .pg-nouv-t {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif;
    font-weight: 800; font-size: 12.5px; line-height: 1.2; color: #FFFFFF;
  }
  /* Rangée — a white panel on the cream page, not a flush band */
  .vt-pg .pg-trust {
    position: relative; margin: 0 14px 14px; padding: 13px 3px; border-radius: 20px;
    background: #FFFFFF; box-shadow: 0 10px 26px -18px rgba(42,30,34,.6);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-pg .pg-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-pg .pg-cell + .pg-cell { border-left: 1px solid #F2E7DC; }
  .vt-pg .pg-cell-i {
    width: 38px; height: 38px; flex: none; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }
  .vt-pg .pg-cell-i--f { background: var(--pg-fuchsia); }
  .vt-pg .pg-cell-i--o { background: var(--pg-orange); }
  .vt-pg .pg-cell-i--s { background: var(--pg-sarcelle); }
  .vt-pg .pg-cell-l { font-size: 9.5px; font-weight: 800; line-height: 1.28; color: var(--pg-encre); }
  .vt-pg .pg-cell-s { font-size: 8px; line-height: 1.25; }
  .vt-pg .pg-cell-s--f { color: var(--pg-vin); }
  .vt-pg .pg-cell-s--o { color: var(--pg-orange-2); }
  .vt-pg .pg-cell-s--s { color: var(--pg-sarcelle-2); }
  .vt-pg .pg-btn { background: rgba(255,255,255,.92); box-shadow: inset 0 0 0 1px rgba(42,30,34,.16), 0 6px 16px -10px rgba(42,30,34,.5); }
  .vt-pg .vt-ent-btn { top: 70px; }
  .vt-pg .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-pg .pg-hero { padding: 74px 12px 14px; }
    .vt-pg .pg-photo-wrap { top: 122px; right: 12px; width: 128px; height: 128px; }
    .vt-pg .pg-perle { width: 11px; height: 11px; }
    /* same arithmetic at 320: the outermost bead lands at x=171.9 */
    .vt-pg .pg-disque-a { left: -36px; top: 6px; width: 72px; height: 72px; }
    .vt-pg .pg-anneau-a { left: -56px; top: -16px; width: 112px; height: 112px; }
    .vt-pg .pg-col { margin-left: 4px; padding-top: 42px; width: calc(100% - 150px); min-height: 220px; }
    .vt-pg .pg-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-pg .pg-name.vt-ent-long { font-size: 21px; }
    .vt-pg .pg-mono { font-size: 48px; }
    .vt-pg .pg-bienv-t { font-size: 16px; }
    .vt-pg .pg-etoile--a { right: 116px; top: 76px; }
    .vt-pg .pg-pois { width: 100px; height: 62px; }
    .vt-pg .pg-trust { margin: 0 12px 12px; padding: 12px 2px; }
    .vt-pg .pg-cell { padding: 0 4px; gap: 5px; }
    .vt-pg .pg-cell-i { width: 34px; height: 34px; }
  }
`;

export const unit: EnteteUnit = { render, css };
