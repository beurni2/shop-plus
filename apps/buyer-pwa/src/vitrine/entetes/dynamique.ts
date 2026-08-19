import { t } from '../../i18n';
import { groupFr } from '../../cliente/money';
import { iconCheckEnt, iconLockEnt, iconPinEnt, iconShieldEnt, iconStarEnt, iconTagEnt } from '../icons';
import {
  avatarImg,
  controls,
  coverImg,
  etat,
  zoneLine,
  type Vals,
} from '../entetes';
import type { EnteteUnit } from './registry';

/**
 * ENTETES-I · 5 · DYNAMIQUE — one of the ORIGINAL five (série 1).
 *
 * MOVED, NOT REWRITTEN. Every byte of the drawing and the sheet is the one
 * ENTETES-A/D shipped; only its address changed. These five were compiled into
 * `entetes.ts` and reached every cliente whether or not her seller chose one.
 *
 * Its ENTETES-D full-bleed OVERRIDES are appended at the foot of this sheet,
 * where they keep the cascade position they had: after this style's own rules,
 * which is the whole mechanism by which they override them.
 */

function render(v: Vals): string {
  const cell = (mod: string, icon: string, label: string, sub: string): string =>
    `<div class="dy-cell"><span class="dy-cell-i dy-cell-i-${mod}">${icon}</span><span class="dy-cell-l">${label}</span><span class="dy-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-dy" data-role="vitrine-hero">',
    '<div class="dy-panel">',
    '<span class="dy-trame-b"></span>',
    // La colonne oblique — 152 pleine hauteur, coupe en clip-path.
    `<div class="dy-photo" data-role="vitrine-cover" data-etat="${etat(v)}">`,
    v.hasCover
      ? coverImg(v, '58% 30%')
      : `<div class="dy-photo-motif"><span class="dy-photo-mono">${v.mono}</span></div>`,
    '<span class="dy-voile"></span><span class="dy-trame-r"></span>',
    '</div>',
    '<div class="dy-col" data-role="vitrine-identity">',
    '<div class="dy-top">',
    '<div class="dy-av">',
    v.hasAvatar ? `<span class="dy-av-photo">${avatarImg(v)}</span>` : `<span class="dy-av-mono">${v.mono}</span>`,
    `<span class="dy-av-badge">${iconCheckEnt(9, '#FFF0F8', 3.6)}</span>`,
    '</div>',
    '<div class="dy-idcol">',
    `<div class="dy-name${v.longName ? ' vt-ent-long' : ''}"><v>${v.name}</v><span class="dy-seal"><span class="dy-seal-d">${iconCheckEnt(9, '#FFFFFF', 3.6)}</span><span class="dy-seal-r"></span></span></div>`,
    v.hasTag ? `<div class="dy-tag"><v>${v.tagline}</v></div>` : '',
    '</div>',
    '</div>',
    `<div class="dy-zone">${zoneLine(v, iconPinEnt(11, '#FF8FC2', 2.3))}</div>`,
    v.hasBio ? `<div class="dy-bio"><v>${v.bio}</v></div>` : '',
    v.showProof || v.showStars
      ? [
          '<div class="dy-proof">',
          v.showProof
            ? `<span data-role="reputation"><b><v>${groupFr(v.delivN)}</v></b> ${t('vit.ventes_livrees')}</span>`
            : '',
          v.showStars
            ? `<span class="dy-stars" data-role="chip-avis">&nbsp;·&nbsp;${iconStarEnt(10, '#FFD36E')} <v>${v.rating}</v> · <v>${v.reviewCount}</v> ${t('vit.avis_verifies')}</span>`
            : '',
          '</div>',
        ].join('')
      : '',
    '</div>',
    v.nouvelle
      ? `<div class="dy-nouv-wrap"><span class="dy-nouv" data-role="chip-nouvelle">${iconStarEnt(14, '#FFFFFF')}<span>${t('vit.nouvelle_vendeuse')}</span></span></div>`
      : '',
    '<div class="dy-trust" data-role="vitrine-trust">',
    cell('v', iconShieldEnt(16, '#FFFFFF', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell('m', iconLockEnt(15, '#FFFFFF', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell('a', iconTagEnt(15, '#FFFFFF', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '<div class="dy-tail"></div>',
    controls(v, 'dy', '#FFF0F8'),
    '</div>',
    '</div>',
  ].join('');
}

const css = `
/* ══════════════════════ 5 · DYNAMIQUE ══════════════════════ */
  .vt-dy {
    --dy-magenta: #E9257F; --dy-magenta-fonce: #C21E73; --dy-rose: #FF8FC2;
    --dy-violet: #6E2BB8; --dy-violet-clair: #8A3BD4;
    --dy-ambre: #E08A2B; --dy-ambre-clair: #F0A94B; --dy-etoile: #FFD36E;
    --dy-ivoire: #FFF0F8; --dy-encre: #231038; --dy-sourd: #8B7C9B; --dy-sep: #F0EAF4;
    background: #F6F2F8;
  }
  .vt-dy .dy-panel { position: relative; background: linear-gradient(118deg, #2B1055 0%, #4B1C7A 42%, #8E1F6B 76%, #C21E73 100%); padding: 14px 14px 0; }
  .vt-dy .dy-trame-b {
    position: absolute; left: 2px; bottom: 64px; width: 110px; height: 76px;
    background-image: radial-gradient(circle, rgba(255,255,255,.28) 1.3px, transparent 1.5px);
    background-size: 11px 11px;
  }
  .vt-dy .dy-photo { position: absolute; top: 0; right: 0; bottom: 0; width: 152px; overflow: hidden; clip-path: polygon(30% 0, 100% 0, 100% 100%, 0 100%); }
  .vt-dy .dy-photo-motif {
    position: absolute; inset: 0; background-color: #5B1E8C;
    background-image:
      repeating-linear-gradient(90deg, rgba(255,255,255,.14) 0 2px, transparent 2px 12px),
      repeating-linear-gradient(0deg, rgba(194,30,115,.38) 0 2px, transparent 2px 11px);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-dy .dy-photo-mono { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 58px; color: rgba(255,240,248,.3); margin-left: 22px; }
  .vt-dy .dy-voile { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(43,16,85,.8) 0%, rgba(43,16,85,.1) 38%, rgba(43,16,85,0) 62%); }
  .vt-dy .dy-trame-r {
    position: absolute; top: 6px; right: 6px; width: 64px; height: 46px;
    background-image: radial-gradient(circle, rgba(255,120,190,.7) 1.4px, transparent 1.6px);
    background-size: 10px 10px;
  }
  .vt-dy .dy-col { position: relative; width: calc(100% - 128px); }
  .vt-dy .dy-top { display: flex; align-items: flex-start; gap: 10px; }
  .vt-dy .dy-av { position: relative; width: 44px; height: 44px; flex: none; }
  .vt-dy .dy-av-photo { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: linear-gradient(160deg,#9A9084,#574E43); box-shadow: 0 0 0 2px rgba(255,240,248,.85); }
  .vt-dy .dy-av-mono {
    position: absolute; inset: 0; border-radius: 50%;
    background: radial-gradient(120% 120% at 32% 24%, var(--dy-violet) 0%, #3A1568 78%);
    box-shadow: 0 0 0 2px rgba(255,240,248,.85);
    display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 21px; color: var(--dy-ivoire);
  }
  .vt-dy .dy-av-badge {
    position: absolute; right: -3px; bottom: -2px; width: 17px; height: 17px; border-radius: 50%;
    background: #2B1055; border: 2px solid var(--dy-ivoire);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-dy .dy-idcol { flex: 1; min-width: 0; }
  .vt-dy .dy-name {
    font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800;
    font-size: clamp(21px, 7.4cqw, 25px); line-height: 1.12; letter-spacing: -.025em;
    color: #FFFFFF; overflow-wrap: break-word;
  }
  .vt-dy .dy-name.vt-ent-long { font-size: 19px; }
  .vt-dy .dy-seal { position: relative; display: inline-flex; width: 17px; height: 17px; vertical-align: -2px; margin-left: 6px; }
  .vt-dy .dy-seal-d { position: absolute; inset: 0; border-radius: 50%; background: var(--dy-magenta); display: flex; align-items: center; justify-content: center; }
  .vt-dy .dy-seal-r { position: absolute; inset: -2px; border-radius: 50%; border: 1.5px dashed rgba(233,37,127,.6); }
  .vt-dy .dy-tag { margin-top: 2px; font-size: 12px; font-weight: 700; color: var(--dy-rose); }
  .vt-dy .dy-zone { margin-top: 6px; font-size: 10.5px; font-weight: 500; line-height: 1.4; color: rgba(255,240,248,.88); }
  .vt-dy .dy-zone svg { vertical-align: -1.5px; margin-right: 3px; }
  .vt-dy .dy-bio { text-wrap: pretty;  margin-top: 7px; font-size: 11.5px; line-height: 1.45; color: rgba(255,240,248,.88); }
  .vt-dy .dy-proof { margin-top: 9px; font-size: 11px; color: rgba(255,240,248,.9); line-height: 1.45; }
  .vt-dy .dy-proof b { font-weight: 700; color: #FFFFFF; }
  .vt-dy .dy-stars { white-space: nowrap; }
  .vt-dy .dy-stars svg { vertical-align: -1px; }
  .vt-dy .dy-nouv-wrap { position: relative; margin-top: 10px; display: flex; justify-content: flex-end; }
  .vt-dy .dy-nouv {
    display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border-radius: 99px;
    background: linear-gradient(120deg, var(--dy-magenta), var(--dy-magenta-fonce));
    box-shadow: 0 10px 22px -10px rgba(233,37,127,.85); white-space: nowrap;
  }
  .vt-dy .dy-nouv svg { flex: none; }
  .vt-dy .dy-nouv span { font-size: 12.5px; font-weight: 700; color: #FFFFFF; }
  .vt-dy .dy-trust {
    position: relative; margin-top: 12px; border-radius: 18px; background: #FFFFFF;
    box-shadow: 0 16px 34px -18px rgba(43,16,85,.7);
    padding: 11px 2px; display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-dy .dy-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .vt-dy .dy-cell + .dy-cell { border-left: 1px solid var(--dy-sep); }
  .vt-dy .dy-cell-i { width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .vt-dy .dy-cell-i-v { background: linear-gradient(140deg, var(--dy-violet), var(--dy-violet-clair)); box-shadow: 0 6px 14px -8px rgba(110,43,184,.7); }
  .vt-dy .dy-cell-i-m { background: linear-gradient(140deg, var(--dy-magenta), #FF5CA8); box-shadow: 0 6px 14px -8px rgba(233,37,127,.7); }
  .vt-dy .dy-cell-i-a { background: linear-gradient(140deg, var(--dy-ambre), var(--dy-ambre-clair)); box-shadow: 0 6px 14px -8px rgba(224,138,43,.7); }
  .vt-dy .dy-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: var(--dy-encre); }
  .vt-dy .dy-cell-s { font-size: 8px; line-height: 1.25; color: var(--dy-sourd); }
  .vt-dy .dy-tail { height: 12px; }
  .vt-dy .dy-btn { background: rgba(43,16,85,.45); border: 1px solid rgba(255,240,248,.32); }
  .vt-dy .vt-ent-btn { top: 10px; }
  .vt-dy .vt-ent-back { right: 10px; }

  /* ═══════════════ ENTETES-D · full-bleed (founder order) ═══════════════
     This style FILLS THE SCREEN like the classique hero: its top surface
     rides up under the unit's 60px status padding and pads itself back
     down, so its background paints to the very top edge with no seam.
     THESE ARE OVERRIDES and their position is load-bearing — they sit
     AFTER this style's own rules, which is how they win by cascade order.
     They lived in one shared block in the compiled sheet; it was split by
     root, and each root's share kept its relative position. */
  .vt-dy .dy-panel { margin-top: -60px; padding-top: 74px; }   /* 14 + 60 */
  .vt-dy .vt-ent-btn { top: 70px; }
`;

export const unit: EnteteUnit = { render, css };
