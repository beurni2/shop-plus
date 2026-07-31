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
  verifieeBare,
  type Vals,
} from '../entetes';
import type { EnteteUnit } from './registry';

/**
 * ENTETES-H · SÉRIE 3 — 13 · PRISME — « verre holographique, couronne cristal,
 * Georgia sapin ».
 *
 * SOURCE OF TRUTH: the id="prisme" block of « En-tetes Boutique - Serie 3 »
 * and its « Relevé — Prisme ».
 *
 * GLASS, AND THE ONE CONTRACT CLASS IT NEEDS. `.glz` is named by the handoff
 * itself (« Classes CSS du contrat — .glz (verre, Prisme & Perle) ») and its
 * recipe is Cristal's from série 1, reused verbatim: an opaque
 * `rgba(255,255,255,.66)` fallback FIRST, then a lighter .44 behind
 * `@supports (backdrop-filter: blur(16px))`. Written that way round on purpose —
 * a low-end Android with no backdrop-filter gets a finished opaque panel, not a
 * transparent one with unreadable text over it. It is scoped `.vt-pi .glz` so
 * it stays inside this style's chunk and cannot reach Cristal's.
 *
 * FULL WIDTH AND CENTRED, so NO fixed long-name tier — « pleine largeur (13,
 * 14) : pas de règle fixe ». A long name wraps.
 *
 * THE CONTRACT'S NAMED DEVIATIONS, carried as written: the board's 3D crystal
 * crown becomes a flat faceted SVG (« écart : 3D → facettes »), and its
 * photoreal holographic halo becomes three CSS radial washes.
 *
 * Bio not drawn — série 3 shows a présentation on Perle and Artisan only.
 */

const iconGroupe = (size: number, fill: string): string =>
  `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}"><path d="M16 11a3 3 0 10-3-3 3 3 0 003 3zM8 11a3 3 0 10-3-3 3 3 0 003 3zm8 2c-2.2 0-4.4 1-4.4 3v2h8.8v-2c0-2-2.2-3-4.4-3zm-8 0c-.3 0-.6 0-.9.1A4.4 4.4 0 019.6 16v2H3.2v-2c0-2 2.6-3 4.8-3z"/></svg>`;

/** The crystal crown — flat and faceted, the relevé's own substitution for the
 *  board's 3D render. */
const couronne = (): string =>
  '<svg class="pi-couronne" aria-hidden="true" width="46" height="30" viewBox="0 0 46 30">' +
  '<path d="M4 24L2 8l10 7L23 2l11 13 10-7-2 16z" fill="#DCD2F5" stroke="#B4A6E8" stroke-width="1.4" stroke-linejoin="round"/>' +
  '<path d="M23 2l4.5 10.5L23 24l-4.5-11.5z" fill="#CDEDE2" stroke="#B4A6E8" stroke-width="1" stroke-linejoin="round"/>' +
  '<circle cx="2.5" cy="7" r="1.6" fill="#FFFFFF"/><circle cx="43.5" cy="7" r="1.6" fill="#FFFFFF"/>' +
  '<circle cx="23" cy="2.4" r="1.8" fill="#FFFFFF"/></svg>';

const etincelle = (size: number, fill: string): string =>
  `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/></svg>`;

function render(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="glz pi-cell"><span class="pi-cell-i">${icon}</span><span class="pi-cell-l">${label}</span><span class="pi-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-pi" data-role="vitrine-hero">',
    '<div class="pi-hero">',
    // the four-ray sparkle at the top right — three CSS shapes, no image
    '<span class="pi-etl-o" aria-hidden="true"></span>',
    '<span class="pi-etl-v" aria-hidden="true"></span>',
    '<span class="pi-etl-h" aria-hidden="true"></span>',
    '<div class="glz pi-carte" data-role="vitrine-identity">',
    couronne(),
    `<div class="pi-name">${weldSeal(v.tail, `<span class="pi-seal" aria-hidden="true"><span class="pi-seal-d">${iconCheckEnt(11, '#FFFFFF', 3.4)}</span><span class="pi-seal-f"></span></span>`)}</div>`,
    v.hasTag
      ? `<div class="pi-bienv"><span class="pi-fil pi-fil--g" aria-hidden="true"></span><span class="pi-bienv-t"><v>${v.tagline}</v></span>${etincelle(11, '#C4B5FD')}<span class="pi-fil pi-fil--d" aria-hidden="true"></span></div>`
      : '',
    `<div class="glz pi-zone">${iconPinSolid(13, '#14B8A6', '#EDEFF5')}<span>${verifieeBare()} · <v>${v.zone}</v></span></div>`,
    v.showProof
      ? `<div class="pi-proof-wrap"><span class="glz pi-proof">${iconGroupe(15, '#5EA79B')}<span data-role="reputation">${ventesLine(v)}</span>${
          v.showStars
            ? `<span class="pi-stars" data-role="chip-avis">${iconStarEnt(10, '#8B79C9')}${avisChip(v)}</span>`
            : ''
        }</span></div>`
      : '',
    // the glass photo frame, inside the card
    `<div class="pi-cadre" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 24%')
      : `<div class="pi-motif"><span class="pi-mono">${v.mono}</span></div>`,
    v.nouvelle
      ? `<span class="glz pi-nouv" data-role="chip-nouvelle">${iconStarEnt(14, '#14B8A6')}<span class="pi-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span>`
      : '',
    '</div>',
    '</div>',
    '<div class="pi-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#14907F', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#14907F', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#14907F', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    controls(v, 'pi', 'right', '20px', '72px', '#123D33'),
    '</div>',
  ].join('');
}

