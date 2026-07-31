import { t } from '../../i18n';
import { iconCheckEnt, iconLockEnt, iconPinEnt, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
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
 * ENTETES-H · SÉRIE 3 — 12 · FLEURIE — « blush aquarelle, panneau blanc, nom
 * Georgia olive ».
 *
 * SOURCE OF TRUTH: the id="fleurie" block of « En-tetes Boutique - Serie 3 »
 * and its « Relevé — Fleurie ».
 *
 * THE ONE STYLE BUILT AROUND A PANEL. Her identity sits on a white .92 card
 * with a 26px radius, inset from the page, and the photograph is an ORGANIC
 * GALET — a 158×196 blob with an eight-value border-radius — pushed off the
 * right edge at −26 with a 6px white ribbon around it. The page behind is
 * blush with two radial washes.
 *
 * THE CONTRACT'S OWN NAMED DEVIATION, carried as it is written: « aquarelles
 * florales → formes radiales CSS (aucune image d'exécution) ». The board's
 * watercolour flowers become a soft organic petal and a radial bloom. That is
 * the deviation the relevé itself declares, not one of mine.
 *
 * THE MINIMAL BADGE WRAPS ITS OWN STRING. The board sets « Nouvelle / vendeuse »
 * on two lines inside a 78px disc. The catalog string is NOT cut to match — it
 * stays « Nouvelle vendeuse » and the disc's width does the wrapping, because a
 * string broken by hand in markup is a string that no longer lives in the
 * catalog (loi 6).
 *
 * Bio not drawn — série 3 shows a présentation on Perle and Artisan only.
 */

/** The proof glyph, and the two florals. Local by DESIGN, not laziness: these
 *  live in this style's own chunk, so a buyer who chose another header pays
 *  nothing for them. Promoting them to the shared icon set would move the bytes
 *  into the main bundle that EVERY buyer downloads — the opposite of what the
 *  per-style split is for, even though Audace draws a similar pair. */
const iconGroupe = (size: number, fill: string): string =>
  `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}"><path d="M16 11a3 3 0 10-3-3 3 3 0 003 3zM8 11a3 3 0 10-3-3 3 3 0 003 3zm8 2c-2.2 0-4.4 1-4.4 3v2h8.8v-2c0-2-2.2-3-4.4-3zm-8 0c-.3 0-.6 0-.9.1A4.4 4.4 0 019.6 16v2H3.2v-2c0-2 2.6-3 4.8-3z"/></svg>`;

const iconCoeur = (w: number, h: number, fill: string): string =>
  `<svg class="i" width="${w}" height="${h}" viewBox="0 0 24 22" fill="${fill}"><path d="M12 21S1 14 1 7.5A6 6 0 0112 4a6 6 0 0111 3.5C23 14 12 21 12 21z"/></svg>`;

/** The wire ribbon-knot at the panel's head, between two hairlines. */
const noeud = (): string =>
  '<span class="fl-noeud" aria-hidden="true"><i></i>' +
  '<svg class="i" width="20" height="14" viewBox="0 0 24 16" fill="none" stroke="#E8A0A8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 8L5 3.5c-2 1.4-2 7.6 0 9zM12 8l7-4.5c2 1.4 2 7.6 0 9z"/><circle cx="12" cy="8" r="1.8" fill="#E8A0A8" stroke="none"/></svg><i></i></span>';

function render(v: Vals): string {
  const cell = (icon: string, tone: string, label: string, sub: string): string =>
    `<div class="fl-cell"><span class="fl-cell-i fl-cell-i--${tone}">${icon}</span><span class="fl-cell-l">${label}</span><span class="fl-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-fl" data-role="vitrine-hero">',
    '<div class="fl-hero">',
    // « aquarelles florales → formes radiales CSS » — the relevé's own deviation
    '<span class="fl-petale" aria-hidden="true"></span>',
    '<span class="fl-fleur" aria-hidden="true"></span>',
    '<span class="fl-pois" aria-hidden="true"></span>',
    '<div class="fl-panneau" data-role="vitrine-identity">',
    '<div class="fl-tete">',
    `<div class="fl-av" data-etat="${v.hasAvatar ? 'live' : 'none'}">`,
    v.hasAvatar
      ? framePhoto({ ...v, hasCover: false }, '50% 32%')
      : `<span class="fl-av-mono">${v.mono}</span>`,
    '<span class="fl-av-fest" aria-hidden="true"></span>',
    `<span class="fl-av-coeur" aria-hidden="true">${iconCoeur(9, 9, '#FFFFFF')}</span>`,
    '</div>',
    noeud(),
    '</div>',
    `<div class="fl-name${v.longName ? ' vt-ent-long' : ''}">${weldSeal(v.tail, `<span class="fl-seal" aria-hidden="true"><span class="fl-seal-d">${iconCheckEnt(10, '#FFFFFF', 3.4)}</span><span class="fl-seal-f"></span></span>`)}</div>`,
    v.hasTag
      ? `<div class="fl-bienv"><span class="fl-tiret" aria-hidden="true"></span><span class="fl-bienv-t"><v>${v.tagline}</v></span><span class="fl-tiret" aria-hidden="true"></span></div>`
      : '',
    `<div class="fl-filet" aria-hidden="true"><span></span>${iconCoeur(10, 9, '#C9B48A')}<span></span></div>`,
    `<div class="fl-zone">${zoneLine(v, iconPinEnt(12, '#8A9B6E', 2.2))}</div>`,
    v.showProof
      ? `<div class="fl-proof"><span class="fl-pilule">${iconGroupe(14, '#B0785A')}<span data-role="reputation">${ventesLine(v)}</span></span>${
          v.showStars
            ? `<div class="fl-stars" data-role="chip-avis">${iconStarEnt(11, '#C9B48A')}${avisChip(v)}</div>`
            : ''
        }</div>`
      : '',
    '</div>',
    // the organic galet, ribboned in white, biting the right edge
    `<div class="fl-galet" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '44% 26%')
      : `<div class="fl-motif"><span class="fl-mono">${v.mono}</span></div>`,
    '</div>',
    v.nouvelle
      ? `<div class="fl-nouv" data-role="chip-nouvelle"><span class="fl-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span>${iconCoeur(11, 10, '#F7CDD2')}</div>`
      : '',
    // « 3 cartes séparées » — the one style whose trust row is three cards
    '<div class="fl-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#FDF4F0', 2), 'sauge', t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#8C5A46', 2), 'rose', t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#FDF4F0', 2), 'sauge', t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    controls(v, 'fl', 'right', '20px', '72px', '#5A6142'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 12 · FLEURIE (série 3) ══════════════════════
     Relevé — page #FBE9E7 (radials #F6CFD4, #F9DDD9) · pétales #F4B8C1 /
     #F4A9B5 · rose #E8A0A8, bande #F7CDD2, italique #C96F7E · olive #5A6142 ·
     sauge #8A9B6E / #A9B98A · or doux #C9B48A · textes #6E5A50 / #7A5B50 /
     #A08A80 · blanc .92. */
  .vt-fl {
    --fl-page: #FBE9E7; --fl-petale: #F4B8C1; --fl-petale-2: #F4A9B5;
    --fl-rose: #E8A0A8; --fl-bande: #F7CDD2; --fl-ital: #C96F7E;
    --fl-olive: #5A6142; --fl-sauge: #8A9B6E; --fl-sauge-clair: #A9B98A;
    --fl-or: #C9B48A; --fl-t1: #6E5A50; --fl-t2: #7A5B50; --fl-t3: #A08A80;
    --fl-creme: #FDF4F0;
    background: var(--fl-page);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad */
  .vt-fl .fl-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 16px;
    background-color: var(--fl-page);
    background-image:
      radial-gradient(56% 40% at 100% 0%, #F6CFD4 0%, rgba(246,207,212,0) 65%),
      radial-gradient(50% 36% at 0% 100%, #F9DDD9 0%, rgba(249,221,217,0) 60%);
  }
  /* the florals — anchored to the card's real corner, so raw values stand */
  .vt-fl .fl-petale {
    position: absolute; left: -30px; top: -24px; width: 110px; height: 110px; opacity: .5;
    border-radius: 58% 42% 52% 48% / 50% 58% 42% 50%; background: var(--fl-petale);
  }
  .vt-fl .fl-fleur {
    position: absolute; right: 64px; top: -10px; width: 70px; height: 70px; border-radius: 50%; opacity: .8;
    background: radial-gradient(circle at 50% 50%, var(--fl-petale-2) 0 26%, rgba(244,169,181,0) 62%);
  }
  /* relevé top 26, + 60 for the status pad */
  .vt-fl .fl-pois {
    position: absolute; right: 36px; top: 86px; width: 44px; height: 44px;
    background-image: radial-gradient(circle, rgba(214,130,145,.5) 1.3px, transparent 1.5px);
    background-size: 9px 9px;
  }
  /* THE PANEL — inset from the page, leaving 118px for the galet */
  .vt-fl .fl-panneau {
    position: relative; margin-right: 118px; border-radius: 26px; padding: 14px 14px 16px;
    background: rgba(255,255,255,.92); box-shadow: 0 14px 34px -20px rgba(150,90,90,.5);
  }
  .vt-fl .fl-tete { display: flex; align-items: center; justify-content: space-between; }
  .vt-fl .fl-av {
    position: relative; width: 52px; height: 52px; flex: none; border-radius: 50%;
    background: var(--fl-creme); box-shadow: 0 0 0 1.5px var(--fl-rose);
  }
  .vt-fl .fl-av .vt-avatar-img { border-radius: 50%; }
  .vt-fl .fl-av-mono {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 25px; color: var(--fl-olive);
  }
  .vt-fl .fl-av-fest { position: absolute; inset: -4px; border-radius: 50%; border: 1.5px dashed rgba(232,160,168,.6); }
  .vt-fl .fl-av-coeur {
    position: absolute; right: -4px; bottom: -1px; width: 16px; height: 16px; border-radius: 50%;
    background: var(--fl-petale-2); display: flex; align-items: center; justify-content: center;
  }
  .vt-fl .fl-noeud { display: flex; align-items: center; gap: 7px; }
  .vt-fl .fl-noeud i { width: 22px; height: 1px; background: #D6A0A9; }
  .vt-fl .fl-name {
    margin-top: 11px;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(24px, 8.4cqw, 29px); line-height: 1.1; letter-spacing: -.005em;
    color: var(--fl-olive); overflow-wrap: break-word;
  }
  /* split column (the galet owns the right 118) ⇒ the fixed tier applies */
  .vt-fl .fl-name.vt-ent-long { font-size: 20px; }
  .vt-fl .fl-name .vt-ent-acc { color: var(--fl-olive); }
  .vt-fl .fl-seal { position: relative; display: inline-flex; width: 19px; height: 19px; vertical-align: -2px; margin-left: 7px; }
  .vt-fl .fl-seal-d {
    position: absolute; inset: 0; border-radius: 50%; background: var(--fl-sauge);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-fl .fl-seal-f { position: absolute; inset: -2.5px; border-radius: 50%; border: 1.5px dashed rgba(138,155,110,.55); }
  .vt-fl .fl-bienv { margin-top: 7px; display: inline-flex; align-items: center; gap: 8px; max-width: 100%; }
  .vt-fl .fl-tiret { width: 16px; height: 2px; flex: none; border-radius: 2px; background: var(--fl-sauge-clair); }
  .vt-fl .fl-bienv-t {
    display: inline-flex; min-height: 28px; align-items: center; padding: 4px 13px; border-radius: 8px;
    background: var(--fl-bande);
    font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 15px; line-height: 1.25; color: var(--fl-ital);
  }
  .vt-fl .fl-filet { margin-top: 10px; display: flex; align-items: center; gap: 7px; }
  .vt-fl .fl-filet span { flex: 1; border-top: 1.5px dotted rgba(150,110,90,.4); }
  .vt-fl .fl-zone { margin-top: 9px; font-size: 11.5px; font-weight: 500; line-height: 1.45; color: var(--fl-t1); }
  .vt-fl .fl-zone svg { vertical-align: -2px; margin-right: 4px; }
  .vt-fl .fl-proof { margin-top: 10px; }
  .vt-fl .fl-pilule {
    display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 5px 13px;
    border-radius: 99px; background: #FBDDE0; font-size: 11.5px; line-height: 1.35; color: var(--fl-t2);
  }
  .vt-fl .fl-pilule svg { flex: none; }
  .vt-fl .fl-pilule b { font-weight: 700; color: #4A3A32; }
  .vt-fl .fl-stars { margin-top: 5px; font-size: 11px; font-weight: 600; color: #B0785A; }
  .vt-fl .fl-stars svg { vertical-align: -1.5px; margin-right: 3px; }
  /* THE GALET — an organic blob, ribboned white, relevé top 44 + 60 */
  .vt-fl .fl-galet {
    position: absolute; top: 104px; right: -26px; width: 158px; height: 196px; overflow: hidden;
    border-radius: 62% 38% 56% 44% / 46% 60% 40% 54%;
    box-shadow: 0 0 0 6px rgba(255,255,255,.9), 0 18px 38px -18px rgba(150,90,90,.55);
  }
  .vt-fl .fl-galet .vt-avatar-img { object-position: 44% 26%; }
  .vt-fl .fl-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--fl-bande);
    background-image: radial-gradient(circle, rgba(138,155,110,.35) 1.5px, transparent 1.7px);
    background-size: 12px 12px;
  }
  .vt-fl .fl-mono { margin-right: 24px; font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 60px; line-height: 1; color: rgba(90,97,66,.45); }
  /* MINIMAL — the scalloped sage disc. The relevé puts it at top 14 (⇒ 74 with
     the status pad), but that is exactly where OUR partager/retour sit: the
     board has no floating controls, so the two never competed there. Measured
     at 320, the button covered the disc and « vendeuse » was unreadable. It
     drops to 124, one control-row below — still on the galet's upper shoulder,
     which is where the board's own composition puts it (the disc overlaps the
     galet there too). The catalog string wraps to two lines on the disc's own
     width; it is never cut by hand in the markup. */
  .vt-fl .fl-nouv {
    position: absolute; top: 124px; right: 10px; width: 78px; height: 78px; border-radius: 50%;
    background: var(--fl-sauge); border: 2px dashed rgba(255,255,255,.55);
    box-shadow: 0 10px 22px -10px rgba(90,97,66,.6); transform: rotate(4deg);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  }
  .vt-fl .fl-nouv-t { font-family: Georgia, 'Times New Roman', serif; font-size: 11px; line-height: 1.15; color: var(--fl-creme); text-align: center; }
  /* « 3 cartes séparées blanches r16 (gap 8) » */
  .vt-fl .fl-trust { position: relative; margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .vt-fl .fl-cell {
    border-radius: 16px; padding: 10px 6px; text-align: center;
    background: rgba(255,255,255,.92); box-shadow: 0 10px 24px -18px rgba(150,90,90,.5);
    display: flex; flex-direction: column; align-items: center; gap: 6px;
  }
  .vt-fl .fl-cell-i {
    width: 34px; height: 34px; flex: none; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }
  .vt-fl .fl-cell-i--sauge { background: var(--fl-sauge); }
  .vt-fl .fl-cell-i--rose { background: #F2C6CC; }
  .vt-fl .fl-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: #4A4534; }
  .vt-fl .fl-cell-s { font-size: 8px; line-height: 1.25; color: var(--fl-t3); }
  .vt-fl .fl-btn { background: rgba(255,255,255,.9); box-shadow: 0 4px 12px -3px rgba(150,90,90,.4); }
  .vt-fl .vt-ent-btn { top: 70px; }
  .vt-fl .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-fl .fl-hero { padding: 74px 12px 12px; }
    .vt-fl .fl-panneau { margin-right: 100px; padding: 12px 12px 14px; }
    .vt-fl .fl-galet { top: 100px; right: -34px; width: 142px; height: 176px; }
    .vt-fl .fl-name { font-size: clamp(21px, 8.4cqw, 25px); }
    .vt-fl .fl-name.vt-ent-long { font-size: 19px; }
    .vt-fl .fl-mono { font-size: 52px; margin-right: 22px; }
    .vt-fl .fl-bienv-t { font-size: 14px; padding: 4px 10px; }
    .vt-fl .fl-trust { gap: 6px; }
    .vt-fl .fl-cell { padding: 9px 4px; gap: 5px; }
    .vt-fl .fl-cell-i { width: 30px; height: 30px; }
  }
`;

export const unit: EnteteUnit = { render, css };
