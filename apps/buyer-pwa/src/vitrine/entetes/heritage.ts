import { t } from '../../i18n';
import { groupFr } from '../../cliente/money';
import { iconCheckEnt, iconLockEnt, iconPinSolid, iconShieldEnt, iconSparkle, iconStarEnt, iconTagEnt } from '../icons';
import {
  avatarImg,
  controls,
  coverImg,
  etat,
  verifieeBare,
  zoneLine,
  type Vals,
} from '../entetes';
import type { EnteteUnit } from './registry';

/**
 * ENTETES-I · 2 · HÉRITAGE — one of the ORIGINAL five (série 1).
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
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="he-cell"><span class="he-cell-i">${icon}</span><span class="he-cell-l">${label}</span><span class="he-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-he" data-role="vitrine-hero">',
    `<div class="he-photo" data-role="vitrine-cover" data-etat="${etat(v)}">`,
    v.hasCover
      ? coverImg(v, '50% 18%')
      : `<div class="he-photo-motif"><span class="he-photo-mono">${v.mono}</span></div>`,
    // L'étincelle haut-droit : point radial + deux rais.
    '<span class="he-etin-p"></span><span class="he-etin-v"></span><span class="he-etin-h"></span>',
    `<span class="he-chip-v">${iconShieldEnt(14, '#E6C983', 2.1)}<span>${verifieeBare()}</span></span>`,
    v.nouvelle
      ? `<span class="he-chip-n" data-role="chip-nouvelle">${iconStarEnt(14, '#C79A45')}<span>${t('vit.nouvelle_vendeuse')}</span></span>`
      : '',
    controls(v, 'he', 'left', '10px', '62px', '#0B4638'),
    '</div>',
    '<div class="he-arch" data-role="vitrine-identity">',
    '<div class="he-med">',
    v.hasAvatar ? `<span class="he-med-photo">${avatarImg(v)}</span>` : `<span class="he-med-mono">${v.mono}</span>`,
    `<span class="he-med-b">${iconCheckEnt(13, '#E6C983', 3.2)}</span>`,
    '</div>',
    `<div class="he-namerow">${iconSparkle(17, '#C79A45')}<span class="he-name"><v>${v.name}</v></span><span class="he-etoile-m">${iconSparkle(17, '#C79A45')}</span></div>`,
    v.hasTag
      ? `<div class="he-tagrow"><span class="he-orn-l"><span class="he-orn-line"></span><span class="he-orn-dot"></span></span><span class="he-tag"><v>${v.tagline}</v></span><span class="he-orn-r"><span class="he-orn-dot"></span><span class="he-orn-line"></span></span></div>`
      : '',
    `<div class="he-zone">${zoneLine(v, iconPinSolid(14, '#C79A45', '#0B4638'))}</div>`,
    v.showProof || v.showStars
      ? [
          '<div class="he-proof">',
          v.showProof
            ? `<span class="he-proof-l" data-role="reputation"><span class="he-pill"><v>${groupFr(v.delivN)}</v></span><span class="he-proof-t">${t('vit.ventes_livrees')}</span></span>`
            : '',
          v.showStars
            ? `<span class="he-stars" data-role="chip-avis">${iconStarEnt(12, '#C79A45')}<span><v>${v.rating}</v> · <v>${v.reviewCount}</v> ${t('vit.avis_verifies')}</span></span>`
            : '',
          '</div>',
        ].join('')
      : '',
    '</div>',
    '<div class="he-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(19, '#E6C983', 1.9), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(18, '#E6C983', 1.9), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    // §2.6 — Héritage is the one style whose third label is the short form.
    cell(iconTagEnt(18, '#E6C983', 1.9), t('vit.cell_prix_court'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
  ].join('');
}

const css = `
/* ══════════════════════ 2 · HÉRITAGE ══════════════════════ */
  .vt-he {
    --he-vert: #0B4638; --he-vert-clair: #0E5442; --he-vert-texte: #123B31;
    --he-or: #C79A45; --he-or-clair: #E6C983; --he-or-sourd: #9C7F4B;
    --he-creme: #F7F1E5; --he-ivoire: #FFFCF6; --he-ivoire-doux: #EFE7D6; --he-ivoire-tendre: #F4EDDD;
    background: #4E6653;
    background-image:
      radial-gradient(80% 55% at 30% 30%, #C4B49B 0%, rgba(196,180,155,0) 70%),
      linear-gradient(155deg, #5E7561 0%, #43584A 55%, #2E4237 100%);
    padding-bottom: 14px;
  }
  .vt-he .he-photo {
    position: relative; margin: 10px 10px 0; height: 238px; border-radius: 24px; overflow: hidden;
    box-shadow: 0 0 0 1px rgba(247,241,229,.5), 0 16px 36px -18px rgba(0,0,0,.55);
  }
  .vt-he .he-photo-motif {
    position: absolute; inset: 0; background-color: var(--he-vert);
    background-image:
      repeating-linear-gradient(45deg, rgba(212,168,87,.09) 0 2px, transparent 2px 14px),
      repeating-linear-gradient(-45deg, rgba(212,168,87,.09) 0 2px, transparent 2px 14px);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-he .he-photo-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 110px; color: rgba(212,168,87,.20); }
  .vt-he .he-etin-p { position: absolute; top: 14px; right: 30px; width: 20px; height: 20px; background: radial-gradient(circle, rgba(255,248,226,.95) 0 14%, rgba(255,248,226,0) 62%); }
  .vt-he .he-etin-v { position: absolute; top: 7px; right: 38px; width: 2px; height: 34px; background: linear-gradient(180deg, rgba(255,248,226,0), rgba(255,248,226,.9), rgba(255,248,226,0)); }
  .vt-he .he-etin-h { position: absolute; top: 23px; right: 22px; width: 34px; height: 2px; background: linear-gradient(90deg, rgba(255,248,226,0), rgba(255,248,226,.9), rgba(255,248,226,0)); }
  .vt-he .he-chip-v {
    position: absolute; top: 10px; left: 10px; display: inline-flex; align-items: center; gap: 7px;
    height: 32px; padding: 0 13px; border-radius: 99px; background: var(--he-vert);
    box-shadow: 0 6px 16px -8px rgba(0,0,0,.6); white-space: nowrap;
  }
  .vt-he .he-chip-v span { font-size: 11.5px; font-weight: 500; color: var(--he-ivoire); }
  .vt-he .he-chip-n {
    position: absolute; top: 10px; right: 10px; display: inline-flex; align-items: center; gap: 7px;
    height: 34px; padding: 0 14px; border-radius: 99px; background: var(--he-creme);
    box-shadow: 0 6px 16px -8px rgba(0,0,0,.55); white-space: nowrap;
  }
  .vt-he .he-chip-n span { font-size: 12px; font-weight: 600; color: var(--he-vert-texte); }
  .vt-he .he-btn { background: var(--he-creme); box-shadow: 0 6px 16px -8px rgba(0,0,0,.55); }
  .vt-he .vt-ent-btn { top: 52px; }
  .vt-he .vt-ent-back { left: 10px; }
  .vt-he .he-arch {
    position: relative; margin: -64px 16px 0; border-radius: 36px; background: var(--he-vert);
    background-image:
      repeating-linear-gradient(45deg, rgba(212,168,87,.05) 0 2px, transparent 2px 15px),
      repeating-linear-gradient(-45deg, rgba(212,168,87,.05) 0 2px, transparent 2px 15px);
    box-shadow: inset 0 0 0 1.5px rgba(212,168,87,.45), 0 18px 40px -20px rgba(0,0,0,.55);
    padding: 0 16px 20px; text-align: center;
  }
  .vt-he .he-med { position: relative; width: 84px; height: 84px; margin: -42px auto 0; }
  .vt-he .he-med-photo { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: linear-gradient(160deg,#9A9084,#574E43); box-shadow: 0 0 0 4px var(--he-vert), 0 0 0 6.5px var(--he-or); }
  .vt-he .he-med-photo .vt-avatar-img { object-position: 50% 32%; }
  .vt-he .he-med-mono {
    position: absolute; inset: 0; border-radius: 50%;
    background: radial-gradient(120% 120% at 30% 22%, #14614C 0%, #0A3D30 74%);
    box-shadow: 0 0 0 4px var(--he-vert), 0 0 0 6.5px var(--he-or);
    display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 40px; color: var(--he-or-clair);
  }
  .vt-he .he-med-b {
    position: absolute; right: -3px; bottom: 0; width: 26px; height: 26px; border-radius: 50%;
    background: var(--he-vert); border: 2px solid var(--he-or);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-he .he-namerow { margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 13px; }
  .vt-he .he-namerow svg { flex: none; }
  .vt-he .he-etoile-m { display: inline-flex; transform: scaleX(-1); }
  .vt-he .he-name {
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(28px, 9.8cqw, 35px); line-height: 1.02; color: var(--he-ivoire);
    min-width: 0; overflow-wrap: break-word;
  }
  .vt-he .he-tagrow { margin-top: 6px; display: flex; align-items: center; justify-content: center; gap: 9px; }
  .vt-he .he-orn-l, .vt-he .he-orn-r { display: flex; align-items: center; gap: 5px; }
  .vt-he .he-orn-l .he-orn-line { width: 24px; height: 1px; background: linear-gradient(90deg, rgba(199,154,69,0), var(--he-or)); }
  .vt-he .he-orn-r .he-orn-line { width: 24px; height: 1px; background: linear-gradient(90deg, var(--he-or), rgba(199,154,69,0)); }
  .vt-he .he-orn-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--he-or); }
  .vt-he .he-tag { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 17px; color: var(--he-or-clair); }
  .vt-he .he-zone { margin-top: 8px; text-align: center; font-size: 12.5px; font-weight: 500; line-height: 1.45; color: var(--he-ivoire-doux); }
  .vt-he .he-zone svg { vertical-align: -2.5px; margin-right: 5px; }
  .vt-he .he-proof { margin-top: 13px; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 7px 10px; }
  .vt-he .he-proof-l { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .vt-he .he-pill {
    display: inline-flex; align-items: center; height: 30px; padding: 0 13px; border-radius: 99px;
    background: var(--he-vert-clair); border: 1px solid var(--he-or);
    font-size: 13px; font-weight: 600; color: var(--he-or-clair); white-space: nowrap;
  }
  .vt-he .he-proof-t { font-size: 13px; font-weight: 500; color: var(--he-ivoire-tendre); }
  .vt-he .he-stars { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .vt-he .he-stars span { font-size: 11.5px; font-weight: 600; color: var(--he-or-clair); }
  .vt-he .he-trust {
    position: relative; margin: -16px 10px 0; border-radius: 22px; background: var(--he-creme);
    box-shadow: 0 0 0 1.5px rgba(199,154,69,.4), 0 14px 30px -18px rgba(0,0,0,.5);
    padding: 13px 2px; display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-he .he-cell { padding: 0 8px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-he .he-cell + .he-cell { border-left: 1px solid rgba(199,154,69,.3); }
  .vt-he .he-cell-i { width: 40px; height: 40px; border-radius: 50%; background: var(--he-vert); display: flex; align-items: center; justify-content: center; }
  .vt-he .he-cell-l { font-family: Georgia, 'Times New Roman', serif; font-size: 11.5px; font-weight: 700; line-height: 1.22; color: var(--he-vert-texte); }
  .vt-he .he-cell-s { font-size: 9px; line-height: 1.25; color: var(--he-or-sourd); }

  /* ═══════════════ ENTETES-D · full-bleed (founder order) ═══════════════
     This style FILLS THE SCREEN like the classique hero: its top surface
     rides up under the unit's 60px status padding and pads itself back
     down, so its background paints to the very top edge with no seam.
     THESE ARE OVERRIDES and their position is load-bearing — they sit
     AFTER this style's own rules, which is how they win by cascade order.
     They lived in one shared block in the compiled sheet; it was split by
     root, and each root's share kept its relative position. */
  .vt-he .he-photo { margin: -60px 0 0; height: 298px; border-radius: 0; }
  .vt-he .he-chip-v { top: 70px; left: 14px; }
  .vt-he .he-chip-n { top: 70px; right: 14px; }
  .vt-he .vt-ent-btn { top: 112px; }
`;

export const unit: EnteteUnit = { render, css };
