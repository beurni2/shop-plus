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
 * ENTETES-H · SÉRIE 5 — 28 · BRONZE — « cire perdue de Ouaga ».
 *
 * SOURCE OF TRUTH: the id="bronze" block of « En-tetes Boutique - Serie 5 »
 * and its « Relevé — Bronze ». Origine: création originale — aucune image
 * source.
 *
 * THE LOST-WAX WORKSHOP. Hot metal on charcoal, and the relevé's intent is
 * precise about the restraint: « une seule touche de patine verte comme
 * signature ». The patina green appears exactly three times — the bead on the
 * medallion's edge, the pin, and the star — and nowhere else. Resisting the
 * urge to spread it is the style.
 *
 * THE THIRD CONTRACT TEXT CLASS. `.txb` is the bronze gradient, named by the
 * handoff as this series' only CSS class (« dégradé de texte via .txb (28
 * uniquement) »). It follows the same discipline as Chrome's `.txc`/`.txv` and
 * Série 4's gold: the SOLID bronze is declared FIRST, the gradient only inside
 * `@supports (background-clip: text)`. A browser that cannot clip a gradient
 * to text gets readable bronze, never transparent letters on charcoal.
 *
 * The photograph sits in a MEDALLION ARCH — 156×206 with radius 78/78/12/12,
 * round at the top and square at the foot, triple-lined bronze / charcoal /
 * bronze. The MINIMAL badge is a cast medallion: a radial bronze disc with an
 * inner highlight above and shadow below, so it reads as struck metal.
 *
 * Verified seal on its own line (série 4/5 convention). Bio not drawn.
 * Split column ⇒ the série 5 tier of 24px.
 */

