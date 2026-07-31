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
 * ENTETES-H · SÉRIE 3 — 20 · GRAFFITI — « brique noire & jaune taxi ».
 *
 * SOURCE OF TRUTH: the id="graffiti" block of « En-tetes Boutique - Serie 3 »
 * and its « Relevé — Graffiti ». This closes série 3.
 *
 * A WALL WITH THINGS TAPED TO IT. Brick lines, a yellow spray grid, wire-drawn
 * doodle crowns and a taped polaroid; a torn paper edge separates the identity
 * from the trust band. Every texture is CSS — the relevé's own deviation
 * (« mur de brique photo-réaliste et coulures → lignes + spray CSS »).
 *
 * THE MINIMAL BADGE IS TWO TAPED CHIPS, tilted opposite ways, and it is the
 * third style to need « Nouvelle vendeuse » split across two boxes. As on Pop
 * and Chrome, the split is DERIVED from the catalog entry at its last space,
 * separator preserved, never re-typed as two literals.
 *
 * The fluo cross is an SVG, not the multiplication glyph — Néon's lesson, and Grand
 * Teint §8 forbids glyph characters in chrome. It is written that way from the
 * start here rather than being caught by the gate.
 *
 * « Street vibes » follows the ruling taken on Chrome and Néon: the French
 * Voice Standard outranks the design brief, so the chip carries a French string
 * from the catalog. This is the last of the three.
 *
 * SPLIT COLUMN, so the > 14 chars → 20px tier applies.
 * Bio not drawn — série 3 shows a présentation on Perle and Artisan only.
 */

/** « Nouvelle vendeuse » as two taped chips — derived, separator preserved. */
function chipsScotchees(): string {
  const s = t('vit.nouvelle_vendeuse').trim();
  const i = s.lastIndexOf(' ');
  if (i === -1) return `<span class="gf-chip gf-chip--n"><v>${s}</v></span>`;
  return (
    `<span class="gf-chip gf-chip--n"><i class="gf-scotch" aria-hidden="true"></i><v>${s.slice(0, i)}</v></span> ` +
    `<span class="gf-chip gf-chip--b"><v>${s.slice(i + 1)}</v></span>`
  );
}

const croix = (): string =>
  '<svg class="gf-croix" aria-hidden="true" width="15" height="15" viewBox="0 0 16 16">' +
  '<path d="M3 3l10 10M13 3L3 13" stroke="#F7C51E" stroke-width="2.2" stroke-linecap="round"/></svg>';

