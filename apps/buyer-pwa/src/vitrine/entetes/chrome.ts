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
 * ENTETES-H · SÉRIE 3 — 15 · CHROME — « noir laqué, texte chromé argent &
 * violet ».
 *
 * SOURCE OF TRUTH: the id="chrome" block of « En-tetes Boutique - Serie 3 »
 * and its « Relevé — Chrome ».
 *
 * THE SECOND CONTRACT CLASS PAIR. `.txc` and `.txv` are named by the handoff
 * alongside `.glz` (« avec .glz, seules classes CSS du contrat »): a silver and
 * a violet gradient painted through the TEXT via `background-clip: text`. Both
 * follow the pattern série 4's gold already uses in `entetes.ts` — a solid
 * colour declared FIRST, the gradient only inside
 * `@supports (background-clip: text)`. A browser that cannot clip to text gets
 * readable silver and violet, never transparent letters on black.
 *
 * The contract's own named deviation, carried as written: the board's extruded
 * 3D lettering becomes a flat text gradient (« lettrage 3D extrudé → dégradé
 * texte plat »), and its photoreal reflections become CSS radials and checks.
 *
 * SPLIT COLUMN, so the > 14 chars → 20px tier applies (the disc owns the right
 * 122px).
 *
 * « LEVEL UP » is a fixed decorative string of the board and lives in the
 * catalog with a register tag, like every user-facing string (loi 6).
 *
 * Bio not drawn — série 3 shows a présentation on Perle and Artisan only.
 */

const iconGroupe = (size: number, fill: string): string =>
  `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}"><path d="M16 11a3 3 0 10-3-3 3 3 0 003 3zM8 11a3 3 0 10-3-3 3 3 0 003 3zm8 2c-2.2 0-4.4 1-4.4 3v2h8.8v-2c0-2-2.2-3-4.4-3zm-8 0c-.3 0-.6 0-.9.1A4.4 4.4 0 019.6 16v2H3.2v-2c0-2 2.6-3 4.8-3z"/></svg>`;

/** The chromed crown at the head — flat, gradient-filled. */
const couronne = (): string =>
  '<svg class="ch3-couronne" aria-hidden="true" width="30" height="18" viewBox="0 0 30 18">' +
  '<defs><linearGradient id="ch3g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#F5F6F9"/><stop offset=".45" stop-color="#C9CDD6"/>' +
  '<stop offset="1" stop-color="#6E7484"/></linearGradient></defs>' +
  '<path d="M2 15L1 4l7 4.5L15 1l7 7.5L29 4l-1 11z" fill="url(#ch3g)" stroke="#2A2C34" stroke-width="1"/></svg>';

/** « Nouvelle vendeuse » in two tones — DERIVED from the catalog entry at its
 *  last space, never re-typed, and the separator survives so the rendered text
 *  still equals the catalog string. Same rule as Pop. */
