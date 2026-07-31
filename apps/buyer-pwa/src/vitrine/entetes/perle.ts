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
 * ENTETES-H · SÉRIE 3 — 17 · PERLE — « nacre irisée, Georgia émeraude ».
 *
 * SOURCE OF TRUTH: the id="perle" block of « En-tetes Boutique - Serie 3 » and
 * its « Relevé — Perle ».
 *
 * ONE OF THE TWO STYLES THAT DRAW HER PRÉSENTATION. « La présentation ne
 * s'affiche que sur Perle et Artisan (seuls visuels qui la montrent) » — eight
 * of the ten série 3 boards have no bio, these two do, and the relevé says so
 * explicitly (« présentation affichée (le visuel la montre) »). Every other
 * style in the series has a test asserting the bio is ABSENT; this one asserts
 * it is present.
 *
 * Mother-of-pearl ground with three radial washes, an emerald name with a white
 * highlight, and a 186px photo disc pushed off the right edge with a pearl set
 * on its rim. Glass panels use `.glz` — the contract class, Cristal's recipe,
 * opaque fallback declared FIRST, scoped to this chunk.
 *
 * The contract's named deviations, carried as written: the board's satin drapes
 * become CSS radials, and its glossy 3D green lettering becomes Georgia with a
 * highlight.
 *
 * SPLIT COLUMN, so the > 14 chars → 20px tier applies.
 */