/** The foundry sun at the head — wire-drawn, bronze. */
const soleil = (): string =>
  '<svg class="bz-soleil" aria-hidden="true" width="44" height="26" viewBox="0 0 44 26">' +
  '<circle cx="22" cy="20" r="7" fill="none" stroke="#B4762E" stroke-width="1.6"/>' +
  '<path d="M22 2v6M9 6l3.5 4.6M35 6l-3.5 4.6M2 18h5M37 18h5M6 27l4-3.4M38 27l-4-3.4" fill="none" stroke="#B4762E" stroke-width="1.6" stroke-linecap="round"/></svg>';

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="bz-cell"><span class="bz-cell-i">${icon}</span><span class="bz-cell-l">${label}</span><span class="bz-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-bz" data-role="vitrine-hero">',
    '<div class="bz-hero">',
    // the medallion arch — round above, square below
    '<div class="bz-photo-wrap">',
    `<div class="bz-photo" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 24%')
      : `<div class="bz-motif"><span class="bz-mono">${v.mono}</span></div>`,
    '</div>',
    '<span class="bz-perle" aria-hidden="true"></span>',
    '</div>',
    '<span class="bz-filet" aria-hidden="true"></span>',
    '<div class="bz-col" data-role="vitrine-identity">',
    soleil(),
    v.hasTag ? `<div class="bz-bienv"><v>${v.tagline}</v></div>` : '',
    `<div class="bz-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="bz-verif"><span class="bz-verif-i">${iconCheckEnt(9, '#1A1714', 3.4)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="bz-zone">${iconPinEnt(12, '#7FB3A2', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="bz-proof-wrap"><span class="bz-proof"><span class="bz-proof-l" data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="bz-stars" data-role="chip-avis">${iconStarEnt(10, '#7FB3A2')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    v.nouvelle
      ? `<div class="bz-nouv-wrap"><span class="bz-nouv" data-role="chip-nouvelle"><span class="bz-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '<div class="bz-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#1A1714', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#1A1714', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#1A1714', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'bz', 'right', '20px', '72px', '#F2E9DA'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 28 · BRONZE (série 5) ══════════════════════
     Relevé — charbon #1A1714 (barre #131110, bande #221D18, grenaille blanche
     .025 pas 7) · bronze .txb #E0A35C / #B4762E / #7E4C16 / #D69A50 (liens
     #8A5518) · patine #3F7D6C / #7FB3A2 · ivoire #F2E9DA / #CDC2B0. */
  .vt-bz {
    --bz-charbon: #1A1714; --bz-bande: #221D18;
    --bz-b1: #E0A35C; --bz-b2: #B4762E; --bz-b3: #7E4C16; --bz-b4: #D69A50; --bz-lien: #8A5518;
    --bz-patine: #3F7D6C; --bz-patine-2: #7FB3A2;
    --bz-ivoire: #F2E9DA; --bz-ivoire-2: #CDC2B0;
    background: var(--bz-charbon);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad. The grain is
     a 7px white speckle at .025 — barely there, which is the point. */
  .vt-bz .bz-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 16px;
    background-color: var(--bz-charbon);
    background-image: radial-gradient(circle, rgba(255,255,255,.025) 1px, transparent 1.2px);
    background-size: 7px 7px;
  }
  /* THE MEDALLION ARCH — round above, square at the foot */
  .vt-bz .bz-photo-wrap { position: absolute; top: 96px; right: 8px; width: 156px; height: 206px; }
  .vt-bz .bz-photo {
    position: absolute; inset: 0; border-radius: 78px 78px 12px 12px; overflow: hidden;
    box-shadow: 0 0 0 2.5px var(--bz-b2), 0 0 0 5px var(--bz-charbon), 0 0 0 6.5px rgba(180,118,46,.4);
  }
  .vt-bz .bz-photo .vt-avatar-img { object-position: 50% 24%; }
  .vt-bz .bz-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle at 40% 26%, #3A2C1C 0%, #241B12 100%);
  }
  .vt-bz .bz-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 58px; line-height: 1; color: rgba(224,163,92,.5); }
  /* THE ONE TOUCH OF PATINA — a bead on the medallion's edge. The relevé allows
     this green in exactly three places; it appears nowhere else in this sheet.
     It rides the OUTER edge, not the inner one: on the inner edge it landed on
     top of her name, and a decorative bead must never sit on a word. */
  .vt-bz .bz-perle {
    position: absolute; right: -6px; top: 58px; width: 12px; height: 12px; border-radius: 50%;
    background: radial-gradient(circle at 34% 30%, var(--bz-patine-2) 0%, var(--bz-patine) 100%);
  }
  .vt-bz .bz-filet {
    position: absolute; left: 6px; top: 96px; width: 2px; height: 178px;
    background: linear-gradient(180deg, rgba(180,118,46,0), var(--bz-b2) 40%, rgba(180,118,46,0));
  }
  /* THE COLUMN CLEARS THE MEDALLION, and that is arithmetic, not taste: the
     arch sits at right 8 and is 156 wide, so it owns everything past x=196.
     The relevé's « calc(100% − 150px) » is measured against the FULL width; the
     column's containing block is the hero's padded box (332 at 360), and the
     14px indent I gave it pushed the name and the proof pill under the photo.
     100% − 162 + an 8px indent lands the right edge at 192 — clear, and only
     12px narrower than the overlapping version. */
  .vt-bz .bz-col { position: relative; margin-left: 8px; width: calc(100% - 162px); min-height: 248px; }
  .vt-bz .bz-soleil { display: block; }
  .vt-bz .bz-bienv { margin-top: 4px; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 18px; color: var(--bz-patine-2); }
  .vt-bz .bz-name {
    margin-top: 6px;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.06;
    color: var(--bz-ivoire); overflow-wrap: break-word;
  }
  /* série 5's split columns take 24px (Karité alone takes 20) */
  .vt-bz .bz-name.vt-ent-long { font-size: 24px; }
  /* .txb — SOLID BRONZE FIRST. A browser that cannot clip a gradient to text
     must get readable bronze, never transparent letters on charcoal. */
  .vt-bz .bz-name .vt-ent-acc { color: var(--bz-b1); }
  @supports (background-clip: text) or (-webkit-background-clip: text) {
    .vt-bz .bz-name .vt-ent-acc {
      background-image: linear-gradient(96deg, var(--bz-b1) 0%, var(--bz-b2) 38%, var(--bz-b3) 68%, var(--bz-b4) 100%);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
    }
  }
  .vt-bz .bz-verif { margin-top: 10px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: var(--bz-ivoire); }
  .vt-bz .bz-verif-i {
    width: 15px; height: 15px; flex: none; border-radius: 50%;
    background: radial-gradient(circle at 34% 30%, var(--bz-b1) 0%, var(--bz-b2) 100%);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-bz .bz-zone { margin-top: 6px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--bz-ivoire-2); }
  .vt-bz .bz-zone svg { vertical-align: -2px; margin-right: 5px; }
  .vt-bz .bz-proof-wrap { margin-top: 11px; }
  .vt-bz .bz-proof {
    display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 8px 14px; border-radius: 99px;
    background: rgba(180,118,46,.08); box-shadow: inset 0 0 0 1px rgba(180,118,46,.55);
  }
  .vt-bz .bz-proof-l { font-size: 11px; line-height: 1.35; color: var(--bz-ivoire); }
  .vt-bz .bz-proof-l b { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 19px; color: var(--bz-b1); }
  .vt-bz .bz-stars { font-size: 10.5px; font-weight: 600; color: var(--bz-patine-2); white-space: nowrap; }
  .vt-bz .bz-stars svg { vertical-align: -1px; margin-right: 3px; }
  /* MINIMAL — a CAST medallion: radial bronze with an inner highlight above and
     shadow below, so it reads as struck metal rather than a coloured chip. */
  .vt-bz .bz-nouv-wrap { margin-top: 13px; }
  .vt-bz .bz-nouv {
    display: inline-flex; align-items: center; justify-content: center; text-align: center;
    width: 92px; height: 92px; border-radius: 50%; padding: 10px;
    background: radial-gradient(circle at 36% 28%, var(--bz-b1) 0%, var(--bz-b2) 58%, var(--bz-b3) 100%);
    box-shadow:
      inset 0 3px 6px rgba(255,255,255,.45), inset 0 -4px 8px rgba(0,0,0,.4),
      0 0 0 2px var(--bz-lien), 0 12px 26px -12px rgba(0,0,0,.8);
  }
  .vt-bz .bz-nouv-t { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 13px; line-height: 1.2; color: #2E1A06; }
  .vt-bz .bz-trust {
    position: relative; padding: 12px 3px; background: var(--bz-bande);
    display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-bz .bz-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-bz .bz-cell + .bz-cell { border-left: 1px solid rgba(180,118,46,.28); }
  .vt-bz .bz-cell-i {
    width: 36px; height: 36px; flex: none; border-radius: 50%;
    background: radial-gradient(circle at 34% 28%, var(--bz-b1) 0%, var(--bz-b2) 70%, var(--bz-b3) 100%);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-bz .bz-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: var(--bz-ivoire); }
  .vt-bz .bz-cell-s { font-size: 8px; line-height: 1.25; color: var(--bz-patine-2); }
  .vt-bz .bz-btn { background: rgba(26,23,20,.75); box-shadow: inset 0 0 0 1px rgba(180,118,46,.6); }
  .vt-bz .vt-ent-btn { top: 70px; }
  .vt-bz .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-bz .bz-hero { padding: 74px 12px 14px; }
    /* right 10, not 4: the patina bead straddles the OUTER edge, and at 4 the
       hero's overflow clipped it in half at 320. */
    .vt-bz .bz-photo-wrap { top: 92px; right: 10px; width: 134px; height: 178px; }
    .vt-bz .bz-photo { border-radius: 67px 67px 12px 12px; }
    /* same arithmetic at 320: arch at right 10, 134 wide ⇒ it owns past x=176 */
    .vt-bz .bz-col { margin-left: 8px; width: calc(100% - 148px); min-height: 230px; }
    .vt-bz .bz-name { font-size: clamp(23px, 9.4cqw, 28px); }
    .vt-bz .bz-name.vt-ent-long { font-size: 21px; }
    .vt-bz .bz-mono { font-size: 50px; }
    .vt-bz .bz-bienv { font-size: 16px; }
    .vt-bz .bz-trust { padding: 11px 2px; }
    .vt-bz .bz-cell { padding: 0 4px; gap: 5px; }
    .vt-bz .bz-cell-i { width: 32px; height: 32px; }
  }
`;

export const unit: EnteteUnit = { render, css };