function badgeDeuxTons(): string {
  const s = t('vit.nouvelle_vendeuse').trim();
  const i = s.lastIndexOf(' ');
  if (i === -1) return `<span class="ch3-nv-1"><v>${s}</v></span>`;
  return `<span class="ch3-nv-1"><v>${s.slice(0, i)}</v></span> <span class="ch3-nv-2"><v>${s.slice(i + 1)}</v></span>`;
}

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ch3-cell"><span class="ch3-cell-i">${icon}</span><span class="ch3-cell-l">${label}</span><span class="ch3-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-ch3" data-role="vitrine-hero">',
    '<div class="ch3-hero">',
    '<span class="ch3-dam-h" aria-hidden="true"></span>',
    '<span class="ch3-dam-b" aria-hidden="true"></span>',
    '<span class="ch3-etl-a" aria-hidden="true"></span>',
    '<span class="ch3-etl-v" aria-hidden="true"></span>',
    '<div class="ch3-tete">',
    couronne(),
    '<span class="ch3-marque">Shop+</span>',
    '</div>',
    // the chromed disc, ringed by a conic gradient, biting the right edge
    `<div class="ch3-cercle" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    '<span class="ch3-anneau" aria-hidden="true"></span>',
    '<div class="ch3-disque">',
    hasPhoto(v)
      ? framePhoto(v, '40% 28%')
      : `<div class="ch3-motif"><span class="ch3-mono">${v.mono}</span></div>`,
    '</div>',
    '<span class="ch3-perle" aria-hidden="true"></span>',
    '</div>',
    '<div class="ch3-col" data-role="vitrine-identity">',
    `<div class="ch3-name${v.longName ? ' vt-ent-long' : ''}">${weldSeal(v.tail, `<span class="ch3-seal" aria-hidden="true"><span class="ch3-seal-d">${iconCheckEnt(11, '#4C1D95', 3.4)}</span></span>`)}</div>`,
    v.hasTag ? `<div class="ch3-bienv"><v>${v.tagline}</v></div>` : '',
    `<div class="ch3-zone">${zoneLine(v, iconPinSolid(12, '#A78BFA', '#0A0A0C'))}</div>`,
    v.showProof
      ? `<div class="ch3-proof-wrap"><span class="ch3-proof">${iconGroupe(14, '#C9CDD6')}<span data-role="reputation">${ventesLine(v)}</span></span>${
          v.showStars
            ? `<span class="ch3-stars" data-role="chip-avis">${iconStarEnt(11, '#A78BFA')}${avisChip(v)}</span>`
            : ''
        }</div>`
      : '',
    v.nouvelle
      ? `<div class="ch3-nouv-wrap"><span class="ch3-nouv" data-role="chip-nouvelle">${badgeDeuxTons()}</span></div>`
      : '',
    '</div>',
    '<div class="ch3-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#0A0A0C', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#0A0A0C', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#0A0A0C', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    // the board's foot: a decorative wordmark and a barcode
    `<div class="ch3-pied" aria-hidden="true"><span class="ch3-level">${t('vit.ch_level_up')}</span><span class="ch3-code"></span></div>`,
    '</div>',
    controls(v, 'ch3', 'right', '20px', '72px', '#E8EAF0'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 15 · CHROME (série 3) ══════════════════════
     Relevé — noir laqué #0A0A0C (+ radials violets .28/.16) · argents
     #F5F6F9→#6E7484 (.txc #FFFFFF/#C9CDD6/#878D9C/#EDEFF4) · violets .txv
     #DDD1FF/#8B5CF6/#4C1D95, accents #A78BFA / #C4B5FD · textes #E8EAF0 /
     #B9BEC9.

     THE ROOT IS vt-ch3, NOT vt-ch: série 1's Chaleureux already owns .vt-ch,
     and reusing it would have this sheet repaint that header. The canon KEY is
     still « chrome »; only the class prefix is disambiguated. */
  .vt-ch3 {
    --ch3-noir: #0A0A0C;
    --ch3-arg-1: #F5F6F9; --ch3-arg-2: #C9CDD6; --ch3-arg-3: #878D9C; --ch3-arg-4: #6E7484;
    --ch3-vio-1: #DDD1FF; --ch3-vio-2: #8B5CF6; --ch3-vio-3: #4C1D95;
    --ch3-accent: #A78BFA; --ch3-accent-2: #C4B5FD;
    --ch3-t1: #E8EAF0; --ch3-t2: #B9BEC9;
    background: var(--ch3-noir);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad */
  .vt-ch3 .ch3-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 14px;
    background-color: var(--ch3-noir);
    background-image:
      radial-gradient(46% 32% at 88% 6%, rgba(139,92,246,.28) 0%, rgba(139,92,246,0) 70%),
      radial-gradient(50% 34% at 6% 96%, rgba(167,139,250,.16) 0%, rgba(167,139,250,0) 70%);
  }
  /* the two chequerboards — anchored to the card's own corners */
  .vt-ch3 .ch3-dam-h {
    position: absolute; top: 64px; right: 8px; width: 70px; height: 42px;
    background-image: repeating-conic-gradient(rgba(255,255,255,.14) 0% 25%, transparent 0% 50%);
    background-size: 14px 14px;
  }
  .vt-ch3 .ch3-dam-b {
    position: absolute; left: 6px; bottom: 84px; width: 60px; height: 48px;
    background-image: repeating-conic-gradient(rgba(255,255,255,.12) 0% 25%, transparent 0% 50%);
    background-size: 12px 12px;
  }
  .vt-ch3 .ch3-etl-a {
    position: absolute; top: 132px; left: 18px; width: 14px; height: 14px;
    background: radial-gradient(circle, rgba(255,255,255,.95) 0 14%, rgba(255,255,255,0) 62%);
  }
  .vt-ch3 .ch3-etl-v {
    position: absolute; top: 236px; right: 128px; width: 12px; height: 12px;
    background: radial-gradient(circle, rgba(196,181,253,.95) 0 14%, rgba(196,181,253,0) 62%);
  }
  .vt-ch3 .ch3-tete { position: relative; display: flex; align-items: center; gap: 9px; }
  .vt-ch3 .ch3-couronne { display: block; }
  .vt-ch3 .ch3-marque {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-style: italic; font-size: 15px; color: #FFFFFF;
  }
  /* THE CHROMED DISC — relevé top 56, + 60 for the status pad */
  .vt-ch3 .ch3-cercle { position: absolute; top: 116px; right: -38px; width: 168px; height: 168px; }
  .vt-ch3 .ch3-anneau {
    position: absolute; inset: 0; border-radius: 50%;
    background: conic-gradient(var(--ch3-arg-1), var(--ch3-arg-4), var(--ch3-arg-2), var(--ch3-arg-3), var(--ch3-arg-1));
  }
  .vt-ch3 .ch3-disque { position: absolute; inset: 7px; border-radius: 50%; overflow: hidden; background: var(--ch3-noir); }
  .vt-ch3 .ch3-disque .vt-avatar-img { object-position: 40% 28%; }
  .vt-ch3 .ch3-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: #15151B;
    background-image:
      repeating-linear-gradient(45deg, rgba(167,139,250,.26) 0 2px, transparent 2px 13px),
      repeating-linear-gradient(-45deg, rgba(245,246,249,.18) 0 2px, transparent 2px 13px);
  }
  .vt-ch3 .ch3-mono {
    margin-right: 34px;
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 58px; line-height: 1; color: rgba(245,246,249,.32);
  }
  .vt-ch3 .ch3-perle {
    position: absolute; top: 12px; left: 16px; width: 18px; height: 18px; border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, #FFFFFF 0%, var(--ch3-arg-2) 45%, var(--ch3-arg-4) 100%);
  }
  .vt-ch3 .ch3-col { position: relative; margin-top: 14px; width: calc(100% - 122px); }
  .vt-ch3 .ch3-name {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-style: italic; text-transform: uppercase;
    font-size: clamp(24px, 8.4cqw, 29px); line-height: 1.06; letter-spacing: -.01em;
    color: var(--ch3-arg-1); overflow-wrap: break-word;
  }
  /* split column ⇒ the fixed tier applies */
  .vt-ch3 .ch3-name.vt-ent-long { font-size: 20px; }
  /* .txc / .txv — SOLID COLOUR FIRST. A browser that cannot clip a gradient to
     text must get readable silver and violet, never transparent letters on a
     black ground. The gradient is an enhancement inside @supports. */
  .vt-ch3 .ch3-name .vt-ent-acc { color: var(--ch3-accent); }
  @supports (background-clip: text) or (-webkit-background-clip: text) {
    .vt-ch3 .ch3-name {
      background-image: linear-gradient(96deg, #FFFFFF 0%, var(--ch3-arg-2) 38%, var(--ch3-arg-3) 68%, #EDEFF4 100%);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
    }
    .vt-ch3 .ch3-name .vt-ent-acc {
      background-image: linear-gradient(96deg, var(--ch3-vio-1) 0%, var(--ch3-vio-2) 52%, var(--ch3-vio-3) 100%);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
    }
  }
  .vt-ch3 .ch3-seal { position: relative; display: inline-flex; width: 21px; height: 21px; vertical-align: -3px; margin-left: 7px; }
  .vt-ch3 .ch3-seal-d {
    position: absolute; inset: 0; border-radius: 50%;
    background: radial-gradient(circle at 32% 26%, #FFFFFF 0%, var(--ch3-arg-2) 48%, var(--ch3-arg-4) 100%);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ch3 .ch3-bienv { margin-top: 6px; font-size: 13px; font-weight: 700; color: var(--ch3-accent-2); }
  .vt-ch3 .ch3-zone { margin-top: 7px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--ch3-t1); }
  .vt-ch3 .ch3-zone svg { vertical-align: -2px; margin-right: 4px; }
  .vt-ch3 .ch3-proof-wrap { margin-top: 10px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .vt-ch3 .ch3-proof {
    display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 5px 13px;
    border-radius: 99px / 50%; background: rgba(255,255,255,.05);
    box-shadow: inset 0 0 0 1px rgba(201,205,214,.6);
    font-size: 10px; font-weight: 600; line-height: 1.3; color: var(--ch3-t2);
  }
  .vt-ch3 .ch3-proof svg { flex: none; }
  .vt-ch3 .ch3-proof b {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: 16px; color: var(--ch3-arg-1);
  }
  .vt-ch3 .ch3-stars { font-size: 11px; font-weight: 600; color: var(--ch3-accent); white-space: nowrap; }
  .vt-ch3 .ch3-stars svg { vertical-align: -1.5px; margin-right: 3px; }
  /* MINIMAL — a wire oval, well below the control corner */
  .vt-ch3 .ch3-nouv-wrap { margin-top: 12px; }
  .vt-ch3 .ch3-nouv {
    display: inline-flex; align-items: baseline; gap: 6px; padding: 9px 18px;
    border-radius: 50% / 42%; background: var(--ch3-noir);
    box-shadow: inset 0 0 0 2.5px var(--ch3-arg-3);
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-style: italic; text-transform: uppercase; font-size: 12.5px; line-height: 1.15;
  }
  .vt-ch3 .ch3-nv-1 { color: #FFFFFF; }
  .vt-ch3 .ch3-nv-2 { color: var(--ch3-accent); }
  .vt-ch3 .ch3-trust {
    position: relative; margin-top: 14px; padding: 11px 3px; border-radius: 18px;
    background: rgba(255,255,255,.045); box-shadow: inset 0 0 0 1px rgba(201,205,214,.4);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-ch3 .ch3-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-ch3 .ch3-cell + .ch3-cell { border-left: 1px solid rgba(201,205,214,.22); }
  .vt-ch3 .ch3-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%;
    background: radial-gradient(circle at 32% 26%, #FFFFFF 0%, var(--ch3-arg-2) 48%, var(--ch3-arg-4) 100%);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ch3 .ch3-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: #F2F3F7; }
  .vt-ch3 .ch3-cell-s { font-size: 8px; line-height: 1.25; color: var(--ch3-accent); }
  /* the board's foot — decorative, aria-hidden, never a control */
  .vt-ch3 .ch3-pied { position: relative; margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .vt-ch3 .ch3-level {
    font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-style: italic; text-transform: uppercase; font-size: 10.5px; letter-spacing: .16em; color: var(--ch3-t2);
  }
  .vt-ch3 .ch3-code {
    flex: 1; max-width: 130px; height: 18px;
    background-image: repeating-linear-gradient(90deg, rgba(255,255,255,.75) 0 1.5px, transparent 1.5px 4px);
  }
  .vt-ch3 .ch3-btn { background: rgba(255,255,255,.08); box-shadow: inset 0 0 0 1px rgba(201,205,214,.45); }
  .vt-ch3 .vt-ent-btn { top: 70px; }
  .vt-ch3 .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-ch3 .ch3-hero { padding: 74px 12px 12px; }
    .vt-ch3 .ch3-cercle { top: 112px; right: -46px; width: 150px; height: 150px; }
    .vt-ch3 .ch3-col { width: calc(100% - 102px); }
    .vt-ch3 .ch3-name { font-size: clamp(21px, 8.4cqw, 26px); }
    .vt-ch3 .ch3-name.vt-ent-long { font-size: 19px; }
    .vt-ch3 .ch3-mono { font-size: 50px; margin-right: 28px; }
    .vt-ch3 .ch3-trust { padding: 10px 2px; }
    .vt-ch3 .ch3-cell { padding: 0 4px; gap: 5px; }
    .vt-ch3 .ch3-cell-i { width: 32px; height: 32px; }
    .vt-ch3 .ch3-code { max-width: 96px; }
  }
`;

export const unit: EnteteUnit = { render, css };