const etincelle = (size: number, fill: string): string =>
  `<svg class="i" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/></svg>`;

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="pe-cell"><span class="pe-cell-i">${icon}</span><span class="pe-cell-l">${label}</span><span class="pe-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-pe" data-role="vitrine-hero">',
    '<div class="pe-hero">',
    '<span class="pe-etl-a" aria-hidden="true"></span>',
    '<span class="pe-etl-b" aria-hidden="true"></span>',
    // the disc, double-ringed, with a pearl on its rim
    `<div class="pe-cercle" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '38% 28%')
      : `<div class="pe-motif"><span class="pe-mono">${v.mono}</span></div>`,
    '</div>',
    '<span class="pe-perle" aria-hidden="true"></span>',
    '<div class="pe-col" data-role="vitrine-identity">',
    // her monogram medallion — emerald, ringed green then gold, with the badge
    `<div class="pe-av" data-etat="${v.hasAvatar ? 'live' : 'none'}">`,
    v.hasAvatar
      ? framePhoto({ ...v, hasCover: false }, '50% 30%')
      : `<span class="pe-av-mono">${v.mono}</span>`,
    `<span class="pe-av-badge" aria-hidden="true">${iconCheckEnt(9, '#0B4A3A', 3.6)}</span>`,
    '</div>',
    `<div class="pe-name${v.longName ? ' vt-ent-long' : ''}">${weldSeal(v.tail, `<span class="pe-seal" aria-hidden="true">${iconCheckEnt(11, '#FFFFFF', 3.4)}</span>`)}</div>`,
    v.hasTag
      ? `<div class="pe-bienv"><span class="pe-tiret" aria-hidden="true"></span><span class="pe-bienv-t"><v>${v.tagline}</v></span><span class="pe-point" aria-hidden="true"></span></div>`
      : '',
    `<div class="pe-zone">${zoneLine(v, iconPinSolid(12, '#17836A', '#F2F4F6'))}</div>`,
    // THE PRÉSENTATION — drawn here and on Artisan only, per the relevé
    v.hasBio ? `<div class="pe-bio"><v>${v.bio}</v></div>` : '',
    v.showProof
      ? `<div class="pe-proof-wrap"><span class="pe-proof">${etincelle(12, '#BFF0E4')}<span data-role="reputation">${ventesLine(v)}</span></span>${
          v.showStars
            ? `<div class="pe-stars" data-role="chip-avis">${iconStarEnt(11, '#C9A45C')}${avisChip(v)}</div>`
            : ''
        }</div>`
      : '',
    v.nouvelle
      ? `<div class="pe-nouv-wrap"><span class="glz pe-nouv" data-role="chip-nouvelle"><span class="pe-nouv-i">${etincelle(13, '#FFFFFF')}</span><span class="pe-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '<div class="glz pe-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#0B4A3A', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#0B4A3A', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#0B4A3A', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    controls(v, 'pe', 'right', '20px', '72px', '#0B4A3A'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 17 · PERLE (série 3) ══════════════════════
     Relevé — nacre #F2F4F6 + radials menthe #BFF0E4 / lilas #E3D8FA / rose
     #F7E1E8 · émeraude #0B4A3A / #0E5F4C / #17836A · lilas #A78BFA / #8B79C9 ·
     or #C9A45C (monogramme #E5C888) · textes #4E6660 / #2E5A50 / #8A97A0. */
  .vt-pe {
    --pe-nacre: #F2F4F6; --pe-menthe: #BFF0E4; --pe-lilas-f: #E3D8FA; --pe-rose: #F7E1E8;
    --pe-em-1: #0B4A3A; --pe-em-2: #0E5F4C; --pe-em-3: #17836A;
    --pe-lilas: #A78BFA; --pe-lilas-2: #8B79C9;
    --pe-or: #C9A45C; --pe-or-clair: #E5C888;
    --pe-t1: #4E6660; --pe-t2: #2E5A50; --pe-t3: #8A97A0;
    background: var(--pe-nacre);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad */
  .vt-pe .pe-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 14px;
    background-color: var(--pe-nacre);
    background-image:
      radial-gradient(48% 34% at 6% 6%, var(--pe-menthe) 0%, rgba(191,240,228,0) 70%),
      radial-gradient(44% 32% at 96% 22%, var(--pe-lilas-f) 0%, rgba(227,216,250,0) 70%),
      radial-gradient(50% 30% at 40% 100%, var(--pe-rose) 0%, rgba(247,225,232,0) 70%);
  }
  /* THE CONTRACT'S GLASS — Cristal's recipe, opaque fallback FIRST so a phone
     without backdrop-filter gets a finished panel, scoped to this chunk. */
  .vt-pe .glz { background: rgba(255,255,255,.66); }
  @supports ((backdrop-filter: blur(16px)) or (-webkit-backdrop-filter: blur(16px))) {
    .vt-pe .glz { -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); background: rgba(255,255,255,.44); }
  }
  .vt-pe .pe-etl-a {
    position: absolute; left: 22px; top: 128px; width: 14px; height: 14px;
    background: radial-gradient(circle, rgba(255,255,255,.98) 0 14%, rgba(255,255,255,0) 62%);
  }
  .vt-pe .pe-etl-b {
    position: absolute; left: 104px; top: 250px; width: 12px; height: 12px;
    background: radial-gradient(circle, rgba(167,139,250,.9) 0 14%, rgba(167,139,250,0) 62%);
  }
  /* THE DISC — relevé top 36, + 60 for the status pad */
  .vt-pe .pe-cercle {
    position: absolute; top: 96px; right: -44px; width: 186px; height: 186px;
    border-radius: 50%; overflow: hidden;
    box-shadow: 0 0 0 5px rgba(255,255,255,.85), 0 0 0 6.5px rgba(167,139,250,.35),
      0 18px 40px -18px rgba(11,74,58,.35);
  }
  .vt-pe .pe-cercle .vt-avatar-img { object-position: 38% 28%; }
  .vt-pe .pe-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--pe-menthe);
    background-image: radial-gradient(circle, rgba(11,74,58,.28) 1.6px, transparent 2px);
    background-size: 14px 14px;
  }
  .vt-pe .pe-mono { margin-left: 30px; font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 62px; line-height: 1; color: rgba(11,74,58,.4); }
  /* the pearl set on the disc's rim */
  .vt-pe .pe-perle {
    position: absolute; top: 112px; right: 112px; width: 20px; height: 20px; border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, #FFFFFF 0%, #EAF3F0 42%, #C7D8D2 100%);
    box-shadow: 0 2px 6px -2px rgba(11,74,58,.4);
  }
  .vt-pe .pe-col { position: relative; width: calc(100% - 138px); }
  .vt-pe .pe-av {
    position: relative; width: 46px; height: 46px; border-radius: 50%;
    background: radial-gradient(circle at 34% 28%, var(--pe-em-3) 0%, var(--pe-em-1) 80%);
    box-shadow: 0 0 0 2px var(--pe-em-2), 0 0 0 3.5px var(--pe-or);
  }
  .vt-pe .pe-av .vt-avatar-img { border-radius: 50%; }
  .vt-pe .pe-av-mono {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 21px; color: var(--pe-or-clair);
  }
  .vt-pe .pe-av-badge {
    position: absolute; right: -3px; bottom: -2px; width: 17px; height: 17px; border-radius: 50%;
    background: #FFFFFF; box-shadow: 0 0 0 1.5px var(--pe-menthe);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-pe .pe-name {
    margin-top: 10px;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(24px, 8.4cqw, 29px); line-height: 1.08;
    color: var(--pe-em-1); text-shadow: 0 1px 0 rgba(255,255,255,.9);
    overflow-wrap: break-word;
  }
  /* split column ⇒ the fixed tier applies */
  .vt-pe .pe-name.vt-ent-long { font-size: 20px; }
  .vt-pe .pe-name .vt-ent-acc { color: var(--pe-em-1); }
  .vt-pe .pe-seal {
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: 50%; margin-left: 7px; vertical-align: -2px;
    background: linear-gradient(150deg, var(--pe-em-3), var(--pe-em-1));
  }
  .vt-pe .pe-bienv { margin-top: 6px; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
  .vt-pe .pe-tiret { width: 22px; height: 2px; flex: none; border-radius: 2px; background: linear-gradient(90deg, rgba(167,139,250,0), var(--pe-lilas)); }
  .vt-pe .pe-bienv-t { font-size: 15px; font-weight: 600; color: var(--pe-lilas); }
  .vt-pe .pe-point { width: 5px; height: 5px; flex: none; border-radius: 50%; background: var(--pe-lilas); }
  .vt-pe .pe-zone {
    margin-top: 8px; padding-bottom: 7px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--pe-t2);
    border-bottom: 1px solid rgba(11,74,58,.16);
  }
  .vt-pe .pe-zone svg { vertical-align: -2px; margin-right: 4px; }
  /* THE PRÉSENTATION — Perle and Artisan are the only two série 3 styles that
     draw one, because they are the only two boards that show one. */
  .vt-pe .pe-bio { margin-top: 9px; font-size: 12px; line-height: 1.55; color: var(--pe-t1); }
  .vt-pe .pe-proof-wrap { margin-top: 10px; }
  .vt-pe .pe-proof {
    display: inline-flex; align-items: center; gap: 7px; min-height: 34px; padding: 6px 14px;
    border-radius: 99px; background: linear-gradient(120deg, var(--pe-em-3), var(--pe-em-1));
    font-size: 11.5px; line-height: 1.35; color: #FFFFFF;
  }
  .vt-pe .pe-proof svg { flex: none; }
  .vt-pe .pe-proof b { font-weight: 700; color: #FFFFFF; }
  .vt-pe .pe-stars { margin-top: 6px; font-size: 11px; font-weight: 600; color: var(--pe-lilas-2); }
  .vt-pe .pe-stars svg { vertical-align: -1.5px; margin-right: 3px; }
  /* MINIMAL — the skewed glass banner, right-aligned in the column and well
     below the control corner */
  .vt-pe .pe-nouv-wrap { margin-top: 12px; display: flex; justify-content: flex-end; }
  .vt-pe .pe-nouv {
    display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 5px 15px;
    transform: skew(-8deg); box-shadow: inset 0 0 0 1px rgba(255,255,255,.95);
  }
  .vt-pe .pe-nouv-i {
    width: 26px; height: 26px; flex: none; border-radius: 50%; transform: skew(8deg);
    background: radial-gradient(circle at 32% 28%, var(--pe-or-clair) 0%, var(--pe-or) 100%);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-pe .pe-nouv-t {
    transform: skew(8deg);
    font-family: Georgia, 'Times New Roman', serif; font-size: 13.5px; line-height: 1.2; color: var(--pe-em-1);
  }
  .vt-pe .pe-trust {
    position: relative; margin-top: 14px; padding: 11px 3px; border-radius: 18px;
    box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.9);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-pe .pe-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-pe .pe-cell + .pe-cell { border-left: 1px solid rgba(11,74,58,.12); }
  .vt-pe .pe-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, #FFFFFF 0%, var(--pe-menthe) 100%);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-pe .pe-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: #17352C; }
  .vt-pe .pe-cell-s { font-size: 8px; line-height: 1.25; color: var(--pe-t3); }
  .vt-pe .pe-btn { background: rgba(255,255,255,.85); box-shadow: inset 0 0 0 1px rgba(255,255,255,.95), 0 4px 12px -3px rgba(11,74,58,.3); }
  .vt-pe .vt-ent-btn { top: 70px; }
  .vt-pe .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-pe .pe-hero { padding: 74px 12px 12px; }
    .vt-pe .pe-cercle { top: 92px; right: -54px; width: 166px; height: 166px; }
    .vt-pe .pe-perle { top: 106px; right: 96px; }
    .vt-pe .pe-col { width: calc(100% - 116px); }
    .vt-pe .pe-name { font-size: clamp(21px, 8.4cqw, 26px); }
    .vt-pe .pe-name.vt-ent-long { font-size: 19px; }
    .vt-pe .pe-mono { font-size: 54px; margin-left: 26px; }
    .vt-pe .pe-trust { padding: 10px 2px; }
    .vt-pe .pe-cell { padding: 0 4px; gap: 5px; }
    .vt-pe .pe-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