const couronne = (cls: string, w: number, h: number): string =>
  `<svg class="${cls}" aria-hidden="true" width="${w}" height="${h}" viewBox="0 0 26 16">` +
  '<path d="M2 14L1 3l6 4L13 1l6 6 6-4-1 11z" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="gf-cell"><span class="gf-cell-i">${icon}</span><span class="gf-cell-l">${label}</span><span class="gf-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-gf" data-role="vitrine-hero">',
    '<div class="gf-hero">',
    '<span class="gf-lueur" aria-hidden="true"></span>',
    '<span class="gf-spray" aria-hidden="true"></span>',
    couronne('gf-doodle-a', 26, 16),
    couronne('gf-doodle-b', 20, 12),
    croix(),
    // the taped polaroid
    `<div class="gf-pola" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    '<div class="gf-pola-photo">',
    hasPhoto(v)
      ? framePhoto(v, '50% 24%')
      : `<div class="gf-motif"><span class="gf-mono">${v.mono}</span></div>`,
    '</div>',
    '<span class="gf-tape gf-tape--j" aria-hidden="true"></span>',
    '<span class="gf-tape gf-tape--g" aria-hidden="true"></span>',
    '</div>',
    `<span class="gf-street">${t('vit.ne_street')}</span>`,
    '<div class="gf-col" data-role="vitrine-identity">',
    `<div class="gf-name${v.longName ? ' vt-ent-long' : ''}">${weldSeal(v.tail, `<span class="gf-seal" aria-hidden="true">${iconCheckEnt(11, '#F7C51E', 3.2)}</span>`)}</div>`,
    '<span class="gf-brosse" aria-hidden="true"></span>',
    v.hasTag ? `<div class="gf-bienv"><span class="gf-bienv-c"><span class="gf-bienv-t"><v>${v.tagline}</v></span></span></div>` : '',
    `<div class="gf-zone">${zoneLine(v, iconPinSolid(12, '#F7C51E', '#161616'))}</div>`,
    v.showProof
      ? `<div class="gf-proof"><span data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="gf-stars" data-role="chip-avis"> · ${iconStarEnt(11, '#F7C51E')}${avisChip(v)}</span>`
            : ''
        }</div>`
      : '',
    v.nouvelle ? `<div class="gf-nouv" data-role="chip-nouvelle">${chipsScotchees()}</div>` : '',
    '</div>',
    '<span class="gf-dechirure" aria-hidden="true"></span>',
    '<div class="gf-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#161616', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#161616', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#161616', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    controls(v, 'gf', 'right', '20px', '72px', '#F7C51E'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 20 · GRAFFITI (série 3) ══════════════════════
     Relevé — brique noire #161616 (lignes blanches .06 pas 24, bande #1D1D1D,
     motif #1C1C1C) · jaune taxi #F7C51E · blanc · papier #F5F0E6 · adhésifs
     jaune .85 / gris .6 · texte #D8D5CE / #B9B6AE. */
  .vt-gf {
    --gf-noir: #161616; --gf-bande: #1D1D1D; --gf-motif: #1C1C1C;
    --gf-jaune: #F7C51E; --gf-papier: #F5F0E6;
    --gf-t1: #D8D5CE; --gf-t2: #B9B6AE;
    background: var(--gf-noir);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad. No bottom
     padding: the torn edge and the band run to the card's own edge. */
  .vt-gf .gf-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 0;
    background-color: var(--gf-noir);
    background-image: repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 1px, transparent 1px 24px);
  }
  .vt-gf .gf-lueur {
    position: absolute; right: -40px; top: 40px; width: 200px; height: 160px;
    background: radial-gradient(circle, rgba(247,197,30,.16) 0%, rgba(247,197,30,0) 70%);
  }
  .vt-gf .gf-spray {
    position: absolute; left: 10px; bottom: 128px; width: 58px; height: 44px;
    background-image: radial-gradient(circle, rgba(247,197,30,.5) 1.4px, transparent 1.8px);
    background-size: 9px 9px;
  }
  /* THE DOODLES SIT IN THE FREE BANDS, not on her name. A graffiti wall does
     overlap itself, but white wire crowns landing on white 29px italic type
     made « Beurni » unreadable and the cross struck through « Boss » — the
     5-second test fails before the style is even judged. They go where the
     composition actually has room: above the polaroid, and low on the left
     under the text column. */
  .vt-gf .gf-doodle-a { position: absolute; right: 128px; top: 84px; }
  .vt-gf .gf-croix { position: absolute; right: 100px; top: 86px; }
  .vt-gf .gf-doodle-b { position: absolute; left: 16px; top: 312px; opacity: .7; }
  /* THE POLAROID — relevé top 58, + 60 for the status pad */
  .vt-gf .gf-pola {
    position: absolute; top: 118px; right: 10px; width: 150px;
    background: #FFFFFF; padding: 6px 6px 20px;
    box-shadow: 0 14px 30px -14px rgba(0,0,0,.7); transform: rotate(2.5deg);
  }
  .vt-gf .gf-pola-photo { position: relative; height: 150px; overflow: hidden; }
  .vt-gf .gf-pola-photo .vt-avatar-img { object-position: 50% 24%; }
  .vt-gf .gf-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--gf-motif);
    background-image:
      repeating-linear-gradient(0deg, rgba(255,255,255,.08) 0 1px, transparent 1px 18px),
      radial-gradient(circle, rgba(247,197,30,.4) 1.6px, transparent 2px);
    background-size: auto, 15px 15px;
  }
  .vt-gf .gf-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    font-size: 58px; line-height: 1; color: rgba(247,197,30,.5);
  }
  .vt-gf .gf-tape { position: absolute; width: 52px; height: 16px; }
  .vt-gf .gf-tape--j { top: -8px; left: -10px; background: rgba(247,197,30,.85); transform: rotate(-26deg); }
  .vt-gf .gf-tape--g { bottom: -6px; right: -10px; background: rgba(190,190,185,.6); transform: rotate(-8deg); }
  .vt-gf .gf-street {
    position: absolute; top: 300px; right: 26px; z-index: 2; display: inline-block;
    transform: rotate(-8deg);
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 13px; color: #FFFFFF;
  }
  .vt-gf .gf-col { position: relative; margin-top: 8px; width: calc(100% - 158px); min-height: 252px; }
  .vt-gf .gf-name {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    font-size: clamp(24px, 8.4cqw, 29px); line-height: 1.05; letter-spacing: -.015em;
    color: #FFFFFF; overflow-wrap: break-word;
  }
  /* split column ⇒ the fixed tier applies */
  .vt-gf .gf-name.vt-ent-long { font-size: 20px; }
  .vt-gf .gf-name .vt-ent-acc { color: var(--gf-jaune); }
  .vt-gf .gf-seal {
    display: inline-flex; align-items: center; justify-content: center;
    width: 21px; height: 21px; border-radius: 50%; margin-left: 7px; vertical-align: -3px;
    box-shadow: inset 0 0 0 2.5px var(--gf-jaune);
  }
  .vt-gf .gf-brosse { display: block; width: 48px; height: 5px; margin-top: 7px; background: var(--gf-jaune); transform: rotate(-1.5deg); }
  .vt-gf .gf-bienv { margin-top: 10px; }
  .vt-gf .gf-bienv-c {
    display: inline-flex; min-height: 28px; align-items: center; padding: 4px 12px;
    background: var(--gf-jaune); transform: skew(-5deg) rotate(-1deg);
  }
  .vt-gf .gf-bienv-t {
    transform: skew(5deg);
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    text-transform: uppercase; font-size: 12.5px; line-height: 1.2; color: var(--gf-noir);
  }
  /* inline-block, never flex — zoneLine is one sentence (see Braise) */
  .vt-gf .gf-zone {
    margin-top: 9px; padding-bottom: 7px; font-size: 11px; font-weight: 600; line-height: 1.4; color: #FFFFFF;
    border-bottom: 1px solid rgba(247,197,30,.55);
  }
  .vt-gf .gf-zone svg { vertical-align: -2px; margin-right: 4px; }
  .vt-gf .gf-proof { margin-top: 9px; font-size: 11px; line-height: 1.4; color: var(--gf-t1); }
  .vt-gf .gf-proof b {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    font-size: 15px; color: var(--gf-jaune);
  }
  .vt-gf .gf-stars { white-space: nowrap; color: var(--gf-jaune); font-weight: 600; }
  .vt-gf .gf-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — two taped chips, tilted opposite ways */
  .vt-gf .gf-nouv { margin-top: 12px; display: flex; flex-direction: column; align-items: flex-start; }
  .vt-gf .gf-chip {
    position: relative; display: inline-block; padding: 4px 11px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    text-transform: uppercase; font-size: 12.5px; line-height: 1.2;
  }
  .vt-gf .gf-chip--n { background: var(--gf-noir); box-shadow: inset 0 0 0 1.5px #FFFFFF; color: #FFFFFF; transform: rotate(-2deg); }
  .vt-gf .gf-chip--b { background: #FFFFFF; color: var(--gf-noir); transform: rotate(2deg); margin-left: 16px; margin-top: 3px; }
  .vt-gf .gf-scotch { position: absolute; top: -7px; left: 10px; width: 34px; height: 12px; background: rgba(247,197,30,.85); transform: rotate(-14deg); }
  /* the torn paper edge, then the band */
  .vt-gf .gf-dechirure {
    position: relative; display: block; margin: 14px -14px 0; height: 12px; background: var(--gf-papier);
    clip-path: polygon(0 0, 100% 0, 100% 55%, 96% 100%, 92% 55%, 88% 100%, 84% 55%, 80% 100%, 76% 55%, 72% 100%, 68% 55%, 64% 100%, 60% 55%, 56% 100%, 52% 55%, 48% 100%, 44% 55%, 40% 100%, 36% 55%, 32% 100%, 28% 55%, 24% 100%, 20% 55%, 16% 100%, 12% 55%, 8% 100%, 4% 55%, 0 100%);
  }
  .vt-gf .gf-trust {
    position: relative; margin: 0 -14px; padding: 12px 3px; background: var(--gf-bande);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-gf .gf-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-gf .gf-cell + .gf-cell { border-left: 2px solid var(--gf-jaune); }
  .vt-gf .gf-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%; background: var(--gf-jaune);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-gf .gf-cell-l {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic;
    text-transform: uppercase; font-size: 9.5px; line-height: 1.25; color: #FFFFFF;
  }
  .vt-gf .gf-cell-s { font-size: 8px; line-height: 1.25; color: var(--gf-t2); }
  .vt-gf .gf-btn { background: rgba(22,22,22,.78); box-shadow: inset 0 0 0 1.5px var(--gf-jaune); }
  .vt-gf .vt-ent-btn { top: 70px; }
  .vt-gf .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-gf .gf-hero { padding: 74px 12px 0; }
    .vt-gf .gf-pola { top: 114px; right: 8px; width: 128px; padding: 5px 5px 17px; }
    .vt-gf .gf-pola-photo { height: 128px; }
    .vt-gf .gf-street { top: 274px; right: 18px; font-size: 12px; }
    .vt-gf .gf-doodle-a { right: 112px; }
    .vt-gf .gf-croix { right: 88px; }
    .vt-gf .gf-doodle-b { top: 292px; }
    .vt-gf .gf-col { width: calc(100% - 134px); min-height: 234px; }
    .vt-gf .gf-name { font-size: clamp(21px, 8.4cqw, 26px); }
    .vt-gf .gf-name.vt-ent-long { font-size: 19px; }
    .vt-gf .gf-mono { font-size: 48px; }
    .vt-gf .gf-dechirure { margin: 14px -12px 0; }
    .vt-gf .gf-trust { margin: 0 -12px; padding: 11px 2px; }
    .vt-gf .gf-cell { padding: 0 4px; gap: 5px; }
    .vt-gf .gf-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