const css = `
  /* ══════════════════════ 13 · PRISME (série 3) ══════════════════════
     Relevé — page #EDEFF5 + radials menthe #CFEDE3 / lilas #E3D9F7 / bleuté
     #D9E6F7 · sapin #123D33 (rangée #22433C) · turquoise #14B8A6 (icônes
     #14907F) · lilas #A78BFA / #8B79C9 / badge #7C5FC9 · couronne #DCD2F5 /
     #CDEDE2, bord #B4A6E8 · verre blanc .44–.9. */
  .vt-pi {
    --pi-page: #EDEFF5; --pi-sapin: #123D33; --pi-sapin-2: #22433C;
    --pi-turquoise: #14B8A6; --pi-turquoise-2: #14907F;
    --pi-lilas: #A78BFA; --pi-lilas-2: #8B79C9; --pi-badge: #7C5FC9;
    background: var(--pi-page);
  }
  /* padding-top 74 = the relevé's 14 + the shell's 60 status pad */
  .vt-pi .pi-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 12px 14px;
    background-color: var(--pi-page);
    background-image:
      radial-gradient(50% 36% at 8% 8%, #CFEDE3 0%, rgba(207,237,227,0) 70%),
      radial-gradient(46% 34% at 96% 30%, #E3D9F7 0%, rgba(227,217,247,0) 70%),
      radial-gradient(50% 30% at 50% 100%, #D9E6F7 0%, rgba(217,230,247,0) 70%);
  }
  /* THE CONTRACT'S GLASS — Cristal's recipe, scoped to this chunk. The opaque
     fallback is declared FIRST so a phone without backdrop-filter gets a
     finished panel rather than transparent glass with text lost on it. */
  .vt-pi .glz { background: rgba(255,255,255,.66); }
  @supports ((backdrop-filter: blur(16px)) or (-webkit-backdrop-filter: blur(16px))) {
    .vt-pi .glz { -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); background: rgba(255,255,255,.44); }
  }
  /* the sparkle — relevé tops 16 / 9 / 23, each + 60 for the status pad */
  .vt-pi .pi-etl-o {
    position: absolute; top: 76px; right: 26px; width: 18px; height: 18px;
    background: radial-gradient(circle, rgba(255,255,255,.98) 0 16%, rgba(255,255,255,0) 60%);
  }
  .vt-pi .pi-etl-v {
    position: absolute; top: 69px; right: 33px; width: 2px; height: 30px;
    background: linear-gradient(180deg, rgba(255,255,255,0), #FFFFFF, rgba(255,255,255,0));
  }
  .vt-pi .pi-etl-h {
    position: absolute; top: 83px; right: 19px; width: 30px; height: 2px;
    background: linear-gradient(90deg, rgba(255,255,255,0), #FFFFFF, rgba(255,255,255,0));
  }
  .vt-pi .pi-carte {
    position: relative; border-radius: 24px; padding: 16px 14px; text-align: center;
    box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.9), 0 18px 40px -22px rgba(90,110,160,.5);
  }
  .vt-pi .pi-couronne { display: block; margin: 0 auto; }
  .vt-pi .pi-name {
    margin-top: 8px;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(26px, 9cqw, 31px); line-height: 1.08;
    color: var(--pi-sapin); overflow-wrap: break-word;
  }
  /* « pleine largeur : pas de règle fixe » — a long name wraps, never shrinks */
  .vt-pi .pi-name .vt-ent-acc { color: var(--pi-sapin); }
  .vt-pi .pi-seal { position: relative; display: inline-flex; width: 20px; height: 20px; vertical-align: -2px; margin-left: 7px; }
  .vt-pi .pi-seal-d {
    position: absolute; inset: 0; border-radius: 50%; background: var(--pi-turquoise);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-pi .pi-seal-f { position: absolute; inset: -2.5px; border-radius: 50%; border: 1.5px dashed rgba(20,184,166,.55); }
  .vt-pi .pi-bienv { margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; }
  .vt-pi .pi-fil { width: 26px; height: 1px; flex: none; }
  .vt-pi .pi-fil--g { background: linear-gradient(90deg, rgba(167,139,250,0), var(--pi-lilas)); }
  .vt-pi .pi-fil--d { background: linear-gradient(90deg, var(--pi-lilas), rgba(167,139,250,0)); }
  .vt-pi .pi-bienv-t { font-size: 15px; font-weight: 600; color: var(--pi-lilas); }
  .vt-pi .pi-zone {
    margin: 11px auto 0; display: inline-flex; align-items: center; gap: 6px;
    min-height: 34px; padding: 5px 14px; border-radius: 99px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.95);
    font-size: 11.5px; font-weight: 600; line-height: 1.35; color: #3E5B54;
  }
  .vt-pi .pi-zone svg { flex: none; }
  .vt-pi .pi-proof-wrap { margin-top: 8px; }
  .vt-pi .pi-proof {
    display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 6px 15px;
    border-radius: 99px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.95);
    font-size: 12px; line-height: 1.35; color: #4C5F66; flex-wrap: wrap; justify-content: center;
  }
  .vt-pi .pi-proof svg { flex: none; }
  .vt-pi .pi-proof b { font-weight: 700; color: var(--pi-sapin); }
  .vt-pi .pi-stars { font-size: 11px; font-weight: 600; color: var(--pi-lilas-2); white-space: nowrap; }
  .vt-pi .pi-stars svg { vertical-align: -1px; margin-right: 3px; }
  .vt-pi .pi-cadre {
    position: relative; margin-top: 12px; height: 186px; border-radius: 22px; overflow: hidden;
    box-shadow: inset 0 0 0 2px rgba(255,255,255,.95), 0 14px 30px -16px rgba(90,110,160,.55);
  }
  .vt-pi .pi-cadre .vt-avatar-img { object-position: 50% 24%; }
  .vt-pi .pi-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: #E2E7F2;
    background-image:
      repeating-linear-gradient(120deg, rgba(180,166,232,.22) 0 2px, transparent 2px 16px),
      repeating-linear-gradient(60deg, rgba(94,167,155,.18) 0 2px, transparent 2px 16px);
  }
  .vt-pi .pi-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 78px; line-height: 1; color: rgba(18,61,51,.28); }
  /* MINIMAL — the hexagonal glass badge, INSIDE the photo frame at its
     bottom-right, which is where the board puts it and (unlike Fleurie's disc)
     nowhere near our control row. The catalog string wraps on the badge's own
     width; it is never cut by hand. */
  .vt-pi .pi-nouv {
    position: absolute; right: 10px; bottom: 10px;
    display: inline-flex; flex-direction: column; align-items: center; gap: 2px; padding: 9px 13px;
    clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.95);
  }
  .vt-pi .pi-nouv-t { max-width: 72px; font-size: 10.5px; font-weight: 700; line-height: 1.2; color: var(--pi-badge); text-align: center; }
  /* « 3 pilules verre séparées r18 (gap 8) » */
  .vt-pi .pi-trust { position: relative; margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .vt-pi .pi-cell {
    border-radius: 18px; padding: 10px 6px; text-align: center;
    box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.9);
    display: flex; flex-direction: column; align-items: center; gap: 6px;
  }
  .vt-pi .pi-cell-i {
    width: 34px; height: 34px; flex: none; border-radius: 50%; background: rgba(255,255,255,.9);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-pi .pi-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: var(--pi-sapin-2); }
  .vt-pi .pi-cell-s { font-size: 8px; line-height: 1.25; color: var(--pi-lilas-2); }
  .vt-pi .pi-btn { background: rgba(255,255,255,.82); box-shadow: inset 0 0 0 1px rgba(255,255,255,.95), 0 4px 12px -3px rgba(90,110,160,.45); }
  .vt-pi .vt-ent-btn { top: 70px; }
  .vt-pi .vt-ent-back { right: 20px; }

  @container (max-width: 339px) {
    .vt-pi .pi-hero { padding: 74px 10px 12px; }
    .vt-pi .pi-carte { padding: 14px 11px; }
    .vt-pi .pi-name { font-size: clamp(23px, 9cqw, 27px); }
    .vt-pi .pi-cadre { height: 164px; }
    .vt-pi .pi-mono { font-size: 66px; }
    .vt-pi .pi-bienv-t { font-size: 14px; }
    .vt-pi .pi-trust { gap: 6px; }
    .vt-pi .pi-cell { padding: 9px 4px; gap: 5px; }
    .vt-pi .pi-cell-i { width: 30px; height: 30px; }
  }
`;

export const unit: EnteteUnit = { render, css };
