import { t } from '../../i18n';
import { iconCheckEnt, iconLockEnt, iconPinSolid, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
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
 * ENTETES-H · SÉRIE 5 — 26 · DUNDA — « teinture Kôkô Dunda de Bobo-Dioulasso ».
 *
 * SOURCE OF TRUTH: the id="dunda" block of « En-tetes Boutique - Serie 5 » and
 * its « Relevé — Dunda ». Origine: création originale — aucune image source.
 *
 * THE FIRST OF SÉRIE 5, and the series is anchored in Burkinabè craft rather
 * than in a visual reference. Dunda is the Kôkô Dunda dyeing of Bobo-Dioulasso:
 * the dashed rings spilling off all four corners are the TIES of the knotted
 * cloth, the dotted clouds are the dye taking, and the coral wave under
 * « Bienvenue » is the dye bath itself. The relevé states the intent —
 * « le rituel de la teinture comme identité » — and it is the reason the rings
 * are dashed rather than solid.
 *
 * TWO CONVENTIONS SÉRIE 5 TAKES FROM SÉRIE 4, both different from série 3:
 * the verified seal is a DEDICATED « Vendeuse vérifiée » line, not a glyph
 * welded to the name; and the long-name tier is 24px here (série 3's split
 * columns used 20). Karité is the one style of this series at 20.
 *
 * The name is bicolore — the accent segment turns coral — through the same
 * `.vt-ent-acc` span the anti-orphan rule emits.
 *
 * Bio not drawn: « bio non affichée » for all five of série 5.
 */

/** The dye-bath wave under « Bienvenue » — the water of the dyeing. */
const vague = (): string =>
  '<svg class="du-vague" aria-hidden="true" width="72" height="8" viewBox="0 0 72 8">' +
  '<path d="M2 5c6-4 12 4 18 0s12 4 18 0 12 4 18 0 8 2 14-1" fill="none" stroke="#F2704F" stroke-width="2.2" stroke-linecap="round"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, tone: string, label: string, sub: string): string =>
    `<div class="du-cell"><span class="du-cell-i du-cell-i--${tone}">${icon}</span><span class="du-cell-l">${label}</span><span class="du-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-du" data-role="vitrine-hero">',
    '<div class="du-hero">',
    // THE TIES — four dashed rings spilling off the corners, plus two dye clouds
    '<span class="du-ring du-ring--a" aria-hidden="true"></span>',
    '<span class="du-ring du-ring--b" aria-hidden="true"></span>',
    '<span class="du-ring du-ring--c" aria-hidden="true"></span>',
    '<span class="du-ring du-ring--d" aria-hidden="true"></span>',
    '<span class="du-pois du-pois--a" aria-hidden="true"></span>',
    '<span class="du-pois du-pois--b" aria-hidden="true"></span>',
    // the portrait, ringed white then dashed — the dye knot
    '<div class="du-photo-wrap">',
    '<span class="du-noeud" aria-hidden="true"></span>',
    `<div class="du-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="du-motif"><span class="du-mono">${v.mono}</span></div>`,
    '</div>',
    '</div>',
    '<div class="du-col" data-role="vitrine-identity">',
    v.hasTag ? `<div class="du-bienv"><span class="du-bienv-t"><v>${v.tagline}</v></span>${vague()}</div>` : '',
    `<div class="du-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    // SÉRIE 4/5 CONVENTION: the seal is a dedicated line, never welded
    `<div class="du-verif"><span class="du-verif-i">${iconCheckEnt(9, '#FFFFFF', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="du-zone">${iconPinSolid(13, '#8FA3F5', '#232F73')}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="du-proof-wrap"><span class="du-proof"><span class="du-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="du-stars" data-role="chip-avis">${iconStarEnt(9, '#F2C21E')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="du-nouv-wrap"><span class="du-nouv" data-role="chip-nouvelle"><span class="du-nouv-i" aria-hidden="true"></span><span class="du-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="du-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#FFFFFF', 2.1), 'i', t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#FFFFFF', 2.1), 'c', t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#FFFFFF', 2.1), 'i', t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'du', 'right', '20px', '72px', '#FFFFFF'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 26 · DUNDA (série 5) ══════════════════════
     Relevé — indigo #232F73 (radials #3B4BA6 / #2A3A94, bande #18205A, ronds
     #2F3D8F) · corail #F2704F (clair #F2A28C) · ciel #8FA3F5 / #BFD0FF /
     #DDE4FB · étoile #F2C21E. */
  .vt-du {
    --du-indigo: #232F73; --du-r1: #3B4BA6; --du-r2: #2A3A94;
    --du-bande: #18205A; --du-rond: #2F3D8F;
    --du-corail: #F2704F; --du-corail-clair: #F2A28C;
    --du-ciel: #8FA3F5; --du-ciel-2: #BFD0FF; --du-ciel-3: #DDE4FB; --du-etoile: #F2C21E;
    background: var(--du-indigo);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad */
  .vt-du .du-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 18px;
    background-color: var(--du-indigo);
    background-image:
      radial-gradient(46% 40% at 84% 24%, var(--du-r1) 0%, rgba(59,75,166,0) 70%),
      radial-gradient(40% 34% at 8% 88%, var(--du-r2) 0%, rgba(42,58,148,0) 70%);
  }
  /* THE TIES of the knotted cloth — dashed, spilling off the corners */
  .vt-du .du-ring { position: absolute; border-radius: 50%; border-style: dashed; border-width: 2px; }
  .vt-du .du-ring--a { left: -44px; top: -44px; width: 150px; height: 150px; border-color: rgba(255,255,255,.25); }
  .vt-du .du-ring--b { left: -22px; top: -22px; width: 106px; height: 106px; border-color: rgba(143,163,245,.4); }
  .vt-du .du-ring--c { right: -30px; bottom: -36px; width: 130px; height: 130px; border-color: rgba(255,255,255,.2); }
  .vt-du .du-ring--d { right: -12px; bottom: -18px; width: 92px; height: 92px; border-color: rgba(242,112,79,.45); }
  .vt-du .du-pois { position: absolute; }
  .vt-du .du-pois--a {
    left: 96px; bottom: 44px; width: 44px; height: 34px;
    background-image: radial-gradient(circle, rgba(255,255,255,.5) 1.2px, transparent 1.4px);
    background-size: 9px 9px;
  }
  /* relevé top 16, + 60 for the status pad */
  .vt-du .du-pois--b {
    right: 150px; top: 76px; width: 38px; height: 28px;
    background-image: radial-gradient(circle, rgba(143,163,245,.55) 1.2px, transparent 1.4px);
    background-size: 8px 8px;
  }
  /* THE DYE KNOT — relevé top 20, + 60 */
  .vt-du .du-photo-wrap { position: absolute; top: 80px; right: 8px; width: 158px; height: 158px; }
  .vt-du .du-noeud { position: absolute; inset: -7px; border-radius: 50%; border: 2px dashed rgba(143,163,245,.6); }
  .vt-du .du-photo {
    position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
    box-shadow: 0 0 0 2.5px #FFFFFF, 0 16px 34px -14px rgba(0,0,0,.7);
  }
  .vt-du .du-photo .vt-avatar-img { object-position: 50% 26%; }
  .vt-du .du-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: #1B2560;
    background-image: repeating-radial-gradient(circle at 50% 50%, rgba(143,163,245,.4) 0 2px, transparent 2px 14px);
  }
  .vt-du .du-mono {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 52px; line-height: 1; color: rgba(255,255,255,.75);
  }
  /* the column is RAISED above the decorative absolutes — Artisan's lesson */
  .vt-du .du-col { position: relative; width: calc(100% - 152px); min-height: 236px; }
  .vt-du .du-bienv { display: inline-block; }
  .vt-du .du-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 18px; color: var(--du-ciel-2); }
  .vt-du .du-vague { display: block; margin-top: 2px; }
  .vt-du .du-name {
    margin-top: 7px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.05; letter-spacing: -.01em;
    color: #FFFFFF; overflow-wrap: break-word;
  }
  /* série 5's split columns take 24px, not série 3's 20 */
  .vt-du .du-name.vt-ent-long { font-size: 24px; }
  .vt-du .du-name .vt-ent-acc { color: var(--du-corail); }
  /* THE DEDICATED VERIFIED LINE — série 4/5 convention, never welded */
  .vt-du .du-verif { margin-top: 10px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: #FFFFFF; }
  .vt-du .du-verif-i {
    width: 17px; height: 17px; flex: none; border-radius: 50%; background: var(--du-corail);
    display: flex; align-items: center; justify-content: center;
  }
  /* inline-block, never flex — zoneLine's siblings must stay one sentence */
  .vt-du .du-zone { margin-top: 6px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--du-ciel-3); }
  .vt-du .du-zone svg { vertical-align: -2px; margin-right: 5px; }
  .vt-du .du-proof-wrap { margin-top: 12px; }
  .vt-du .du-proof {
    display: inline-flex; flex-direction: column; gap: 2px; padding: 9px 13px; border-radius: 14px;
    background: rgba(255,255,255,.08); box-shadow: inset 0 0 0 1px rgba(191,208,255,.35);
  }
  .vt-du .du-proof-l { font-size: 10.5px; font-weight: 600; line-height: 1.3; color: #FFFFFF; }
  .vt-du .du-proof-l b {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 19px; color: var(--du-corail);
  }
  .vt-du .du-stars { font-size: 10px; font-weight: 600; color: var(--du-ciel-2); }
  .vt-du .du-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — the coral chip, tilted, with a dashed tie of its own. It lives in
     the text column, clear of the control corner. */
  .vt-du .du-nouv-wrap { margin-top: 13px; }
  .vt-du .du-nouv {
    display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 12px;
    background: var(--du-corail); transform: rotate(-3deg);
    box-shadow: 0 12px 24px -10px rgba(242,112,79,.8);
  }
  .vt-du .du-nouv-i { width: 16px; height: 16px; flex: none; border-radius: 50%; border: 2px dashed rgba(255,255,255,.8); }
  .vt-du .du-nouv-t {
    max-width: 84px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 12.5px; line-height: 1.2; color: #FFFFFF;
  }
  .vt-du .du-trust {
    position: relative; padding: 12px 3px; background: var(--du-bande);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-du .du-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-du .du-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }
  .vt-du .du-cell-i--i { background: var(--du-rond); }
  .vt-du .du-cell-i--c { background: var(--du-corail); }
  .vt-du .du-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: #FFFFFF; }
  .vt-du .du-cell-s { font-size: 8px; line-height: 1.25; color: var(--du-ciel-2); }
  .vt-du .du-cell + .du-cell .du-cell-s { color: var(--du-corail-clair); }
  .vt-du .du-btn { background: rgba(35,47,115,.7); box-shadow: inset 0 0 0 1px rgba(255,255,255,.35); }
  .vt-du .vt-ent-btn { top: 70px; }
  .vt-du .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-du .du-hero { padding: 74px 12px 16px; }
    .vt-du .du-photo-wrap { top: 76px; right: 4px; width: 136px; height: 136px; }
    .vt-du .du-col { width: calc(100% - 128px); min-height: 220px; }
    .vt-du .du-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-du .du-name.vt-ent-long { font-size: 21px; }
    .vt-du .du-mono { font-size: 44px; }
    .vt-du .du-bienv-t { font-size: 16px; }
    .vt-du .du-trust { padding: 11px 2px; }
    .vt-du .du-cell { padding: 0 4px; gap: 5px; }
    .vt-du .du-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
